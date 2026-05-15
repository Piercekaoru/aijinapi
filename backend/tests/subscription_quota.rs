use actix_web::{App, http::StatusCode, test, web};
use chrono::{DateTime, Duration, Utc};
use reqwest::Client;
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

use openachieve_backend::{
    auth::{ensure_monthly_quota, hash_password},
    config::Config,
    db::{create_customer_key_for_user, subscription_summary},
    errors::ApiError,
    models::User,
    plans::{FREE_MONTHLY_REQUEST_LIMIT, PLUS_MONTHLY_REQUEST_LIMIT},
    routes,
    state::AppState,
    upstream::UpstreamKeyRing,
};

#[sqlx::test(migrations = "./migrations")]
async fn register_user_defaults_to_free_quota(pool: PgPool) {
    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(app_state(pool.clone())))
            .configure(routes::configure),
    )
    .await;

    let email = format!("{}@example.com", Uuid::new_v4());
    let req = test::TestRequest::post()
        .uri("/auth/register")
        .set_json(json!({
            "name": "Quota Tester",
            "email": email,
            "password": "password123"
        }))
        .to_request();

    let response = test::call_service(&app, req).await;
    assert_eq!(response.status(), StatusCode::OK);
    let body: Value = test::read_body_json(response).await;
    assert!(
        body["session_token"]
            .as_str()
            .unwrap()
            .starts_with("openachieve_session_")
    );
    assert_eq!(body["user"]["email"], email.as_str());
    assert_eq!(
        body["api_key"]["monthly_request_limit"],
        FREE_MONTHLY_REQUEST_LIMIT
    );

    let stored_limit: i32 =
        sqlx::query_scalar("SELECT monthly_request_limit FROM users WHERE email = $1")
            .bind(&email)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(stored_limit, FREE_MONTHLY_REQUEST_LIMIT);

    let session_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sessions")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(session_count, 1);

    let key_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM api_keys")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(key_count, 1);
}

#[sqlx::test(migrations = "./migrations")]
async fn registered_user_can_login_and_gets_default_key(pool: PgPool) {
    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(app_state(pool.clone())))
            .configure(routes::configure),
    )
    .await;

    let email = format!("{}@example.com", Uuid::new_v4());
    let password = "password123";
    let password_hash = hash_password(password).unwrap();
    sqlx::query(
        r#"
        INSERT INTO users (email, name, password_hash, plan, plan_status, monthly_request_limit)
        VALUES ($1, 'Verified Tester', $2, 'free', 'active', $3)
        "#,
    )
    .bind(&email)
    .bind(password_hash)
    .bind(FREE_MONTHLY_REQUEST_LIMIT)
    .execute(&pool)
    .await
    .unwrap();

    let login = test::TestRequest::post()
        .uri("/auth/login")
        .set_json(json!({
            "email": email,
            "password": password
        }))
        .to_request();
    let body: Value = test::call_and_read_body_json(&app, login).await;
    assert!(
        body["session_token"]
            .as_str()
            .unwrap()
            .starts_with("openachieve_session_")
    );
    assert_eq!(
        body["api_key"]["monthly_request_limit"],
        FREE_MONTHLY_REQUEST_LIMIT
    );
}

#[sqlx::test(migrations = "./migrations")]
async fn subscription_summary_reports_plus_1500_and_remaining_quota(pool: PgPool) {
    let user_id = insert_user(
        &pool,
        "plus",
        "active",
        PLUS_MONTHLY_REQUEST_LIMIT,
        Some(Utc::now() + Duration::days(30)),
    )
    .await;
    let key = create_customer_key_for_user(&pool, user_id, "primary", PLUS_MONTHLY_REQUEST_LIMIT)
        .await
        .unwrap();
    insert_usage_events(&pool, key.id, 10, "qwen3.6-plus").await;

    let user = fetch_user(&pool, user_id).await;
    let summary = subscription_summary(&pool, &user).await.unwrap();

    assert_eq!(summary.plan, "plus");
    assert_eq!(summary.monthly_request_limit, PLUS_MONTHLY_REQUEST_LIMIT);
    assert_eq!(summary.requests_this_month, 10);
    assert_eq!(summary.remaining_requests, 1490);
    assert!(summary.allowed_models.contains(&"qwen3.6-plus"));
    assert!(summary.allowed_models.contains(&"big-pickle"));
    assert!(summary.allowed_models.contains(&"deepseek-v4-flash-free"));
}

#[sqlx::test(migrations = "./migrations")]
async fn free_quota_is_exceeded_after_500_monthly_chat_requests(pool: PgPool) {
    let user_id = insert_user(&pool, "free", "active", FREE_MONTHLY_REQUEST_LIMIT, None).await;
    let key = create_customer_key_for_user(&pool, user_id, "free-key", FREE_MONTHLY_REQUEST_LIMIT)
        .await
        .unwrap();
    insert_usage_events(&pool, key.id, 499, "big-pickle").await;

    let user = fetch_user(&pool, user_id).await;
    ensure_monthly_quota(&pool, &user).await.unwrap();

    insert_usage_events(&pool, key.id, 1, "big-pickle").await;
    assert!(matches!(
        ensure_monthly_quota(&pool, &user).await,
        Err(ApiError::QuotaExceeded)
    ));
}

#[sqlx::test(migrations = "./migrations")]
async fn plus_quota_is_exceeded_after_1500_monthly_chat_requests(pool: PgPool) {
    let user_id = insert_user(
        &pool,
        "plus",
        "active",
        PLUS_MONTHLY_REQUEST_LIMIT,
        Some(Utc::now() + Duration::days(30)),
    )
    .await;
    let key = create_customer_key_for_user(&pool, user_id, "plus-key", PLUS_MONTHLY_REQUEST_LIMIT)
        .await
        .unwrap();
    insert_usage_events(&pool, key.id, 1499, "qwen3.6-plus").await;

    let user = fetch_user(&pool, user_id).await;
    ensure_monthly_quota(&pool, &user).await.unwrap();

    insert_usage_events(&pool, key.id, 1, "qwen3.6-plus").await;
    assert!(matches!(
        ensure_monthly_quota(&pool, &user).await,
        Err(ApiError::QuotaExceeded)
    ));
}

#[sqlx::test(migrations = "./migrations")]
async fn quota_is_shared_across_all_keys_for_a_user(pool: PgPool) {
    let user_id = insert_user(
        &pool,
        "plus",
        "active",
        PLUS_MONTHLY_REQUEST_LIMIT,
        Some(Utc::now() + Duration::days(30)),
    )
    .await;
    let first = create_customer_key_for_user(&pool, user_id, "first", PLUS_MONTHLY_REQUEST_LIMIT)
        .await
        .unwrap();
    let second = create_customer_key_for_user(&pool, user_id, "second", PLUS_MONTHLY_REQUEST_LIMIT)
        .await
        .unwrap();

    insert_usage_events(&pool, first.id, 1000, "qwen3.6-plus").await;
    insert_usage_events(&pool, second.id, 499, "deepseek-v4-pro").await;
    let user = fetch_user(&pool, user_id).await;
    ensure_monthly_quota(&pool, &user).await.unwrap();

    insert_usage_events(&pool, second.id, 1, "deepseek-v4-pro").await;
    assert!(matches!(
        ensure_monthly_quota(&pool, &user).await,
        Err(ApiError::QuotaExceeded)
    ));
}

#[sqlx::test(migrations = "./migrations")]
async fn expired_plus_user_falls_back_to_free_quota(pool: PgPool) {
    let user_id = insert_user(
        &pool,
        "plus",
        "active",
        PLUS_MONTHLY_REQUEST_LIMIT,
        Some(Utc::now() - Duration::days(1)),
    )
    .await;
    let key =
        create_customer_key_for_user(&pool, user_id, "expired-plus", PLUS_MONTHLY_REQUEST_LIMIT)
            .await
            .unwrap();
    insert_usage_events(&pool, key.id, FREE_MONTHLY_REQUEST_LIMIT, "big-pickle").await;

    let user = fetch_user(&pool, user_id).await;
    let summary = subscription_summary(&pool, &user).await.unwrap();

    assert_eq!(summary.plan, "free");
    assert_eq!(summary.monthly_request_limit, FREE_MONTHLY_REQUEST_LIMIT);
    assert!(matches!(
        ensure_monthly_quota(&pool, &user).await,
        Err(ApiError::QuotaExceeded)
    ));
}

fn app_state(pool: PgPool) -> AppState {
    let config = Config {
        database_url: "postgres://postgres:postgres@localhost/openachieve_test".to_string(),
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
    };
    let upstream_keys = UpstreamKeyRing::from_config(&config);

    AppState {
        config,
        db: pool,
        http: Client::new(),
        upstream_keys,
    }
}

async fn insert_user(
    pool: &PgPool,
    plan: &str,
    plan_status: &str,
    monthly_limit: i32,
    plus_expires_at: Option<DateTime<Utc>>,
) -> i64 {
    sqlx::query_scalar(
        r#"
        INSERT INTO users (
          email,
          name,
          password_hash,
          plan,
          plan_status,
          monthly_request_limit,
          plus_started_at,
          plus_expires_at
        )
        VALUES ($1, 'Test User', 'hash', $2, $3, $4, now(), $5)
        RETURNING id
        "#,
    )
    .bind(format!("{}@example.com", Uuid::new_v4()))
    .bind(plan)
    .bind(plan_status)
    .bind(monthly_limit)
    .bind(plus_expires_at)
    .fetch_one(pool)
    .await
    .unwrap()
}

async fn fetch_user(pool: &PgPool, user_id: i64) -> User {
    sqlx::query_as::<_, User>(
        r#"
        SELECT
          id,
          email,
          name,
          password_hash,
          created_at,
          plan,
          plan_status,
          monthly_request_limit,
          plus_started_at,
          plus_expires_at
        FROM users
        WHERE id = $1
        "#,
    )
    .bind(user_id)
    .fetch_one(pool)
    .await
    .unwrap()
}

async fn insert_usage_events(pool: &PgPool, api_key_id: i64, count: i32, model: &str) {
    if count <= 0 {
        return;
    }

    sqlx::query(
        r#"
        INSERT INTO usage_events (
          api_key_id,
          model,
          path,
          status_code,
          is_stream,
          upstream_latency_ms
        )
        SELECT $1, $2, '/v1/chat/completions', 200, false, 12
        FROM generate_series(1, $3::int)
        "#,
    )
    .bind(api_key_id)
    .bind(model)
    .bind(count)
    .execute(pool)
    .await
    .unwrap();
}
