use std::{env, fmt, net::IpAddr};

#[derive(Clone, Debug)]
pub struct Config {
    pub database_url: String,
    pub app_base_url: String,
    pub admin_emails: Vec<String>,
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
    pub smtp: Option<SmtpConfig>,
    pub fovpay: Option<FovPayConfig>,
}

#[derive(Clone, Debug)]
pub struct SmtpConfig {
    pub host: String,
    pub port: u16,
    pub username: Option<String>,
    pub password: Option<String>,
    pub from_email: String,
    pub from_name: String,
    pub tls_mode: SmtpTlsMode,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SmtpTlsMode {
    StartTls,
    Implicit,
    None,
}

#[derive(Clone)]
pub struct FovPayConfig {
    pub enabled: bool,
    pub base_url: String,
    pub pid: String,
    pub secret_key: String,
    pub plus_amount_cents: i32,
    pub plus_days: i32,
    pub allowed_paytypes: Vec<String>,
}

impl fmt::Debug for FovPayConfig {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("FovPayConfig")
            .field("enabled", &self.enabled)
            .field("base_url", &self.base_url)
            .field("pid", &self.pid)
            .field("secret_key", &"<redacted>")
            .field("plus_amount_cents", &self.plus_amount_cents)
            .field("plus_days", &self.plus_days)
            .field("allowed_paytypes", &self.allowed_paytypes)
            .finish()
    }
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
        if opencode_zen_api_keys.is_empty() {
            return Err(anyhow::anyhow!(
                "OPENCODE_ZEN_API_KEYS or OPENCODE_ZEN_API_KEY is required"
            ));
        }

        Ok(Self {
            database_url: required("DATABASE_URL")?,
            app_base_url: env::var("APP_BASE_URL")
                .unwrap_or_else(|_| "http://localhost:3000".to_string())
                .trim_end_matches('/')
                .to_string(),
            admin_emails: admin_emails_from_env(),
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
            smtp: smtp_config_from_env()?,
            fovpay: fovpay_config_from_env()?,
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

fn admin_emails_from_env() -> Vec<String> {
    optional("ADMIN_EMAILS")
        .map(|value| parse_email_list(&value))
        .filter(|emails| !emails.is_empty())
        .unwrap_or_else(|| vec!["xiaolinyihai@gmail.com".to_string()])
}

fn smtp_config_from_env() -> anyhow::Result<Option<SmtpConfig>> {
    let has_smtp_env = [
        "SMTP_HOST",
        "SMTP_USERNAME",
        "SMTP_PASSWORD",
        "SMTP_FROM_EMAIL",
    ]
    .iter()
    .any(|name| optional(name).is_some());

    if !has_smtp_env {
        return Ok(None);
    }

    let username = optional("SMTP_USERNAME");
    let password = optional("SMTP_PASSWORD");
    if username.is_some() != password.is_some() {
        return Err(anyhow::anyhow!(
            "SMTP_USERNAME and SMTP_PASSWORD must be set together"
        ));
    }

    Ok(Some(SmtpConfig {
        host: required("SMTP_HOST")?,
        port: env::var("SMTP_PORT")
            .unwrap_or_else(|_| "587".to_string())
            .parse()?,
        username,
        password,
        from_email: required("SMTP_FROM_EMAIL")?,
        from_name: env::var("SMTP_FROM_NAME")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| "OpenAchieve".to_string()),
        tls_mode: smtp_tls_mode_from_env()?,
    }))
}

fn smtp_tls_mode_from_env() -> anyhow::Result<SmtpTlsMode> {
    match env::var("SMTP_TLS_MODE")
        .unwrap_or_else(|_| "starttls".to_string())
        .trim()
        .to_ascii_lowercase()
        .as_str()
    {
        "starttls" => Ok(SmtpTlsMode::StartTls),
        "implicit" => Ok(SmtpTlsMode::Implicit),
        "none" => Ok(SmtpTlsMode::None),
        other => Err(anyhow::anyhow!(
            "SMTP_TLS_MODE must be starttls, implicit, or none; got {other}"
        )),
    }
}

fn fovpay_config_from_env() -> anyhow::Result<Option<FovPayConfig>> {
    let enabled = optional("FOVPAY_ENABLED")
        .map(|value| parse_bool("FOVPAY_ENABLED", &value))
        .transpose()?
        .unwrap_or(false);

    if !enabled {
        return Ok(None);
    }

    let allowed_paytypes = optional("FOVPAY_ALLOWED_PAYTYPES")
        .map(|value| parse_key_list(&value))
        .filter(|paytypes| !paytypes.is_empty())
        .unwrap_or_else(|| {
            vec![
                "alipay".to_string(),
                "wxpay".to_string(),
                "paypal".to_string(),
                "usdt".to_string(),
            ]
        });

    let plus_days = env::var("FOVPAY_PLUS_DAYS")
        .unwrap_or_else(|_| "30".to_string())
        .parse::<i32>()?;
    if !(1..=365).contains(&plus_days) {
        return Err(anyhow::anyhow!(
            "FOVPAY_PLUS_DAYS must be between 1 and 365"
        ));
    }

    Ok(Some(FovPayConfig {
        enabled,
        base_url: env::var("FOVPAY_BASE_URL")
            .unwrap_or_else(|_| "https://pay.fovpay.com".to_string())
            .trim_end_matches('/')
            .to_string(),
        pid: required("FOVPAY_PID")?,
        secret_key: required("FOVPAY_SECRET_KEY")?,
        plus_amount_cents: parse_cny_to_cents(
            &env::var("FOVPAY_PLUS_AMOUNT_CNY").unwrap_or_else(|_| "58.00".to_string()),
        )?,
        plus_days,
        allowed_paytypes,
    }))
}

fn parse_bool(name: &str, value: &str) -> anyhow::Result<bool> {
    match value.trim().to_ascii_lowercase().as_str() {
        "1" | "true" | "yes" | "on" => Ok(true),
        "0" | "false" | "no" | "off" => Ok(false),
        other => Err(anyhow::anyhow!(
            "{name} must be true/false, 1/0, yes/no, or on/off; got {other}"
        )),
    }
}

fn parse_cny_to_cents(value: &str) -> anyhow::Result<i32> {
    let value = value.trim();
    let (yuan, cents) = value
        .split_once('.')
        .map_or((value, ""), |(yuan, cents)| (yuan, cents));
    if yuan.is_empty()
        || !yuan.chars().all(|ch| ch.is_ascii_digit())
        || !cents.chars().all(|ch| ch.is_ascii_digit())
        || cents.len() > 2
    {
        return Err(anyhow::anyhow!(
            "FOVPAY_PLUS_AMOUNT_CNY must be a positive amount with at most two decimals"
        ));
    }

    let yuan = yuan.parse::<i32>()?;
    let cents = match cents.len() {
        0 => 0,
        1 => cents.parse::<i32>()? * 10,
        2 => cents.parse::<i32>()?,
        _ => unreachable!("cents length checked above"),
    };
    let total = yuan
        .checked_mul(100)
        .and_then(|yuan_cents| yuan_cents.checked_add(cents))
        .ok_or_else(|| anyhow::anyhow!("FOVPAY_PLUS_AMOUNT_CNY is too large"))?;
    if total <= 0 {
        return Err(anyhow::anyhow!(
            "FOVPAY_PLUS_AMOUNT_CNY must be greater than zero"
        ));
    }
    Ok(total)
}

fn parse_key_list(value: &str) -> Vec<String> {
    value
        .split(',')
        .map(str::trim)
        .filter(|key| !key.is_empty())
        .map(ToOwned::to_owned)
        .collect()
}

fn parse_email_list(value: &str) -> Vec<String> {
    value
        .split(',')
        .map(str::trim)
        .filter(|email| !email.is_empty())
        .map(str::to_ascii_lowercase)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{admin_emails_from_env, parse_cny_to_cents, parse_email_list, parse_key_list};

    #[test]
    fn parses_comma_separated_api_keys() {
        assert_eq!(
            parse_key_list(" key-a, key-b ,,key-c "),
            vec!["key-a", "key-b", "key-c"]
        );
    }

    #[test]
    fn parses_admin_emails_case_insensitively() {
        assert_eq!(
            parse_email_list(" Admin@Example.com, xiaolinyihai@gmail.com "),
            vec!["admin@example.com", "xiaolinyihai@gmail.com"]
        );
    }

    #[test]
    fn defaults_admin_email_when_unset() {
        unsafe {
            std::env::remove_var("ADMIN_EMAILS");
        }

        assert_eq!(
            admin_emails_from_env(),
            vec!["xiaolinyihai@gmail.com".to_string()]
        );
    }

    #[test]
    fn parses_cny_amount_to_cents() {
        assert_eq!(parse_cny_to_cents("58").unwrap(), 5800);
        assert_eq!(parse_cny_to_cents("58.5").unwrap(), 5850);
        assert_eq!(parse_cny_to_cents("58.05").unwrap(), 5805);
        assert!(parse_cny_to_cents("58.005").is_err());
        assert!(parse_cny_to_cents("0").is_err());
    }
}
