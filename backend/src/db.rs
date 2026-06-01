use sqlx::PgPool;

use crate::{
    auth::{
        generate_email_verification_token, generate_password_reset_token, generate_session_token,
        key_prefix,
    },
    keys::{generate_customer_key, hash_key},
    models::{
        ApiKeySummary, BillingOrder, IssuedApiKey, SubscriptionSummary, UsageEvent,
        UsageEventSummary, User,
    },
    upstream::{MINIMAX_M3_MODEL, allowed_models_for_plan},
};

pub async fn record_admin_audit(
    pool: &PgPool,
    actor: &User,
    target_user_id: Option<i64>,
    target_email: &str,
    action: &str,
    details: serde_json::Value,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        INSERT INTO admin_audit_events (
          actor_user_id,
          actor_email,
          target_user_id,
          target_email,
          action,
          details
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        "#,
    )
    .bind(actor.id)
    .bind(&actor.email)
    .bind(target_user_id)
    .bind(target_email)
    .bind(action)
    .bind(details)
    .execute(pool)
    .await?;

    Ok(())
}

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
          error_type,
          client_ip
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        "#,
    )
    .bind(event.api_key_id)
    .bind(event.model)
    .bind(event.path)
    .bind(i32::from(event.status_code))
    .bind(event.is_stream)
    .bind(event.upstream_latency_ms)
    .bind(event.error_type)
    .bind(event.client_ip)
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

pub async fn revoke_api_key_for_user(
    pool: &PgPool,
    user_id: i64,
    api_key_id: i64,
) -> Result<bool, sqlx::Error> {
    let result = sqlx::query(
        r#"
        UPDATE api_keys
        SET enabled = false
        WHERE id = $1
          AND user_id = $2
        "#,
    )
    .bind(api_key_id)
    .bind(user_id)
    .execute(pool)
    .await?;

    Ok(result.rows_affected() > 0)
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

pub async fn create_email_verification_token(
    pool: &PgPool,
    user_id: i64,
) -> Result<String, sqlx::Error> {
    let token = generate_email_verification_token();
    let token_hash = hash_key(&token);

    sqlx::query(
        r#"
        INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
        VALUES ($1, $2, now() + interval '24 hours')
        "#,
    )
    .bind(user_id)
    .bind(token_hash)
    .execute(pool)
    .await?;

    Ok(token)
}

pub async fn consume_email_verification_token(
    pool: &PgPool,
    token: &str,
) -> Result<Option<i64>, sqlx::Error> {
    let token_hash = hash_key(token);
    let user_id: Option<i64> = sqlx::query_scalar(
        r#"
        SELECT t.user_id
        FROM email_verification_tokens t
        JOIN users u ON u.id = t.user_id
        WHERE t.token_hash = $1
          AND t.consumed_at IS NULL
          AND t.expires_at > now()
          AND u.email_verified_at IS NULL
        "#,
    )
    .bind(token_hash)
    .fetch_optional(pool)
    .await?;

    if let Some(user_id) = user_id {
        sqlx::query("UPDATE users SET email_verified_at = now() WHERE id = $1")
            .bind(user_id)
            .execute(pool)
            .await?;
        consume_unspent_email_verification_tokens(pool, user_id).await?;
        Ok(Some(user_id))
    } else {
        Ok(None)
    }
}

pub async fn consume_unspent_email_verification_tokens(
    pool: &PgPool,
    user_id: i64,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        UPDATE email_verification_tokens
        SET consumed_at = now()
        WHERE user_id = $1
          AND consumed_at IS NULL
        "#,
    )
    .bind(user_id)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn consume_email_verification_token_by_value(
    pool: &PgPool,
    token: &str,
) -> Result<(), sqlx::Error> {
    let token_hash = hash_key(token);
    sqlx::query(
        r#"
        UPDATE email_verification_tokens
        SET consumed_at = now()
        WHERE token_hash = $1
          AND consumed_at IS NULL
        "#,
    )
    .bind(token_hash)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn verification_email_sent_recently(
    pool: &PgPool,
    user_id: i64,
) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar(
        r#"
        SELECT EXISTS (
          SELECT 1
          FROM email_verification_tokens
          WHERE user_id = $1
            AND consumed_at IS NULL
            AND created_at > now() - interval '60 seconds'
        )
        "#,
    )
    .bind(user_id)
    .fetch_one(pool)
    .await
}

pub async fn create_password_reset_token(
    pool: &PgPool,
    user_id: i64,
) -> Result<String, sqlx::Error> {
    consume_unspent_password_reset_tokens(pool, user_id).await?;

    let token = generate_password_reset_token();
    let token_hash = hash_key(&token);

    sqlx::query(
        r#"
        INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
        VALUES ($1, $2, now() + interval '1 hour')
        "#,
    )
    .bind(user_id)
    .bind(token_hash)
    .execute(pool)
    .await?;

    Ok(token)
}

pub async fn consume_unspent_password_reset_tokens(
    pool: &PgPool,
    user_id: i64,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        UPDATE password_reset_tokens
        SET consumed_at = now()
        WHERE user_id = $1
          AND consumed_at IS NULL
        "#,
    )
    .bind(user_id)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn consume_password_reset_token_by_value(
    pool: &PgPool,
    token: &str,
) -> Result<(), sqlx::Error> {
    let token_hash = hash_key(token);
    sqlx::query(
        r#"
        UPDATE password_reset_tokens
        SET consumed_at = now()
        WHERE token_hash = $1
          AND consumed_at IS NULL
        "#,
    )
    .bind(token_hash)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn reset_password_with_token(
    pool: &PgPool,
    token: &str,
    password_hash: String,
) -> Result<bool, sqlx::Error> {
    let token_hash = hash_key(token);
    let mut tx = pool.begin().await?;

    let user_id: Option<i64> = sqlx::query_scalar(
        r#"
        SELECT user_id
        FROM password_reset_tokens
        WHERE token_hash = $1
          AND consumed_at IS NULL
          AND expires_at > now()
        FOR UPDATE
        "#,
    )
    .bind(token_hash)
    .fetch_optional(&mut *tx)
    .await?;

    let Some(user_id) = user_id else {
        tx.commit().await?;
        return Ok(false);
    };

    sqlx::query("UPDATE users SET password_hash = $1 WHERE id = $2")
        .bind(password_hash)
        .bind(user_id)
        .execute(&mut *tx)
        .await?;

    sqlx::query(
        r#"
        UPDATE password_reset_tokens
        SET consumed_at = now()
        WHERE user_id = $1
          AND consumed_at IS NULL
        "#,
    )
    .bind(user_id)
    .execute(&mut *tx)
    .await?;

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

    tx.commit().await?;
    Ok(true)
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

pub async fn create_default_customer_key_if_missing(
    pool: &PgPool,
    user_id: i64,
    monthly_limit: i32,
) -> Result<Option<IssuedApiKey>, sqlx::Error> {
    let existing_count: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*)
        FROM api_keys
        WHERE user_id = $1
        "#,
    )
    .bind(user_id)
    .fetch_one(pool)
    .await?;

    if existing_count > 0 {
        return Ok(None);
    }

    create_customer_key_for_user(pool, user_id, "default", monthly_limit)
        .await
        .map(Some)
}

pub async fn api_key_summaries(
    pool: &PgPool,
    user_id: i64,
) -> Result<Vec<ApiKeySummary>, sqlx::Error> {
    sqlx::query_as::<_, ApiKeySummary>(
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
          k.id,
          k.name,
          k.enabled,
          k.key_prefix,
          k.monthly_request_limit,
          k.created_at,
          k.last_used_at,
          COUNT(e.id) FILTER (
            WHERE e.created_at >= q.usage_start
              AND e.model IS DISTINCT FROM $2
          ) AS requests_this_month
        FROM api_keys k
        CROSS JOIN quota_window q
        LEFT JOIN usage_events e ON e.api_key_id = k.id
        WHERE k.user_id = $1
        GROUP BY k.id, q.usage_start
        ORDER BY k.created_at DESC
        "#,
    )
    .bind(user_id)
    .bind(MINIMAX_M3_MODEL)
    .fetch_all(pool)
    .await
}

pub async fn monthly_chat_usage_for_user(pool: &PgPool, user_id: i64) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar(
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
          AND e.created_at >= q.usage_start
          AND e.model IS DISTINCT FROM $2
        "#,
    )
    .bind(user_id)
    .bind(MINIMAX_M3_MODEL)
    .fetch_one(pool)
    .await
}

pub async fn subscription_summary(
    pool: &PgPool,
    user: &User,
) -> Result<SubscriptionSummary, sqlx::Error> {
    let plan = user.effective_plan().to_string();
    let allowed_models = allowed_models_for_plan(&plan)
        .iter()
        .map(|model| (*model).to_string())
        .collect();

    subscription_summary_with_models(pool, user, allowed_models).await
}

pub async fn subscription_summary_with_models(
    pool: &PgPool,
    user: &User,
    allowed_models: Vec<String>,
) -> Result<SubscriptionSummary, sqlx::Error> {
    let requests_this_month = monthly_chat_usage_for_user(pool, user.id).await?;
    let monthly_request_limit = user.effective_monthly_request_limit();
    let remaining_requests = (i64::from(monthly_request_limit) - requests_this_month).max(0);
    let plan = user.effective_plan().to_string();

    Ok(SubscriptionSummary {
        allowed_models,
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

pub async fn insert_billing_order(
    pool: &PgPool,
    user_id: i64,
    out_trade_no: &str,
    amount_cents: i32,
    paytype_code: &str,
    subject: &str,
) -> Result<BillingOrder, sqlx::Error> {
    sqlx::query_as::<_, BillingOrder>(
        r#"
        INSERT INTO billing_orders (
          user_id,
          out_trade_no,
          amount_cents,
          paytype_code,
          subject
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING
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
        "#,
    )
    .bind(user_id)
    .bind(out_trade_no)
    .bind(amount_cents)
    .bind(paytype_code)
    .bind(subject)
    .fetch_one(pool)
    .await
}

pub async fn update_billing_order_payment(
    pool: &PgPool,
    order_id: i64,
    provider_trade_no: &str,
    pay_url: &str,
) -> Result<BillingOrder, sqlx::Error> {
    sqlx::query_as::<_, BillingOrder>(
        r#"
        UPDATE billing_orders
        SET provider_trade_no = $2,
            pay_url = $3,
            status = 'pending',
            updated_at = now()
        WHERE id = $1
        RETURNING
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
        "#,
    )
    .bind(order_id)
    .bind(provider_trade_no)
    .bind(pay_url)
    .fetch_one(pool)
    .await
}

pub async fn mark_billing_order_failed(
    pool: &PgPool,
    order_id: i64,
    failure: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        UPDATE billing_orders
        SET status = 'failed',
            notify_payload = $2,
            updated_at = now()
        WHERE id = $1
        "#,
    )
    .bind(order_id)
    .bind(failure)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn billing_order_for_user_by_ref(
    pool: &PgPool,
    user_id: i64,
    order_ref: &str,
) -> Result<Option<BillingOrder>, sqlx::Error> {
    let order_id = order_ref.parse::<i64>().ok();
    sqlx::query_as::<_, BillingOrder>(
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
        WHERE user_id = $1
          AND (
            ($2::bigint IS NOT NULL AND id = $2)
            OR out_trade_no = $3
          )
        "#,
    )
    .bind(user_id)
    .bind(order_id)
    .bind(order_ref)
    .fetch_optional(pool)
    .await
}
