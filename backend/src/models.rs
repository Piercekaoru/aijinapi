use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

use crate::plans::{FREE_PLAN, PLUS_PLAN, monthly_limit_for_plan};

#[derive(Debug, Clone, FromRow)]
pub struct ApiKey {
    pub id: i64,
    pub key_hash: String,
    pub name: String,
    pub enabled: bool,
    pub monthly_request_limit: i32,
    pub created_at: DateTime<Utc>,
    pub last_used_at: Option<DateTime<Utc>>,
    pub user_id: Option<i64>,
    pub key_prefix: Option<String>,
}

#[derive(Debug, Clone, FromRow, Serialize)]
pub struct User {
    pub id: i64,
    pub email: String,
    pub name: String,
    #[serde(skip_serializing)]
    pub password_hash: String,
    pub created_at: DateTime<Utc>,
    pub email_verified_at: Option<DateTime<Utc>>,
    pub plan: String,
    pub plan_status: String,
    pub monthly_request_limit: i32,
    pub plus_started_at: Option<DateTime<Utc>>,
    pub plus_expires_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize)]
pub struct PublicUser {
    pub id: i64,
    pub email: String,
    pub name: String,
    pub created_at: DateTime<Utc>,
    pub email_verified_at: Option<DateTime<Utc>>,
    pub plan: String,
    pub plan_status: String,
    pub monthly_request_limit: i32,
    pub plus_started_at: Option<DateTime<Utc>>,
    pub plus_expires_at: Option<DateTime<Utc>>,
    pub is_admin: bool,
}

impl From<User> for PublicUser {
    fn from(user: User) -> Self {
        Self::from_user(&user, &[])
    }
}

impl PublicUser {
    pub fn from_user(user: &User, admin_emails: &[String]) -> Self {
        let effective_plan = user.effective_plan().to_string();
        let monthly_request_limit = user.effective_monthly_request_limit();
        Self {
            id: user.id,
            email: user.email.clone(),
            name: user.name.clone(),
            created_at: user.created_at,
            email_verified_at: user.email_verified_at,
            plan: effective_plan,
            plan_status: user.plan_status.clone(),
            monthly_request_limit,
            plus_started_at: user.plus_started_at,
            plus_expires_at: user.plus_expires_at,
            is_admin: admin_emails.contains(&user.email),
        }
    }
}

impl User {
    pub fn email_is_verified(&self) -> bool {
        self.email_verified_at.is_some()
    }

    pub fn effective_plan(&self) -> &'static str {
        if self.plan == PLUS_PLAN
            && self.plan_status == "active"
            && self
                .plus_expires_at
                .map(|expires_at| expires_at > Utc::now())
                .unwrap_or(false)
        {
            PLUS_PLAN
        } else {
            FREE_PLAN
        }
    }

    pub fn effective_monthly_request_limit(&self) -> i32 {
        match self.effective_plan() {
            PLUS_PLAN => self.monthly_request_limit,
            plan => monthly_limit_for_plan(plan),
        }
    }
}

#[cfg(test)]
mod tests {
    use chrono::{Duration, Utc};

    use super::*;
    use crate::plans::{FREE_MONTHLY_REQUEST_LIMIT, PLUS_MONTHLY_REQUEST_LIMIT};

    fn user(plan: &str, plan_status: &str, expires_at: Option<DateTime<Utc>>) -> User {
        User {
            id: 1,
            email: "test@example.com".to_string(),
            name: "Test".to_string(),
            password_hash: "hash".to_string(),
            created_at: Utc::now(),
            email_verified_at: Some(Utc::now()),
            plan: plan.to_string(),
            plan_status: plan_status.to_string(),
            monthly_request_limit: PLUS_MONTHLY_REQUEST_LIMIT,
            plus_started_at: None,
            plus_expires_at: expires_at,
        }
    }

    #[test]
    fn effective_plan_requires_active_unexpired_plus() {
        assert_eq!(
            user(PLUS_PLAN, "active", Some(Utc::now() + Duration::days(1))).effective_plan(),
            PLUS_PLAN
        );

        for status in ["inactive", "canceled", "past_due"] {
            assert_eq!(
                user(PLUS_PLAN, status, Some(Utc::now() + Duration::days(1))).effective_plan(),
                FREE_PLAN
            );
        }

        assert_eq!(
            user(PLUS_PLAN, "active", Some(Utc::now() - Duration::days(1))).effective_plan(),
            FREE_PLAN
        );
        assert_eq!(user(FREE_PLAN, "active", None).effective_plan(), FREE_PLAN);
    }

    #[test]
    fn effective_monthly_limit_falls_back_to_free_for_non_plus() {
        assert_eq!(
            user(PLUS_PLAN, "active", Some(Utc::now() + Duration::days(1)))
                .effective_monthly_request_limit(),
            PLUS_MONTHLY_REQUEST_LIMIT
        );
        assert_eq!(
            user(PLUS_PLAN, "active", Some(Utc::now() - Duration::days(1)))
                .effective_monthly_request_limit(),
            FREE_MONTHLY_REQUEST_LIMIT
        );
    }
}

#[derive(Debug, FromRow, Serialize)]
pub struct ApiKeySummary {
    pub id: i64,
    pub name: String,
    pub enabled: bool,
    pub key_prefix: Option<String>,
    pub monthly_request_limit: i32,
    pub requests_this_month: i64,
    pub created_at: DateTime<Utc>,
    pub last_used_at: Option<DateTime<Utc>>,
}

#[derive(Debug, FromRow, Serialize)]
pub struct UsageEventSummary {
    pub model: Option<String>,
    pub path: String,
    pub status_code: i32,
    pub is_stream: bool,
    pub upstream_latency_ms: Option<i32>,
    pub error_type: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct UsageEvent<'a> {
    pub api_key_id: Option<i64>,
    pub model: Option<&'a str>,
    pub path: &'a str,
    pub status_code: u16,
    pub is_stream: bool,
    pub upstream_latency_ms: Option<i32>,
    pub error_type: Option<&'a str>,
}

#[derive(Debug, Serialize)]
pub struct HealthResponse {
    pub ok: bool,
    pub service: &'static str,
}

#[derive(Debug, Serialize)]
pub struct ErrorBody {
    pub error: ErrorDetail,
}

#[derive(Debug, Serialize)]
pub struct ErrorDetail {
    pub code: &'static str,
    pub message: String,
    #[serde(rename = "type")]
    pub kind: &'static str,
}

#[derive(Debug, Deserialize)]
pub struct CreateKeyArgs {
    pub name: String,
    pub monthly_request_limit: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct RegisterRequest {
    pub name: String,
    pub email: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct ResendVerificationRequest {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateUserKeyRequest {
    pub name: Option<String>,
    pub monthly_request_limit: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct AdminCreateUserRequest {
    pub email: String,
    pub name: String,
    pub plan: Option<String>,
    pub days: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct AdminUpdatePlanRequest {
    pub plan: String,
    pub days: Option<i32>,
}

#[derive(Debug, Serialize)]
pub struct AuthResponse {
    pub session_token: String,
    pub user: PublicUser,
    pub api_key: Option<IssuedApiKey>,
}

#[derive(Debug, Serialize)]
pub struct VerificationRequiredResponse {
    pub verification_required: bool,
    pub email: String,
    pub message: String,
}

#[derive(Debug, Serialize)]
pub struct VerificationMessageResponse {
    pub verification_required: bool,
    pub email: String,
    pub message: String,
}

#[derive(Debug, Serialize)]
pub struct IssuedApiKey {
    pub id: i64,
    pub name: String,
    pub key: String,
    pub key_prefix: String,
    pub monthly_request_limit: i32,
}

#[derive(Debug, Serialize)]
pub struct DashboardResponse {
    pub user: PublicUser,
    pub subscription: SubscriptionSummary,
    pub api_keys: Vec<ApiKeySummary>,
    pub recent_usage: Vec<UsageEventSummary>,
}

#[derive(Debug, Serialize)]
pub struct SubscriptionSummary {
    pub plan: String,
    pub plan_status: String,
    pub monthly_request_limit: i32,
    pub requests_this_month: i64,
    pub remaining_requests: i64,
    pub plus_started_at: Option<DateTime<Utc>>,
    pub plus_expires_at: Option<DateTime<Utc>>,
    pub allowed_models: Vec<&'static str>,
}

#[derive(Debug, FromRow)]
pub struct AdminUserRow {
    pub id: i64,
    pub email: String,
    pub name: String,
    pub created_at: DateTime<Utc>,
    pub plan: String,
    pub plan_status: String,
    pub monthly_request_limit: i32,
    pub plus_started_at: Option<DateTime<Utc>>,
    pub plus_expires_at: Option<DateTime<Utc>>,
    pub api_key_count: i64,
    pub requests_this_month: i64,
    pub last_used_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize)]
pub struct AdminUserSummary {
    pub id: i64,
    pub email: String,
    pub name: String,
    pub created_at: DateTime<Utc>,
    pub plan: String,
    pub stored_plan: String,
    pub plan_status: String,
    pub monthly_request_limit: i32,
    pub requests_this_month: i64,
    pub remaining_requests: i64,
    pub plus_started_at: Option<DateTime<Utc>>,
    pub plus_expires_at: Option<DateTime<Utc>>,
    pub api_key_count: i64,
    pub last_used_at: Option<DateTime<Utc>>,
    pub is_admin: bool,
}

#[derive(Debug, Serialize)]
pub struct AdminUserStats {
    pub total_users: usize,
    pub free_users: usize,
    pub plus_users: usize,
    pub inactive_plus_users: usize,
}

#[derive(Debug, Serialize)]
pub struct AdminUsersResponse {
    pub stats: AdminUserStats,
    pub users: Vec<AdminUserSummary>,
}

#[derive(Debug, Serialize)]
pub struct AdminCreateUserResponse {
    pub user: AdminUserSummary,
    pub temporary_password: String,
    pub api_key: IssuedApiKey,
}
