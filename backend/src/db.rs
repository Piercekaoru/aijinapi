use sqlx::PgPool;

use crate::{
    auth::{generate_session_token, key_prefix},
    keys::{generate_customer_key, hash_key},
    models::{
        ApiKeySummary, IssuedApiKey, SubscriptionSummary, UsageEvent, UsageEventSummary, User,
    },
    upstream::allowed_models_for_plan,
};

pub async fn record_usage(pool: &PgPool, event: UsageEvent<'_>) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        INSERT INTO usage_events (
          api_key_id,
          model,
          path,
          status_code,
          is_stream,
          upstream_latency_ms,
          error_type
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        "#,
    )
    .bind(event.api_key_id)
    .bind(event.model)
    .bind(event.path)
    .bind(i32::from(event.status_code))
    .bind(event.is_stream)
    .bind(event.upstream_latency_ms)
    .bind(event.error_type)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn touch_key(pool: &PgPool, api_key_id: i64) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE api_keys SET last_used_at = now() WHERE id = $1")
        .bind(api_key_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn create_session(pool: &PgPool, user_id: i64) -> Result<String, sqlx::Error> {
    let token = generate_session_token();
    let token_hash = hash_key(&token);

    sqlx::query(
        r#"
        INSERT INTO sessions (user_id, token_hash, expires_at)
        VALUES ($1, $2, now() + interval '30 days')
        "#,
    )
    .bind(user_id)
    .bind(token_hash)
    .execute(pool)
    .await?;

    Ok(token)
}

pub async fn create_customer_key_for_user(
    pool: &PgPool,
    user_id: i64,
    name: &str,
    monthly_limit: i32,
) -> Result<IssuedApiKey, sqlx::Error> {
    let key = generate_customer_key();
    let key_hash = hash_key(&key);
    let prefix = key_prefix(&key);

    let id: i64 = sqlx::query_scalar(
        r#"
        INSERT INTO api_keys (key_hash, name, monthly_request_limit, user_id, key_prefix)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
        "#,
    )
    .bind(key_hash)
    .bind(name)
    .bind(monthly_limit)
    .bind(user_id)
    .bind(&prefix)
    .fetch_one(pool)
    .await?;

    Ok(IssuedApiKey {
        id,
        name: name.to_owned(),
        key,
        key_prefix: prefix,
        monthly_request_limit: monthly_limit,
    })
}

pub async fn api_key_summaries(
    pool: &PgPool,
    user_id: i64,
) -> Result<Vec<ApiKeySummary>, sqlx::Error> {
    sqlx::query_as::<_, ApiKeySummary>(
        r#"
        SELECT
          k.id,
          k.name,
          k.enabled,
          k.key_prefix,
          k.monthly_request_limit,
          k.created_at,
          k.last_used_at,
          COUNT(e.id) FILTER (WHERE e.created_at >= date_trunc('month', now())) AS requests_this_month
        FROM api_keys k
        LEFT JOIN usage_events e ON e.api_key_id = k.id
        WHERE k.user_id = $1
        GROUP BY k.id
        ORDER BY k.created_at DESC
        "#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await
}

pub async fn monthly_chat_usage_for_user(pool: &PgPool, user_id: i64) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar(
        r#"
        SELECT COUNT(*)
        FROM usage_events e
        JOIN api_keys k ON k.id = e.api_key_id
        WHERE k.user_id = $1
          AND e.path = '/v1/chat/completions'
          AND e.created_at >= date_trunc('month', now())
        "#,
    )
    .bind(user_id)
    .fetch_one(pool)
    .await
}

pub async fn subscription_summary(
    pool: &PgPool,
    user: &User,
) -> Result<SubscriptionSummary, sqlx::Error> {
    let requests_this_month = monthly_chat_usage_for_user(pool, user.id).await?;
    let monthly_request_limit = user.effective_monthly_request_limit();
    let remaining_requests = (i64::from(monthly_request_limit) - requests_this_month).max(0);
    let plan = user.effective_plan().to_string();

    Ok(SubscriptionSummary {
        allowed_models: allowed_models_for_plan(&plan).to_vec(),
        plan,
        plan_status: user.plan_status.clone(),
        monthly_request_limit,
        requests_this_month,
        remaining_requests,
        plus_started_at: user.plus_started_at,
        plus_expires_at: user.plus_expires_at,
    })
}

pub async fn recent_usage_for_user(
    pool: &PgPool,
    user_id: i64,
) -> Result<Vec<UsageEventSummary>, sqlx::Error> {
    sqlx::query_as::<_, UsageEventSummary>(
        r#"
        SELECT
          e.model,
          e.path,
          e.status_code,
          e.is_stream,
          e.upstream_latency_ms,
          e.error_type,
          e.created_at
        FROM usage_events e
        JOIN api_keys k ON k.id = e.api_key_id
        WHERE k.user_id = $1
        ORDER BY e.created_at DESC
        LIMIT 20
        "#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await
}
