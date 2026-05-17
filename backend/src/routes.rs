use std::collections::HashMap;

use actix_web::{HttpRequest, HttpResponse, Responder, http::header, web};
use chrono::{DateTime, Duration, TimeZone, Utc};
use rand::{Rng, distr::Alphanumeric};
use serde_json::{Value, json};
use tracing::{info, warn};
use uuid::Uuid;

use crate::{
    auth::{
        authenticate, authenticate_admin_session, authenticate_session, ensure_monthly_quota,
        extract_bearer, hash_password, normalize_email, user_for_api_key, validate_password,
        validate_register_input, verify_password,
    },
    db::{
        api_key_summaries, billing_order_for_user_by_ref, consume_email_verification_token,
        consume_email_verification_token_by_value, consume_password_reset_token_by_value,
        consume_unspent_email_verification_tokens, create_customer_key_for_user,
        create_default_customer_key_if_missing, create_email_verification_token,
        create_password_reset_token, create_session, insert_billing_order,
        mark_billing_order_failed, recent_usage_for_user, record_admin_audit, record_usage,
        reset_password_with_token, revoke_api_key_for_user, subscription_summary_with_models,
        touch_key, update_billing_order_payment, verification_email_sent_recently,
    },
    email::{PasswordResetEmail, VerificationEmail},
    errors::ApiError,
    fovpay::{
        CreateOrderResponse, SIGN_TYPE_MD5, STATUS_PAID, cents_to_amount, sign_md5,
        trade_status_to_order_status, verify_md5,
    },
    free_models::{is_free_model_candidate, should_trip_free_model},
    models::{
        AdminBanUserRequest, AdminCreateUserRequest, AdminCreateUserResponse, AdminIpBanRequest,
        AdminQuotaResetResponse, AdminUpdatePlanRequest, AdminUserRow, AdminUserStats,
        AdminUserSummary, AdminUsersResponse, AuthResponse, BillingConfigSummary, BillingOrder,
        BillingOrderSummary, CreateFovPayCheckoutRequest, CreateFovPayCheckoutResponse,
        CreateUserKeyRequest, DashboardResponse, HealthResponse, IpBanSummary, LoginRequest,
        PasswordResetConfirmRequest, PasswordResetMessageResponse, PasswordResetRequest,
        PublicUser, RegisterRequest, ResendVerificationRequest, SecurityEventSummary,
        SecurityIpDetailResponse, SecurityIpStats, SecurityIpSummary, SecurityIpUser, UsageEvent,
        User, VerificationMessageResponse, VerificationRequiredResponse,
    },
    plans::{FREE_MONTHLY_REQUEST_LIMIT, FREE_PLAN, PLUS_MONTHLY_REQUEST_LIMIT, PLUS_PLAN},
    security::{
        AUTH_LIMIT, AUTH_SCOPE, AUTH_WINDOW_SECONDS, DASHBOARD_WRITE_LIMIT, DASHBOARD_WRITE_SCOPE,
        DASHBOARD_WRITE_WINDOW_SECONDS, FREE_AI_HOURLY_LIMIT, FREE_AI_HOURLY_WINDOW_SECONDS,
        FREE_AI_SCOPE, FREE_AI_SHORT_LIMIT, FREE_AI_SHORT_WINDOW_SECONDS, REGISTER_HOURLY_LIMIT,
        REGISTER_HOURLY_WINDOW_SECONDS, REGISTER_SCOPE, REGISTER_SHORT_LIMIT,
        REGISTER_SHORT_WINDOW_SECONDS, RateLimitRule, active_ip_ban, ban_user, client_ip,
        create_ip_ban, enforce_ip_rate_limits, ensure_ip_not_banned, lift_ip_ban,
        record_registration_created, record_security_event, touch_user_ip, unban_user, validate_ip,
    },
    state::AppState,
    upstream::{
        PLUS_MODELS, UpstreamRoute, bytes_from_static_json, forward_chat, is_plus_model,
        openai_models_payload, request_is_stream, request_model,
    },
};

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.route("/health", web::get().to(health))
        .route("/auth/register", web::post().to(register))
        .route("/auth/login", web::post().to(login))
        .route("/auth/verify-email", web::get().to(verify_email))
        .route(
            "/auth/resend-verification",
            web::post().to(resend_verification),
        )
        .route(
            "/auth/password-reset/request",
            web::post().to(request_password_reset),
        )
        .route(
            "/auth/password-reset/confirm",
            web::post().to(confirm_password_reset),
        )
        .route("/auth/me", web::get().to(me))
        .route("/dashboard", web::get().to(dashboard))
        .route("/dashboard/api-keys", web::post().to(create_dashboard_key))
        .route(
            "/dashboard/api-keys/{key_id}",
            web::delete().to(delete_dashboard_key),
        )
        .route(
            "/dashboard/billing/fovpay/checkout",
            web::post().to(create_fovpay_checkout),
        )
        .route(
            "/dashboard/billing/orders/{order_ref}",
            web::get().to(get_billing_order),
        )
        .route("/billing/fovpay/notify", web::post().to(fovpay_notify))
        .route("/admin/users", web::get().to(admin_users))
        .route("/admin/users", web::post().to(admin_create_user))
        .route(
            "/admin/users/{user_id}/plan",
            web::patch().to(admin_update_user_plan),
        )
        .route("/admin/users/{user_id}/ban", web::post().to(admin_ban_user))
        .route(
            "/admin/users/{user_id}/unban",
            web::post().to(admin_unban_user),
        )
        .route(
            "/admin/users/{user_id}",
            web::delete().to(admin_delete_user),
        )
        .route("/admin/quota-resets", web::post().to(admin_reset_all_quota))
        .route("/admin/security/ips", web::get().to(admin_security_ips))
        .route(
            "/admin/security/ip-detail",
            web::get().to(admin_security_ip_detail),
        )
        .route(
            "/admin/security/ip-bans",
            web::post().to(admin_create_ip_ban),
        )
        .route(
            "/admin/security/ip-bans/{ban_id}",
            web::delete().to(admin_lift_ip_ban),
        )
        .route("/public/free-models", web::get().to(public_free_models))
        .route("/v1/models", web::get().to(models))
        .route("/v1/chat/completions", web::post().to(chat_completions));
}

async fn health() -> impl Responder {
    web::Json(HealthResponse {
        ok: true,
        service: "openachieve-backend",
    })
}

async fn register(
    state: web::Data<AppState>,
    req: HttpRequest,
    body: web::Json<RegisterRequest>,
) -> Result<HttpResponse, ApiError> {
    let ip = client_ip(&req);
    ensure_ip_not_banned(&state.db, &ip).await?;
    enforce_ip_rate_limits(
        &state.db,
        &ip,
        &[
            RateLimitRule {
                scope: REGISTER_SCOPE,
                limit: REGISTER_SHORT_LIMIT,
                window_seconds: REGISTER_SHORT_WINDOW_SECONDS,
            },
            RateLimitRule {
                scope: REGISTER_SCOPE,
                limit: REGISTER_HOURLY_LIMIT,
                window_seconds: REGISTER_HOURLY_WINDOW_SECONDS,
            },
        ],
        "/auth/register",
        None,
        None,
    )
    .await?;

    let body = body.into_inner();
    let email = normalize_email(&body.email);
    validate_register_input(&body.name, &email, &body.password)?;

    let password_hash = hash_password(&body.password)?;
    let user = sqlx::query_as::<_, User>(
        r#"
        INSERT INTO users (
          email,
          name,
          password_hash,
          plan,
          plan_status,
          monthly_request_limit,
          registration_ip,
          last_seen_ip,
          last_seen_at
        )
        VALUES ($1, $2, $3, 'free', 'active', $4, $5, $5, now())
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
          plus_expires_at,
          status,
          banned_at,
          banned_reason,
          registration_ip,
          last_seen_ip,
          last_seen_at
        "#,
    )
    .bind(&email)
    .bind(body.name.trim())
    .bind(password_hash)
    .bind(FREE_MONTHLY_REQUEST_LIMIT)
    .bind(&ip)
    .fetch_one(&state.db)
    .await
    .map_err(|err| {
        if is_unique_violation(&err) {
            ApiError::EmailAlreadyRegistered
        } else {
            ApiError::Database(err)
        }
    })?;

    record_registration_created(&state.db, &ip, user.id).await?;

    let token = create_email_verification_token(&state.db, user.id).await?;
    if send_verification_email(&state, &user, &token)
        .await
        .is_err()
    {
        consume_email_verification_token_by_value(&state.db, &token).await?;
        return Err(ApiError::EmailDeliveryFailed);
    }

    Ok(HttpResponse::Accepted().json(VerificationRequiredResponse {
        verification_required: true,
        email: user.email,
        message: "verification email sent".to_string(),
    }))
}

async fn login(
    state: web::Data<AppState>,
    req: HttpRequest,
    body: web::Json<LoginRequest>,
) -> Result<web::Json<AuthResponse>, ApiError> {
    let ip = client_ip(&req);
    ensure_ip_not_banned(&state.db, &ip).await?;
    enforce_ip_rate_limits(
        &state.db,
        &ip,
        &[RateLimitRule {
            scope: AUTH_SCOPE,
            limit: AUTH_LIMIT,
            window_seconds: AUTH_WINDOW_SECONDS,
        }],
        "/auth/login",
        None,
        None,
    )
    .await?;

    let email = normalize_email(&body.email);
    let user = sqlx::query_as::<_, User>(
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
          plus_expires_at,
          status,
          banned_at,
          banned_reason,
          registration_ip,
          last_seen_ip,
          last_seen_at
        FROM users
        WHERE email = $1
        "#,
    )
    .bind(email)
    .fetch_optional(&state.db)
    .await?
    .ok_or(ApiError::InvalidCredentials)?;

    if !verify_password(&body.password, &user.password_hash) {
        return Err(ApiError::InvalidCredentials);
    }
    if !user.email_is_verified() {
        return Err(ApiError::EmailNotVerified);
    }
    if user.is_banned() {
        return Err(ApiError::AccountBanned);
    }

    let session_token = create_session(&state.db, user.id).await?;
    touch_user_ip(&state.db, user.id, &ip).await?;
    let api_key = create_default_customer_key_if_missing(
        &state.db,
        user.id,
        user.effective_monthly_request_limit(),
    )
    .await?;

    Ok(web::Json(AuthResponse {
        session_token,
        user: PublicUser::from_user(&user, &state.config.admin_emails),
        api_key,
    }))
}

#[derive(serde::Deserialize)]
struct VerifyEmailQuery {
    token: Option<String>,
}

async fn verify_email(
    state: web::Data<AppState>,
    query: web::Query<VerifyEmailQuery>,
) -> Result<HttpResponse, ApiError> {
    let success = if let Some(token) = query.token.as_deref() {
        consume_email_verification_token(&state.db, token)
            .await?
            .is_some()
    } else {
        false
    };

    let target = if success {
        login_redirect_url(&state, "verified=1")
    } else {
        login_redirect_url(&state, "verification=invalid")
    };

    Ok(HttpResponse::SeeOther()
        .insert_header((header::LOCATION, target))
        .finish())
}

async fn resend_verification(
    state: web::Data<AppState>,
    req: HttpRequest,
    body: web::Json<ResendVerificationRequest>,
) -> Result<web::Json<VerificationMessageResponse>, ApiError> {
    let ip = client_ip(&req);
    ensure_ip_not_banned(&state.db, &ip).await?;
    enforce_ip_rate_limits(
        &state.db,
        &ip,
        &[RateLimitRule {
            scope: AUTH_SCOPE,
            limit: AUTH_LIMIT,
            window_seconds: AUTH_WINDOW_SECONDS,
        }],
        "/auth/resend-verification",
        None,
        None,
    )
    .await?;

    let body = body.into_inner();
    let email = normalize_email(&body.email);
    let user = user_by_email(&state.db, &email).await?;

    if !verify_password(&body.password, &user.password_hash) {
        return Err(ApiError::InvalidCredentials);
    }
    if user.email_is_verified() {
        return Err(ApiError::InvalidRequest("email is already verified".into()));
    }
    if verification_email_sent_recently(&state.db, user.id).await? {
        return Err(ApiError::VerificationEmailRecentlySent);
    }

    consume_unspent_email_verification_tokens(&state.db, user.id).await?;
    let token = create_email_verification_token(&state.db, user.id).await?;
    if send_verification_email(&state, &user, &token)
        .await
        .is_err()
    {
        consume_email_verification_token_by_value(&state.db, &token).await?;
        return Err(ApiError::EmailDeliveryFailed);
    }

    Ok(web::Json(VerificationMessageResponse {
        verification_required: true,
        email: user.email,
        message: "verification email sent".to_string(),
    }))
}

async fn request_password_reset(
    state: web::Data<AppState>,
    req: HttpRequest,
    body: web::Json<PasswordResetRequest>,
) -> Result<HttpResponse, ApiError> {
    let ip = client_ip(&req);
    ensure_ip_not_banned(&state.db, &ip).await?;
    enforce_ip_rate_limits(
        &state.db,
        &ip,
        &[RateLimitRule {
            scope: AUTH_SCOPE,
            limit: AUTH_LIMIT,
            window_seconds: AUTH_WINDOW_SECONDS,
        }],
        "/auth/password-reset/request",
        None,
        None,
    )
    .await?;

    let body = body.into_inner();
    let email = normalize_email(&body.email);
    let generic_response = || {
        HttpResponse::Accepted().json(PasswordResetMessageResponse {
            message: "if the email exists, a password reset link will be sent".to_string(),
        })
    };

    if !email.contains('@') || email.len() < 5 {
        return Ok(generic_response());
    }

    let user = match user_by_email(&state.db, &email).await {
        Ok(user) => user,
        Err(ApiError::NotFound) => return Ok(generic_response()),
        Err(err) => return Err(err),
    };

    if !user.email_is_verified() {
        return Ok(generic_response());
    }

    let token = create_password_reset_token(&state.db, user.id).await?;
    if let Err(err) = send_password_reset_email(&state, &user, &token).await {
        warn!(
            email = %user.email,
            error = %err,
            "failed to send password reset email"
        );
        consume_password_reset_token_by_value(&state.db, &token).await?;
    }

    Ok(generic_response())
}

async fn confirm_password_reset(
    state: web::Data<AppState>,
    req: HttpRequest,
    body: web::Json<PasswordResetConfirmRequest>,
) -> Result<web::Json<PasswordResetMessageResponse>, ApiError> {
    let ip = client_ip(&req);
    ensure_ip_not_banned(&state.db, &ip).await?;
    enforce_ip_rate_limits(
        &state.db,
        &ip,
        &[RateLimitRule {
            scope: AUTH_SCOPE,
            limit: AUTH_LIMIT,
            window_seconds: AUTH_WINDOW_SECONDS,
        }],
        "/auth/password-reset/confirm",
        None,
        None,
    )
    .await?;

    let body = body.into_inner();
    let token = body.token.trim();
    if token.is_empty() {
        return Err(ApiError::InvalidRequest(
            "password reset token is required".into(),
        ));
    }
    validate_password(&body.password)?;

    let password_hash = hash_password(&body.password)?;
    let reset = reset_password_with_token(&state.db, token, password_hash).await?;
    if !reset {
        return Err(ApiError::InvalidRequest(
            "password reset link is invalid or expired".into(),
        ));
    }

    Ok(web::Json(PasswordResetMessageResponse {
        message: "password reset".to_string(),
    }))
}

async fn me(
    state: web::Data<AppState>,
    req: HttpRequest,
) -> Result<web::Json<PublicUser>, ApiError> {
    let ip = client_ip(&req);
    ensure_ip_not_banned(&state.db, &ip).await?;
    let user = authenticate_session(&state.db, extract_bearer(&req)?).await?;
    touch_user_ip(&state.db, user.id, &ip).await?;
    Ok(web::Json(PublicUser::from_user(
        &user,
        &state.config.admin_emails,
    )))
}

async fn dashboard(
    state: web::Data<AppState>,
    req: HttpRequest,
) -> Result<web::Json<DashboardResponse>, ApiError> {
    let ip = client_ip(&req);
    ensure_ip_not_banned(&state.db, &ip).await?;
    let user = authenticate_session(&state.db, extract_bearer(&req)?).await?;
    touch_user_ip(&state.db, user.id, &ip).await?;
    let api_keys = api_key_summaries(&state.db, user.id).await?;
    let recent_usage = recent_usage_for_user(&state.db, user.id).await?;
    let allowed_models = allowed_models_for_effective_plan(&state, user.effective_plan()).await;
    let subscription = subscription_summary_with_models(&state.db, &user, allowed_models).await?;

    Ok(web::Json(DashboardResponse {
        user: PublicUser::from_user(&user, &state.config.admin_emails),
        subscription,
        billing: billing_config_summary(&state),
        api_keys,
        recent_usage,
    }))
}

async fn create_dashboard_key(
    state: web::Data<AppState>,
    req: HttpRequest,
    body: web::Json<CreateUserKeyRequest>,
) -> Result<web::Json<crate::models::IssuedApiKey>, ApiError> {
    let ip = client_ip(&req);
    ensure_ip_not_banned(&state.db, &ip).await?;
    let user = authenticate_session(&state.db, extract_bearer(&req)?).await?;
    enforce_ip_rate_limits(
        &state.db,
        &ip,
        &[RateLimitRule {
            scope: DASHBOARD_WRITE_SCOPE,
            limit: DASHBOARD_WRITE_LIMIT,
            window_seconds: DASHBOARD_WRITE_WINDOW_SECONDS,
        }],
        "/dashboard/api-keys",
        Some(user.id),
        None,
    )
    .await?;
    touch_user_ip(&state.db, user.id, &ip).await?;
    let monthly_limit = user.effective_monthly_request_limit().clamp(1, 1_000_000);
    let name = body.name.as_deref().unwrap_or("extra key").trim();
    if name.is_empty() {
        return Err(ApiError::InvalidRequest("key name is required".into()));
    }

    let key = create_customer_key_for_user(&state.db, user.id, name, monthly_limit).await?;
    Ok(web::Json(key))
}

async fn delete_dashboard_key(
    state: web::Data<AppState>,
    req: HttpRequest,
    path: web::Path<i64>,
) -> Result<HttpResponse, ApiError> {
    let ip = client_ip(&req);
    ensure_ip_not_banned(&state.db, &ip).await?;
    let user = authenticate_session(&state.db, extract_bearer(&req)?).await?;
    enforce_ip_rate_limits(
        &state.db,
        &ip,
        &[RateLimitRule {
            scope: DASHBOARD_WRITE_SCOPE,
            limit: DASHBOARD_WRITE_LIMIT,
            window_seconds: DASHBOARD_WRITE_WINDOW_SECONDS,
        }],
        "/dashboard/api-keys",
        Some(user.id),
        None,
    )
    .await?;
    touch_user_ip(&state.db, user.id, &ip).await?;
    let key_id = path.into_inner();
    let revoked = revoke_api_key_for_user(&state.db, user.id, key_id).await?;
    if !revoked {
        return Err(ApiError::NotFound);
    }

    Ok(HttpResponse::NoContent().finish())
}

async fn create_fovpay_checkout(
    state: web::Data<AppState>,
    req: HttpRequest,
    body: web::Json<CreateFovPayCheckoutRequest>,
) -> Result<web::Json<CreateFovPayCheckoutResponse>, ApiError> {
    let ip = client_ip(&req);
    ensure_ip_not_banned(&state.db, &ip).await?;
    let user = authenticate_session(&state.db, extract_bearer(&req)?).await?;
    enforce_ip_rate_limits(
        &state.db,
        &ip,
        &[RateLimitRule {
            scope: DASHBOARD_WRITE_SCOPE,
            limit: DASHBOARD_WRITE_LIMIT,
            window_seconds: DASHBOARD_WRITE_WINDOW_SECONDS,
        }],
        "/dashboard/billing/fovpay/checkout",
        Some(user.id),
        None,
    )
    .await?;
    touch_user_ip(&state.db, user.id, &ip).await?;
    let config = enabled_fovpay_config(&state)?;
    let paytype_code = body.paytype_code.trim().to_ascii_lowercase();
    if !config
        .allowed_paytypes
        .iter()
        .any(|allowed| allowed == &paytype_code)
    {
        return Err(ApiError::InvalidRequest("unsupported pay type".into()));
    }

    let subject = format!("OpenAchieve Plus {} days", config.plus_days);
    let out_trade_no = format!("OA{}", Uuid::new_v4().simple());
    let amount_cny = cents_to_amount(config.plus_amount_cents);
    let order = insert_billing_order(
        &state.db,
        user.id,
        &out_trade_no,
        config.plus_amount_cents,
        &paytype_code,
        &subject,
    )
    .await?;

    let notify_url = format!(
        "{}/api/backend/billing/fovpay/notify",
        state.config.app_base_url
    );
    let return_url = format!(
        "{}/account?checkout={out_trade_no}",
        state.config.app_base_url
    );
    let timestamp = Utc::now().timestamp().to_string();
    let mut params = vec![
        ("pid".to_string(), config.pid.clone()),
        ("out_trade_no".to_string(), out_trade_no.clone()),
        ("total_amount".to_string(), amount_cny.clone()),
        ("subject".to_string(), subject),
        ("paytype_code".to_string(), paytype_code.clone()),
        ("notify_url".to_string(), notify_url),
        ("return_url".to_string(), return_url),
        ("attach".to_string(), user.id.to_string()),
        ("client_ip".to_string(), ip),
        ("timestamp".to_string(), timestamp),
    ];
    let sign = sign_md5(&params, &config.secret_key);
    params.push(("sign_type".to_string(), SIGN_TYPE_MD5.to_string()));
    params.push(("sign".to_string(), sign));

    let response = state
        .http
        .post(format!("{}/openapi/pay/create", config.base_url))
        .form(&params)
        .send()
        .await;
    let response = match response {
        Ok(response) => response,
        Err(error) => {
            mark_billing_order_failed(&state.db, order.id, &error.to_string()).await?;
            return Err(ApiError::UpstreamRequest(error));
        }
    };
    let status = response.status();
    let response_body = response.text().await.unwrap_or_default();
    if !status.is_success() {
        mark_billing_order_failed(&state.db, order.id, &response_body).await?;
        return Err(ApiError::UpstreamStatus {
            status_code: status.as_u16(),
            body: response_body,
        });
    }

    let payload = match serde_json::from_str::<CreateOrderResponse>(&response_body) {
        Ok(payload) => payload,
        Err(_) => {
            mark_billing_order_failed(&state.db, order.id, &response_body).await?;
            return Err(ApiError::UpstreamStatus {
                status_code: 502,
                body: "invalid fovpay response".to_string(),
            });
        }
    };
    let Some(data) = payload.data else {
        mark_billing_order_failed(&state.db, order.id, &payload.msg).await?;
        return Err(ApiError::UpstreamStatus {
            status_code: 502,
            body: payload.msg,
        });
    };
    if payload.code != 1 {
        let failure = format!("unexpected fovpay response: {}", response_body);
        mark_billing_order_failed(&state.db, order.id, &failure).await?;
        return Err(ApiError::UpstreamStatus {
            status_code: 502,
            body: failure,
        });
    }

    let order =
        update_billing_order_payment(&state.db, order.id, &data.trade_no, &data.pay_url).await?;

    Ok(web::Json(CreateFovPayCheckoutResponse {
        order_id: order.id,
        out_trade_no: order.out_trade_no,
        pay_url: data.pay_url,
        status: order.status,
        paytype_code,
        amount_cny,
    }))
}

async fn get_billing_order(
    state: web::Data<AppState>,
    req: HttpRequest,
    path: web::Path<String>,
) -> Result<web::Json<BillingOrderSummary>, ApiError> {
    let ip = client_ip(&req);
    ensure_ip_not_banned(&state.db, &ip).await?;
    let user = authenticate_session(&state.db, extract_bearer(&req)?).await?;
    touch_user_ip(&state.db, user.id, &ip).await?;
    let order_ref = path.into_inner();
    let order = billing_order_for_user_by_ref(&state.db, user.id, &order_ref)
        .await?
        .ok_or(ApiError::NotFound)?;

    Ok(web::Json(billing_order_summary(order)))
}

async fn fovpay_notify(
    state: web::Data<AppState>,
    form: web::Form<HashMap<String, String>>,
) -> Result<HttpResponse, ApiError> {
    let config = enabled_fovpay_config(&state)?;
    let params = form.into_inner();
    let pairs = fovpay_pairs(&params);
    let sign_type = params
        .get("sign_type")
        .map(String::as_str)
        .unwrap_or_default();
    if !sign_type.eq_ignore_ascii_case(SIGN_TYPE_MD5) {
        return Err(ApiError::InvalidRequest(
            "unsupported fovpay sign_type".into(),
        ));
    }
    if !verify_md5(&pairs, &config.secret_key) {
        return Err(ApiError::InvalidRequest("invalid fovpay signature".into()));
    }

    process_fovpay_notify(&state, &params).await?;
    Ok(HttpResponse::Ok()
        .content_type("text/plain; charset=utf-8")
        .body("success"))
}

async fn admin_users(
    state: web::Data<AppState>,
    req: HttpRequest,
) -> Result<web::Json<AdminUsersResponse>, ApiError> {
    let _admin =
        authenticate_admin_session(&state.db, extract_bearer(&req)?, &state.config.admin_emails)
            .await?;
    let rows = admin_user_rows(&state.db).await?;
    let users = summarize_admin_users(rows, &state.config.admin_emails);
    let stats = admin_user_stats(&users);

    Ok(web::Json(AdminUsersResponse { stats, users }))
}

async fn admin_create_user(
    state: web::Data<AppState>,
    req: HttpRequest,
    body: web::Json<AdminCreateUserRequest>,
) -> Result<web::Json<AdminCreateUserResponse>, ApiError> {
    let admin =
        authenticate_admin_session(&state.db, extract_bearer(&req)?, &state.config.admin_emails)
            .await?;
    let body = body.into_inner();
    let email = normalize_email(&body.email);
    let name = body.name.trim().to_string();
    let temporary_password = generate_temporary_password();
    validate_register_input(&name, &email, &temporary_password)?;

    let plan = normalized_admin_plan(body.plan.as_deref().unwrap_or(FREE_PLAN))?;
    let days = validated_admin_days(body.days)?;
    let password_hash = hash_password(&temporary_password)?;
    let created_user = match plan.as_str() {
        PLUS_PLAN => {
            sqlx::query_as::<_, User>(
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
                VALUES ($1, $2, $3, now(), 'plus', 'active', $4, now(), now() + ($5::int || ' days')::interval)
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
                  plus_expires_at,
                  status,
                  banned_at,
                  banned_reason,
                  registration_ip,
                  last_seen_ip,
                  last_seen_at
                "#,
            )
            .bind(&email)
            .bind(&name)
            .bind(password_hash)
            .bind(PLUS_MONTHLY_REQUEST_LIMIT)
            .bind(days)
            .fetch_one(&state.db)
            .await
        }
        FREE_PLAN => {
            sqlx::query_as::<_, User>(
                r#"
                INSERT INTO users (email, name, password_hash, email_verified_at, plan, plan_status, monthly_request_limit)
                VALUES ($1, $2, $3, now(), 'free', 'active', $4)
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
                  plus_expires_at,
                  status,
                  banned_at,
                  banned_reason,
                  registration_ip,
                  last_seen_ip,
                  last_seen_at
                "#,
            )
            .bind(&email)
            .bind(&name)
            .bind(password_hash)
            .bind(FREE_MONTHLY_REQUEST_LIMIT)
            .fetch_one(&state.db)
            .await
        }
        _ => unreachable!("plan has already been validated"),
    }
    .map_err(|err| {
        if is_unique_violation(&err) {
            ApiError::EmailAlreadyRegistered
        } else {
            ApiError::Database(err)
        }
    })?;

    let api_key = create_customer_key_for_user(
        &state.db,
        created_user.id,
        "default",
        created_user.effective_monthly_request_limit(),
    )
    .await?;
    record_admin_audit(
        &state.db,
        &admin,
        Some(created_user.id),
        &created_user.email,
        "create_user",
        json!({
            "plan": plan.as_str(),
            "days": if plan == PLUS_PLAN { Some(days) } else { None },
        }),
    )
    .await?;
    let user = admin_user_summary_by_id(&state.db, created_user.id, &state.config.admin_emails)
        .await?
        .ok_or(ApiError::NotFound)?;

    Ok(web::Json(AdminCreateUserResponse {
        user,
        temporary_password,
        api_key,
    }))
}

async fn admin_update_user_plan(
    state: web::Data<AppState>,
    req: HttpRequest,
    path: web::Path<i64>,
    body: web::Json<AdminUpdatePlanRequest>,
) -> Result<web::Json<AdminUserSummary>, ApiError> {
    let admin =
        authenticate_admin_session(&state.db, extract_bearer(&req)?, &state.config.admin_emails)
            .await?;
    let user_id = path.into_inner();
    let body = body.into_inner();
    let plan = normalized_admin_plan(&body.plan)?;
    let days = validated_admin_days(body.days)?;
    let target = user_by_id(&state.db, user_id).await?;

    if target.id == admin.id && plan == FREE_PLAN {
        return Err(ApiError::Forbidden);
    }

    match plan.as_str() {
        PLUS_PLAN => {
            sqlx::query(
                r#"
                UPDATE users
                SET plan = 'plus',
                    plan_status = 'active',
                    monthly_request_limit = $2,
                    plus_started_at = now(),
                    plus_expires_at = now() + ($3::int || ' days')::interval
                WHERE id = $1
                "#,
            )
            .bind(user_id)
            .bind(PLUS_MONTHLY_REQUEST_LIMIT)
            .bind(days)
            .execute(&state.db)
            .await?;
        }
        FREE_PLAN => {
            sqlx::query(
                r#"
                UPDATE users
                SET plan = 'free',
                    plan_status = 'active',
                    monthly_request_limit = $2,
                    plus_started_at = NULL,
                    plus_expires_at = NULL
                WHERE id = $1
                "#,
            )
            .bind(user_id)
            .bind(FREE_MONTHLY_REQUEST_LIMIT)
            .execute(&state.db)
            .await?;
        }
        _ => unreachable!("plan has already been validated"),
    }

    record_admin_audit(
        &state.db,
        &admin,
        Some(target.id),
        &target.email,
        if plan == PLUS_PLAN {
            "upgrade_plan"
        } else {
            "downgrade_plan"
        },
        json!({
            "from_plan": target.plan.as_str(),
            "from_effective_plan": target.effective_plan(),
            "to_plan": plan.as_str(),
            "days": if plan == PLUS_PLAN { Some(days) } else { None },
        }),
    )
    .await?;

    admin_user_summary_by_id(&state.db, user_id, &state.config.admin_emails)
        .await?
        .map(web::Json)
        .ok_or(ApiError::NotFound)
}

async fn admin_ban_user(
    state: web::Data<AppState>,
    req: HttpRequest,
    path: web::Path<i64>,
    body: web::Json<AdminBanUserRequest>,
) -> Result<web::Json<AdminUserSummary>, ApiError> {
    let admin =
        authenticate_admin_session(&state.db, extract_bearer(&req)?, &state.config.admin_emails)
            .await?;
    let user_id = path.into_inner();
    let target = user_by_id(&state.db, user_id).await?;
    if target.id == admin.id {
        return Err(ApiError::Forbidden);
    }

    let reason = body
        .reason
        .as_deref()
        .map(str::trim)
        .filter(|reason| !reason.is_empty())
        .unwrap_or("manual admin ban");
    ban_user(&state.db, target.id, reason)
        .await?
        .ok_or(ApiError::NotFound)?;
    record_admin_audit(
        &state.db,
        &admin,
        Some(target.id),
        &target.email,
        "ban_user",
        json!({
            "reason": reason,
            "registration_ip": target.registration_ip,
            "last_seen_ip": target.last_seen_ip,
        }),
    )
    .await?;
    record_security_event(
        &state.db,
        "user_banned",
        target
            .last_seen_ip
            .as_deref()
            .or(target.registration_ip.as_deref()),
        Some(target.id),
        None,
        Some("/admin/users/ban"),
        json!({ "reason": reason, "actor_user_id": admin.id }),
    )
    .await?;

    admin_user_summary_by_id(&state.db, target.id, &state.config.admin_emails)
        .await?
        .map(web::Json)
        .ok_or(ApiError::NotFound)
}

async fn admin_unban_user(
    state: web::Data<AppState>,
    req: HttpRequest,
    path: web::Path<i64>,
) -> Result<web::Json<AdminUserSummary>, ApiError> {
    let admin =
        authenticate_admin_session(&state.db, extract_bearer(&req)?, &state.config.admin_emails)
            .await?;
    let user_id = path.into_inner();
    let target = user_by_id(&state.db, user_id).await?;
    unban_user(&state.db, target.id)
        .await?
        .ok_or(ApiError::NotFound)?;
    record_admin_audit(
        &state.db,
        &admin,
        Some(target.id),
        &target.email,
        "unban_user",
        json!({
            "previous_reason": target.banned_reason,
        }),
    )
    .await?;
    record_security_event(
        &state.db,
        "user_unbanned",
        target
            .last_seen_ip
            .as_deref()
            .or(target.registration_ip.as_deref()),
        Some(target.id),
        None,
        Some("/admin/users/unban"),
        json!({ "actor_user_id": admin.id }),
    )
    .await?;

    admin_user_summary_by_id(&state.db, target.id, &state.config.admin_emails)
        .await?
        .map(web::Json)
        .ok_or(ApiError::NotFound)
}

async fn admin_delete_user(
    state: web::Data<AppState>,
    req: HttpRequest,
    path: web::Path<i64>,
) -> Result<HttpResponse, ApiError> {
    let admin =
        authenticate_admin_session(&state.db, extract_bearer(&req)?, &state.config.admin_emails)
            .await?;
    let user_id = path.into_inner();
    let target = user_by_id(&state.db, user_id).await?;

    if target.id == admin.id {
        return Err(ApiError::Forbidden);
    }

    record_admin_audit(
        &state.db,
        &admin,
        Some(target.id),
        &target.email,
        "delete_user",
        json!({
            "target_plan": target.plan.as_str(),
            "target_effective_plan": target.effective_plan(),
        }),
    )
    .await?;

    sqlx::query("DELETE FROM users WHERE id = $1")
        .bind(user_id)
        .execute(&state.db)
        .await?;

    Ok(HttpResponse::NoContent().finish())
}

async fn admin_reset_all_quota(
    state: web::Data<AppState>,
    req: HttpRequest,
) -> Result<web::Json<AdminQuotaResetResponse>, ApiError> {
    let admin =
        authenticate_admin_session(&state.db, extract_bearer(&req)?, &state.config.admin_emails)
            .await?;
    let users_affected: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users")
        .fetch_one(&state.db)
        .await?;
    let effective_at: DateTime<Utc> = sqlx::query_scalar(
        r#"
        INSERT INTO quota_resets (actor_user_id, scope, effective_at)
        VALUES ($1, 'global', now())
        RETURNING effective_at
        "#,
    )
    .bind(admin.id)
    .fetch_one(&state.db)
    .await?;

    record_admin_audit(
        &state.db,
        &admin,
        None,
        "*",
        "reset_all_quota",
        json!({
            "scope": "global",
            "effective_at": effective_at,
            "users_affected": users_affected,
        }),
    )
    .await?;

    Ok(web::Json(AdminQuotaResetResponse {
        effective_at,
        users_affected,
    }))
}

async fn admin_security_ips(
    state: web::Data<AppState>,
    req: HttpRequest,
) -> Result<web::Json<crate::models::SecurityIpsResponse>, ApiError> {
    let _admin =
        authenticate_admin_session(&state.db, extract_bearer(&req)?, &state.config.admin_emails)
            .await?;
    let ips = security_ip_summaries(&state.db).await?;
    Ok(web::Json(crate::models::SecurityIpsResponse { ips }))
}

#[derive(serde::Deserialize)]
struct SecurityIpDetailQuery {
    ip: String,
}

async fn admin_security_ip_detail(
    state: web::Data<AppState>,
    req: HttpRequest,
    query: web::Query<SecurityIpDetailQuery>,
) -> Result<web::Json<SecurityIpDetailResponse>, ApiError> {
    let _admin =
        authenticate_admin_session(&state.db, extract_bearer(&req)?, &state.config.admin_emails)
            .await?;
    let ip = validate_ip(&query.ip)?;
    security_ip_detail(&state.db, &ip).await.map(web::Json)
}

async fn admin_create_ip_ban(
    state: web::Data<AppState>,
    req: HttpRequest,
    body: web::Json<AdminIpBanRequest>,
) -> Result<web::Json<IpBanSummary>, ApiError> {
    let admin =
        authenticate_admin_session(&state.db, extract_bearer(&req)?, &state.config.admin_emails)
            .await?;
    let ip = validate_ip(&body.ip)?;
    let reason = body
        .reason
        .as_deref()
        .map(str::trim)
        .filter(|reason| !reason.is_empty())
        .unwrap_or("manual admin IP ban");
    let expires_at = body
        .expires_in_hours
        .filter(|hours| *hours > 0)
        .map(|hours| Utc::now() + Duration::hours(i64::from(hours)));
    let ban = create_ip_ban(&state.db, &ip, reason, Some(admin.id), expires_at).await?;
    record_admin_audit(
        &state.db,
        &admin,
        None,
        &ip,
        "ban_ip",
        json!({
            "ip": ip,
            "reason": reason,
            "expires_at": ban.expires_at,
        }),
    )
    .await?;
    record_security_event(
        &state.db,
        "ip_banned",
        Some(&ban.ip),
        None,
        None,
        Some("/admin/security/ip-bans"),
        json!({
            "reason": reason,
            "actor_user_id": admin.id,
            "ban_id": ban.id,
        }),
    )
    .await?;

    Ok(web::Json(ban))
}

async fn admin_lift_ip_ban(
    state: web::Data<AppState>,
    req: HttpRequest,
    path: web::Path<i64>,
) -> Result<web::Json<IpBanSummary>, ApiError> {
    let admin =
        authenticate_admin_session(&state.db, extract_bearer(&req)?, &state.config.admin_emails)
            .await?;
    let ban_id = path.into_inner();
    let ban = lift_ip_ban(&state.db, ban_id, admin.id, "manual admin lift")
        .await?
        .ok_or(ApiError::NotFound)?;
    record_admin_audit(
        &state.db,
        &admin,
        None,
        &ban.ip,
        "unban_ip",
        json!({
            "ip": ban.ip,
            "ban_id": ban.id,
        }),
    )
    .await?;
    record_security_event(
        &state.db,
        "ip_unbanned",
        Some(&ban.ip),
        None,
        None,
        Some("/admin/security/ip-bans"),
        json!({
            "actor_user_id": admin.id,
            "ban_id": ban.id,
        }),
    )
    .await?;

    Ok(web::Json(ban))
}

async fn security_ip_summaries(pool: &sqlx::PgPool) -> Result<Vec<SecurityIpSummary>, sqlx::Error> {
    sqlx::query_as::<_, SecurityIpSummary>(
        r#"
        WITH ips AS (
          SELECT registration_ip AS ip FROM users WHERE registration_ip IS NOT NULL
          UNION
          SELECT last_seen_ip AS ip FROM users WHERE last_seen_ip IS NOT NULL
          UNION
          SELECT ip FROM security_events WHERE ip IS NOT NULL
          UNION
          SELECT ip FROM ip_bans
        ),
        active_bans AS (
          SELECT DISTINCT ON (ip)
            id,
            ip,
            reason,
            expires_at
          FROM ip_bans
          WHERE lifted_at IS NULL
            AND (expires_at IS NULL OR expires_at > now())
          ORDER BY ip, created_at DESC
        )
        SELECT
          ips.ip,
          (
            SELECT COUNT(*)
            FROM users u
            WHERE u.registration_ip = ips.ip
          ) AS registered_user_count,
          (
            SELECT COUNT(DISTINCT u.id)
            FROM users u
            WHERE u.registration_ip = ips.ip OR u.last_seen_ip = ips.ip
          ) AS seen_user_count,
          (
            SELECT COUNT(*)
            FROM security_events se
            WHERE se.ip = ips.ip
              AND se.event_type = 'free_ai_request'
          ) AS free_ai_request_count,
          (
            SELECT COUNT(*)
            FROM security_events se
            WHERE se.ip = ips.ip
              AND se.event_type = 'rate_limited'
              AND se.created_at > now() - interval '7 days'
          ) AS rate_limited_count,
          active_bans.id AS active_ban_id,
          active_bans.reason AS active_ban_reason,
          active_bans.expires_at AS active_ban_expires_at,
          (
            SELECT MAX(seen_at)
            FROM (
              SELECT last_seen_at AS seen_at FROM users WHERE last_seen_ip = ips.ip
              UNION ALL
              SELECT created_at AS seen_at FROM security_events WHERE ip = ips.ip
            ) seen
          ) AS last_seen_at
        FROM ips
        LEFT JOIN active_bans ON active_bans.ip = ips.ip
        WHERE ips.ip IS NOT NULL
        ORDER BY
          active_ban_id NULLS LAST,
          rate_limited_count DESC,
          registered_user_count DESC,
          last_seen_at DESC NULLS LAST
        LIMIT 200
        "#,
    )
    .fetch_all(pool)
    .await
}

async fn security_ip_detail(
    pool: &sqlx::PgPool,
    ip: &str,
) -> Result<SecurityIpDetailResponse, ApiError> {
    let stats: SecurityIpStats = sqlx::query_as(
        r#"
        SELECT
          (
            SELECT COUNT(*)
            FROM users
            WHERE registration_ip = $1
          ) AS registered_user_count,
          (
            SELECT COUNT(DISTINCT id)
            FROM users
            WHERE registration_ip = $1 OR last_seen_ip = $1
          ) AS seen_user_count,
          (
            SELECT COUNT(*)
            FROM security_events
            WHERE ip = $1
              AND event_type = 'free_ai_request'
          ) AS free_ai_request_count,
          (
            SELECT COUNT(*)
            FROM security_events
            WHERE ip = $1
              AND event_type = 'rate_limited'
              AND created_at > now() - interval '7 days'
          ) AS rate_limited_count
        "#,
    )
    .bind(ip)
    .fetch_one(pool)
    .await?;
    let active_ban = active_ip_ban(pool, ip).await?;
    let users = sqlx::query_as::<_, SecurityIpUser>(
        r#"
        SELECT
          id,
          email,
          name,
          status,
          plan,
          created_at,
          registration_ip,
          last_seen_ip,
          last_seen_at
        FROM users
        WHERE registration_ip = $1 OR last_seen_ip = $1
        ORDER BY created_at DESC
        LIMIT 100
        "#,
    )
    .bind(ip)
    .fetch_all(pool)
    .await?;
    let recent_events = sqlx::query_as::<_, SecurityEventSummary>(
        r#"
        SELECT
          id,
          event_type,
          ip,
          user_id,
          api_key_id,
          route,
          details,
          created_at
        FROM security_events
        WHERE ip = $1
        ORDER BY created_at DESC
        LIMIT 100
        "#,
    )
    .bind(ip)
    .fetch_all(pool)
    .await?;

    Ok(SecurityIpDetailResponse {
        ip: ip.to_string(),
        stats,
        active_ban,
        users,
        recent_events,
    })
}

async fn admin_user_rows(pool: &sqlx::PgPool) -> Result<Vec<AdminUserRow>, sqlx::Error> {
    sqlx::query_as::<_, AdminUserRow>(
        r#"
        WITH quota_window AS (
          SELECT GREATEST(
            date_trunc('month', now()),
            COALESCE(
              (SELECT MAX(effective_at) FROM quota_resets WHERE scope = 'global'),
              date_trunc('month', now())
            )
          ) AS usage_start
        )
        SELECT
          u.id,
          u.email,
          u.name,
          u.created_at,
          u.plan,
          u.plan_status,
          u.monthly_request_limit,
          u.plus_started_at,
          u.plus_expires_at,
          COUNT(DISTINCT k.id) AS api_key_count,
          COUNT(e.id) FILTER (
            WHERE e.created_at >= q.usage_start
              AND e.path = '/v1/chat/completions'
          ) AS requests_this_month,
          MAX(k.last_used_at) AS last_used_at,
          u.status,
          u.banned_at,
          u.banned_reason,
          u.registration_ip,
          u.last_seen_ip,
          u.last_seen_at,
          (
            SELECT COUNT(*)
            FROM security_events se
            WHERE se.user_id = u.id
              AND se.event_type = 'rate_limited'
              AND se.created_at > now() - interval '24 hours'
          ) AS recent_rate_limit_count,
          (
            SELECT COUNT(*)
            FROM ip_bans b
            WHERE b.ip IN (u.registration_ip, u.last_seen_ip)
              AND b.lifted_at IS NULL
              AND (b.expires_at IS NULL OR b.expires_at > now())
          ) AS active_ip_ban_count
        FROM users u
        CROSS JOIN quota_window q
        LEFT JOIN api_keys k ON k.user_id = u.id
        LEFT JOIN usage_events e ON e.api_key_id = k.id
        GROUP BY u.id, q.usage_start
        ORDER BY u.created_at DESC
        "#,
    )
    .fetch_all(pool)
    .await
}

async fn admin_user_summary_by_id(
    pool: &sqlx::PgPool,
    user_id: i64,
    admin_emails: &[String],
) -> Result<Option<AdminUserSummary>, sqlx::Error> {
    let row = sqlx::query_as::<_, AdminUserRow>(
        r#"
        WITH quota_window AS (
          SELECT GREATEST(
            date_trunc('month', now()),
            COALESCE(
              (SELECT MAX(effective_at) FROM quota_resets WHERE scope = 'global'),
              date_trunc('month', now())
            )
          ) AS usage_start
        )
        SELECT
          u.id,
          u.email,
          u.name,
          u.created_at,
          u.plan,
          u.plan_status,
          u.monthly_request_limit,
          u.plus_started_at,
          u.plus_expires_at,
          COUNT(DISTINCT k.id) AS api_key_count,
          COUNT(e.id) FILTER (
            WHERE e.created_at >= q.usage_start
              AND e.path = '/v1/chat/completions'
          ) AS requests_this_month,
          MAX(k.last_used_at) AS last_used_at,
          u.status,
          u.banned_at,
          u.banned_reason,
          u.registration_ip,
          u.last_seen_ip,
          u.last_seen_at,
          (
            SELECT COUNT(*)
            FROM security_events se
            WHERE se.user_id = u.id
              AND se.event_type = 'rate_limited'
              AND se.created_at > now() - interval '24 hours'
          ) AS recent_rate_limit_count,
          (
            SELECT COUNT(*)
            FROM ip_bans b
            WHERE b.ip IN (u.registration_ip, u.last_seen_ip)
              AND b.lifted_at IS NULL
              AND (b.expires_at IS NULL OR b.expires_at > now())
          ) AS active_ip_ban_count
        FROM users u
        CROSS JOIN quota_window q
        LEFT JOIN api_keys k ON k.user_id = u.id
        LEFT JOIN usage_events e ON e.api_key_id = k.id
        WHERE u.id = $1
        GROUP BY u.id, q.usage_start
        "#,
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|row| admin_user_summary(row, admin_emails)))
}

fn summarize_admin_users(
    rows: Vec<AdminUserRow>,
    admin_emails: &[String],
) -> Vec<AdminUserSummary> {
    rows.into_iter()
        .map(|row| admin_user_summary(row, admin_emails))
        .collect()
}

fn admin_user_summary(row: AdminUserRow, admin_emails: &[String]) -> AdminUserSummary {
    let plus_is_active = row.plan == PLUS_PLAN
        && row.plan_status == "active"
        && row
            .plus_expires_at
            .map(|expires_at| expires_at > Utc::now())
            .unwrap_or(false);
    let plan = if plus_is_active { PLUS_PLAN } else { FREE_PLAN }.to_string();
    let monthly_request_limit = if plus_is_active {
        row.monthly_request_limit
    } else {
        FREE_MONTHLY_REQUEST_LIMIT
    };
    let remaining_requests = (i64::from(monthly_request_limit) - row.requests_this_month).max(0);
    let is_admin = admin_emails.contains(&row.email);

    AdminUserSummary {
        id: row.id,
        email: row.email,
        name: row.name,
        created_at: row.created_at,
        plan,
        stored_plan: row.plan,
        plan_status: row.plan_status,
        monthly_request_limit,
        requests_this_month: row.requests_this_month,
        remaining_requests,
        plus_started_at: row.plus_started_at,
        plus_expires_at: row.plus_expires_at,
        api_key_count: row.api_key_count,
        last_used_at: row.last_used_at,
        is_admin,
        status: row.status,
        banned_at: row.banned_at,
        banned_reason: row.banned_reason,
        registration_ip: row.registration_ip,
        last_seen_ip: row.last_seen_ip,
        last_seen_at: row.last_seen_at,
        recent_rate_limit_count: row.recent_rate_limit_count,
        active_ip_ban_count: row.active_ip_ban_count,
    }
}

fn admin_user_stats(users: &[AdminUserSummary]) -> AdminUserStats {
    AdminUserStats {
        total_users: users.len(),
        free_users: users
            .iter()
            .filter(|user| user.plan == FREE_PLAN && user.stored_plan == FREE_PLAN)
            .count(),
        plus_users: users.iter().filter(|user| user.plan == PLUS_PLAN).count(),
        inactive_plus_users: users
            .iter()
            .filter(|user| user.stored_plan == PLUS_PLAN && user.plan != PLUS_PLAN)
            .count(),
    }
}

async fn user_by_id(pool: &sqlx::PgPool, user_id: i64) -> Result<User, ApiError> {
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
          plus_expires_at,
          status,
          banned_at,
          banned_reason,
          registration_ip,
          last_seen_ip,
          last_seen_at
        FROM users
        WHERE id = $1
        "#,
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?
    .ok_or(ApiError::NotFound)
}

async fn user_by_email(pool: &sqlx::PgPool, email: &str) -> Result<User, ApiError> {
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
          plus_expires_at,
          status,
          banned_at,
          banned_reason,
          registration_ip,
          last_seen_ip,
          last_seen_at
        FROM users
        WHERE email = $1
        "#,
    )
    .bind(email)
    .fetch_optional(pool)
    .await?
    .ok_or(ApiError::InvalidCredentials)
}

fn billing_config_summary(state: &web::Data<AppState>) -> BillingConfigSummary {
    if let Some(config) = &state.config.fovpay {
        return BillingConfigSummary {
            fovpay_enabled: config.enabled,
            plus_amount_cny: Some(cents_to_amount(config.plus_amount_cents)),
            plus_days: config.plus_days,
            allowed_paytypes: config.allowed_paytypes.clone(),
        };
    }

    BillingConfigSummary {
        fovpay_enabled: false,
        plus_amount_cny: None,
        plus_days: 30,
        allowed_paytypes: Vec::new(),
    }
}

fn enabled_fovpay_config(
    state: &web::Data<AppState>,
) -> Result<crate::config::FovPayConfig, ApiError> {
    state
        .config
        .fovpay
        .clone()
        .filter(|config| config.enabled)
        .ok_or_else(|| ApiError::InvalidRequest("fovpay is not enabled".into()))
}

fn billing_order_summary(order: BillingOrder) -> BillingOrderSummary {
    BillingOrderSummary {
        id: order.id,
        out_trade_no: order.out_trade_no,
        provider_trade_no: order.provider_trade_no,
        amount_cny: cents_to_amount(order.amount_cents),
        currency: order.currency,
        paytype_code: order.paytype_code,
        status: order.status,
        pay_url: order.pay_url,
        paid_at: order.paid_at,
        granted_until: order.granted_until,
        created_at: order.created_at,
        updated_at: order.updated_at,
    }
}

fn fovpay_pairs(params: &HashMap<String, String>) -> Vec<(String, String)> {
    params
        .iter()
        .map(|(key, value)| (key.clone(), value.clone()))
        .collect()
}

fn required_fovpay_param<'a>(
    params: &'a HashMap<String, String>,
    name: &str,
) -> Result<&'a str, ApiError> {
    params
        .get(name)
        .map(String::as_str)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| ApiError::InvalidRequest(format!("missing fovpay parameter: {name}")))
}

fn fovpay_timestamp(params: &HashMap<String, String>, name: &str) -> Option<chrono::DateTime<Utc>> {
    params
        .get(name)
        .and_then(|value| value.parse::<i64>().ok())
        .and_then(|timestamp| Utc.timestamp_opt(timestamp, 0).single())
}

async fn process_fovpay_notify(
    state: &web::Data<AppState>,
    params: &HashMap<String, String>,
) -> Result<(), ApiError> {
    let config = enabled_fovpay_config(state)?;
    let out_trade_no = required_fovpay_param(params, "out_trade_no")?;
    let pid = required_fovpay_param(params, "pid")?;
    let total_amount = required_fovpay_param(params, "total_amount")?;
    let trade_status = required_fovpay_param(params, "trade_status")?;
    if pid != config.pid {
        return Err(ApiError::InvalidRequest("fovpay pid mismatch".into()));
    }

    let notify_payload = serde_json::to_string(params)
        .map_err(|_| ApiError::InvalidRequest("invalid fovpay payload".into()))?;
    let provider_trade_no = params.get("trade_no").filter(|value| !value.is_empty());
    let mut tx = state.db.begin().await?;
    let order = sqlx::query_as::<_, BillingOrder>(
        r#"
        SELECT
          id,
          user_id,
          provider,
          out_trade_no,
          provider_trade_no,
          amount_cents,
          currency,
          paytype_code,
          subject,
          status,
          pay_url,
          notify_payload,
          paid_at,
          granted_until,
          created_at,
          updated_at
        FROM billing_orders
        WHERE out_trade_no = $1
        FOR UPDATE
        "#,
    )
    .bind(out_trade_no)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or(ApiError::NotFound)?;

    if total_amount != cents_to_amount(order.amount_cents) {
        return Err(ApiError::InvalidRequest("fovpay amount mismatch".into()));
    }

    let order_status = trade_status_to_order_status(trade_status);
    if order_status == STATUS_PAID && order.granted_until.is_none() {
        let user = sqlx::query_as::<_, User>(
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
              plus_expires_at,
              status,
              banned_at,
              banned_reason,
              registration_ip,
              last_seen_ip,
              last_seen_at
            FROM users
            WHERE id = $1
            FOR UPDATE
            "#,
        )
        .bind(order.user_id)
        .fetch_one(&mut *tx)
        .await?;
        let now = Utc::now();
        let paid_at = fovpay_timestamp(params, "success_time").unwrap_or(now);
        let grant_start = if user.effective_plan() == PLUS_PLAN {
            user.plus_expires_at.unwrap_or(now)
        } else {
            now
        };
        let granted_until = grant_start + Duration::days(i64::from(config.plus_days));
        let plus_started_at = if user.effective_plan() == PLUS_PLAN {
            user.plus_started_at.unwrap_or(now)
        } else {
            now
        };

        sqlx::query(
            r#"
            UPDATE billing_orders
            SET status = 'paid',
                provider_trade_no = COALESCE($2::text, provider_trade_no),
                notify_payload = $3,
                paid_at = $4,
                granted_until = $5,
                updated_at = now()
            WHERE id = $1
            "#,
        )
        .bind(order.id)
        .bind(provider_trade_no)
        .bind(&notify_payload)
        .bind(paid_at)
        .bind(granted_until)
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            r#"
            UPDATE users
            SET plan = 'plus',
                plan_status = 'active',
                monthly_request_limit = $2,
                plus_started_at = $3,
                plus_expires_at = $4
            WHERE id = $1
            "#,
        )
        .bind(order.user_id)
        .bind(PLUS_MONTHLY_REQUEST_LIMIT)
        .bind(plus_started_at)
        .bind(granted_until)
        .execute(&mut *tx)
        .await?;
    } else {
        sqlx::query(
            r#"
            UPDATE billing_orders
            SET status = $2,
                provider_trade_no = COALESCE($3::text, provider_trade_no),
                notify_payload = $4,
                paid_at = CASE WHEN $2 = 'paid' THEN COALESCE(paid_at, now()) ELSE paid_at END,
                updated_at = now()
            WHERE id = $1
            "#,
        )
        .bind(order.id)
        .bind(order_status)
        .bind(provider_trade_no)
        .bind(&notify_payload)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    Ok(())
}

fn normalized_admin_plan(plan: &str) -> Result<String, ApiError> {
    let plan = plan.trim().to_ascii_lowercase();
    match plan.as_str() {
        FREE_PLAN | PLUS_PLAN => Ok(plan),
        _ => Err(ApiError::InvalidRequest("plan must be free or plus".into())),
    }
}

fn validated_admin_days(days: Option<i32>) -> Result<i32, ApiError> {
    let days = days.unwrap_or(30);
    if (1..=365).contains(&days) {
        Ok(days)
    } else {
        Err(ApiError::InvalidRequest(
            "days must be between 1 and 365".into(),
        ))
    }
}

async fn send_verification_email(
    state: &web::Data<AppState>,
    user: &User,
    token: &str,
) -> Result<(), crate::email::EmailSendError> {
    let verification_url = format!(
        "{}/api/backend/auth/verify-email?token={}",
        state.config.app_base_url, token
    );

    state
        .email
        .send_verification_email(VerificationEmail {
            to_email: user.email.clone(),
            to_name: user.name.clone(),
            verification_url,
        })
        .await
}

async fn send_password_reset_email(
    state: &web::Data<AppState>,
    user: &User,
    token: &str,
) -> Result<(), crate::email::EmailSendError> {
    let reset_url = format!("{}/login?reset_token={}", state.config.app_base_url, token);

    state
        .email
        .send_password_reset_email(PasswordResetEmail {
            to_email: user.email.clone(),
            to_name: user.name.clone(),
            reset_url,
        })
        .await
}

fn login_redirect_url(state: &web::Data<AppState>, query: &str) -> String {
    format!("{}/login?{}", state.config.app_base_url, query)
}

fn generate_temporary_password() -> String {
    let suffix: String = rand::rng()
        .sample_iter(&Alphanumeric)
        .take(18)
        .map(char::from)
        .collect();
    format!("OA-{suffix}")
}

fn is_unique_violation(err: &sqlx::Error) -> bool {
    err.as_database_error()
        .and_then(|db_err| db_err.code())
        .as_deref()
        == Some("23505")
}

async fn models(state: web::Data<AppState>, req: HttpRequest) -> Result<HttpResponse, ApiError> {
    let ip = client_ip(&req);
    ensure_ip_not_banned(&state.db, &ip).await?;
    let api_key = authenticate(&state.db, extract_bearer(&req)?).await?;
    let user = user_for_api_key(&state.db, &api_key).await?;
    touch_user_ip(&state.db, user.id, &ip).await?;
    let plan = user.effective_plan();
    let allowed_models = allowed_models_for_effective_plan(&state, plan).await;

    touch_key(&state.db, api_key.id).await?;
    Ok(HttpResponse::Ok()
        .content_type("application/json")
        .body(bytes_from_static_json(openai_models_payload(
            &allowed_models
                .iter()
                .map(String::as_str)
                .collect::<Vec<_>>(),
        ))))
}

async fn public_free_models(state: web::Data<AppState>) -> Result<HttpResponse, ApiError> {
    Ok(HttpResponse::Ok().json(state.free_models.public_snapshot().await))
}

async fn allowed_models_for_effective_plan(state: &AppState, plan: &str) -> Vec<String> {
    let mut models = state.free_models.available_models().await;
    if plan == PLUS_PLAN {
        models.extend(PLUS_MODELS.iter().map(|model| (*model).to_string()));
    }
    models
}

async fn route_for_model(
    state: &AppState,
    plan: &str,
    model: &str,
) -> Result<UpstreamRoute, ApiError> {
    if state.free_models.is_available(model).await {
        return Ok(UpstreamRoute::Zen);
    }

    if is_plus_model(model) {
        return if plan == PLUS_PLAN {
            Ok(UpstreamRoute::Go)
        } else {
            Err(ApiError::ModelNotAllowed(model.to_string()))
        };
    }

    if is_free_model_candidate(model) {
        return Err(ApiError::ModelTemporarilyUnavailable(model.to_string()));
    }

    Err(ApiError::UnsupportedModel(model.to_string()))
}

async fn chat_completions(
    state: web::Data<AppState>,
    req: HttpRequest,
    body: web::Json<Value>,
) -> Result<HttpResponse, ApiError> {
    let ip = client_ip(&req);
    ensure_ip_not_banned(&state.db, &ip).await?;
    let api_key = authenticate(&state.db, extract_bearer(&req)?).await?;
    let user = user_for_api_key(&state.db, &api_key).await?;
    ensure_monthly_quota(&state.db, &user).await?;

    let body = body.into_inner();
    let model = request_model(&body)?.to_string();
    let is_stream = request_is_stream(&body);
    let plan = user.effective_plan();
    let route = route_for_model(&state, plan, &model).await?;
    let should_limit_free_ai = plan == FREE_PLAN || route == UpstreamRoute::Zen;
    if should_limit_free_ai {
        enforce_ip_rate_limits(
            &state.db,
            &ip,
            &[
                RateLimitRule {
                    scope: FREE_AI_SCOPE,
                    limit: FREE_AI_SHORT_LIMIT,
                    window_seconds: FREE_AI_SHORT_WINDOW_SECONDS,
                },
                RateLimitRule {
                    scope: FREE_AI_SCOPE,
                    limit: FREE_AI_HOURLY_LIMIT,
                    window_seconds: FREE_AI_HOURLY_WINDOW_SECONDS,
                },
            ],
            "/v1/chat/completions",
            Some(user.id),
            Some(api_key.id),
        )
        .await?;
        record_security_event(
            &state.db,
            "free_ai_request",
            Some(&ip),
            Some(user.id),
            Some(api_key.id),
            Some("/v1/chat/completions"),
            json!({
                "plan": plan,
                "model": model,
                "route": format!("{route:?}"),
            }),
        )
        .await?;
    }

    info!(
        api_key_id = api_key.id,
        user_id = user.id,
        plan = plan,
        model = %model,
        stream = is_stream,
        "proxying chat completion"
    );

    let result = forward_chat(
        &state.http,
        &state.config,
        &state.upstream_keys,
        body,
        route,
    )
    .await?;
    if route == crate::upstream::UpstreamRoute::Zen
        && is_free_model_candidate(&model)
        && should_trip_free_model(result.status_code, result.body_text.as_deref())
    {
        state
            .free_models
            .trip_model(&model, format!("upstream returned {}", result.status_code))
            .await;
        record_usage(
            &state.db,
            UsageEvent {
                api_key_id: Some(api_key.id),
                model: Some(&model),
                path: "/v1/chat/completions",
                status_code: result.status_code,
                is_stream,
                upstream_latency_ms: Some(result.latency_ms),
                error_type: Some("model_temporarily_unavailable"),
                client_ip: Some(&ip),
            },
        )
        .await?;
        return Err(ApiError::ModelTemporarilyUnavailable(model));
    }
    touch_key(&state.db, api_key.id).await?;
    touch_user_ip(&state.db, user.id, &ip).await?;
    record_usage(
        &state.db,
        UsageEvent {
            api_key_id: Some(api_key.id),
            model: Some(&model),
            path: "/v1/chat/completions",
            status_code: result.status_code,
            is_stream,
            upstream_latency_ms: Some(result.latency_ms),
            error_type: result.error_type,
            client_ip: Some(&ip),
        },
    )
    .await?;

    Ok(result.response)
}
