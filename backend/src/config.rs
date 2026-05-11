use std::{env, net::IpAddr};

#[derive(Clone, Debug)]
pub struct Config {
    pub database_url: String,
    pub opencode_zen_api_key: String,
    pub opencode_go_api_key: String,
    pub server_host: IpAddr,
    pub server_port: u16,
    pub default_monthly_request_limit: i32,
    pub zen_chat_completions_url: String,
    pub zen_go_chat_completions_url: String,
    pub zen_models_url: String,
    pub zen_go_models_url: String,
    pub cors_allowed_origins: Vec<String>,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        let server_host = env::var("SERVER_HOST")
            .unwrap_or_else(|_| "127.0.0.1".to_string())
            .parse()?;
        let server_port = env::var("SERVER_PORT")
            .unwrap_or_else(|_| "8080".to_string())
            .parse()?;
        let default_monthly_request_limit = env::var("DEFAULT_MONTHLY_REQUEST_LIMIT")
            .unwrap_or_else(|_| "500".to_string())
            .parse()?;

        Ok(Self {
            database_url: required("DATABASE_URL")?,
            opencode_zen_api_key: optional("OPENCODE_ZEN_API_KEY")
                .or_else(|| optional("OPENCODE_GO_API_KEY"))
                .ok_or_else(|| anyhow::anyhow!("OPENCODE_ZEN_API_KEY is required"))?,
            opencode_go_api_key: required("OPENCODE_GO_API_KEY")?,
            server_host,
            server_port,
            default_monthly_request_limit,
            zen_chat_completions_url: env::var("ZEN_CHAT_COMPLETIONS_URL")
                .or_else(|_| env::var("UPSTREAM_CHAT_URL"))
                .unwrap_or_else(|_| "https://opencode.ai/zen/v1/chat/completions".to_string()),
            zen_go_chat_completions_url: env::var("ZEN_GO_CHAT_COMPLETIONS_URL")
                .unwrap_or_else(|_| "https://opencode.ai/zen/go/v1/chat/completions".to_string()),
            zen_models_url: env::var("ZEN_MODELS_URL")
                .or_else(|_| env::var("UPSTREAM_MODELS_URL"))
                .unwrap_or_else(|_| "https://opencode.ai/zen/v1/models".to_string()),
            zen_go_models_url: env::var("ZEN_GO_MODELS_URL")
                .unwrap_or_else(|_| "https://opencode.ai/zen/go/v1/models".to_string()),
            cors_allowed_origins: env::var("CORS_ALLOWED_ORIGINS")
                .unwrap_or_else(|_| {
                    "http://localhost:3000,http://localhost:3001,http://localhost:3002".to_string()
                })
                .split(',')
                .map(str::trim)
                .filter(|origin| !origin.is_empty())
                .map(ToOwned::to_owned)
                .collect(),
        })
    }
}

fn required(name: &str) -> anyhow::Result<String> {
    optional(name).ok_or_else(|| anyhow::anyhow!("{name} is required"))
}

fn optional(name: &str) -> Option<String> {
    env::var(name).ok().filter(|value| !value.trim().is_empty())
}
