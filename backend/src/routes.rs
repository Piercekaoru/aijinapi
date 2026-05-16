use actix_web::{HttpRequest, HttpResponse, Responder, http::header, web};
use chrono::Utc;
use rand::{Rng, distr::Alphanumeric};
use serde_json::{Value, json};
use tracing::info;

use crate::{
    auth::{
        authenticate, authenticate_admin_session, authenticate_session, ensure_monthly_quota,
        extract_bearer, hash_password, normalize_email, user_for_api_key, validate_register_input,
        verify_password,
    },
    db::{
        api_key_summaries, consume_email_verification_token,
        consume_email_verification_token_by_value, consume_unspent_email_verification_tokens,
        create_customer_key_for_user, create_default_customer_key_if_missing,
        create_email_verification_token, create_session, recent_usage_for_user, record_admin_audit,
        record_usage, revoke_api_key_for_user, subscription_summary_with_models, touch_key,
        verification_email_sent_recently,
    },
    email::VerificationEmail,
    errors::ApiError,
    free_models::{is_free_model_candidate, should_trip_free_model},
    models::{
        AdminCreateUserRequest, AdminCreateUserResponse, AdminUpdatePlanRequest, AdminUserRow,
        AdminUserStats, AdminUserSummary, AdminUsersResponse, AuthResponse, CreateUserKeyRequest,
        DashboardResponse, HealthResponse, LoginRequest, PublicUser, RegisterRequest,
        ResendVerificationRequest, UsageEvent, User, VerificationMessageResponse,
        VerificationRequiredResponse,
    },
    plans::{FREE_MONTHLY_REQUEST_LIMIT, FREE_PLAN, PLUS_MONTHLY_REQUEST_LIMIT, PLUS_PLAN},
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
        .route("/auth/me", web::get().to(me))
        .route("/dashboard", web::get().to(dashboard))
        .route("/dashboard/api-keys", web::post().to(create_dashboard_key))
        .route(
            "/dashboard/api-keys/{key_id}",
            web::delete().to(delete_dashboard_key),
        )
        .route("/admin/users", web::get().to(admin_users))
        .route("/admin/users", web::post().to(admin_create_user))
        .route(
            "/admin/users/{user_id}/plan",
            web::patch().to(admin_update_user_plan),
        )
        .route(
            "/admin/users/{user_id}",
            web::delete().to(admin_delete_user),
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
    body: web::Json<RegisterRequest>,
) -> Result<HttpResponse, ApiError> {
    let body = body.into_inner();
    let email = normalize_email(&body.email);
    validate_register_input(&body.name, &email, &body.password)?;

    let password_hash = hash_password(&body.password)?;
    let user = sqlx::query_as::<_, User>(
        r#"
        INSERT INTO users (email, name, password_hash, plan, plan_status, monthly_request_limit)
        VALUES ($1, $2, $3, 'free', 'active', $4)
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
    .bind(&email)
    .bind(body.name.trim())
    .bind(password_hash)
    .bind(FREE_MONTHLY_REQUEST_LIMIT)
    .fetch_one(&state.db)
    .await
    .map_err(|err| {
        if is_unique_violation(&err) {
            ApiError::EmailAlreadyRegistered
        } else {
            ApiError::Database(err)
        }
    })?;

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
    body: web::Json<LoginRequest>,
) -> Result<web::Json<AuthResponse>, ApiError> {
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
          plus_expires_at
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

    let session_token = create_session(&state.db, user.id).await?;
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
    body: web::Json<ResendVerificationRequest>,
) -> Result<web::Json<VerificationMessageResponse>, ApiError> {
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

async fn me(
    state: web::Data<AppState>,
    req: HttpRequest,
) -> Result<web::Json<PublicUser>, ApiError> {
    let user = authenticate_session(&state.db, extract_bearer(&req)?).await?;
    Ok(web::Json(PublicUser::from_user(
        &user,
        &state.config.admin_emails,
    )))
}

async fn dashboard(
    state: web::Data<AppState>,
    req: HttpRequest,
) -> Result<web::Json<DashboardResponse>, ApiError> {
    let user = authenticate_session(&state.db, extract_bearer(&req)?).await?;
    let api_keys = api_key_summaries(&state.db, user.id).await?;
    let recent_usage = recent_usage_for_user(&state.db, user.id).await?;
    let allowed_models = allowed_models_for_effective_plan(&state, user.effective_plan()).await;
    let subscription = subscription_summary_with_models(&state.db, &user, allowed_models).await?;

    Ok(web::Json(DashboardResponse {
        user: PublicUser::from_user(&user, &state.config.admin_emails),
        subscription,
        api_keys,
        recent_usage,
    }))
}

async fn create_dashboard_key(
    state: web::Data<AppState>,
    req: HttpRequest,
    body: web::Json<CreateUserKeyRequest>,
) -> Result<web::Json<crate::models::IssuedApiKey>, ApiError> {
    let user = authenticate_session(&state.db, extract_bearer(&req)?).await?;
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
    let user = authenticate_session(&state.db, extract_bearer(&req)?).await?;
    let key_id = path.into_inner();
    let revoked = revoke_api_key_for_user(&state.db, user.id, key_id).await?;
    if !revoked {
        return Err(ApiError::NotFound);
    }

    Ok(HttpResponse::NoContent().finish())
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
                  plus_expires_at
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
                  plus_expires_at
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

async fn admin_user_rows(pool: &sqlx::PgPool) -> Result<Vec<AdminUserRow>, sqlx::Error> {
    sqlx::query_as::<_, AdminUserRow>(
        r#"
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
            WHERE e.created_at >= date_trunc('month', now())
              AND e.path = '/v1/chat/completions'
          ) AS requests_this_month,
          MAX(k.last_used_at) AS last_used_at
        FROM users u
        LEFT JOIN api_keys k ON k.user_id = u.id
        LEFT JOIN usage_events e ON e.api_key_id = k.id
        GROUP BY u.id
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
            WHERE e.created_at >= date_trunc('month', now())
              AND e.path = '/v1/chat/completions'
          ) AS requests_this_month,
          MAX(k.last_used_at) AS last_used_at
        FROM users u
        LEFT JOIN api_keys k ON k.user_id = u.id
        LEFT JOIN usage_events e ON e.api_key_id = k.id
        WHERE u.id = $1
        GROUP BY u.id
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
          plus_expires_at
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
          plus_expires_at
        FROM users
        WHERE email = $1
        "#,
    )
    .bind(email)
    .fetch_optional(pool)
    .await?
    .ok_or(ApiError::InvalidCredentials)
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
    let api_key = authenticate(&state.db, extract_bearer(&req)?).await?;
    let user = user_for_api_key(&state.db, &api_key).await?;
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
    let api_key = authenticate(&state.db, extract_bearer(&req)?).await?;
    let user = user_for_api_key(&state.db, &api_key).await?;
    ensure_monthly_quota(&state.db, &user).await?;

    let body = body.into_inner();
    let model = request_model(&body)?.to_string();
    let is_stream = request_is_stream(&body);
    let plan = user.effective_plan();
    let route = route_for_model(&state, plan, &model).await?;

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
            },
        )
        .await?;
        return Err(ApiError::ModelTemporarilyUnavailable(model));
    }
    touch_key(&state.db, api_key.id).await?;
    record_usage(
        &state.db,
        UsageEvent {
            api_key_id: Some(api_key.id),
            model: Some(&model),
            path: "/v1/chat/completions",
            status_code: result.status_code,
            is_stream,
            upstream_latency_ms: Some(result.latency_ms),
            error_type: None,
        },
    )
    .await?;

    Ok(result.response)
}
