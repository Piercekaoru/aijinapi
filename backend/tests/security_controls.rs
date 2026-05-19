use actix_web::{App, http::StatusCode, test, web};
use chrono::{Duration, Utc};
use reqwest::Client;
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;
use wiremock::{
    Mock, MockServer, ResponseTemplate,
    matchers::{header as wire_header, method, path},
};

use openachieve_backend::{
    auth::hash_password,
    config::Config,
    db::{create_customer_key_for_user, create_session},
    email::InMemoryEmailSender,
    free_models::FreeModelCatalog,
    plans::{FREE_MONTHLY_REQUEST_LIMIT, PLUS_MONTHLY_REQUEST_LIMIT, PLUS_PLAN},
    routes,
    state::AppState,
    upstream::UpstreamKeyRing,
};

const TEST_PASSWORD: &str = "Password123";

#[sqlx::test(migrations = "./migrations")]
async fn registration_rate_limit_auto_bans_and_lift_restores(pool: PgPool) {
    let server = MockServer::start().await;
    let app = test_app(pool.clone(), &server).await;
    let ip = "203.0.113.20";

    for index in 0..3 {
        let response = register_from_ip(&app, ip, &format!("allowed-{index}@example.com")).await;
        assert_eq!(response.status(), StatusCode::ACCEPTED);
    }

    for index in 0..3 {
        let response = register_from_ip(&app, ip, &format!("limited-{index}@example.com")).await;
        assert_eq!(response.status(), StatusCode::TOO_MANY_REQUESTS);
        let body: Value = test::read_body_json(response).await;
        assert_eq!(body["error"]["code"], "rate_limited");
    }

    let banned: bool = sqlx::query_scalar(
        "SELECT EXISTS (SELECT 1 FROM ip_bans WHERE ip = $1 AND lifted_at IS NULL)",
    )
    .bind(ip)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(banned);

    let blocked = register_from_ip(&app, ip, "blocked@example.com").await;
    assert_eq!(blocked.status(), StatusCode::FORBIDDEN);
    let body: Value = test::read_body_json(blocked).await;
    assert_eq!(body["error"]["code"], "ip_banned");

    sqlx::query("UPDATE ip_bans SET lifted_at = now(), lift_reason = 'test' WHERE ip = $1")
        .bind(ip)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("DELETE FROM ip_rate_limit_windows WHERE ip = $1")
        .bind(ip)
        .execute(&pool)
        .await
        .unwrap();

    let restored = register_from_ip(&app, ip, "restored@example.com").await;
    assert_eq!(restored.status(), StatusCode::ACCEPTED);
}

#[sqlx::test(migrations = "./migrations")]
async fn free_open_models_are_ip_limited_but_plus_only_go_models_skip(pool: PgPool) {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/go/chat/completions"))
        .and(wire_header("authorization", "Bearer real-go-key"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "id": "plus_ok",
            "object": "chat.completion"
        })))
        .expect(1)
        .mount(&server)
        .await;

    let free_key = create_key_for_plan(&pool, "free").await;
    let plus_key = create_key_for_plan(&pool, PLUS_PLAN).await;
    let app = test_app(pool.clone(), &server).await;

    let free_zen_ip = "203.0.113.21";
    insert_free_ai_window(&pool, free_zen_ip, 60).await;
    let free_zen = post_chat_from_ip(&app, &free_key, "big-pickle", free_zen_ip).await;
    assert_eq!(free_zen.status(), StatusCode::TOO_MANY_REQUESTS);

    let plus_zen_ip = "203.0.113.24";
    insert_free_ai_window(&pool, plus_zen_ip, 60).await;
    let plus_zen = post_chat_from_ip(&app, &plus_key, "big-pickle", plus_zen_ip).await;
    assert_eq!(plus_zen.status(), StatusCode::TOO_MANY_REQUESTS);

    let free_sponsored_ip = "203.0.113.25";
    insert_free_ai_window(&pool, free_sponsored_ip, 60).await;
    let free_sponsored_go =
        post_chat_from_ip(&app, &free_key, "deepseek-v4-flash", free_sponsored_ip).await;
    assert_eq!(free_sponsored_go.status(), StatusCode::TOO_MANY_REQUESTS);

    let plus_sponsored_ip = "203.0.113.26";
    insert_free_ai_window(&pool, plus_sponsored_ip, 60).await;
    let plus_sponsored_go =
        post_chat_from_ip(&app, &plus_key, "deepseek-v4-flash", plus_sponsored_ip).await;
    assert_eq!(plus_sponsored_go.status(), StatusCode::TOO_MANY_REQUESTS);

    let plus_go_ip = "203.0.113.27";
    insert_free_ai_window(&pool, plus_go_ip, 60).await;
    let plus_go = post_chat_from_ip(&app, &plus_key, "qwen3.6-plus", plus_go_ip).await;
    assert_eq!(plus_go.status(), StatusCode::OK);
}

#[sqlx::test(migrations = "./migrations")]
async fn explicit_ip_ban_blocks_auth_models_and_chat_then_lift_restores(pool: PgPool) {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/zen/chat/completions"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "id": "chat_ok",
            "object": "chat.completion"
        })))
        .mount(&server)
        .await;

    let ip = "203.0.113.22";
    let email = unique_email();
    let user_id = insert_user(&pool, &email, "free").await;
    let key = create_customer_key_for_user(&pool, user_id, "default", FREE_MONTHLY_REQUEST_LIMIT)
        .await
        .unwrap()
        .key;
    sqlx::query(
        "INSERT INTO ip_bans (ip, reason, expires_at) VALUES ($1, 'test ban', now() + interval '1 hour')",
    )
    .bind(ip)
    .execute(&pool)
    .await
    .unwrap();
    let app = test_app(pool.clone(), &server).await;

    let login = login_from_ip(&app, ip, &email).await;
    assert_eq!(login.status(), StatusCode::FORBIDDEN);
    let models = get_models_from_ip(&app, &key, ip).await;
    assert_eq!(models.status(), StatusCode::FORBIDDEN);
    let chat = post_chat_from_ip(&app, &key, "big-pickle", ip).await;
    assert_eq!(chat.status(), StatusCode::FORBIDDEN);

    sqlx::query("UPDATE ip_bans SET lifted_at = now(), lift_reason = 'test lift' WHERE ip = $1")
        .bind(ip)
        .execute(&pool)
        .await
        .unwrap();

    let restored_login = login_from_ip(&app, ip, &email).await;
    assert_eq!(restored_login.status(), StatusCode::OK);
}

#[sqlx::test(migrations = "./migrations")]
async fn account_ban_revokes_session_blocks_api_and_unban_allows_login(pool: PgPool) {
    let server = MockServer::start().await;
    let app = test_app(pool.clone(), &server).await;
    let admin_id = insert_user_with_email(&pool, "admin@example.com", "free").await;
    let target_email = unique_email();
    let target_id = insert_user(&pool, &target_email, "free").await;
    let admin_session = create_session(&pool, admin_id).await.unwrap();
    let target_session = create_session(&pool, target_id).await.unwrap();
    let target_key =
        create_customer_key_for_user(&pool, target_id, "default", FREE_MONTHLY_REQUEST_LIMIT)
            .await
            .unwrap()
            .key;

    let ban = test::TestRequest::post()
        .uri(&format!("/admin/users/{target_id}/ban"))
        .insert_header(("authorization", format!("Bearer {admin_session}")))
        .set_json(json!({ "reason": "test ban" }))
        .to_request();
    assert_eq!(test::call_service(&app, ban).await.status(), StatusCode::OK);

    let old_session_req = test::TestRequest::get()
        .uri("/auth/me")
        .insert_header(("authorization", format!("Bearer {target_session}")))
        .to_request();
    assert_eq!(
        test::call_service(&app, old_session_req).await.status(),
        StatusCode::UNAUTHORIZED
    );

    let login = login_from_ip(&app, "203.0.113.23", &target_email).await;
    assert_eq!(login.status(), StatusCode::FORBIDDEN);
    let body: Value = test::read_body_json(login).await;
    assert_eq!(body["error"]["code"], "account_banned");

    let models = get_models_from_ip(&app, &target_key, "203.0.113.23").await;
    assert_eq!(models.status(), StatusCode::FORBIDDEN);

    let unban = test::TestRequest::post()
        .uri(&format!("/admin/users/{target_id}/unban"))
        .insert_header(("authorization", format!("Bearer {admin_session}")))
        .to_request();
    assert_eq!(
        test::call_service(&app, unban).await.status(),
        StatusCode::OK
    );

    let restored_login = login_from_ip(&app, "203.0.113.23", &target_email).await;
    assert_eq!(restored_login.status(), StatusCode::OK);

    let self_ban = test::TestRequest::post()
        .uri(&format!("/admin/users/{admin_id}/ban"))
        .insert_header(("authorization", format!("Bearer {admin_session}")))
        .set_json(json!({ "reason": "self" }))
        .to_request();
    assert_eq!(
        test::call_service(&app, self_ban).await.status(),
        StatusCode::FORBIDDEN
    );
}

async fn test_app(
    pool: PgPool,
    server: &MockServer,
) -> impl actix_service::Service<
    actix_http::Request,
    Response = actix_web::dev::ServiceResponse,
    Error = actix_web::Error,
> {
    test::init_service(
        App::new()
            .app_data(web::Data::new(app_state(pool, server)))
            .configure(routes::configure),
    )
    .await
}

fn app_state(pool: PgPool, server: &MockServer) -> AppState {
    let config = Config {
        database_url: "postgres://postgres:postgres@localhost/openachieve_test".to_string(),
        app_base_url: "http://localhost:3000".to_string(),
        admin_emails: vec!["admin@example.com".to_string()],
        opencode_zen_api_keys: vec!["real-zen-key".to_string()],
        opencode_go_api_keys: vec!["real-go-key".to_string()],
        server_host: "127.0.0.1".parse().unwrap(),
        server_port: 8080,
        default_monthly_request_limit: FREE_MONTHLY_REQUEST_LIMIT,
        zen_chat_completions_url: format!("{}/zen/chat/completions", server.uri()),
        zen_go_chat_completions_url: format!("{}/go/chat/completions", server.uri()),
        zen_models_url: format!("{}/zen/models", server.uri()),
        zen_go_models_url: format!("{}/go/models", server.uri()),
        upstream_max_attempts: 1,
        upstream_retry_base_ms: 0,
        upstream_key_cooldown_ms: 60_000,
        cors_allowed_origins: vec!["http://localhost:3000".to_string()],
        smtp: None,
        fovpay: None,
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

async fn register_from_ip<S>(app: &S, ip: &str, email: &str) -> actix_web::dev::ServiceResponse
where
    S: actix_service::Service<
            actix_http::Request,
            Response = actix_web::dev::ServiceResponse,
            Error = actix_web::Error,
        >,
{
    let req = test::TestRequest::post()
        .uri("/auth/register")
        .insert_header(("x-real-ip", ip))
        .set_json(json!({
            "name": "Test User",
            "email": email,
            "password": TEST_PASSWORD
        }))
        .to_request();
    test::call_service(app, req).await
}

async fn login_from_ip<S>(app: &S, ip: &str, email: &str) -> actix_web::dev::ServiceResponse
where
    S: actix_service::Service<
            actix_http::Request,
            Response = actix_web::dev::ServiceResponse,
            Error = actix_web::Error,
        >,
{
    let req = test::TestRequest::post()
        .uri("/auth/login")
        .insert_header(("x-real-ip", ip))
        .set_json(json!({
            "email": email,
            "password": TEST_PASSWORD
        }))
        .to_request();
    test::call_service(app, req).await
}

async fn post_chat_from_ip<S>(
    app: &S,
    api_key: &str,
    model: &str,
    ip: &str,
) -> actix_web::dev::ServiceResponse
where
    S: actix_service::Service<
            actix_http::Request,
            Response = actix_web::dev::ServiceResponse,
            Error = actix_web::Error,
        >,
{
    let req = test::TestRequest::post()
        .uri("/v1/chat/completions")
        .insert_header(("x-real-ip", ip))
        .insert_header(("authorization", format!("Bearer {api_key}")))
        .set_json(json!({
            "model": model,
            "messages": [
                { "role": "user", "content": "hello" }
            ]
        }))
        .to_request();
    test::call_service(app, req).await
}

async fn get_models_from_ip<S>(app: &S, api_key: &str, ip: &str) -> actix_web::dev::ServiceResponse
where
    S: actix_service::Service<
            actix_http::Request,
            Response = actix_web::dev::ServiceResponse,
            Error = actix_web::Error,
        >,
{
    let req = test::TestRequest::get()
        .uri("/v1/models")
        .insert_header(("x-real-ip", ip))
        .insert_header(("authorization", format!("Bearer {api_key}")))
        .to_request();
    test::call_service(app, req).await
}

async fn create_key_for_plan(pool: &PgPool, plan: &str) -> String {
    let user_id = insert_user(pool, &unique_email(), plan).await;
    let monthly_limit = if plan == PLUS_PLAN {
        PLUS_MONTHLY_REQUEST_LIMIT
    } else {
        FREE_MONTHLY_REQUEST_LIMIT
    };
    create_customer_key_for_user(pool, user_id, "test-key", monthly_limit)
        .await
        .unwrap()
        .key
}

async fn insert_user(pool: &PgPool, email: &str, plan: &str) -> i64 {
    insert_user_with_email(pool, email, plan).await
}

async fn insert_user_with_email(pool: &PgPool, email: &str, plan: &str) -> i64 {
    let monthly_limit = if plan == PLUS_PLAN {
        PLUS_MONTHLY_REQUEST_LIMIT
    } else {
        FREE_MONTHLY_REQUEST_LIMIT
    };
    let plus_expires_at = if plan == PLUS_PLAN {
        Some(Utc::now() + Duration::days(30))
    } else {
        None
    };
    sqlx::query_scalar(
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
        VALUES ($1, 'Test User', $2, now(), $3, 'active', $4, now(), $5)
        RETURNING id
        "#,
    )
    .bind(email)
    .bind(hash_password(TEST_PASSWORD).unwrap())
    .bind(plan)
    .bind(monthly_limit)
    .bind(plus_expires_at)
    .fetch_one(pool)
    .await
    .unwrap()
}

async fn insert_free_ai_window(pool: &PgPool, ip: &str, count: i32) {
    sqlx::query(
        r#"
        INSERT INTO ip_rate_limit_windows (
          scope,
          ip,
          window_start,
          window_seconds,
          request_count
        )
        VALUES (
          'free_ai',
          $1,
          to_timestamp(floor(extract(epoch FROM now()) / 60) * 60),
          60,
          $2
        )
        "#,
    )
    .bind(ip)
    .bind(count)
    .execute(pool)
    .await
    .unwrap();
}

fn unique_email() -> String {
    format!("{}@example.com", Uuid::new_v4())
}
