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
    #[error("unsupported model: {0}")]
    UnsupportedModel(String),
    #[error("model is not available on your current plan: {0}")]
    ModelNotAllowed(String),
    #[error("invalid request body: {0}")]
    InvalidRequest(String),
    #[error("email is already registered")]
    EmailAlreadyRegistered,
    #[error("invalid email or password")]
    InvalidCredentials,
    #[error("invalid or expired session")]
    InvalidSession,
    #[error("upstream request failed")]
    UpstreamRequest(#[from] reqwest::Error),
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
            Self::UnsupportedModel(_) => "unsupported_model",
            Self::ModelNotAllowed(_) => "model_not_allowed",
            Self::InvalidRequest(_) => "invalid_request",
            Self::EmailAlreadyRegistered => "email_already_registered",
            Self::InvalidCredentials => "invalid_credentials",
            Self::InvalidSession => "invalid_session",
            Self::UpstreamRequest(_) => "upstream_error",
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
            Self::DisabledApiKey | Self::ModelNotAllowed(_) => StatusCode::FORBIDDEN,
            Self::QuotaExceeded => StatusCode::TOO_MANY_REQUESTS,
            Self::UnsupportedModel(_) | Self::InvalidRequest(_) => StatusCode::BAD_REQUEST,
            Self::EmailAlreadyRegistered => StatusCode::CONFLICT,
            Self::UpstreamRequest(_) => StatusCode::BAD_GATEWAY,
            Self::Database(_) => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    fn error_response(&self) -> HttpResponse {
        let body = ErrorBody {
            error: ErrorDetail {
                code: self.code(),
                message: self.to_string(),
                kind: "aijinapi_error",
            },
        };

        HttpResponse::build(self.status_code()).json(body)
    }
}
