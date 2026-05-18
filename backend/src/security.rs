use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};

use actix_web::HttpRequest;
use chrono::{DateTime, Duration, Utc};
use serde::Serialize;
use serde_json::json;
use sqlx::PgPool;

use crate::{config::Config, errors::ApiError};

pub const REGISTER_SCOPE: &str = "register";
pub const FREE_AI_SCOPE: &str = "free_ai";

pub const REGISTER_SHORT_LIMIT: i32 = 3;
pub const REGISTER_SHORT_WINDOW_SECONDS: i32 = 10 * 60;
pub const REGISTER_HOURLY_LIMIT: i32 = 5;
pub const REGISTER_HOURLY_WINDOW_SECONDS: i32 = 60 * 60;
pub const FREE_AI_SHORT_LIMIT: i32 = 60;
pub const FREE_AI_SHORT_WINDOW_SECONDS: i32 = 60;
pub const FREE_AI_HOURLY_LIMIT: i32 = 300;
pub const FREE_AI_HOURLY_WINDOW_SECONDS: i32 = 60 * 60;

const AUTO_BAN_HOURS: i64 = 24;

#[derive(Debug, Clone, Eq, PartialEq)]
pub struct ClientIp {
    pub ip: String,
    pub source: &'static str,
}

#[derive(Debug)]
pub struct RateLimitRule {
    pub scope: &'static str,
    pub limit: i32,
    pub window_seconds: i32,
    pub auto_ban_on_repeat: bool,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct IpBanSummary {
    pub id: i64,
    pub ip: String,
    pub reason: String,
    pub banned_by_user_id: Option<i64>,
    pub created_at: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>,
    pub lifted_at: Option<DateTime<Utc>>,
}

pub fn is_local_environment(config: &Config) -> bool {
    let app_base_url = config.app_base_url.to_ascii_lowercase();
    app_base_url.starts_with("http://localhost")
        || app_base_url.starts_with("http://127.0.0.1")
        || app_base_url.starts_with("http://[::1]")
}

pub fn client_ip_for_security(req: &HttpRequest, config: &Config) -> Result<ClientIp, ApiError> {
    let local = is_local_environment(config);
    let candidates: &[(&str, &str)] = if local {
        &[
            ("x-openachieve-client-ip", "openachieve"),
            ("cf-connecting-ip", "cloudflare"),
            ("x-real-ip", "x-real-ip"),
            ("x-forwarded-for", "x-forwarded-for"),
        ]
    } else {
        &[
            ("x-openachieve-client-ip", "openachieve"),
            ("cf-connecting-ip", "cloudflare"),
        ]
    };

    for (header_name, source) in candidates {
        if let Some(ip) = req
            .headers()
            .get(*header_name)
            .and_then(|value| value.to_str().ok())
            .and_then(first_valid_ip)
        {
            if !local && is_non_public_ip(ip) {
                return Err(ApiError::InvalidClientIp);
            }
            return Ok(ClientIp {
                ip: ip.to_string(),
                source,
            });
        }
    }

    if local {
        if let Some(ip) = req.peer_addr().map(|addr| addr.ip()) {
            return Ok(ClientIp {
                ip: ip.to_string(),
                source: "peer_addr",
            });
        }
        return Ok(ClientIp {
            ip: "127.0.0.1".to_string(),
            source: "local_default",
        });
    }

    Err(ApiError::InvalidClientIp)
}

pub fn best_effort_client_ip(req: &HttpRequest) -> String {
    for header_name in [
        "x-openachieve-client-ip",
        "cf-connecting-ip",
        "x-real-ip",
        "x-forwarded-for",
    ] {
        if let Some(ip) = req
            .headers()
            .get(header_name)
            .and_then(|value| value.to_str().ok())
            .and_then(first_valid_ip)
        {
            return ip.to_string();
        }
    }

    req.peer_addr()
        .map(|addr| addr.ip().to_string())
        .unwrap_or_else(|| "127.0.0.1".to_string())
}

fn first_valid_ip(value: &str) -> Option<IpAddr> {
    value
        .split(',')
        .map(str::trim)
        .find_map(|part| part.parse::<IpAddr>().ok())
}

pub fn validate_ip(ip: &str) -> Result<String, ApiError> {
    let trimmed = ip.trim();
    if trimmed.parse::<IpAddr>().is_err() {
        return Err(ApiError::InvalidRequest(
            "valid IP address is required".into(),
        ));
    }
    Ok(trimmed.to_string())
}

fn is_non_public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => is_non_public_ipv4(ip),
        IpAddr::V6(ip) => is_non_public_ipv6(ip),
    }
}

fn is_non_public_ipv4(ip: Ipv4Addr) -> bool {
    ip.is_loopback()
        || ip.is_private()
        || ip.is_link_local()
        || ip.is_unspecified()
        || ip.is_broadcast()
        || ip.octets()[0] == 0
}

fn is_non_public_ipv6(ip: Ipv6Addr) -> bool {
    ip.is_loopback() || ip.is_unspecified() || ip.is_unique_local() || ip.is_unicast_link_local()
}

pub async fn ensure_ip_not_banned(pool: &PgPool, ip: &ClientIp) -> Result<(), ApiError> {
    let banned: bool = sqlx::query_scalar(
        r#"
        SELECT EXISTS (
          SELECT 1
          FROM ip_bans
          WHERE ip = $1
            AND lifted_at IS NULL
            AND (expires_at IS NULL OR expires_at > now())
        )
        "#,
    )
    .bind(&ip.ip)
    .fetch_one(pool)
    .await?;

    if banned {
        record_security_event(
            pool,
            "ip_ban_blocked",
            Some(ip),
            None,
            None,
            None,
            json!({}),
        )
        .await?;
        return Err(ApiError::IpBanned);
    }

    Ok(())
}

pub async fn enforce_ip_rate_limits(
    pool: &PgPool,
    ip: &ClientIp,
    rules: &[RateLimitRule],
    route: &str,
    user_id: Option<i64>,
    api_key_id: Option<i64>,
) -> Result<(), ApiError> {
    for rule in rules {
        enforce_ip_rate_limit(pool, ip, rule, route, user_id, api_key_id).await?;
    }
    Ok(())
}

async fn enforce_ip_rate_limit(
    pool: &PgPool,
    ip: &ClientIp,
    rule: &RateLimitRule,
    route: &str,
    user_id: Option<i64>,
    api_key_id: Option<i64>,
) -> Result<(), ApiError> {
    let (request_count, retry_after_seconds): (i32, i32) = sqlx::query_as(
        r#"
        WITH rate_window AS (
          SELECT to_timestamp(
            floor(extract(epoch FROM now()) / $3::int) * $3::int
          ) AS window_start
        ),
        upserted AS (
          INSERT INTO ip_rate_limit_windows (
            scope,
            ip,
            window_start,
            window_seconds,
            request_count,
            updated_at
          )
          SELECT $1, $2, window_start, $3::int, 1, now()
          FROM rate_window
          ON CONFLICT (scope, ip, window_start, window_seconds)
          DO UPDATE
            SET request_count = ip_rate_limit_windows.request_count + 1,
                updated_at = now()
          RETURNING request_count, window_start
        )
        SELECT
          request_count,
          GREATEST(
            1,
            CEIL(EXTRACT(EPOCH FROM (window_start + ($3::int * interval '1 second') - now())))::int
          ) AS retry_after_seconds
        FROM upserted
        "#,
    )
    .bind(rule.scope)
    .bind(&ip.ip)
    .bind(rule.window_seconds)
    .fetch_one(pool)
    .await?;

    if request_count <= rule.limit {
        return Ok(());
    }

    record_security_event(
        pool,
        "rate_limited",
        Some(ip),
        user_id,
        api_key_id,
        Some(route),
        json!({
            "scope": rule.scope,
            "limit": rule.limit,
            "window_seconds": rule.window_seconds,
            "request_count": request_count,
        }),
    )
    .await?;

    if rule.auto_ban_on_repeat {
        maybe_auto_ban_after_rate_limit(pool, ip, route).await?;
    }

    Err(ApiError::RateLimited {
        retry_after_seconds: retry_after_seconds.max(1) as u64,
    })
}

pub async fn record_security_event(
    pool: &PgPool,
    event_type: &str,
    ip: Option<&ClientIp>,
    user_id: Option<i64>,
    api_key_id: Option<i64>,
    route: Option<&str>,
    details: serde_json::Value,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        INSERT INTO security_events (
          event_type,
          ip,
          ip_source,
          user_id,
          api_key_id,
          route,
          details
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        "#,
    )
    .bind(event_type)
    .bind(ip.map(|ip| ip.ip.as_str()))
    .bind(ip.map(|ip| ip.source))
    .bind(user_id)
    .bind(api_key_id)
    .bind(route)
    .bind(details)
    .execute(pool)
    .await?;
    Ok(())
}

async fn maybe_auto_ban_after_rate_limit(
    pool: &PgPool,
    ip: &ClientIp,
    route: &str,
) -> Result<(), sqlx::Error> {
    let recent_limit_events: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*)
        FROM security_events
        WHERE event_type = 'rate_limited'
          AND ip = $1
          AND created_at > now() - interval '30 minutes'
        "#,
    )
    .bind(&ip.ip)
    .fetch_one(pool)
    .await?;

    if recent_limit_events >= 3 {
        let expires_at = Utc::now() + Duration::hours(AUTO_BAN_HOURS);
        create_ip_ban(
            pool,
            &ip.ip,
            "automatic ban after repeated rate limit violations",
            None,
            Some(expires_at),
        )
        .await?;
        record_security_event(
            pool,
            "ip_auto_banned",
            Some(ip),
            None,
            None,
            Some(route),
            json!({
                "reason": "repeated_rate_limit",
                "recent_limit_events": recent_limit_events,
                "expires_at": expires_at,
            }),
        )
        .await?;
    }
    Ok(())
}

pub async fn record_registration_created(
    pool: &PgPool,
    ip: &ClientIp,
    user_id: i64,
) -> Result<(), ApiError> {
    record_security_event(
        pool,
        "registration_created",
        Some(ip),
        Some(user_id),
        None,
        Some("/auth/register"),
        json!({}),
    )
    .await?;
    Ok(())
}

pub async fn touch_user_ip(pool: &PgPool, user_id: i64, ip: &ClientIp) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        UPDATE users
        SET last_seen_ip = $2,
            last_seen_at = now()
        WHERE id = $1
        "#,
    )
    .bind(user_id)
    .bind(&ip.ip)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn ensure_user_active(pool: &PgPool, user_id: i64) -> Result<(), ApiError> {
    let status: Option<String> = sqlx::query_scalar("SELECT status FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_optional(pool)
        .await?;
    match status.as_deref() {
        Some("banned") => Err(ApiError::AccountBanned),
        Some(_) => Ok(()),
        None => Err(ApiError::NotFound),
    }
}

pub async fn ban_user(pool: &PgPool, user_id: i64, reason: &str) -> Result<bool, sqlx::Error> {
    let mut tx = pool.begin().await?;
    let result = sqlx::query(
        r#"
        UPDATE users
        SET status = 'banned',
            banned_at = now(),
            banned_reason = $2
        WHERE id = $1
        "#,
    )
    .bind(user_id)
    .bind(reason)
    .execute(&mut *tx)
    .await?;

    if result.rows_affected() > 0 {
        sqlx::query(
            r#"
            UPDATE sessions
            SET revoked_at = now()
            WHERE user_id = $1
              AND revoked_at IS NULL
            "#,
        )
        .bind(user_id)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    Ok(result.rows_affected() > 0)
}

pub async fn unban_user(pool: &PgPool, user_id: i64) -> Result<bool, sqlx::Error> {
    let result = sqlx::query(
        r#"
        UPDATE users
        SET status = 'active',
            banned_at = NULL,
            banned_reason = NULL
        WHERE id = $1
        "#,
    )
    .bind(user_id)
    .execute(pool)
    .await?;
    Ok(result.rows_affected() > 0)
}

pub async fn create_ip_ban(
    pool: &PgPool,
    ip: &str,
    reason: &str,
    banned_by_user_id: Option<i64>,
    expires_at: Option<DateTime<Utc>>,
) -> Result<IpBanSummary, sqlx::Error> {
    if let Some(existing) = active_ip_ban(pool, ip).await? {
        return Ok(existing);
    }
    sqlx::query_as::<_, IpBanSummary>(
        r#"
        INSERT INTO ip_bans (ip, reason, banned_by_user_id, expires_at)
        VALUES ($1, $2, $3, $4)
        RETURNING id, ip, reason, banned_by_user_id, created_at, expires_at, lifted_at
        "#,
    )
    .bind(ip)
    .bind(reason)
    .bind(banned_by_user_id)
    .bind(expires_at)
    .fetch_one(pool)
    .await
}

pub async fn active_ip_ban(pool: &PgPool, ip: &str) -> Result<Option<IpBanSummary>, sqlx::Error> {
    sqlx::query_as::<_, IpBanSummary>(
        r#"
        SELECT id, ip, reason, banned_by_user_id, created_at, expires_at, lifted_at
        FROM ip_bans
        WHERE ip = $1
          AND lifted_at IS NULL
          AND (expires_at IS NULL OR expires_at > now())
        ORDER BY created_at DESC
        LIMIT 1
        "#,
    )
    .bind(ip)
    .fetch_optional(pool)
    .await
}

pub async fn lift_ip_ban(
    pool: &PgPool,
    ban_id: i64,
    lifted_by_user_id: i64,
    reason: &str,
) -> Result<Option<IpBanSummary>, sqlx::Error> {
    sqlx::query_as::<_, IpBanSummary>(
        r#"
        UPDATE ip_bans
        SET lifted_at = now(),
            lifted_by_user_id = $2,
            lift_reason = $3
        WHERE id = $1
          AND lifted_at IS NULL
        RETURNING id, ip, reason, banned_by_user_id, created_at, expires_at, lifted_at
        "#,
    )
    .bind(ban_id)
    .bind(lifted_by_user_id)
    .bind(reason)
    .fetch_optional(pool)
    .await
}

#[cfg(test)]
mod tests {
    use actix_web::test::TestRequest;

    use super::*;

    fn config(app_base_url: &str) -> Config {
        Config {
            database_url: "postgres://example".to_string(),
            app_base_url: app_base_url.to_string(),
            admin_emails: vec![],
            opencode_zen_api_keys: vec!["zen".to_string()],
            opencode_go_api_keys: vec!["go".to_string()],
            server_host: "127.0.0.1".parse().unwrap(),
            server_port: 8080,
            default_monthly_request_limit: 500,
            zen_chat_completions_url: "http://127.0.0.1/zen".to_string(),
            zen_go_chat_completions_url: "http://127.0.0.1/go".to_string(),
            zen_models_url: "http://127.0.0.1/models".to_string(),
            zen_go_models_url: "http://127.0.0.1/go/models".to_string(),
            upstream_max_attempts: 1,
            upstream_retry_base_ms: 0,
            upstream_key_cooldown_ms: 60_000,
            cors_allowed_origins: vec![],
            smtp: None,
            fovpay: None,
        }
    }

    #[test]
    fn production_uses_cloudflare_real_ip() {
        let req = TestRequest::default()
            .insert_header(("cf-connecting-ip", "198.51.100.10"))
            .insert_header(("x-real-ip", "127.0.0.1"))
            .to_http_request();
        let ip = client_ip_for_security(&req, &config("https://openachieve.asia")).unwrap();
        assert_eq!(ip.ip, "198.51.100.10");
        assert_eq!(ip.source, "cloudflare");
    }

    #[test]
    fn production_rejects_local_or_missing_ip() {
        let prod = config("https://openachieve.asia");
        let local_req = TestRequest::default()
            .insert_header(("cf-connecting-ip", "127.0.0.1"))
            .to_http_request();
        assert!(matches!(
            client_ip_for_security(&local_req, &prod),
            Err(ApiError::InvalidClientIp)
        ));

        let missing_req = TestRequest::default().to_http_request();
        assert!(matches!(
            client_ip_for_security(&missing_req, &prod),
            Err(ApiError::InvalidClientIp)
        ));
    }

    #[test]
    fn local_environment_accepts_forwarded_test_ip() {
        let req = TestRequest::default()
            .insert_header(("x-forwarded-for", "203.0.113.9, 10.0.0.1"))
            .to_http_request();
        let ip = client_ip_for_security(&req, &config("http://localhost:3000")).unwrap();
        assert_eq!(ip.ip, "203.0.113.9");
        assert_eq!(ip.source, "x-forwarded-for");
    }
}
