use std::collections::HashMap;

use actix_web::{
    App,
    http::{StatusCode, header},
    test, web,
};
use chrono::{DateTime, Utc};
use reqwest::Client;
use serde_json::{Value, json};
use sqlx::PgPool;
use wiremock::{
    Mock, MockServer, ResponseTemplate,
    matchers::{body_string_contains, method, path},
};

use openachieve_backend::{
    config::{Config, FovPayConfig},
    db::{create_session, insert_billing_order},
    email::InMemoryEmailSender,
    fovpay::{SIGN_TYPE_MD5, sign_md5},
    free_models::FreeModelCatalog,
    plans::{FREE_MONTHLY_REQUEST_LIMIT, PLUS_MONTHLY_REQUEST_LIMIT},
    routes,
    state::AppState,
    upstream::UpstreamKeyRing,
};

#[sqlx::test(migrations = "./migrations")]
async fn checkout_requires_session(pool: PgPool) {
    let server = MockServer::start().await;
    let app = test_app(pool, &server).await;

    let request = test::TestRequest::post()
        .uri("/dashboard/billing/fovpay/checkout")
        .set_json(json!({ "paytype_code": "alipay" }))
        .to_request();
    let response = test::call_service(&app, request).await;

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[sqlx::test(migrations = "./migrations")]
async fn checkout_rejects_disallowed_paytype(pool: PgPool) {
    let server = MockServer::start().await;
    let user_id = insert_user(&pool, "paytype@example.com").await;
    let session = create_session(&pool, user_id).await.unwrap();
    let app = test_app(pool, &server).await;

    let request = authed_post(&session, "/dashboard/billing/fovpay/checkout")
        .set_json(json!({ "paytype_code": "unsupported_paytype" }))
        .to_request();
    let response = test::call_service(&app, request).await;

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
}

#[sqlx::test(migrations = "./migrations")]
async fn checkout_creates_pending_order_and_requests_fovpay(pool: PgPool) {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/openapi/pay/create"))
        .and(body_string_contains("paytype_code=alipay"))
        .and(body_string_contains("total_amount=58.00"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "code": 1,
            "msg": "success",
            "data": {
                "trade_no": "P202605170001",
                "out_trade_no": "ignored-by-test",
                "pay_url": "https://pay.fovpay.com/cashier/test"
            }
        })))
        .mount(&server)
        .await;

    let user_id = insert_user(&pool, "checkout@example.com").await;
    let session = create_session(&pool, user_id).await.unwrap();
    let app = test_app(pool.clone(), &server).await;
    let request = authed_post(&session, "/dashboard/billing/fovpay/checkout")
        .set_json(json!({ "paytype_code": "alipay" }))
        .to_request();
    let response = test::call_service(&app, request).await;

    assert_eq!(response.status(), StatusCode::OK);
    let body = test::read_body_json::<Value, _>(response).await;
    assert_eq!(body["pay_url"], "https://pay.fovpay.com/cashier/test");
    assert_eq!(body["paytype_code"], "alipay");

    let pending_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM billing_orders WHERE user_id = $1 AND status = 'pending'",
    )
    .bind(user_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(pending_count, 1);
}

#[sqlx::test(migrations = "./migrations")]
async fn checkout_rejects_temporarily_disabled_paypal_paytype(pool: PgPool) {
    assert_checkout_rejects_paytype(pool, "paypal", "paypal-checkout@example.com").await;
}

#[sqlx::test(migrations = "./migrations")]
async fn checkout_rejects_temporarily_disabled_usdt_paytype(pool: PgPool) {
    assert_checkout_rejects_paytype(pool, "usdt", "usdt-checkout@example.com").await;
}

#[sqlx::test(migrations = "./migrations")]
async fn valid_trade_success_callback_grants_plus_once(pool: PgPool) {
    let server = MockServer::start().await;
    let user_id = insert_user(&pool, "notify@example.com").await;
    let order = insert_billing_order(
        &pool,
        user_id,
        "OA_NOTIFY_SUCCESS",
        5800,
        "alipay",
        "OpenAchieve Plus 30 days",
    )
    .await
    .unwrap();
    let app = test_app(pool.clone(), &server).await;
    let params = success_notify_params(&order.out_trade_no);

    let response = test::call_service(
        &app,
        test::TestRequest::post()
            .uri("/billing/fovpay/notify")
            .set_form(&params)
            .to_request(),
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(test::read_body(response).await, "success");

    let first_expires_at = plus_expires_at(&pool, user_id).await;
    assert!(first_expires_at > Utc::now());
    let user_plan: (String, String, i32) =
        sqlx::query_as("SELECT plan, plan_status, monthly_request_limit FROM users WHERE id = $1")
            .bind(user_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(
        user_plan,
        (
            "plus".to_string(),
            "active".to_string(),
            PLUS_MONTHLY_REQUEST_LIMIT
        )
    );

    let duplicate = test::call_service(
        &app,
        test::TestRequest::post()
            .uri("/billing/fovpay/notify")
            .set_form(&params)
            .to_request(),
    )
    .await;
    assert_eq!(duplicate.status(), StatusCode::OK);
    assert_eq!(plus_expires_at(&pool, user_id).await, first_expires_at);
}

#[sqlx::test(migrations = "./migrations")]
async fn invalid_callback_signature_does_not_grant_plus(pool: PgPool) {
    let server = MockServer::start().await;
    let user_id = insert_user(&pool, "bad-sign@example.com").await;
    let order = insert_billing_order(
        &pool,
        user_id,
        "OA_BAD_SIGNATURE",
        5800,
        "wxpay",
        "OpenAchieve Plus 30 days",
    )
    .await
    .unwrap();
    let app = test_app(pool.clone(), &server).await;
    let mut params = success_notify_params(&order.out_trade_no);
    params.insert("sign".to_string(), "bad-sign".to_string());

    let response = test::call_service(
        &app,
        test::TestRequest::post()
            .uri("/billing/fovpay/notify")
            .set_form(&params)
            .to_request(),
    )
    .await;

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    let plan: String = sqlx::query_scalar("SELECT plan FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(plan, "free");
}

#[sqlx::test(migrations = "./migrations")]
async fn users_can_only_query_their_own_orders(pool: PgPool) {
    let server = MockServer::start().await;
    let owner_id = insert_user(&pool, "owner@example.com").await;
    let stranger_id = insert_user(&pool, "stranger@example.com").await;
    let session = create_session(&pool, stranger_id).await.unwrap();
    let order = insert_billing_order(
        &pool,
        owner_id,
        "OA_OWNER_ONLY",
        5800,
        "alipay",
        "OpenAchieve Plus 30 days",
    )
    .await
    .unwrap();
    let app = test_app(pool, &server).await;

    let response = test::call_service(
        &app,
        test::TestRequest::get()
            .uri(&format!("/dashboard/billing/orders/{}", order.out_trade_no))
            .insert_header((header::AUTHORIZATION, format!("Bearer {session}")))
            .to_request(),
    )
    .await;

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
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
        zen_chat_completions_url: "http://127.0.0.1/zen/chat/completions".to_string(),
        zen_go_chat_completions_url: "http://127.0.0.1/go/chat/completions".to_string(),
        zen_go_messages_url: "http://127.0.0.1/go/messages".to_string(),
        zen_models_url: "http://127.0.0.1/zen/models".to_string(),
        zen_go_models_url: "http://127.0.0.1/go/models".to_string(),
        upstream_max_attempts: 1,
        upstream_retry_base_ms: 0,
        upstream_key_cooldown_ms: 60_000,
        cors_allowed_origins: vec!["http://localhost:3000".to_string()],
        smtp: None,
        fovpay: Some(FovPayConfig {
            enabled: true,
            base_url: server.uri(),
            pid: "2088123456789012".to_string(),
            secret_key: "fovpay-secret".to_string(),
            plus_amount_cents: 5800,
            plus_days: 30,
            allowed_paytypes: vec!["alipay".to_string(), "wxpay".to_string()],
            disabled_paytypes: vec!["paypal".to_string(), "usdt".to_string()],
        }),
    };
    let upstream_keys = UpstreamKeyRing::from_config(&config);

    AppState {
        config,
        db: pool,
        http: Client::new(),
        email: InMemoryEmailSender::shared(),
        upstream_keys,
        free_models: FreeModelCatalog::seeded(["big-pickle", "deepseek-v4-flash-free"]),
    }
}

async fn assert_checkout_rejects_paytype(pool: PgPool, paytype: &str, email: &str) {
    let server = MockServer::start().await;
    let user_id = insert_user(&pool, email).await;
    let session = create_session(&pool, user_id).await.unwrap();
    let app = test_app(pool.clone(), &server).await;
    let request = authed_post(&session, "/dashboard/billing/fovpay/checkout")
        .set_json(json!({ "paytype_code": paytype }))
        .to_request();
    let response = test::call_service(&app, request).await;

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);

    let pending_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM billing_orders WHERE user_id = $1 AND status = 'pending' AND paytype_code = $2",
    )
    .bind(user_id)
    .bind(paytype)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(pending_count, 0);
}

fn authed_post(session: &str, uri: &str) -> test::TestRequest {
    let mut request = test::TestRequest::post().uri(uri);
    request = request.insert_header((header::AUTHORIZATION, format!("Bearer {session}")));
    request
}

fn success_notify_params(out_trade_no: &str) -> HashMap<String, String> {
    let mut params = HashMap::from([
        ("pid".to_string(), "2088123456789012".to_string()),
        ("trade_no".to_string(), "P202605170002".to_string()),
        ("out_trade_no".to_string(), out_trade_no.to_string()),
        ("total_amount".to_string(), "58.00".to_string()),
        (
            "subject".to_string(),
            "OpenAchieve Plus 30 days".to_string(),
        ),
        ("paytype_code".to_string(), "alipay".to_string()),
        ("channel_id".to_string(), "1".to_string()),
        ("attach".to_string(), "1".to_string()),
        ("trade_status".to_string(), "TRADE_SUCCESS".to_string()),
        (
            "success_time".to_string(),
            Utc::now().timestamp().to_string(),
        ),
        ("timestamp".to_string(), Utc::now().timestamp().to_string()),
        ("sign_type".to_string(), SIGN_TYPE_MD5.to_string()),
    ]);
    let pairs = params
        .iter()
        .map(|(key, value)| (key.clone(), value.clone()))
        .collect::<Vec<_>>();
    params.insert("sign".to_string(), sign_md5(&pairs, "fovpay-secret"));
    params
}

async fn insert_user(pool: &PgPool, email: &str) -> i64 {
    sqlx::query_scalar(
        r#"
        INSERT INTO users (email, name, password_hash, email_verified_at, plan, plan_status, monthly_request_limit)
        VALUES ($1, 'Test User', 'hash', now(), 'free', 'active', $2)
        RETURNING id
        "#,
    )
    .bind(email)
    .bind(FREE_MONTHLY_REQUEST_LIMIT)
    .fetch_one(pool)
    .await
    .unwrap()
}

async fn plus_expires_at(pool: &PgPool, user_id: i64) -> DateTime<Utc> {
    sqlx::query_scalar::<_, Option<DateTime<Utc>>>(
        "SELECT plus_expires_at FROM users WHERE id = $1",
    )
    .bind(user_id)
    .fetch_one(pool)
    .await
    .unwrap()
    .unwrap()
}
