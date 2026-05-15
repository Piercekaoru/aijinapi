use actix_web::{App, http::header, test, web};
use chrono::{DateTime, Duration, Utc};
use reqwest::Client;
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;
use wiremock::{
    Mock, MockServer, ResponseTemplate,
    matchers::{header as wire_header, method, path},
};

use openachieve_backend::{
    config::Config,
    db::create_customer_key_for_user,
    plans::{FREE_MONTHLY_REQUEST_LIMIT, PLUS_MONTHLY_REQUEST_LIMIT},
    routes,
    state::AppState,
    upstream::UpstreamKeyRing,
};

#[sqlx::test(migrations = "./migrations")]
async fn free_zen_free_model_uses_zen_upstream_and_records_usage(pool: PgPool) {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/zen/chat/completions"))
        .and(wire_header("authorization", "Bearer real-zen-key"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "id": "free_chat",
            "object": "chat.completion"
        })))
        .expect(1)
        .mount(&server)
        .await;

    let api_key =
        create_key_for_user(&pool, "free", "active", FREE_MONTHLY_REQUEST_LIMIT, None).await;
    let app = test_app(pool.clone(), &server).await;
    let response = post_chat(&app, &api_key, "deepseek-v4-flash-free", false).await;

    assert_eq!(response.status(), 200);
    assert_usage_count(&pool, 1, Some(200), Some(false)).await;
}

#[sqlx::test(migrations = "./migrations")]
async fn plus_models_use_go_upstream_and_go_key(pool: PgPool) {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/go/chat/completions"))
        .and(wire_header("authorization", "Bearer real-go-key"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "id": "plus_chat",
            "object": "chat.completion"
        })))
        .expect(3)
        .mount(&server)
        .await;

    let api_key = create_key_for_user(
        &pool,
        "plus",
        "active",
        PLUS_MONTHLY_REQUEST_LIMIT,
        Some(Utc::now() + Duration::days(30)),
    )
    .await;
    let app = test_app(pool.clone(), &server).await;

    for model in ["qwen3.6-plus", "deepseek-v4-pro", "mimo-v2.5-pro"] {
        let response = post_chat(&app, &api_key, model, false).await;
        assert_eq!(response.status(), 200);
    }

    assert_usage_count(&pool, 3, Some(200), Some(false)).await;
}

#[sqlx::test(migrations = "./migrations")]
async fn plus_free_models_use_zen_upstream_and_zen_key(pool: PgPool) {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/zen/chat/completions"))
        .and(wire_header("authorization", "Bearer real-zen-key"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "id": "plus_free_chat",
            "object": "chat.completion"
        })))
        .expect(1)
        .mount(&server)
        .await;

    let api_key = create_key_for_user(
        &pool,
        "plus",
        "active",
        PLUS_MONTHLY_REQUEST_LIMIT,
        Some(Utc::now() + Duration::days(30)),
    )
    .await;
    let app = test_app(pool.clone(), &server).await;
    let response = post_chat(&app, &api_key, "minimax-m2.5-free", false).await;

    assert_eq!(response.status(), 200);
    assert_usage_count(&pool, 1, Some(200), Some(false)).await;
}

#[sqlx::test(migrations = "./migrations")]
async fn models_endpoint_returns_models_for_effective_plan(pool: PgPool) {
    let server = MockServer::start().await;
    let free_key =
        create_key_for_user(&pool, "free", "active", FREE_MONTHLY_REQUEST_LIMIT, None).await;
    let plus_key = create_key_for_user(
        &pool,
        "plus",
        "active",
        PLUS_MONTHLY_REQUEST_LIMIT,
        Some(Utc::now() + Duration::days(30)),
    )
    .await;
    let app = test_app(pool.clone(), &server).await;

    let free_models = get_models(&app, &free_key).await;
    assert_eq!(
        model_ids(&free_models),
        vec![
            "big-pickle",
            "deepseek-v4-flash-free",
            "minimax-m2.5-free",
            "ring-2.6-1t-free",
            "nemotron-3-super-free"
        ]
    );

    let plus_models = get_models(&app, &plus_key).await;
    let plus_ids = model_ids(&plus_models);
    assert!(plus_ids.contains(&"qwen3.6-plus"));
    assert!(plus_ids.contains(&"deepseek-v4-pro"));
    assert!(plus_ids.contains(&"big-pickle"));
    assert!(plus_ids.contains(&"nemotron-3-super-free"));
}

#[sqlx::test(migrations = "./migrations")]
async fn plan_model_errors_return_expected_status_codes(pool: PgPool) {
    let server = MockServer::start().await;
    let free_key =
        create_key_for_user(&pool, "free", "active", FREE_MONTHLY_REQUEST_LIMIT, None).await;
    let plus_key = create_key_for_user(
        &pool,
        "plus",
        "active",
        PLUS_MONTHLY_REQUEST_LIMIT,
        Some(Utc::now() + Duration::days(30)),
    )
    .await;
    let app = test_app(pool.clone(), &server).await;

    let free_response = post_chat(&app, &free_key, "qwen3.6-plus", false).await;
    assert_eq!(free_response.status(), 403);

    let plus_response = post_chat(&app, &plus_key, "qwen3.6-plus-free", false).await;
    assert_eq!(plus_response.status(), 400);
}

#[sqlx::test(migrations = "./migrations")]
async fn upstream_http_failure_is_returned_and_recorded_without_prompt_body(pool: PgPool) {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/go/chat/completions"))
        .and(wire_header("authorization", "Bearer real-go-key"))
        .respond_with(ResponseTemplate::new(500).set_body_json(json!({
            "error": "upstream temporarily unavailable"
        })))
        .expect(1)
        .mount(&server)
        .await;

    let api_key = create_key_for_user(
        &pool,
        "plus",
        "active",
        PLUS_MONTHLY_REQUEST_LIMIT,
        Some(Utc::now() + Duration::days(30)),
    )
    .await;
    let app = test_app(pool.clone(), &server).await;
    let response = post_chat(&app, &api_key, "qwen3.6-plus", false).await;

    assert_eq!(response.status(), 500);
    let row: (String, String, i32, Option<String>) =
        sqlx::query_as("SELECT model, path, status_code, error_type FROM usage_events LIMIT 1")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(row.0, "qwen3.6-plus");
    assert_eq!(row.1, "/v1/chat/completions");
    assert_eq!(row.2, 500);
    assert_eq!(row.3, None);
}

#[sqlx::test(migrations = "./migrations")]
async fn streaming_chat_response_is_proxied_and_recorded(pool: PgPool) {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/go/chat/completions"))
        .and(wire_header("authorization", "Bearer real-go-key"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_raw("data: hello\n\ndata: [DONE]\n\n", "text/event-stream"),
        )
        .expect(1)
        .mount(&server)
        .await;

    let api_key = create_key_for_user(
        &pool,
        "plus",
        "active",
        PLUS_MONTHLY_REQUEST_LIMIT,
        Some(Utc::now() + Duration::days(30)),
    )
    .await;
    let app = test_app(pool.clone(), &server).await;
    let response = post_chat(&app, &api_key, "qwen3.6-plus", true).await;

    assert_eq!(response.status(), 200);
    assert_eq!(
        response.headers().get(header::CONTENT_TYPE).unwrap(),
        "text/event-stream"
    );
    let bytes = test::read_body(response).await;
    assert_eq!(bytes, "data: hello\n\ndata: [DONE]\n\n");
    assert_usage_count(&pool, 1, Some(200), Some(true)).await;
}

#[sqlx::test(migrations = "./migrations")]
async fn upstream_failover_success_is_recorded_with_final_status(pool: PgPool) {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/go/chat/completions"))
        .and(wire_header("authorization", "Bearer real-go-key"))
        .respond_with(ResponseTemplate::new(500).set_body_json(json!({
            "error": "first key failed"
        })))
        .expect(1)
        .mount(&server)
        .await;
    Mock::given(method("POST"))
        .and(path("/go/chat/completions"))
        .and(wire_header("authorization", "Bearer fallback-go-key"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "id": "fallback_chat",
            "object": "chat.completion"
        })))
        .expect(1)
        .mount(&server)
        .await;

    let api_key = create_key_for_user(
        &pool,
        "plus",
        "active",
        PLUS_MONTHLY_REQUEST_LIMIT,
        Some(Utc::now() + Duration::days(30)),
    )
    .await;
    let app = test_app_with_keys(
        pool.clone(),
        &server,
        vec!["real-zen-key"],
        vec!["real-go-key", "fallback-go-key"],
    )
    .await;
    let response = post_chat(&app, &api_key, "qwen3.6-plus", false).await;

    assert_eq!(response.status(), 200);
    assert_usage_count(&pool, 1, Some(200), Some(false)).await;
}

#[sqlx::test(migrations = "./migrations")]
async fn all_upstream_http_failures_return_last_response_and_record_usage(pool: PgPool) {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/go/chat/completions"))
        .and(wire_header("authorization", "Bearer real-go-key"))
        .respond_with(ResponseTemplate::new(500).set_body_json(json!({
            "error": "first key failed"
        })))
        .expect(1)
        .mount(&server)
        .await;
    Mock::given(method("POST"))
        .and(path("/go/chat/completions"))
        .and(wire_header("authorization", "Bearer fallback-go-key"))
        .respond_with(ResponseTemplate::new(502).set_body_json(json!({
            "error": "fallback key failed"
        })))
        .expect(1)
        .mount(&server)
        .await;

    let api_key = create_key_for_user(
        &pool,
        "plus",
        "active",
        PLUS_MONTHLY_REQUEST_LIMIT,
        Some(Utc::now() + Duration::days(30)),
    )
    .await;
    let app = test_app_with_keys(
        pool.clone(),
        &server,
        vec!["real-zen-key"],
        vec!["real-go-key", "fallback-go-key"],
    )
    .await;
    let response = post_chat(&app, &api_key, "qwen3.6-plus", false).await;

    assert_eq!(response.status(), 502);
    assert_usage_count(&pool, 1, Some(502), Some(false)).await;
}

async fn test_app(
    pool: PgPool,
    server: &MockServer,
) -> impl actix_service::Service<
    actix_http::Request,
    Response = actix_web::dev::ServiceResponse,
    Error = actix_web::Error,
> {
    test_app_with_keys(pool, server, vec!["real-zen-key"], vec!["real-go-key"]).await
}

async fn test_app_with_keys(
    pool: PgPool,
    server: &MockServer,
    zen_keys: Vec<&str>,
    go_keys: Vec<&str>,
) -> impl actix_service::Service<
    actix_http::Request,
    Response = actix_web::dev::ServiceResponse,
    Error = actix_web::Error,
> {
    test::init_service(
        App::new()
            .app_data(web::Data::new(app_state(pool, server, zen_keys, go_keys)))
            .configure(routes::configure),
    )
    .await
}

fn app_state(
    pool: PgPool,
    server: &MockServer,
    zen_keys: Vec<&str>,
    go_keys: Vec<&str>,
) -> AppState {
    let config = Config {
        database_url: "postgres://postgres:postgres@localhost/openachieve_test".to_string(),
        admin_emails: vec!["admin@example.com".to_string()],
        opencode_zen_api_keys: zen_keys.into_iter().map(str::to_string).collect(),
        opencode_go_api_keys: go_keys.into_iter().map(str::to_string).collect(),
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
    };
    let upstream_keys = UpstreamKeyRing::from_config(&config);

    AppState {
        config,
        db: pool,
        http: Client::new(),
        upstream_keys,
    }
}

async fn create_key_for_user(
    pool: &PgPool,
    plan: &str,
    plan_status: &str,
    monthly_limit: i32,
    plus_expires_at: Option<DateTime<Utc>>,
) -> String {
    let user_id = insert_user(pool, plan, plan_status, monthly_limit, plus_expires_at).await;
    create_customer_key_for_user(pool, user_id, "test-key", monthly_limit)
        .await
        .unwrap()
        .key
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

async fn post_chat<S>(
    app: &S,
    api_key: &str,
    model: &str,
    stream: bool,
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
        .insert_header(("authorization", format!("Bearer {api_key}")))
        .set_json(json!({
            "model": model,
            "stream": stream,
            "messages": [
                { "role": "user", "content": "do not store this prompt" }
            ]
        }))
        .to_request();

    test::call_service(app, req).await
}

async fn get_models<S>(app: &S, api_key: &str) -> Value
where
    S: actix_service::Service<
            actix_http::Request,
            Response = actix_web::dev::ServiceResponse,
            Error = actix_web::Error,
        >,
{
    let req = test::TestRequest::get()
        .uri("/v1/models")
        .insert_header(("authorization", format!("Bearer {api_key}")))
        .to_request();

    test::call_and_read_body_json(app, req).await
}

fn model_ids(value: &Value) -> Vec<&str> {
    value["data"]
        .as_array()
        .unwrap()
        .iter()
        .map(|item| item["id"].as_str().unwrap())
        .collect()
}

async fn assert_usage_count(
    pool: &PgPool,
    expected_count: i64,
    expected_status: Option<i32>,
    expected_stream: Option<bool>,
) {
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM usage_events")
        .fetch_one(pool)
        .await
        .unwrap();
    assert_eq!(count, expected_count);

    if let Some(status) = expected_status {
        let stored_status: i32 =
            sqlx::query_scalar("SELECT status_code FROM usage_events ORDER BY id DESC LIMIT 1")
                .fetch_one(pool)
                .await
                .unwrap();
        assert_eq!(stored_status, status);
    }

    if let Some(is_stream) = expected_stream {
        let stored_stream: bool =
            sqlx::query_scalar("SELECT is_stream FROM usage_events ORDER BY id DESC LIMIT 1")
                .fetch_one(pool)
                .await
                .unwrap();
        assert_eq!(stored_stream, is_stream);
    }
}
