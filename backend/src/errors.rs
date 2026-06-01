use actix_web::{HttpResponse, ResponseError, http::StatusCode};
use thiserror::Error;

use crate::models::{ErrorBody, ErrorDetail};

#[derive(Debug, Error)]
pub enum ApiError {
    #[error("missing or invalid Authorization header")]
    MissingAuthorization,
    #[error("invalid API key")]
    InvalidApiKey,
    #[error("disabled API key")]
    DisabledApiKey,
    #[error("monthly request limit exceeded")]
    QuotaExceeded,
    #[error("too many requests")]
    RateLimited { retry_after_seconds: u64 },
    #[error("could not determine real client IP")]
    InvalidClientIp,
    #[error("IP address is banned")]
    IpBanned,
    #[error("account is banned")]
    AccountBanned,
    #[error("unsupported model: {0}")]
    UnsupportedModel(String),
    #[error("model requires /v1/messages: {0}")]
    ModelRequiresMessages(String),
    #[error("model is not available on /v1/messages: {0}")]
    ModelNotAvailableOnMessages(String),
    #[error("model is not available on your current plan: {0}")]
    ModelNotAllowed(String),
    #[error("model is temporarily unavailable: {0}")]
    ModelTemporarilyUnavailable(String),
    #[error("invalid request body: {0}")]
    InvalidRequest(String),
    #[error("email is already registered")]
    EmailAlreadyRegistered,
    #[error("email is not verified")]
    EmailNotVerified,
    #[error("verification email was sent recently")]
    VerificationEmailRecentlySent,
    #[error("could not send verification email")]
    EmailDeliveryFailed,
    #[error("invalid email or password")]
    InvalidCredentials,
    #[error("invalid or expired session")]
    InvalidSession,
    #[error("forbidden")]
    Forbidden,
    #[error("resource not found")]
    NotFound,
    #[error("upstream request failed")]
    UpstreamRequest(#[from] reqwest::Error),
    #[error("upstream returned status {status_code}: {body}")]
    UpstreamStatus { status_code: u16, body: String },
    #[error("database error")]
    Database(#[from] sqlx::Error),
}

impl ApiError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::MissingAuthorization => "missing_authorization",
            Self::InvalidApiKey => "invalid_api_key",
            Self::DisabledApiKey => "disabled_api_key",
            Self::QuotaExceeded => "quota_exceeded",
            Self::RateLimited { .. } => "rate_limited",
            Self::InvalidClientIp => "invalid_client_ip",
            Self::IpBanned => "ip_banned",
            Self::AccountBanned => "account_banned",
            Self::UnsupportedModel(_) => "unsupported_model",
            Self::ModelRequiresMessages(_) => "model_requires_messages",
            Self::ModelNotAvailableOnMessages(_) => "model_not_available_on_messages",
            Self::ModelNotAllowed(_) => "model_not_allowed",
            Self::ModelTemporarilyUnavailable(_) => "model_temporarily_unavailable",
            Self::InvalidRequest(_) => "invalid_request",
            Self::EmailAlreadyRegistered => "email_already_registered",
            Self::EmailNotVerified => "email_not_verified",
            Self::VerificationEmailRecentlySent => "verification_email_recently_sent",
            Self::EmailDeliveryFailed => "email_delivery_failed",
            Self::InvalidCredentials => "invalid_credentials",
            Self::InvalidSession => "invalid_session",
            Self::Forbidden => "forbidden",
            Self::NotFound => "not_found",
            Self::UpstreamRequest(_) => "upstream_error",
            Self::UpstreamStatus { .. } => "upstream_error",
            Self::Database(_) => "database_error",
        }
    }
}

impl ResponseError for ApiError {
    fn status_code(&self) -> StatusCode {
        match self {
            Self::MissingAuthorization
            | Self::InvalidApiKey
            | Self::InvalidCredentials
            | Self::InvalidSession => StatusCode::UNAUTHORIZED,
            Self::DisabledApiKey
            | Self::Forbidden
            | Self::EmailNotVerified
            | Self::ModelNotAllowed(_)
            | Self::IpBanned
            | Self::AccountBanned => StatusCode::FORBIDDEN,
            Self::ModelTemporarilyUnavailable(_) => StatusCode::SERVICE_UNAVAILABLE,
            Self::QuotaExceeded
            | Self::VerificationEmailRecentlySent
            | Self::RateLimited { .. } => StatusCode::TOO_MANY_REQUESTS,
            Self::UnsupportedModel(_)
            | Self::ModelRequiresMessages(_)
            | Self::ModelNotAvailableOnMessages(_)
            | Self::InvalidRequest(_)
            | Self::InvalidClientIp => StatusCode::BAD_REQUEST,
            Self::EmailAlreadyRegistered => StatusCode::CONFLICT,
            Self::NotFound => StatusCode::NOT_FOUND,
            Self::UpstreamRequest(_) | Self::UpstreamStatus { .. } | Self::EmailDeliveryFailed => {
                StatusCode::BAD_GATEWAY
            }
            Self::Database(_) => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    fn error_response(&self) -> HttpResponse {
        let body = ErrorBody {
            error: ErrorDetail {
                code: self.code(),
                message: self.to_string(),
                kind: "openachieve_error",
            },
        };

        let mut response = HttpResponse::build(self.status_code());
        if let Self::RateLimited {
            retry_after_seconds,
        } = self
        {
            response.insert_header(("Retry-After", retry_after_seconds.to_string()));
        }

        response.json(body)
    }
}
