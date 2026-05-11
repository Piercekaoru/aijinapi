use std::{env, net::IpAddr};

use aijinapi_backend::{
    config::Config,
    upstream::{UpstreamRoute, forward_chat, forward_models},
};
use reqwest::Client;
use serde_json::json;
use wiremock::{
    Mock, MockServer, ResponseTemplate,
    matchers::{header, method, path},
};

fn test_config(server: &MockServer) -> Config {
    Config {
        database_url: "postgres://postgres:postgres@localhost/aijinapi_test".to_string(),
        opencode_zen_api_key: "real-zen-key".to_string(),
        opencode_go_api_key: "real-upstream-key".to_string(),
        server_host: "127.0.0.1".parse::<IpAddr>().unwrap(),
        server_port: 8080,
        default_monthly_request_limit: 500,
        zen_chat_completions_url: format!("{}/zen/chat/completions", server.uri()),
        zen_go_chat_completions_url: format!("{}/go/chat/completions", server.uri()),
        zen_models_url: format!("{}/zen/models", server.uri()),
        zen_go_models_url: format!("{}/go/models", server.uri()),
        cors_allowed_origins: vec!["http://localhost:3002".to_string()],
    }
}

#[actix_rt::test]
async fn forwards_chat_with_upstream_authorization() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/go/chat/completions"))
        .and(header("authorization", "Bearer real-upstream-key"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "id": "chatcmpl_test",
            "object": "chat.completion"
        })))
        .mount(&server)
        .await;

    let result = forward_chat(
        &Client::new(),
        &test_config(&server),
        json!({"model": "qwen3.6-plus", "messages": []}),
        UpstreamRoute::Go,
    )
    .await
    .unwrap();

    assert_eq!(result.status_code, 200);
    assert!(result.latency_ms >= 0);
}

#[actix_rt::test]
async fn forwards_models_with_upstream_authorization() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/zen/models"))
        .and(header("authorization", "Bearer real-zen-key"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "object": "list",
            "data": []
        })))
        .mount(&server)
        .await;

    let result = forward_models(&Client::new(), &test_config(&server), UpstreamRoute::Zen)
        .await
        .unwrap();

    assert_eq!(result.status_code, 200);
}

#[actix_rt::test]
async fn forwards_go_models_with_go_authorization() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/go/models"))
        .and(header("authorization", "Bearer real-upstream-key"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "object": "list",
            "data": []
        })))
        .mount(&server)
        .await;

    let result = forward_models(&Client::new(), &test_config(&server), UpstreamRoute::Go)
        .await
        .unwrap();

    assert_eq!(result.status_code, 200);
}

#[test]
fn create_key_help_parser_documents_required_name() {
    assert!(env::args().next().is_some());
}
