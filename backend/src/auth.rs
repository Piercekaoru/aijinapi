use actix_web::HttpRequest;
use argon2::{
    Argon2, PasswordHash, PasswordHasher, PasswordVerifier,
    password_hash::{SaltString, rand_core::OsRng},
};
use rand::{Rng, distr::Alphanumeric};
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    errors::ApiError,
    keys::{CUSTOMER_KEY_PREFIX, hash_key},
    models::{ApiKey, User},
};

pub const SESSION_TOKEN_PREFIX: &str = "openachieve_session_";

pub fn extract_bearer(req: &HttpRequest) -> Result<&str, ApiError> {
    let header = req
        .headers()
        .get("authorization")
        .and_then(|value| value.to_str().ok())
        .ok_or(ApiError::MissingAuthorization)?;

    header
        .strip_prefix("Bearer ")
        .filter(|key| !key.trim().is_empty())
        .map(str::trim)
        .ok_or(ApiError::MissingAuthorization)
}

pub async fn authenticate(pool: &PgPool, bearer_key: &str) -> Result<ApiKey, ApiError> {
    if !bearer_key.starts_with(CUSTOMER_KEY_PREFIX) {
        return Err(ApiError::InvalidApiKey);
    }

    let key_hash = hash_key(bearer_key);
    let api_key = sqlx::query_as::<_, ApiKey>(
        r#"
        SELECT id, key_hash, name, enabled, monthly_request_limit, created_at, last_used_at,
               user_id, key_prefix
        FROM api_keys
        WHERE key_hash = $1
        "#,
    )
    .bind(key_hash)
    .fetch_optional(pool)
    .await?;

    let api_key = api_key.ok_or(ApiError::InvalidApiKey)?;
    if !api_key.enabled {
        return Err(ApiError::DisabledApiKey);
    }

    Ok(api_key)
}

pub async fn authenticate_session(pool: &PgPool, bearer_token: &str) -> Result<User, ApiError> {
    if !bearer_token.starts_with(SESSION_TOKEN_PREFIX) {
        return Err(ApiError::InvalidSession);
    }

    let token_hash = hash_key(bearer_token);
    let user = sqlx::query_as::<_, User>(
        r#"
        SELECT
          u.id,
          u.email,
          u.name,
              u.password_hash,
              u.created_at,
              u.email_verified_at,
              u.plan,
          u.plan_status,
          u.monthly_request_limit,
          u.plus_started_at,
          u.plus_expires_at,
          u.status,
          u.banned_at,
          u.banned_reason,
          u.registration_ip,
          u.last_seen_ip,
          u.last_seen_at
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = $1
          AND s.revoked_at IS NULL
          AND s.expires_at > now()
        "#,
    )
    .bind(token_hash)
    .fetch_optional(pool)
    .await?;

    let user = user.ok_or(ApiError::InvalidSession)?;
    if !user.email_is_verified() {
        return Err(ApiError::EmailNotVerified);
    }
    if user.is_banned() {
        return Err(ApiError::AccountBanned);
    }

    Ok(user)
}

pub async fn authenticate_admin_session(
    pool: &PgPool,
    bearer_token: &str,
    admin_emails: &[String],
) -> Result<User, ApiError> {
    let user = authenticate_session(pool, bearer_token).await?;
    if admin_emails.contains(&user.email) {
        Ok(user)
    } else {
        Err(ApiError::Forbidden)
    }
}

pub async fn user_for_api_key(pool: &PgPool, api_key: &ApiKey) -> Result<User, ApiError> {
    let user_id = api_key.user_id.ok_or(ApiError::InvalidApiKey)?;
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
        "#,
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?;

    let user = user.ok_or(ApiError::InvalidApiKey)?;
    if !user.email_is_verified() {
        return Err(ApiError::EmailNotVerified);
    }
    if user.is_banned() {
        return Err(ApiError::AccountBanned);
    }

    Ok(user)
}

pub fn normalize_email(email: &str) -> String {
    email.trim().to_ascii_lowercase()
}

pub fn validate_register_input(name: &str, email: &str, password: &str) -> Result<(), ApiError> {
    if name.trim().len() < 2 {
        return Err(ApiError::InvalidRequest(
            "name must be at least 2 characters".into(),
        ));
    }
    if !email.contains('@') || email.trim().len() < 5 {
        return Err(ApiError::InvalidRequest("valid email is required".into()));
    }
    validate_password(password)
}

pub fn validate_password(password: &str) -> Result<(), ApiError> {
    if password.len() < 8 {
        return Err(ApiError::InvalidRequest(
            "password must be at least 8 characters".into(),
        ));
    }
    Ok(())
}

pub fn hash_password(password: &str) -> Result<String, ApiError> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|_| ApiError::InvalidRequest("could not hash password".into()))
}

pub fn verify_password(password: &str, password_hash: &str) -> bool {
    let Ok(parsed_hash) = PasswordHash::new(password_hash) else {
        return false;
    };
    Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .is_ok()
}

pub fn generate_session_token() -> String {
    let suffix: String = rand::rng()
        .sample_iter(&Alphanumeric)
        .take(40)
        .map(char::from)
        .collect();
    format!(
        "{SESSION_TOKEN_PREFIX}{}_{}",
        Uuid::new_v4().simple(),
        suffix
    )
}

pub fn generate_email_verification_token() -> String {
    let suffix: String = rand::rng()
        .sample_iter(&Alphanumeric)
        .take(48)
        .map(char::from)
        .collect();
    format!("openachieve_verify_{}_{}", Uuid::new_v4().simple(), suffix)
}

pub fn generate_password_reset_token() -> String {
    let suffix: String = rand::rng()
        .sample_iter(&Alphanumeric)
        .take(48)
        .map(char::from)
        .collect();
    format!("openachieve_reset_{}_{}", Uuid::new_v4().simple(), suffix)
}

pub fn key_prefix(key: &str) -> String {
    key.chars().take(14).collect()
}

pub async fn ensure_monthly_quota(pool: &PgPool, user: &User) -> Result<(), ApiError> {
    let used: i64 = sqlx::query_scalar(
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
        SELECT COUNT(*)
        FROM usage_events e
        JOIN api_keys k ON k.id = e.api_key_id
        CROSS JOIN quota_window q
        WHERE k.user_id = $1
          AND e.path = '/v1/chat/completions'
          AND e.created_at >= q.usage_start
        "#,
    )
    .bind(user.id)
    .fetch_one(pool)
    .await?;

    if used >= i64::from(user.effective_monthly_request_limit()) {
        return Err(ApiError::QuotaExceeded);
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use actix_web::test::TestRequest;

    use super::*;

    #[test]
    fn extracts_bearer_token() {
        let req = TestRequest::default()
            .insert_header(("authorization", "Bearer openachieve_abc"))
            .to_http_request();

        assert_eq!(extract_bearer(&req).unwrap(), "openachieve_abc");
    }

    #[test]
    fn rejects_missing_bearer_token() {
        let req = TestRequest::default()
            .insert_header(("authorization", "Basic nope"))
            .to_http_request();

        assert!(matches!(
            extract_bearer(&req),
            Err(ApiError::MissingAuthorization)
        ));
    }

    #[test]
    fn rejects_absent_authorization_header() {
        let req = TestRequest::default().to_http_request();

        assert!(matches!(
            extract_bearer(&req),
            Err(ApiError::MissingAuthorization)
        ));
    }

    #[test]
    fn rejects_empty_bearer_token() {
        let req = TestRequest::default()
            .insert_header(("authorization", "Bearer    "))
            .to_http_request();

        assert!(matches!(
            extract_bearer(&req),
            Err(ApiError::MissingAuthorization)
        ));
    }
}
