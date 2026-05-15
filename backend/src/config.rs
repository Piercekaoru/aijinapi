use std::{env, net::IpAddr};

#[derive(Clone, Debug)]
pub struct Config {
    pub database_url: String,
    pub opencode_zen_api_keys: Vec<String>,
    pub opencode_go_api_keys: Vec<String>,
    pub server_host: IpAddr,
    pub server_port: u16,
    pub default_monthly_request_limit: i32,
    pub zen_chat_completions_url: String,
    pub zen_go_chat_completions_url: String,
    pub zen_models_url: String,
    pub zen_go_models_url: String,
    pub upstream_max_attempts: usize,
    pub upstream_retry_base_ms: u64,
    pub upstream_key_cooldown_ms: u64,
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
        let opencode_go_api_keys = api_keys_from_env("OPENCODE_GO_API_KEYS", "OPENCODE_GO_API_KEY");
        if opencode_go_api_keys.is_empty() {
            return Err(anyhow::anyhow!(
                "OPENCODE_GO_API_KEYS or OPENCODE_GO_API_KEY is required"
            ));
        }
        let opencode_zen_api_keys =
            api_keys_from_env("OPENCODE_ZEN_API_KEYS", "OPENCODE_ZEN_API_KEY");
        let opencode_zen_api_keys = if opencode_zen_api_keys.is_empty() {
            opencode_go_api_keys.clone()
        } else {
            opencode_zen_api_keys
        };

        Ok(Self {
            database_url: required("DATABASE_URL")?,
            opencode_zen_api_keys,
            opencode_go_api_keys,
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
            upstream_max_attempts: env::var("UPSTREAM_MAX_ATTEMPTS")
                .unwrap_or_else(|_| "4".to_string())
                .parse::<usize>()?
                .clamp(1, 8),
            upstream_retry_base_ms: env::var("UPSTREAM_RETRY_BASE_MS")
                .unwrap_or_else(|_| "300".to_string())
                .parse::<u64>()?
                .min(5_000),
            upstream_key_cooldown_ms: env::var("UPSTREAM_KEY_COOLDOWN_MS")
                .unwrap_or_else(|_| "60000".to_string())
                .parse::<u64>()?,
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

fn api_keys_from_env(plural: &str, singular: &str) -> Vec<String> {
    optional(plural)
        .map(|value| parse_key_list(&value))
        .filter(|keys| !keys.is_empty())
        .or_else(|| optional(singular).map(|value| parse_key_list(&value)))
        .unwrap_or_default()
}

fn parse_key_list(value: &str) -> Vec<String> {
    value
        .split(',')
        .map(str::trim)
        .filter(|key| !key.is_empty())
        .map(ToOwned::to_owned)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::parse_key_list;

    #[test]
    fn parses_comma_separated_api_keys() {
        assert_eq!(
            parse_key_list(" key-a, key-b ,,key-c "),
            vec!["key-a", "key-b", "key-c"]
        );
    }
}
