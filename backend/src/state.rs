use reqwest::Client;
use sqlx::PgPool;

use crate::{config::Config, upstream::UpstreamKeyRing};

#[derive(Clone)]
pub struct AppState {
    pub config: Config,
    pub db: PgPool,
    pub http: Client,
    pub upstream_keys: UpstreamKeyRing,
}
