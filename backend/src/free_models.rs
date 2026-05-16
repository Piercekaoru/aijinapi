use std::{
    collections::BTreeSet,
    sync::Arc,
    time::{Duration, Instant},
};

use chrono::{DateTime, Utc};
use reqwest::Client;
use serde::Serialize;
use serde_json::{Value, json};
use tokio::{sync::RwLock, time::sleep};
use tracing::{info, warn};

use crate::{
    config::Config,
    upstream::{UpstreamKeyRing, UpstreamRoute, fetch_models_json, forward_chat},
};

const FREE_MODEL_EXCEPTIONS: &[&str] = &["big-pickle"];
const REFRESH_INTERVAL: Duration = Duration::from_secs(300);
const STALE_AFTER: Duration = Duration::from_secs(600);
const PROBE_MAX_TOKENS: u8 = 1;

#[derive(Clone)]
pub struct FreeModelCatalog {
    state: Arc<RwLock<CatalogState>>,
    refresh_interval: Duration,
    stale_after: Duration,
}

#[derive(Debug, Clone)]
struct CatalogState {
    models: Vec<String>,
    unavailable_models: BTreeSet<String>,
    last_success_at: Option<DateTime<Utc>>,
    last_refresh_at: Option<DateTime<Utc>>,
    last_success_monotonic: Option<Instant>,
    last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PublicFreeModels {
    pub object: &'static str,
    pub data: Vec<PublicFreeModel>,
    pub updated_at: Option<DateTime<Utc>>,
    pub degraded: bool,
    pub fail_closed: bool,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PublicFreeModel {
    pub id: String,
    pub object: &'static str,
    pub owned_by: &'static str,
}

impl FreeModelCatalog {
    pub fn new() -> Self {
        Self {
            state: Arc::new(RwLock::new(CatalogState::empty())),
            refresh_interval: REFRESH_INTERVAL,
            stale_after: STALE_AFTER,
        }
    }

    pub fn seeded(models: impl IntoIterator<Item = impl Into<String>>) -> Self {
        Self::seeded_with_stale_after(models, STALE_AFTER)
    }

    fn seeded_with_stale_after(
        models: impl IntoIterator<Item = impl Into<String>>,
        stale_after: Duration,
    ) -> Self {
        Self {
            state: Arc::new(RwLock::new(CatalogState {
                models: normalize_model_list(models),
                unavailable_models: BTreeSet::new(),
                last_success_at: Some(Utc::now()),
                last_refresh_at: Some(Utc::now()),
                last_success_monotonic: Some(Instant::now()),
                last_error: None,
            })),
            refresh_interval: REFRESH_INTERVAL,
            stale_after,
        }
    }

    pub async fn refresh(
        &self,
        client: &Client,
        config: &Config,
        key_ring: &UpstreamKeyRing,
    ) -> Result<Vec<String>, String> {
        let value = match fetch_models_json(client, config, key_ring, UpstreamRoute::Zen).await {
            Ok(value) => value,
            Err(err) => {
                let error = err.to_string();
                self.mark_refresh_failure(error.clone()).await;
                return Err(error);
            }
        };
        let candidates = match candidate_free_models_from_payload(&value) {
            Ok(candidates) => candidates,
            Err(error) => {
                self.mark_refresh_failure(error.clone()).await;
                return Err(error);
            }
        };

        let mut verified = Vec::new();
        let mut probe_errors = Vec::new();
        for model in candidates {
            match probe_free_model(client, config, key_ring, &model).await {
                Ok(()) => verified.push(model),
                Err(err) => probe_errors.push(format!("{model}: {err}")),
            }
        }

        let last_error = if verified.is_empty() && probe_errors.is_empty() {
            Some("no free model candidates found".to_string())
        } else if probe_errors.is_empty() {
            None
        } else {
            Some(format!(
                "free model probe failures: {}",
                probe_errors.join("; ")
            ))
        };

        let now = Utc::now();
        let mut state = self.state.write().await;
        state.models = normalize_model_list(verified);
        state.unavailable_models.clear();
        state.last_success_at = Some(now);
        state.last_refresh_at = Some(now);
        state.last_success_monotonic = Some(Instant::now());
        state.last_error = last_error;

        Ok(state.models.clone())
    }

    pub async fn mark_refresh_failure(&self, error: String) {
        let mut state = self.state.write().await;
        state.last_refresh_at = Some(Utc::now());
        state.last_error = Some(error);
    }

    pub async fn available_models(&self) -> Vec<String> {
        let state = self.state.read().await;
        if state.is_fail_closed(self.stale_after) {
            return Vec::new();
        }

        state
            .models
            .iter()
            .filter(|model| !state.unavailable_models.contains(*model))
            .cloned()
            .collect()
    }

    pub async fn is_available(&self, model: &str) -> bool {
        self.available_models()
            .await
            .iter()
            .any(|available| available == model)
    }

    pub async fn trip_model(&self, model: &str, reason: impl Into<String>) {
        let mut state = self.state.write().await;
        state.unavailable_models.insert(model.to_string());
        state.last_error = Some(format!("{model}: {}", reason.into()));
        warn!(model, "free model tripped and removed from active catalog");
    }

    pub async fn public_snapshot(&self) -> PublicFreeModels {
        let state = self.state.read().await;
        let fail_closed = state.is_fail_closed(self.stale_after);
        let data = if fail_closed {
            Vec::new()
        } else {
            state
                .models
                .iter()
                .filter(|model| !state.unavailable_models.contains(*model))
                .map(|id| PublicFreeModel {
                    id: id.clone(),
                    object: "model",
                    owned_by: "openachieve",
                })
                .collect()
        };

        PublicFreeModels {
            object: "list",
            data,
            updated_at: state.last_success_at,
            degraded: state.last_error.is_some(),
            fail_closed,
            last_error: state.last_error.clone(),
        }
    }

    pub fn start_background_refresh(
        self,
        client: Client,
        config: Config,
        key_ring: UpstreamKeyRing,
    ) {
        tokio::spawn(async move {
            loop {
                sleep(self.refresh_interval).await;
                match self.refresh(&client, &config, &key_ring).await {
                    Ok(models) => {
                        info!(model_count = models.len(), "refreshed free model catalog");
                    }
                    Err(error) => {
                        warn!(%error, "failed to refresh free model catalog");
                    }
                }
            }
        });
    }
}

impl Default for FreeModelCatalog {
    fn default() -> Self {
        Self::new()
    }
}

impl CatalogState {
    fn empty() -> Self {
        Self {
            models: Vec::new(),
            unavailable_models: BTreeSet::new(),
            last_success_at: None,
            last_refresh_at: None,
            last_success_monotonic: None,
            last_error: None,
        }
    }

    fn is_fail_closed(&self, stale_after: Duration) -> bool {
        self.last_success_monotonic
            .map(|instant| instant.elapsed() > stale_after)
            .unwrap_or(true)
    }
}

pub fn is_free_model_candidate(model: &str) -> bool {
    model.ends_with("-free") || FREE_MODEL_EXCEPTIONS.contains(&model)
}

pub fn should_trip_free_model(status_code: u16, body_text: Option<&str>) -> bool {
    if matches!(status_code, 402 | 403 | 404) {
        return true;
    }

    if status_code < 400 {
        return false;
    }

    body_text
        .map(|body| {
            let body = body.to_ascii_lowercase();
            [
                "payment",
                "billing",
                "balance",
                "credit",
                "insufficient",
                "not supported",
                "unsupported",
                "not found",
                "forbidden",
                "disabled",
                "permission",
            ]
            .iter()
            .any(|needle| body.contains(needle))
        })
        .unwrap_or(false)
}

pub fn candidate_free_models_from_payload(value: &Value) -> Result<Vec<String>, String> {
    let data = value
        .get("data")
        .and_then(Value::as_array)
        .ok_or_else(|| "models payload is missing data array".to_string())?;

    let candidates = data
        .iter()
        .filter_map(|item| item.get("id").and_then(Value::as_str))
        .filter(|id| is_free_model_candidate(id))
        .map(ToOwned::to_owned)
        .collect::<Vec<_>>();

    Ok(normalize_model_list(candidates))
}

fn normalize_model_list(models: impl IntoIterator<Item = impl Into<String>>) -> Vec<String> {
    models
        .into_iter()
        .map(Into::into)
        .filter(|model| !model.trim().is_empty())
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect()
}

async fn probe_free_model(
    client: &Client,
    config: &Config,
    key_ring: &UpstreamKeyRing,
    model: &str,
) -> Result<(), String> {
    let body = json!({
        "model": model,
        "stream": false,
        "max_tokens": PROBE_MAX_TOKENS,
        "messages": [
            { "role": "user", "content": "ping" }
        ]
    });

    let result = forward_chat(client, config, key_ring, body, UpstreamRoute::Zen)
        .await
        .map_err(|err| err.to_string())?;

    if should_trip_free_model(result.status_code, result.body_text.as_deref()) {
        return Err(format!(
            "probe returned risky status {}",
            result.status_code
        ));
    }

    if !(200..300).contains(&result.status_code) {
        return Err(format!("probe returned status {}", result.status_code));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn extracts_cautious_free_candidates() {
        let payload = json!({
            "object": "list",
            "data": [
                { "id": "big-pickle" },
                { "id": "deepseek-v4-flash-free" },
                { "id": "qwen3.6-plus" },
                { "id": "trinity-large-preview-free" }
            ]
        });

        assert_eq!(
            candidate_free_models_from_payload(&payload).unwrap(),
            vec![
                "big-pickle",
                "deepseek-v4-flash-free",
                "trinity-large-preview-free"
            ]
        );
    }

    #[test]
    fn excludes_paid_models_from_candidates() {
        let payload = json!({
            "data": [
                { "id": "glm-5.1" },
                { "id": "qwen3.6-plus" },
                { "id": "minimax-m2.5" }
            ]
        });

        assert!(
            candidate_free_models_from_payload(&payload)
                .unwrap()
                .is_empty()
        );
    }

    #[actix_rt::test]
    async fn fail_closed_after_catalog_is_stale() {
        let catalog =
            FreeModelCatalog::seeded_with_stale_after(["big-pickle"], Duration::from_millis(1));

        sleep(Duration::from_millis(5)).await;

        assert!(catalog.available_models().await.is_empty());
        assert!(catalog.public_snapshot().await.fail_closed);
    }

    #[test]
    fn detects_risky_upstream_errors() {
        assert!(should_trip_free_model(402, None));
        assert!(should_trip_free_model(
            400,
            Some(r#"{"error":"model not supported"}"#)
        ));
        assert!(!should_trip_free_model(
            200,
            Some(r#"{"content":"payment terms were not found"}"#)
        ));
        assert!(!should_trip_free_model(200, Some(r#"{"id":"ok"}"#)));
    }
}
