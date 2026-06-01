use std::{env, net::IpAddr};

use openachieve_backend::{
    config::Config,
    errors::ApiError,
    free_models::FreeModelCatalog,
    upstream::{UpstreamKeyRing, UpstreamRoute, forward_chat, forward_models},
};
use reqwest::Client;
use serde_json::json;
use wiremock::{
    Mock, MockServer, ResponseTemplate,
    matchers::{header, method, path},
};

fn test_config(server: &MockServer) -> Config {
    test_config_with_keys(
        server,
        vec!["real-zen-key"],
        vec!["real-upstream-key"],
        60_000,
    )
}

fn test_config_with_keys(
    server: &MockServer,
    zen_keys: Vec<&str>,
    go_keys: Vec<&str>,
    upstream_key_cooldown_ms: u64,
) -> Config {
    Config {
        database_url: "postgres://postgres:postgres@localhost/openachieve_test".to_string(),
        app_base_url: "http://localhost:3000".to_string(),
        admin_emails: vec!["admin@example.com".to_string()],
        opencode_zen_api_keys: zen_keys.into_iter().map(str::to_string).collect(),
        opencode_go_api_keys: go_keys.into_iter().map(str::to_string).collect(),
        server_host: "127.0.0.1".parse::<IpAddr>().unwrap(),
        server_port: 8080,
        default_monthly_request_limit: 500,
        zen_chat_completions_url: format!("{}/zen/chat/completions", server.uri()),
        zen_go_chat_completions_url: format!("{}/go/chat/completions", server.uri()),
        zen_go_messages_url: format!("{}/go/messages", server.uri()),
        zen_models_url: format!("{}/zen/models", server.uri()),
        zen_go_models_url: format!("{}/go/models", server.uri()),
        upstream_max_attempts: 1,
        upstream_retry_base_ms: 0,
        upstream_key_cooldown_ms,
        cors_allowed_origins: vec!["http://localhost:3002".to_string()],
        smtp: None,
        fovpay: None,
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

    let config = test_config(&server);
    let key_ring = UpstreamKeyRing::from_config(&config);
    let result = forward_chat(
        &Client::new(),
        &config,
        &key_ring,
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

    let config = test_config(&server);
    let key_ring = UpstreamKeyRing::from_config(&config);
    let result = forward_models(&Client::new(), &config, &key_ring, UpstreamRoute::Zen)
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

    let config = test_config(&server);
    let key_ring = UpstreamKeyRing::from_config(&config);
    let result = forward_models(&Client::new(), &config, &key_ring, UpstreamRoute::Go)
        .await
        .unwrap();

    assert_eq!(result.status_code, 200);
}

#[actix_rt::test]
async fn free_model_catalog_refresh_adds_probe_verified_candidates() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/zen/models"))
        .and(header("authorization", "Bearer real-zen-key"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "object": "list",
            "data": [
                { "id": "new-model-free" },
                { "id": "qwen3.6-plus" }
            ]
        })))
        .expect(1)
        .mount(&server)
        .await;
    Mock::given(method("POST"))
        .and(path("/zen/chat/completions"))
        .and(header("authorization", "Bearer real-zen-key"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "id": "probe",
            "object": "chat.completion"
        })))
        .expect(1)
        .mount(&server)
        .await;

    let config = test_config(&server);
    let key_ring = UpstreamKeyRing::from_config(&config);
    let catalog = FreeModelCatalog::new();

    let models = catalog
        .refresh(&Client::new(), &config, &key_ring)
        .await
        .unwrap();

    assert_eq!(models, vec!["new-model-free"]);
    assert_eq!(catalog.available_models().await, vec!["new-model-free"]);
}

#[actix_rt::test]
async fn free_model_catalog_refresh_rejects_probe_failures() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/zen/models"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "object": "list",
            "data": [{ "id": "new-model-free" }]
        })))
        .expect(1)
        .mount(&server)
        .await;
    Mock::given(method("POST"))
        .and(path("/zen/chat/completions"))
        .respond_with(ResponseTemplate::new(403).set_body_json(json!({
            "error": "payment required"
        })))
        .expect(1)
        .mount(&server)
        .await;

    let config = test_config(&server);
    let key_ring = UpstreamKeyRing::from_config(&config);
    let catalog = FreeModelCatalog::new();

    let models = catalog
        .refresh(&Client::new(), &config, &key_ring)
        .await
        .unwrap();
    assert!(models.is_empty());
    assert!(catalog.available_models().await.is_empty());
    assert!(catalog.public_snapshot().await.degraded);
}

#[actix_rt::test]
async fn free_model_catalog_keeps_existing_model_on_probe_rate_limit() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/zen/models"))
        .and(header("authorization", "Bearer zen-key-a"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "object": "list",
            "data": [{ "id": "big-pickle" }]
        })))
        .expect(1)
        .mount(&server)
        .await;
    Mock::given(method("POST"))
        .and(path("/zen/chat/completions"))
        .and(header("authorization", "Bearer zen-key-b"))
        .respond_with(ResponseTemplate::new(429).set_body_json(json!({
            "error": "rate limit exceeded"
        })))
        .expect(1)
        .mount(&server)
        .await;
    Mock::given(method("POST"))
        .and(path("/zen/chat/completions"))
        .and(header("authorization", "Bearer zen-key-a"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({"id": "fallback"})))
        .expect(0)
        .mount(&server)
        .await;

    let config = test_config_with_keys(
        &server,
        vec!["zen-key-a", "zen-key-b"],
        vec!["go-key"],
        60_000,
    );
    let key_ring = UpstreamKeyRing::from_config(&config);
    let catalog = FreeModelCatalog::seeded(["big-pickle"]);

    let models = catalog
        .refresh(&Client::new(), &config, &key_ring)
        .await
        .unwrap();

    assert_eq!(models, vec!["big-pickle"]);
    assert_eq!(catalog.available_models().await, vec!["big-pickle"]);
    assert!(catalog.public_snapshot().await.degraded);
}

#[actix_rt::test]
async fn free_model_catalog_marks_existing_model_unavailable_on_denied_probe() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/zen/models"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "object": "list",
            "data": [{ "id": "big-pickle" }]
        })))
        .expect(1)
        .mount(&server)
        .await;
    Mock::given(method("POST"))
        .and(path("/zen/chat/completions"))
        .respond_with(ResponseTemplate::new(403).set_body_json(json!({
            "error": "model not supported"
        })))
        .expect(1)
        .mount(&server)
        .await;

    let config = test_config(&server);
    let key_ring = UpstreamKeyRing::from_config(&config);
    let catalog = FreeModelCatalog::seeded(["big-pickle"]);

    let models = catalog
        .refresh(&Client::new(), &config, &key_ring)
        .await
        .unwrap();

    assert!(models.is_empty());
    assert!(catalog.available_models().await.is_empty());
    assert!(catalog.public_snapshot().await.degraded);
}

#[actix_rt::test]
async fn free_model_catalog_removes_models_missing_from_upstream_list() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/zen/models"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "object": "list",
            "data": []
        })))
        .expect(1)
        .mount(&server)
        .await;
    Mock::given(method("POST"))
        .and(path("/zen/chat/completions"))
        .respond_with(ResponseTemplate::new(200))
        .expect(0)
        .mount(&server)
        .await;

    let config = test_config(&server);
    let key_ring = UpstreamKeyRing::from_config(&config);
    let catalog = FreeModelCatalog::seeded(["big-pickle"]);

    let models = catalog
        .refresh(&Client::new(), &config, &key_ring)
        .await
        .unwrap();

    assert!(models.is_empty());
    assert!(catalog.available_models().await.is_empty());
}

#[actix_rt::test]
async fn free_model_catalog_probes_existing_models_round_robin() {
    let server = MockServer::start().await;
    let models = [
        "big-pickle",
        "deepseek-v4-flash-free",
        "minimax-m2.5-free",
        "nemotron-3-super-free",
        "ring-2.6-1t-free",
    ];
    Mock::given(method("GET"))
        .and(path("/zen/models"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "object": "list",
            "data": models.iter().map(|id| json!({ "id": id })).collect::<Vec<_>>()
        })))
        .expect(5)
        .mount(&server)
        .await;
    Mock::given(method("POST"))
        .and(path("/zen/chat/completions"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "id": "probe",
            "object": "chat.completion"
        })))
        .expect(5)
        .mount(&server)
        .await;

    let config = test_config(&server);
    let key_ring = UpstreamKeyRing::from_config(&config);
    let catalog = FreeModelCatalog::seeded(models);

    for _ in 0..5 {
        let refreshed = catalog
            .refresh(&Client::new(), &config, &key_ring)
            .await
            .unwrap();
        assert_eq!(refreshed.len(), 5);
    }
}

#[actix_rt::test]
async fn free_model_catalog_restores_unavailable_model_after_successful_probe() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/zen/models"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "object": "list",
            "data": [{ "id": "big-pickle" }]
        })))
        .expect(1)
        .mount(&server)
        .await;
    Mock::given(method("POST"))
        .and(path("/zen/chat/completions"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "id": "probe",
            "object": "chat.completion"
        })))
        .expect(1)
        .mount(&server)
        .await;

    let config = test_config(&server);
    let key_ring = UpstreamKeyRing::from_config(&config);
    let catalog = FreeModelCatalog::seeded(["big-pickle"]);
    catalog.trip_model("big-pickle", "test trip").await;
    assert!(catalog.available_models().await.is_empty());

    let models = catalog
        .refresh(&Client::new(), &config, &key_ring)
        .await
        .unwrap();

    assert_eq!(models, vec!["big-pickle"]);
    assert_eq!(catalog.available_models().await, vec!["big-pickle"]);
}

#[actix_rt::test]
async fn round_robins_across_multiple_go_keys() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/go/chat/completions"))
        .and(header("authorization", "Bearer go-key-a"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({"id": "from_a"})))
        .expect(1)
        .mount(&server)
        .await;
    Mock::given(method("POST"))
        .and(path("/go/chat/completions"))
        .and(header("authorization", "Bearer go-key-b"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({"id": "from_b"})))
        .expect(1)
        .mount(&server)
        .await;

    let config = test_config_with_keys(
        &server,
        vec!["real-zen-key"],
        vec!["go-key-a", "go-key-b"],
        60_000,
    );
    let key_ring = UpstreamKeyRing::from_config(&config);

    for _ in 0..2 {
        let result = forward_chat(
            &Client::new(),
            &config,
            &key_ring,
            json!({"model": "qwen3.6-plus", "messages": []}),
            UpstreamRoute::Go,
        )
        .await
        .unwrap();
        assert_eq!(result.status_code, 200);
    }
}

#[actix_rt::test]
async fn fails_over_to_next_key_on_retryable_statuses() {
    for status in [401, 429, 500] {
        assert_status_failover(status).await;
    }
}

async fn assert_status_failover(status: u16) {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/go/chat/completions"))
        .and(header("authorization", "Bearer go-key-a"))
        .respond_with(ResponseTemplate::new(status))
        .expect(1)
        .mount(&server)
        .await;
    Mock::given(method("POST"))
        .and(path("/go/chat/completions"))
        .and(header("authorization", "Bearer go-key-b"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({"id": "fallback"})))
        .expect(1)
        .mount(&server)
        .await;

    let config = test_config_with_keys(
        &server,
        vec!["real-zen-key"],
        vec!["go-key-a", "go-key-b"],
        60_000,
    );
    let key_ring = UpstreamKeyRing::from_config(&config);
    let result = forward_chat(
        &Client::new(),
        &config,
        &key_ring,
        json!({"model": "qwen3.6-plus", "messages": []}),
        UpstreamRoute::Go,
    )
    .await
    .unwrap();

    assert_eq!(result.status_code, 200);
}

#[actix_rt::test]
async fn cools_down_unauthorized_and_rate_limited_keys() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/go/chat/completions"))
        .and(header("authorization", "Bearer go-key-a"))
        .respond_with(ResponseTemplate::new(429))
        .expect(1)
        .mount(&server)
        .await;
    Mock::given(method("POST"))
        .and(path("/go/chat/completions"))
        .and(header("authorization", "Bearer go-key-b"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({"id": "fallback"})))
        .expect(2)
        .mount(&server)
        .await;

    let config = test_config_with_keys(
        &server,
        vec!["real-zen-key"],
        vec!["go-key-a", "go-key-b"],
        60_000,
    );
    let key_ring = UpstreamKeyRing::from_config(&config);

    for _ in 0..2 {
        let result = forward_chat(
            &Client::new(),
            &config,
            &key_ring,
            json!({"model": "qwen3.6-plus", "messages": []}),
            UpstreamRoute::Go,
        )
        .await
        .unwrap();
        assert_eq!(result.status_code, 200);
    }
}

#[actix_rt::test]
async fn single_key_still_runs_even_after_cooldown_status() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/go/chat/completions"))
        .and(header("authorization", "Bearer only-go-key"))
        .respond_with(ResponseTemplate::new(429))
        .expect(2)
        .mount(&server)
        .await;

    let config = test_config_with_keys(&server, vec!["real-zen-key"], vec!["only-go-key"], 60_000);
    let key_ring = UpstreamKeyRing::from_config(&config);

    for _ in 0..2 {
        let result = forward_chat(
            &Client::new(),
            &config,
            &key_ring,
            json!({"model": "qwen3.6-plus", "messages": []}),
            UpstreamRoute::Go,
        )
        .await
        .unwrap();
        assert_eq!(result.status_code, 429);
    }
}

#[actix_rt::test]
async fn all_network_failures_return_upstream_error() {
    let server = MockServer::start().await;
    let mut config = test_config_with_keys(
        &server,
        vec!["real-zen-key"],
        vec!["go-key-a", "go-key-b"],
        60_000,
    );
    config.zen_go_chat_completions_url = "http://127.0.0.1:9/go/chat/completions".to_string();
    let key_ring = UpstreamKeyRing::from_config(&config);

    let err = forward_chat(
        &Client::new(),
        &config,
        &key_ring,
        json!({"model": "qwen3.6-plus", "messages": []}),
        UpstreamRoute::Go,
    )
    .await
    .unwrap_err();

    assert!(matches!(err, ApiError::UpstreamRequest(_)));
}

#[test]
fn create_key_help_parser_documents_required_name() {
    assert!(env::args().next().is_some());
}
