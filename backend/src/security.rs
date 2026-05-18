use std::net::IpAddr;

use actix_web::HttpRequest;
use chrono::{DateTime, Duration, Utc};
use serde_json::json;
use sqlx::PgPool;

use crate::{
    errors::ApiError,
    models::{IpBanSummary, User},
};

pub const REGISTER_SCOPE: &str = "register";
pub const AUTH_SCOPE: &str = "auth";
pub const DASHBOARD_WRITE_SCOPE: &str = "dashboard_write";
pub const FREE_AI_SCOPE: &str = "free_ai";

pub const REGISTER_SHORT_LIMIT: i32 = 3;
pub const REGISTER_SHORT_WINDOW_SECONDS: i32 = 10 * 60;
pub const REGISTER_HOURLY_LIMIT: i32 = 5;
pub const REGISTER_HOURLY_WINDOW_SECONDS: i32 = 60 * 60;
pub const AUTH_LIMIT: i32 = 10;
pub const AUTH_WINDOW_SECONDS: i32 = 10 * 60;
pub const DASHBOARD_WRITE_LIMIT: i32 = 20;
pub const DASHBOARD_WRITE_WINDOW_SECONDS: i32 = 60 * 60;
pub const FREE_AI_SHORT_LIMIT: i32 = 60;
pub const FREE_AI_SHORT_WINDOW_SECONDS: i32 = 60;
pub const FREE_AI_HOURLY_LIMIT: i32 = 300;
pub const FREE_AI_HOURLY_WINDOW_SECONDS: i32 = 60 * 60;

const AUTO_BAN_HOURS: i64 = 24;

#[derive(Debug)]
pub struct RateLimitRule {
    pub scope: &'static str,
    pub limit: i32,
    pub window_seconds: i32,
}

pub fn client_ip(req: &HttpRequest) -> String {
    for header_name in [
        "x-openachieve-client-ip",
        "cf-connecting-ip",
        "x-real-ip",
        "x-forwarded-for",
    ] {
        if let Some(value) = req
            .headers()
            .get(header_name)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.split(',').next())
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            return value.to_string();
        }
    }

    req.peer_addr()
        .map(|addr| addr.ip().to_string())
        .unwrap_or_else(|| "127.0.0.1".to_string())
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

pub async fn ensure_ip_not_banned(pool: &PgPool, ip: &str) -> Result<(), ApiError> {
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
    .bind(ip)
    .fetch_one(pool)
    .await?;

    if banned {
        return Err(ApiError::IpBanned);
    }

    Ok(())
}

pub async fn enforce_ip_rate_limits(
    pool: &PgPool,
    ip: &str,
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
    ip: &str,
    rule: &RateLimitRule,
    route: &str,
    user_id: Option<i64>,
    api_key_id: Option<i64>,
) -> Result<(), ApiError> {
    let (request_count, retry_after_seconds): (i32, i32) = sqlx::query_as(
        r#"
        WITH window AS (
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
          FROM window
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
    .bind(ip)
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
    maybe_auto_ban_after_rate_limit(pool, ip).await?;

    Err(ApiError::RateLimited {
        retry_after_seconds: retry_after_seconds.max(1) as u64,
    })
}

pub async fn record_security_event(
    pool: &PgPool,
    event_type: &str,
    ip: Option<&str>,
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
          user_id,
          api_key_id,
          route,
          details
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        "#,
    )
    .bind(event_type)
    .bind(ip)
    .bind(user_id)
    .bind(api_key_id)
    .bind(route)
    .bind(details)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn record_registration_created(
    pool: &PgPool,
    ip: &str,
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
    maybe_auto_ban_after_registration(pool, ip).await?;
    Ok(())
}

pub async fn touch_user_ip(pool: &PgPool, user_id: i64, ip: &str) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        UPDATE users
        SET last_seen_ip = $2,
            last_seen_at = now()
        WHERE id = $1
        "#,
    )
    .bind(user_id)
    .bind(ip)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn ban_user(
    pool: &PgPool,
    user_id: i64,
    reason: &str,
) -> Result<Option<User>, sqlx::Error> {
    let mut tx = pool.begin().await?;
    let user = sqlx::query_as::<_, User>(
        r#"
        UPDATE users
        SET status = 'banned',
            banned_at = now(),
            banned_reason = $2
        WHERE id = $1
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
    .bind(user_id)
    .bind(reason)
    .fetch_optional(&mut *tx)
    .await?;

    if user.is_some() {
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
    Ok(user)
}

pub async fn unban_user(pool: &PgPool, user_id: i64) -> Result<Option<User>, sqlx::Error> {
    sqlx::query_as::<_, User>(
        r#"
        UPDATE users
        SET status = 'active',
            banned_at = NULL,
            banned_reason = NULL
        WHERE id = $1
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
    .bind(user_id)
    .fetch_optional(pool)
    .await
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

async fn maybe_auto_ban_after_rate_limit(pool: &PgPool, ip: &str) -> Result<(), sqlx::Error> {
    let recent_limit_events: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*)
        FROM security_events
        WHERE event_type = 'rate_limited'
          AND ip = $1
          AND created_at > now() - interval '30 minutes'
        "#,
    )
    .bind(ip)
    .fetch_one(pool)
    .await?;

    if recent_limit_events >= 3 {
        let expires_at = Utc::now() + Duration::hours(AUTO_BAN_HOURS);
        create_ip_ban(
            pool,
            ip,
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
            None,
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

async fn maybe_auto_ban_after_registration(pool: &PgPool, ip: &str) -> Result<(), sqlx::Error> {
    let recent_registrations: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*)
        FROM security_events
        WHERE event_type = 'registration_created'
          AND ip = $1
          AND created_at > now() - interval '1 hour'
        "#,
    )
    .bind(ip)
    .fetch_one(pool)
    .await?;

    if recent_registrations >= i64::from(REGISTER_HOURLY_LIMIT) {
        let expires_at = Utc::now() + Duration::hours(AUTO_BAN_HOURS);
        create_ip_ban(
            pool,
            ip,
            "automatic ban after excessive registrations",
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
            Some("/auth/register"),
            json!({
                "reason": "excessive_registrations",
                "recent_registrations": recent_registrations,
                "expires_at": expires_at,
            }),
        )
        .await?;
    }

    Ok(())
}
