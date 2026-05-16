use reqwest::Client;
use sqlx::PgPool;

use crate::{
    config::Config, email::SharedEmailSender, free_models::FreeModelCatalog,
    upstream::UpstreamKeyRing,
};

#[derive(Clone)]
pub struct AppState {
    pub config: Config,
    pub db: PgPool,
    pub http: Client,
    pub email: SharedEmailSender,
    pub upstream_keys: UpstreamKeyRing,
    pub free_models: FreeModelCatalog,
}
