use std::time::Instant;

use actix_web::{HttpResponse, http::header};
use bytes::Bytes;
use futures_util::StreamExt;
use reqwest::{Client, RequestBuilder, StatusCode};
use serde_json::Value;
use tokio::time::{Duration, sleep};
use tracing::warn;

use crate::{config::Config, errors::ApiError};

pub const FREE_MODELS: &[&str] = &["big-pickle"];

pub const PLUS_MODELS: &[&str] = &[
    "glm-5.1",
    "glm-5",
    "kimi-k2.5",
    "kimi-k2.6",
    "deepseek-v4-pro",
    "deepseek-v4-flash",
    "mimo-v2.5",
    "mimo-v2.5-pro",
    "qwen3.6-plus",
    "qwen3.5-plus",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UpstreamRoute {
    Zen,
    Go,
}

#[derive(Debug)]
pub struct UpstreamResult {
    pub response: HttpResponse,
    pub status_code: u16,
    pub latency_ms: i32,
}

pub fn is_supported_chat_model(model: &str) -> bool {
    FREE_MODELS.contains(&model) || PLUS_MODELS.contains(&model)
}

pub fn allowed_models_for_plan(plan: &str) -> &'static [&'static str] {
    if plan == "plus" {
        PLUS_MODELS
    } else {
        FREE_MODELS
    }
}

pub fn request_model(body: &Value) -> Result<&str, ApiError> {
    body.get("model")
        .and_then(Value::as_str)
        .ok_or_else(|| ApiError::InvalidRequest("model is required".to_string()))
}

pub fn request_is_stream(body: &Value) -> bool {
    body.get("stream").and_then(Value::as_bool).unwrap_or(false)
}

pub fn route_for_model(plan: &str, model: &str) -> Result<UpstreamRoute, ApiError> {
    if !is_supported_chat_model(model) {
        return Err(ApiError::UnsupportedModel(model.to_string()));
    }

    match plan {
        "plus" if PLUS_MODELS.contains(&model) => Ok(UpstreamRoute::Go),
        "free" if FREE_MODELS.contains(&model) => Ok(UpstreamRoute::Zen),
        "plus" => Err(ApiError::UnsupportedModel(model.to_string())),
        _ => Err(ApiError::ModelNotAllowed(model.to_string())),
    }
}

pub async fn forward_models(
    client: &Client,
    config: &Config,
    route: UpstreamRoute,
) -> Result<UpstreamResult, ApiError> {
    let started = Instant::now();
    let api_key = match route {
        UpstreamRoute::Zen => &config.opencode_zen_api_key,
        UpstreamRoute::Go => &config.opencode_go_api_key,
    };
    let url = model_url(config, route);
    let upstream = send_with_retries(config, "models", route, url, || {
        client.get(url).bearer_auth(api_key)
    })
    .await?;

    response_from_upstream(upstream, started, false).await
}

pub async fn forward_chat(
    client: &Client,
    config: &Config,
    body: Value,
    route: UpstreamRoute,
) -> Result<UpstreamResult, ApiError> {
    let is_stream = request_is_stream(&body);
    let started = Instant::now();
    let (url, api_key) = upstream_parts(config, route);
    let upstream = send_with_retries(config, "chat", route, url, || {
        client.post(url).bearer_auth(api_key).json(&body)
    })
    .await?;

    response_from_upstream(upstream, started, is_stream).await
}

async fn send_with_retries(
    config: &Config,
    operation: &'static str,
    route: UpstreamRoute,
    url: &str,
    mut build: impl FnMut() -> RequestBuilder,
) -> Result<reqwest::Response, ApiError> {
    let attempts = config.upstream_max_attempts.max(1);

    for attempt in 1..=attempts {
        match build().send().await {
            Ok(response) => return Ok(response),
            Err(err) if attempt < attempts => {
                let delay_ms = retry_delay_ms(config.upstream_retry_base_ms, attempt);
                warn!(
                    operation,
                    route = ?route,
                    url,
                    attempt,
                    attempts,
                    delay_ms,
                    error = %err,
                    "upstream request failed; retrying"
                );
                sleep(Duration::from_millis(delay_ms)).await;
            }
            Err(err) => {
                warn!(
                    operation,
                    route = ?route,
                    url,
                    attempt,
                    attempts,
                    error = %err,
                    "upstream request failed; no attempts remaining"
                );
                return Err(ApiError::UpstreamRequest(err));
            }
        }
    }

    unreachable!("attempts is always at least one")
}

fn retry_delay_ms(base_ms: u64, attempt: usize) -> u64 {
    let multiplier = 1_u64 << attempt.saturating_sub(1).min(4);
    base_ms.saturating_mul(multiplier).min(5_000)
}

fn upstream_parts(config: &Config, route: UpstreamRoute) -> (&str, &str) {
    match route {
        UpstreamRoute::Zen => (
            &config.zen_chat_completions_url,
            &config.opencode_zen_api_key,
        ),
        UpstreamRoute::Go => (
            &config.zen_go_chat_completions_url,
            &config.opencode_go_api_key,
        ),
    }
}

fn model_url(config: &Config, route: UpstreamRoute) -> &str {
    match route {
        UpstreamRoute::Zen => &config.zen_models_url,
        UpstreamRoute::Go => &config.zen_go_models_url,
    }
}

async fn response_from_upstream(
    upstream: reqwest::Response,
    started: Instant,
    is_stream: bool,
) -> Result<UpstreamResult, ApiError> {
    let status = upstream.status();
    let status_code = status.as_u16();
    let latency_ms = started.elapsed().as_millis().min(i32::MAX as u128) as i32;

    if is_stream {
        let content_type = upstream
            .headers()
            .get(header::CONTENT_TYPE.as_str())
            .and_then(|value| value.to_str().ok())
            .unwrap_or("text/event-stream")
            .to_string();

        let stream = upstream
            .bytes_stream()
            .map(|chunk| chunk.map_err(actix_web::error::ErrorBadGateway));

        let response = HttpResponse::build(to_actix_status(status))
            .insert_header((header::CONTENT_TYPE, content_type))
            .insert_header((header::CACHE_CONTROL, "no-cache"))
            .streaming(stream);

        return Ok(UpstreamResult {
            response,
            status_code,
            latency_ms,
        });
    }

    let content_type = upstream
        .headers()
        .get(header::CONTENT_TYPE.as_str())
        .and_then(|value| value.to_str().ok())
        .unwrap_or("application/json")
        .to_string();
    let bytes = upstream.bytes().await?;
    let response = HttpResponse::build(to_actix_status(status))
        .insert_header((header::CONTENT_TYPE, content_type))
        .body(bytes);

    Ok(UpstreamResult {
        response,
        status_code,
        latency_ms,
    })
}

fn to_actix_status(status: StatusCode) -> actix_web::http::StatusCode {
    actix_web::http::StatusCode::from_u16(status.as_u16())
        .unwrap_or(actix_web::http::StatusCode::BAD_GATEWAY)
}

pub fn openai_models_payload(models: &[&str]) -> Value {
    let data: Vec<Value> = models
        .iter()
        .map(|model| {
            serde_json::json!({
                "id": model,
                "object": "model",
                "owned_by": "aijinapi"
            })
        })
        .collect();

    serde_json::json!({
        "object": "list",
        "data": data
    })
}

pub fn bytes_from_static_json(value: Value) -> Bytes {
    Bytes::from(serde_json::to_vec(&value).expect("static JSON serializes"))
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn identifies_supported_chat_models() {
        assert!(is_supported_chat_model("qwen3.6-plus"));
        assert!(is_supported_chat_model("kimi-k2.6"));
        assert!(is_supported_chat_model("big-pickle"));
        assert!(!is_supported_chat_model("unknown-model"));
    }

    #[test]
    fn exposes_allowed_models_by_plan() {
        let free_models = allowed_models_for_plan("free");
        assert_eq!(free_models, ["big-pickle"]);

        let plus_models = allowed_models_for_plan("plus");
        assert!(plus_models.contains(&"qwen3.6-plus"));
        assert!(plus_models.contains(&"deepseek-v4-pro"));
        assert!(!plus_models.contains(&"big-pickle"));
    }

    #[test]
    fn routes_models_by_plan() {
        assert_eq!(
            route_for_model("free", "big-pickle").unwrap(),
            UpstreamRoute::Zen
        );
        assert_eq!(
            route_for_model("plus", "qwen3.6-plus").unwrap(),
            UpstreamRoute::Go
        );
        assert!(matches!(
            route_for_model("free", "qwen3.6-plus"),
            Err(ApiError::ModelNotAllowed(_))
        ));
        assert!(matches!(
            route_for_model("plus", "big-pickle"),
            Err(ApiError::UnsupportedModel(_))
        ));
        assert!(matches!(
            route_for_model("plus", "unknown-model"),
            Err(ApiError::UnsupportedModel(_))
        ));
    }

    #[test]
    fn reads_model_and_stream_flag() {
        let body = json!({"model": "qwen3.6-plus", "stream": true});
        assert_eq!(request_model(&body).unwrap(), "qwen3.6-plus");
        assert!(request_is_stream(&body));
    }

    #[test]
    fn rejects_missing_model() {
        assert!(matches!(
            request_model(&json!({"messages": []})),
            Err(ApiError::InvalidRequest(_))
        ));
    }
}
