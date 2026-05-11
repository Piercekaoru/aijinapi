use actix_web::{HttpRequest, HttpResponse, Responder, web};
use serde_json::Value;
use tracing::info;

use crate::{
    auth::{
        authenticate, authenticate_session, ensure_monthly_quota, extract_bearer, hash_password,
        normalize_email, user_for_api_key, validate_register_input, verify_password,
    },
    db::{
        api_key_summaries, create_customer_key_for_user, create_session, recent_usage_for_user,
        record_usage, subscription_summary, touch_key,
    },
    errors::ApiError,
    models::{
        AuthResponse, CreateUserKeyRequest, DashboardResponse, HealthResponse, LoginRequest,
        PublicUser, RegisterRequest, UsageEvent, User,
    },
    plans::FREE_MONTHLY_REQUEST_LIMIT,
    state::AppState,
    upstream::{
        allowed_models_for_plan, bytes_from_static_json, forward_chat, openai_models_payload,
        request_is_stream, request_model, route_for_model,
    },
};

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.route("/health", web::get().to(health))
        .route("/auth/register", web::post().to(register))
        .route("/auth/login", web::post().to(login))
        .route("/auth/me", web::get().to(me))
        .route("/dashboard", web::get().to(dashboard))
        .route("/dashboard/api-keys", web::post().to(create_dashboard_key))
        .route("/v1/models", web::get().to(models))
        .route("/v1/chat/completions", web::post().to(chat_completions));
}

async fn health() -> impl Responder {
    web::Json(HealthResponse {
        ok: true,
        service: "aijinapi-backend",
    })
}

async fn register(
    state: web::Data<AppState>,
    body: web::Json<RegisterRequest>,
) -> Result<web::Json<AuthResponse>, ApiError> {
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

    let session_token = create_session(&state.db, user.id).await?;
    let api_key =
        create_customer_key_for_user(&state.db, user.id, "default", FREE_MONTHLY_REQUEST_LIMIT)
            .await?;

    Ok(web::Json(AuthResponse {
        session_token,
        user: user.into(),
        api_key: Some(api_key),
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

    let session_token = create_session(&state.db, user.id).await?;

    Ok(web::Json(AuthResponse {
        session_token,
        user: user.into(),
        api_key: None,
    }))
}

async fn me(
    state: web::Data<AppState>,
    req: HttpRequest,
) -> Result<web::Json<PublicUser>, ApiError> {
    let user = authenticate_session(&state.db, extract_bearer(&req)?).await?;
    Ok(web::Json(user.into()))
}

async fn dashboard(
    state: web::Data<AppState>,
    req: HttpRequest,
) -> Result<web::Json<DashboardResponse>, ApiError> {
    let user = authenticate_session(&state.db, extract_bearer(&req)?).await?;
    let api_keys = api_key_summaries(&state.db, user.id).await?;
    let recent_usage = recent_usage_for_user(&state.db, user.id).await?;
    let subscription = subscription_summary(&state.db, &user).await?;

    Ok(web::Json(DashboardResponse {
        user: user.into(),
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

    touch_key(&state.db, api_key.id).await?;
    Ok(HttpResponse::Ok()
        .content_type("application/json")
        .body(bytes_from_static_json(openai_models_payload(
            allowed_models_for_plan(plan),
        ))))
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
    let route = route_for_model(plan, &model)?;

    info!(
        api_key_id = api_key.id,
        user_id = user.id,
        plan = plan,
        model = %model,
        stream = is_stream,
        "proxying chat completion"
    );

    let result = forward_chat(&state.http, &state.config, body, route).await?;
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
