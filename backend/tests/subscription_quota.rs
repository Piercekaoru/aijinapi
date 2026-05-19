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
    email::{InMemoryEmailSender, SharedEmailSender},
    errors::ApiError,
    free_models::FreeModelCatalog,
    keys::hash_key,
    models::User,
    plans::{FREE_MONTHLY_REQUEST_LIMIT, PLUS_MONTHLY_REQUEST_LIMIT},
    routes,
    state::AppState,
    upstream::UpstreamKeyRing,
};

#[sqlx::test(migrations = "./migrations")]
async fn register_user_defaults_to_free_quota(pool: PgPool) {
    let email_sender = InMemoryEmailSender::shared();
    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(app_state_with_email(
                pool.clone(),
                email_sender.clone(),
            )))
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
    assert_eq!(response.status(), StatusCode::ACCEPTED);
    let body: Value = test::read_body_json(response).await;
    assert_eq!(body["verification_required"], true);
    assert_eq!(body["email"], email.as_str());
    assert_eq!(email_sender.sent().len(), 1);
    assert_eq!(email_sender.sent()[0].to_email, email);

    let (stored_limit, email_verified_at): (i32, Option<DateTime<Utc>>) = sqlx::query_as(
        "SELECT monthly_request_limit, email_verified_at FROM users WHERE email = $1",
    )
    .bind(&email)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(stored_limit, FREE_MONTHLY_REQUEST_LIMIT);
    assert!(email_verified_at.is_none());

    let session_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sessions")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(session_count, 0);

    let key_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM api_keys")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(key_count, 0);
}

#[sqlx::test(migrations = "./migrations")]
async fn user_can_verify_email_then_login_and_get_default_key(pool: PgPool) {
    let email_sender = InMemoryEmailSender::shared();
    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(app_state_with_email(
                pool.clone(),
                email_sender.clone(),
            )))
            .configure(routes::configure),
    )
    .await;

    let email = format!("{}@example.com", Uuid::new_v4());
    let password = "password123";
    let register = test::TestRequest::post()
        .uri("/auth/register")
        .set_json(json!({
            "name": "Verify Tester",
            "email": email,
            "password": password
        }))
        .to_request();
    assert_eq!(
        test::call_service(&app, register).await.status(),
        StatusCode::ACCEPTED
    );

    let login_before_verify = test::TestRequest::post()
        .uri("/auth/login")
        .set_json(json!({
            "email": email,
            "password": password
        }))
        .to_request();
    let login_before_response = test::call_service(&app, login_before_verify).await;
    assert_eq!(login_before_response.status(), StatusCode::FORBIDDEN);
    let login_before_body: Value = test::read_body_json(login_before_response).await;
    assert_eq!(login_before_body["error"]["code"], "email_not_verified");

    let token = verification_token_from_url(&email_sender.sent()[0].verification_url);
    let verify = test::TestRequest::get()
        .uri(&format!("/auth/verify-email?token={token}"))
        .to_request();
    let verify_response = test::call_service(&app, verify).await;
    assert_eq!(verify_response.status(), StatusCode::SEE_OTHER);
    assert_eq!(
        verify_response.headers().get("location").unwrap(),
        "http://localhost:3000/login?verified=1"
    );

    let verified_at: Option<DateTime<Utc>> =
        sqlx::query_scalar("SELECT email_verified_at FROM users WHERE email = $1")
            .bind(&email)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(verified_at.is_some());

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
async fn verification_rejects_expired_reused_and_fake_tokens(pool: PgPool) {
    let email_sender = InMemoryEmailSender::shared();
    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(app_state_with_email(
                pool.clone(),
                email_sender.clone(),
            )))
            .configure(routes::configure),
    )
    .await;

    let email = format!("{}@example.com", Uuid::new_v4());
    let register = test::TestRequest::post()
        .uri("/auth/register")
        .set_json(json!({
            "name": "Expired Tester",
            "email": email,
            "password": "password123"
        }))
        .to_request();
    assert_eq!(
        test::call_service(&app, register).await.status(),
        StatusCode::ACCEPTED
    );
    let expired_token = verification_token_from_url(&email_sender.sent()[0].verification_url);
    sqlx::query(
        "UPDATE email_verification_tokens SET created_at = now() - interval '25 hours', expires_at = now() - interval '1 second'",
    )
    .execute(&pool)
    .await
    .unwrap();

    let expired = test::TestRequest::get()
        .uri(&format!("/auth/verify-email?token={expired_token}"))
        .to_request();
    let expired_response = test::call_service(&app, expired).await;
    assert_eq!(expired_response.status(), StatusCode::SEE_OTHER);
    assert_eq!(
        expired_response.headers().get("location").unwrap(),
        "http://localhost:3000/login?verification=invalid"
    );

    let verified_at: Option<DateTime<Utc>> =
        sqlx::query_scalar("SELECT email_verified_at FROM users WHERE email = $1")
            .bind(&email)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(verified_at.is_none());

    let resend = test::TestRequest::post()
        .uri("/auth/resend-verification")
        .set_json(json!({
            "email": email,
            "password": "password123"
        }))
        .to_request();
    assert_eq!(
        test::call_service(&app, resend).await.status(),
        StatusCode::OK
    );
    let valid_token = verification_token_from_url(&email_sender.sent()[1].verification_url);

    let valid = test::TestRequest::get()
        .uri(&format!("/auth/verify-email?token={valid_token}"))
        .to_request();
    assert_eq!(
        test::call_service(&app, valid).await.status(),
        StatusCode::SEE_OTHER
    );

    let reused = test::TestRequest::get()
        .uri(&format!("/auth/verify-email?token={valid_token}"))
        .to_request();
    let reused_response = test::call_service(&app, reused).await;
    assert_eq!(
        reused_response.headers().get("location").unwrap(),
        "http://localhost:3000/login?verification=invalid"
    );

    let fake = test::TestRequest::get()
        .uri("/auth/verify-email?token=openachieve_verify_fake")
        .to_request();
    let fake_response = test::call_service(&app, fake).await;
    assert_eq!(
        fake_response.headers().get("location").unwrap(),
        "http://localhost:3000/login?verification=invalid"
    );
}

#[sqlx::test(migrations = "./migrations")]
async fn resend_verification_requires_password_and_rate_limits(pool: PgPool) {
    let email_sender = InMemoryEmailSender::shared();
    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(app_state_with_email(
                pool.clone(),
                email_sender.clone(),
            )))
            .configure(routes::configure),
    )
    .await;

    let email = format!("{}@example.com", Uuid::new_v4());
    let register = test::TestRequest::post()
        .uri("/auth/register")
        .set_json(json!({
            "name": "Resend Tester",
            "email": email,
            "password": "password123"
        }))
        .to_request();
    assert_eq!(
        test::call_service(&app, register).await.status(),
        StatusCode::ACCEPTED
    );

    let wrong_password = test::TestRequest::post()
        .uri("/auth/resend-verification")
        .set_json(json!({
            "email": email,
            "password": "wrong-password"
        }))
        .to_request();
    assert_eq!(
        test::call_service(&app, wrong_password).await.status(),
        StatusCode::UNAUTHORIZED
    );

    let rate_limited = test::TestRequest::post()
        .uri("/auth/resend-verification")
        .set_json(json!({
            "email": email,
            "password": "password123"
        }))
        .to_request();
    let rate_limited_response = test::call_service(&app, rate_limited).await;
    assert_eq!(
        rate_limited_response.status(),
        StatusCode::TOO_MANY_REQUESTS
    );
    let body: Value = test::read_body_json(rate_limited_response).await;
    assert_eq!(body["error"]["code"], "verification_email_recently_sent");

    sqlx::query("UPDATE email_verification_tokens SET created_at = now() - interval '61 seconds'")
        .execute(&pool)
        .await
        .unwrap();

    let resend = test::TestRequest::post()
        .uri("/auth/resend-verification")
        .set_json(json!({
            "email": email,
            "password": "password123"
        }))
        .to_request();
    assert_eq!(
        test::call_service(&app, resend).await.status(),
        StatusCode::OK
    );
    assert_eq!(email_sender.sent().len(), 2);

    let active_tokens: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM email_verification_tokens WHERE consumed_at IS NULL",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(active_tokens, 1);
}

#[sqlx::test(migrations = "./migrations")]
async fn password_reset_request_sends_email_and_hides_unknown_accounts(pool: PgPool) {
    let email_sender = InMemoryEmailSender::shared();
    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(app_state_with_email(
                pool.clone(),
                email_sender.clone(),
            )))
            .configure(routes::configure),
    )
    .await;

    let email = format!("{}@example.com", Uuid::new_v4());
    insert_verified_user(&pool, &email, "password123").await;

    let reset = test::TestRequest::post()
        .uri("/auth/password-reset/request")
        .set_json(json!({ "email": email }))
        .to_request();
    assert_eq!(
        test::call_service(&app, reset).await.status(),
        StatusCode::ACCEPTED
    );
    assert_eq!(email_sender.password_resets().len(), 1);
    assert_eq!(email_sender.password_resets()[0].to_email, email);

    let token = reset_token_from_url(&email_sender.password_resets()[0].reset_url);
    let stored_hash: String =
        sqlx::query_scalar("SELECT token_hash FROM password_reset_tokens WHERE user_id = $1")
            .bind(user_id_by_email(&pool, &email).await)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_ne!(stored_hash, token);
    assert_eq!(stored_hash, hash_key(&token));

    let unknown = test::TestRequest::post()
        .uri("/auth/password-reset/request")
        .set_json(json!({ "email": "missing@example.com" }))
        .to_request();
    assert_eq!(
        test::call_service(&app, unknown).await.status(),
        StatusCode::ACCEPTED
    );
    assert_eq!(email_sender.password_resets().len(), 1);

    let unverified_email = format!("{}@example.com", Uuid::new_v4());
    sqlx::query(
        r#"
        INSERT INTO users (email, name, password_hash, plan, plan_status, monthly_request_limit)
        VALUES ($1, 'Unverified', $2, 'free', 'active', $3)
        "#,
    )
    .bind(&unverified_email)
    .bind(hash_password("password123").unwrap())
    .bind(FREE_MONTHLY_REQUEST_LIMIT)
    .execute(&pool)
    .await
    .unwrap();

    let unverified = test::TestRequest::post()
        .uri("/auth/password-reset/request")
        .set_json(json!({ "email": unverified_email }))
        .to_request();
    assert_eq!(
        test::call_service(&app, unverified).await.status(),
        StatusCode::ACCEPTED
    );
    assert_eq!(email_sender.password_resets().len(), 1);
}

#[sqlx::test(migrations = "./migrations")]
async fn password_reset_confirm_updates_password_and_revokes_sessions(pool: PgPool) {
    let email_sender = InMemoryEmailSender::shared();
    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(app_state_with_email(
                pool.clone(),
                email_sender.clone(),
            )))
            .configure(routes::configure),
    )
    .await;

    let email = format!("{}@example.com", Uuid::new_v4());
    let old_password = "password123";
    let new_password = "new-password-456";
    insert_verified_user(&pool, &email, old_password).await;

    let login = test::TestRequest::post()
        .uri("/auth/login")
        .set_json(json!({
            "email": email,
            "password": old_password
        }))
        .to_request();
    let login_body: Value = test::call_and_read_body_json(&app, login).await;
    let old_session = login_body["session_token"].as_str().unwrap().to_string();

    let reset = test::TestRequest::post()
        .uri("/auth/password-reset/request")
        .set_json(json!({ "email": email }))
        .to_request();
    assert_eq!(
        test::call_service(&app, reset).await.status(),
        StatusCode::ACCEPTED
    );
    let token = reset_token_from_url(&email_sender.password_resets()[0].reset_url);

    let weak_password = test::TestRequest::post()
        .uri("/auth/password-reset/confirm")
        .set_json(json!({
            "token": token,
            "password": "short"
        }))
        .to_request();
    let weak_response = test::call_service(&app, weak_password).await;
    assert_eq!(weak_response.status(), StatusCode::BAD_REQUEST);
    let weak_body: Value = test::read_body_json(weak_response).await;
    assert_eq!(weak_body["error"]["code"], "invalid_request");

    let confirm = test::TestRequest::post()
        .uri("/auth/password-reset/confirm")
        .set_json(json!({
            "token": token,
            "password": new_password
        }))
        .to_request();
    assert_eq!(
        test::call_service(&app, confirm).await.status(),
        StatusCode::OK
    );

    let old_login = test::TestRequest::post()
        .uri("/auth/login")
        .set_json(json!({
            "email": email,
            "password": old_password
        }))
        .to_request();
    assert_eq!(
        test::call_service(&app, old_login).await.status(),
        StatusCode::UNAUTHORIZED
    );

    let new_login = test::TestRequest::post()
        .uri("/auth/login")
        .set_json(json!({
            "email": email,
            "password": new_password
        }))
        .to_request();
    let new_login_body: Value = test::call_and_read_body_json(&app, new_login).await;
    assert!(
        new_login_body["session_token"]
            .as_str()
            .unwrap()
            .starts_with("openachieve_session_")
    );

    let old_session_me = test::TestRequest::get()
        .uri("/auth/me")
        .insert_header(("authorization", format!("Bearer {old_session}")))
        .to_request();
    assert_eq!(
        test::call_service(&app, old_session_me).await.status(),
        StatusCode::UNAUTHORIZED
    );

    let reused = test::TestRequest::post()
        .uri("/auth/password-reset/confirm")
        .set_json(json!({
            "token": token,
            "password": "another-password-789"
        }))
        .to_request();
    assert_eq!(
        test::call_service(&app, reused).await.status(),
        StatusCode::BAD_REQUEST
    );
}

#[sqlx::test(migrations = "./migrations")]
async fn password_reset_rejects_expired_fake_and_superseded_tokens(pool: PgPool) {
    let email_sender = InMemoryEmailSender::shared();
    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(app_state_with_email(
                pool.clone(),
                email_sender.clone(),
            )))
            .configure(routes::configure),
    )
    .await;

    let email = format!("{}@example.com", Uuid::new_v4());
    let user_id = insert_verified_user(&pool, &email, "password123").await;

    let first_reset = test::TestRequest::post()
        .uri("/auth/password-reset/request")
        .set_json(json!({ "email": email }))
        .to_request();
    assert_eq!(
        test::call_service(&app, first_reset).await.status(),
        StatusCode::ACCEPTED
    );
    let first_token = reset_token_from_url(&email_sender.password_resets()[0].reset_url);

    let second_reset = test::TestRequest::post()
        .uri("/auth/password-reset/request")
        .set_json(json!({ "email": email }))
        .to_request();
    assert_eq!(
        test::call_service(&app, second_reset).await.status(),
        StatusCode::ACCEPTED
    );
    let second_token = reset_token_from_url(&email_sender.password_resets()[1].reset_url);

    let active_tokens: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM password_reset_tokens WHERE user_id = $1 AND consumed_at IS NULL",
    )
    .bind(user_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(active_tokens, 1);

    let superseded = test::TestRequest::post()
        .uri("/auth/password-reset/confirm")
        .set_json(json!({
            "token": first_token,
            "password": "new-password-456"
        }))
        .to_request();
    assert_eq!(
        test::call_service(&app, superseded).await.status(),
        StatusCode::BAD_REQUEST
    );

    sqlx::query(
        "UPDATE password_reset_tokens SET expires_at = now() - interval '1 second' WHERE user_id = $1 AND consumed_at IS NULL",
    )
    .bind(user_id)
    .execute(&pool)
    .await
    .unwrap();

    let expired = test::TestRequest::post()
        .uri("/auth/password-reset/confirm")
        .set_json(json!({
            "token": second_token,
            "password": "new-password-456"
        }))
        .to_request();
    assert_eq!(
        test::call_service(&app, expired).await.status(),
        StatusCode::BAD_REQUEST
    );

    let fake = test::TestRequest::post()
        .uri("/auth/password-reset/confirm")
        .set_json(json!({
            "token": "openachieve_reset_fake",
            "password": "new-password-456"
        }))
        .to_request();
    assert_eq!(
        test::call_service(&app, fake).await.status(),
        StatusCode::BAD_REQUEST
    );
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
        INSERT INTO users (email, name, password_hash, email_verified_at, plan, plan_status, monthly_request_limit)
        VALUES ($1, 'Verified Tester', $2, now(), 'free', 'active', $3)
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
    assert!(
        summary
            .allowed_models
            .iter()
            .any(|model| model == "qwen3.6-plus")
    );
    assert!(
        summary
            .allowed_models
            .iter()
            .any(|model| model == "big-pickle")
    );
    assert!(
        summary
            .allowed_models
            .iter()
            .any(|model| model == "deepseek-v4-flash-free")
    );
    assert!(
        summary
            .allowed_models
            .iter()
            .any(|model| model == "deepseek-v4-flash")
    );
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
    assert!(
        summary
            .allowed_models
            .iter()
            .any(|model| model == "deepseek-v4-flash")
    );
    assert!(matches!(
        ensure_monthly_quota(&pool, &user).await,
        Err(ApiError::QuotaExceeded)
    ));
}

fn app_state(pool: PgPool) -> AppState {
    app_state_with_email(pool, InMemoryEmailSender::shared())
}

fn app_state_with_email(pool: PgPool, email: SharedEmailSender) -> AppState {
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
        fovpay: None,
    };
    let upstream_keys = UpstreamKeyRing::from_config(&config);

    AppState {
        config,
        db: pool,
        http: Client::new(),
        email,
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
          email_verified_at,
          plan,
          plan_status,
          monthly_request_limit,
          plus_started_at,
          plus_expires_at
        )
        VALUES ($1, 'Test User', 'hash', now(), $2, $3, $4, now(), $5)
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

async fn insert_verified_user(pool: &PgPool, email: &str, password: &str) -> i64 {
    let password_hash = hash_password(password).unwrap();
    sqlx::query_scalar(
        r#"
        INSERT INTO users (email, name, password_hash, email_verified_at, plan, plan_status, monthly_request_limit)
        VALUES ($1, 'Verified Tester', $2, now(), 'free', 'active', $3)
        RETURNING id
        "#,
    )
    .bind(email)
    .bind(password_hash)
    .bind(FREE_MONTHLY_REQUEST_LIMIT)
    .fetch_one(pool)
    .await
    .unwrap()
}

async fn user_id_by_email(pool: &PgPool, email: &str) -> i64 {
    sqlx::query_scalar("SELECT id FROM users WHERE email = $1")
        .bind(email)
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
          email_verified_at,
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

fn verification_token_from_url(url: &str) -> String {
    url.split("token=")
        .nth(1)
        .expect("verification URL should include token")
        .to_string()
}

fn reset_token_from_url(url: &str) -> String {
    url.split("reset_token=")
        .nth(1)
        .expect("reset URL should include reset_token")
        .to_string()
}
