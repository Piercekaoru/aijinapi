use actix_web::{App, http::StatusCode, test, web};
use chrono::{Duration, Utc};
use reqwest::Client;
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

use openachieve_backend::{
    auth::hash_password,
    config::Config,
    db::create_session,
    email::InMemoryEmailSender,
    free_models::FreeModelCatalog,
    plans::{FREE_MONTHLY_REQUEST_LIMIT, PLUS_MONTHLY_REQUEST_LIMIT},
    routes,
    state::AppState,
    upstream::UpstreamKeyRing,
};

#[sqlx::test(migrations = "./migrations")]
async fn admin_routes_require_admin_session(pool: PgPool) {
    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(app_state(pool.clone())))
            .configure(routes::configure),
    )
    .await;

    let missing_auth = test::TestRequest::get().uri("/admin/users").to_request();
    let missing_auth_response = test::call_service(&app, missing_auth).await;
    assert_eq!(missing_auth_response.status(), StatusCode::UNAUTHORIZED);

    let user = insert_user(&pool, "regular@example.com", "Regular", "free", None).await;
    let token = create_session(&pool, user.id).await.unwrap();
    let regular_req = test::TestRequest::get()
        .uri("/admin/users")
        .insert_header(("authorization", format!("Bearer {token}")))
        .to_request();
    let regular_response = test::call_service(&app, regular_req).await;
    assert_eq!(regular_response.status(), StatusCode::FORBIDDEN);
}

#[sqlx::test(migrations = "./migrations")]
async fn admin_can_manage_users_and_audit_events(pool: PgPool) {
    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(app_state(pool.clone())))
            .configure(routes::configure),
    )
    .await;

    let admin = insert_user(&pool, "admin@example.com", "Admin", "free", None).await;
    let token = create_session(&pool, admin.id).await.unwrap();
    let auth_header = ("authorization", format!("Bearer {token}"));

    let list_req = test::TestRequest::get()
        .uri("/admin/users")
        .insert_header(auth_header.clone())
        .to_request();
    let list_body: Value = test::call_and_read_body_json(&app, list_req).await;
    assert_eq!(list_body["stats"]["total_users"], 1);
    assert_eq!(list_body["users"][0]["is_admin"], true);

    let customer_email = format!("{}@example.com", Uuid::new_v4());
    let create_req = test::TestRequest::post()
        .uri("/admin/users")
        .insert_header(auth_header.clone())
        .set_json(json!({
            "name": "Created User",
            "email": customer_email,
            "plan": "plus",
            "days": 45
        }))
        .to_request();
    let create_body: Value = test::call_and_read_body_json(&app, create_req).await;
    assert_eq!(create_body["user"]["plan"], "plus");
    assert_eq!(
        create_body["user"]["monthly_request_limit"],
        PLUS_MONTHLY_REQUEST_LIMIT
    );
    assert!(
        create_body["temporary_password"]
            .as_str()
            .unwrap()
            .starts_with("OA-")
    );
    assert!(
        create_body["api_key"]["key"]
            .as_str()
            .unwrap()
            .starts_with("openachieve_")
    );
    let customer_id = create_body["user"]["id"].as_i64().unwrap();

    let downgrade_req = test::TestRequest::patch()
        .uri(&format!("/admin/users/{customer_id}/plan"))
        .insert_header(auth_header.clone())
        .set_json(json!({ "plan": "free" }))
        .to_request();
    let downgrade_body: Value = test::call_and_read_body_json(&app, downgrade_req).await;
    assert_eq!(downgrade_body["plan"], "free");
    assert_eq!(
        downgrade_body["monthly_request_limit"],
        FREE_MONTHLY_REQUEST_LIMIT
    );
    assert!(downgrade_body["plus_expires_at"].is_null());

    let upgrade_req = test::TestRequest::patch()
        .uri(&format!("/admin/users/{customer_id}/plan"))
        .insert_header(auth_header.clone())
        .set_json(json!({ "plan": "plus", "days": 30 }))
        .to_request();
    let upgrade_body: Value = test::call_and_read_body_json(&app, upgrade_req).await;
    assert_eq!(upgrade_body["plan"], "plus");
    assert_eq!(
        upgrade_body["monthly_request_limit"],
        PLUS_MONTHLY_REQUEST_LIMIT
    );

    let delete_req = test::TestRequest::delete()
        .uri(&format!("/admin/users/{customer_id}"))
        .insert_header(auth_header)
        .to_request();
    let delete_response = test::call_service(&app, delete_req).await;
    assert_eq!(delete_response.status(), StatusCode::NO_CONTENT);

    let remaining_users: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users WHERE id = $1")
        .bind(customer_id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(remaining_users, 0);

    let audit_actions: Vec<String> =
        sqlx::query_scalar("SELECT action FROM admin_audit_events ORDER BY id")
            .fetch_all(&pool)
            .await
            .unwrap();
    assert_eq!(
        audit_actions,
        vec![
            "create_user",
            "downgrade_plan",
            "upgrade_plan",
            "delete_user"
        ]
    );
}

#[sqlx::test(migrations = "./migrations")]
async fn admin_cannot_delete_or_downgrade_self(pool: PgPool) {
    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(app_state(pool.clone())))
            .configure(routes::configure),
    )
    .await;

    let admin = insert_user(&pool, "admin@example.com", "Admin", "plus", Some(30)).await;
    let token = create_session(&pool, admin.id).await.unwrap();
    let auth_header = ("authorization", format!("Bearer {token}"));

    let downgrade_self = test::TestRequest::patch()
        .uri(&format!("/admin/users/{}/plan", admin.id))
        .insert_header(auth_header.clone())
        .set_json(json!({ "plan": "free" }))
        .to_request();
    let downgrade_response = test::call_service(&app, downgrade_self).await;
    assert_eq!(downgrade_response.status(), StatusCode::FORBIDDEN);

    let delete_self = test::TestRequest::delete()
        .uri(&format!("/admin/users/{}", admin.id))
        .insert_header(auth_header)
        .to_request();
    let delete_response = test::call_service(&app, delete_self).await;
    assert_eq!(delete_response.status(), StatusCode::FORBIDDEN);
}

fn app_state(pool: PgPool) -> AppState {
    let config = Config {
        database_url: "postgres://postgres:postgres@localhost/openachieve_test".to_string(),
        app_base_url: "http://localhost:3000".to_string(),
        admin_emails: vec!["admin@example.com".to_string()],
        opencode_zen_api_keys: vec!["real-zen-key".to_string()],
        opencode_go_api_keys: vec!["real-go-key".to_string()],
        server_host: "127.0.0.1".parse().unwrap(),
        server_port: 8080,
        default_monthly_request_limit: FREE_MONTHLY_REQUEST_LIMIT,
        zen_chat_completions_url: "http://127.0.0.1/zen/chat/completions".to_string(),
        zen_go_chat_completions_url: "http://127.0.0.1/go/chat/completions".to_string(),
        zen_models_url: "http://127.0.0.1/zen/models".to_string(),
        zen_go_models_url: "http://127.0.0.1/go/models".to_string(),
        upstream_max_attempts: 1,
        upstream_retry_base_ms: 0,
        upstream_key_cooldown_ms: 60_000,
        cors_allowed_origins: vec!["http://localhost:3000".to_string()],
        smtp: None,
    };
    let upstream_keys = UpstreamKeyRing::from_config(&config);

    AppState {
        config,
        db: pool,
        http: Client::new(),
        email: InMemoryEmailSender::shared(),
        upstream_keys,
        free_models: FreeModelCatalog::seeded([
            "big-pickle",
            "deepseek-v4-flash-free",
            "minimax-m2.5-free",
            "ring-2.6-1t-free",
            "nemotron-3-super-free",
        ]),
    }
}

async fn insert_user(
    pool: &PgPool,
    email: &str,
    name: &str,
    plan: &str,
    plus_days: Option<i64>,
) -> openachieve_backend::models::User {
    let password_hash = hash_password("password123").unwrap();
    let plus_expires_at = plus_days.map(|days| Utc::now() + Duration::days(days));
    let monthly_limit = if plan == "plus" {
        PLUS_MONTHLY_REQUEST_LIMIT
    } else {
        FREE_MONTHLY_REQUEST_LIMIT
    };

    sqlx::query_as(
        r#"
        INSERT INTO users (
          email,
          name,
          password_hash,
          email_verified_at,
          plan,
          plan_status,
          monthly_request_limit,
          plus_started_at,
          plus_expires_at
        )
        VALUES ($1, $2, $3, now(), $4, 'active', $5, CASE WHEN $4 = 'plus' THEN now() ELSE NULL END, $6)
        RETURNING
          id,
          email,
          name,
          password_hash,
          created_at,
          email_verified_at,
          plan,
          plan_status,
          monthly_request_limit,
          plus_started_at,
          plus_expires_at
        "#,
    )
    .bind(email)
    .bind(name)
    .bind(password_hash)
    .bind(plan)
    .bind(monthly_limit)
    .bind(plus_expires_at)
    .fetch_one(pool)
    .await
    .unwrap()
}
