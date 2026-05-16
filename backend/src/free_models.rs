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
    upstream::{UpstreamKeyRing, UpstreamRoute, fetch_models_json, forward_chat_once},
};

const FREE_MODEL_EXCEPTIONS: &[&str] = &["big-pickle"];
const REFRESH_INTERVAL: Duration = Duration::from_secs(300);
const STALE_AFTER: Duration = Duration::from_secs(600);
const FULL_PROBE_INTERVAL: Duration = Duration::from_secs(3600);
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
    next_probe_index: usize,
    last_full_probe_monotonic: Option<Instant>,
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
                next_probe_index: 0,
                last_full_probe_monotonic: Some(Instant::now()),
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

        let candidate_set = candidates.iter().cloned().collect::<BTreeSet<_>>();
        let (probe_targets, next_probe_index, full_probe_due) = {
            let state = self.state.read().await;
            let known_models = state
                .models
                .iter()
                .chain(state.unavailable_models.iter())
                .filter(|model| candidate_set.contains(*model))
                .cloned()
                .collect::<BTreeSet<_>>();
            let existing_candidates = candidates
                .iter()
                .filter(|model| known_models.contains(*model))
                .cloned()
                .collect::<Vec<_>>();
            let new_candidates = candidates
                .iter()
                .filter(|model| !known_models.contains(*model))
                .cloned()
                .collect::<Vec<_>>();
            let full_probe_due = state
                .last_full_probe_monotonic
                .map(|instant| instant.elapsed() >= FULL_PROBE_INTERVAL)
                .unwrap_or(false);

            if full_probe_due {
                (candidates.clone(), state.next_probe_index, full_probe_due)
            } else {
                let mut targets = new_candidates;
                let mut next_probe_index = state.next_probe_index;

                if !existing_candidates.is_empty() {
                    let probe_index = state.next_probe_index % existing_candidates.len();
                    let existing_target = existing_candidates[probe_index].clone();
                    if !targets.contains(&existing_target) {
                        targets.push(existing_target);
                    }
                    next_probe_index = (probe_index + 1) % existing_candidates.len();
                }

                (targets, next_probe_index, full_probe_due)
            }
        };

        let targeted_all_candidates = !candidates.is_empty()
            && probe_targets.iter().cloned().collect::<BTreeSet<_>>() == candidate_set;
        let mut probe_reports = Vec::new();
        let mut stopped_early = false;
        for model in probe_targets {
            let outcome = probe_free_model(client, config, key_ring, &model).await;
            let stop_current_round = outcome.stop_current_round();
            probe_reports.push(ProbeReport { model, outcome });

            if stop_current_round {
                stopped_early = true;
                break;
            }
        }

        let now = Utc::now();
        let now_instant = Instant::now();
        let mut state = self.state.write().await;
        let mut known_models = state
            .models
            .iter()
            .filter(|model| candidate_set.contains(*model))
            .cloned()
            .collect::<BTreeSet<_>>();
        let mut unavailable_models = state
            .unavailable_models
            .iter()
            .filter(|model| candidate_set.contains(*model))
            .cloned()
            .collect::<BTreeSet<_>>();
        let mut probe_errors = Vec::new();

        for report in probe_reports {
            match report.outcome {
                ProbeOutcome::Healthy => {
                    known_models.insert(report.model.clone());
                    unavailable_models.remove(&report.model);
                }
                ProbeOutcome::ModelDenied(reason) => {
                    unavailable_models.insert(report.model.clone());
                    probe_errors.push(format!("{}: {reason}", report.model));
                }
                ProbeOutcome::Inconclusive { reason, .. } => {
                    if !known_models.contains(&report.model) {
                        unavailable_models.insert(report.model.clone());
                    }
                    probe_errors.push(format!("{}: {reason}", report.model));
                }
            }
        }

        state.models = known_models.into_iter().collect();
        state.unavailable_models = unavailable_models;
        state.next_probe_index = next_probe_index;
        state.last_success_at = Some(now);
        state.last_refresh_at = Some(now);
        state.last_success_monotonic = Some(now_instant);
        if full_probe_due || (targeted_all_candidates && !stopped_early) {
            state.last_full_probe_monotonic = Some(now_instant);
        }
        state.last_error = refresh_error(&candidates, &probe_errors, &state.unavailable_models);

        Ok(state.available_models())
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

        state.available_models()
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
            next_probe_index: 0,
            last_full_probe_monotonic: None,
        }
    }

    fn is_fail_closed(&self, stale_after: Duration) -> bool {
        self.last_success_monotonic
            .map(|instant| instant.elapsed() > stale_after)
            .unwrap_or(true)
    }

    fn available_models(&self) -> Vec<String> {
        self.models
            .iter()
            .filter(|model| !self.unavailable_models.contains(*model))
            .cloned()
            .collect()
    }
}

pub fn is_free_model_candidate(model: &str) -> bool {
    model.ends_with("-free") || FREE_MODEL_EXCEPTIONS.contains(&model)
}

pub fn should_trip_free_model(status_code: u16, body_text: Option<&str>) -> bool {
    if matches!(status_code, 402 | 403 | 404) {
        return true;
    }

    if status_code < 400 || status_code == 429 || status_code >= 500 {
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

fn refresh_error(
    candidates: &[String],
    probe_errors: &[String],
    unavailable_models: &BTreeSet<String>,
) -> Option<String> {
    if candidates.is_empty() {
        return Some("no free model candidates found".to_string());
    }

    if !probe_errors.is_empty() {
        return Some(format!(
            "free model probe issues: {}",
            probe_errors.join("; ")
        ));
    }

    if !unavailable_models.is_empty() {
        return Some(format!(
            "free models unavailable: {}",
            unavailable_models
                .iter()
                .cloned()
                .collect::<Vec<_>>()
                .join(", ")
        ));
    }

    None
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

#[derive(Debug)]
struct ProbeReport {
    model: String,
    outcome: ProbeOutcome,
}

#[derive(Debug)]
enum ProbeOutcome {
    Healthy,
    ModelDenied(String),
    Inconclusive {
        reason: String,
        stop_current_round: bool,
    },
}

impl ProbeOutcome {
    fn stop_current_round(&self) -> bool {
        matches!(
            self,
            Self::Inconclusive {
                stop_current_round: true,
                ..
            }
        )
    }
}

async fn probe_free_model(
    client: &Client,
    config: &Config,
    key_ring: &UpstreamKeyRing,
    model: &str,
) -> ProbeOutcome {
    let body = json!({
        "model": model,
        "stream": false,
        "max_tokens": PROBE_MAX_TOKENS,
        "messages": [
            { "role": "user", "content": "ping" }
        ]
    });

    let result = match forward_chat_once(client, config, key_ring, body, UpstreamRoute::Zen).await {
        Ok(result) => result,
        Err(err) => {
            return ProbeOutcome::Inconclusive {
                reason: err.to_string(),
                stop_current_round: true,
            };
        }
    };

    if (200..300).contains(&result.status_code) {
        return ProbeOutcome::Healthy;
    }

    if should_trip_free_model(result.status_code, result.body_text.as_deref()) {
        return ProbeOutcome::ModelDenied(format!(
            "probe returned risky status {}",
            result.status_code
        ));
    }

    let stop_current_round = result.status_code == 429 || result.status_code >= 500;
    ProbeOutcome::Inconclusive {
        reason: format!("probe returned status {}", result.status_code),
        stop_current_round,
    }
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
            429,
            Some(r#"{"error":"rate limit exceeded"}"#)
        ));
        assert!(!should_trip_free_model(
            500,
            Some(r#"{"error":"upstream temporarily unavailable"}"#)
        ));
        assert!(!should_trip_free_model(
            200,
            Some(r#"{"content":"payment terms were not found"}"#)
        ));
        assert!(!should_trip_free_model(200, Some(r#"{"id":"ok"}"#)));
    }
}
