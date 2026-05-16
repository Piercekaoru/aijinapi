use serde::Deserialize;

pub const SIGN_TYPE_MD5: &str = "MD5";
pub const STATUS_PENDING: &str = "pending";
pub const STATUS_PAID: &str = "paid";
pub const STATUS_CLOSED: &str = "closed";
pub const STATUS_REFUNDED: &str = "refunded";
pub const STATUS_FROZEN: &str = "frozen";
pub const STATUS_UNFROZEN: &str = "unfrozen";
pub const STATUS_FAILED: &str = "failed";

#[derive(Debug, Deserialize)]
pub struct CreateOrderResponse {
    pub code: i32,
    pub msg: String,
    pub data: Option<CreateOrderData>,
}

#[derive(Debug, Deserialize)]
pub struct CreateOrderData {
    pub trade_no: String,
    pub out_trade_no: String,
    pub pay_url: String,
}

pub fn cents_to_amount(cents: i32) -> String {
    format!("{}.{:02}", cents / 100, cents % 100)
}

pub fn sign_md5(params: &[(String, String)], secret_key: &str) -> String {
    let mut signed_params = params
        .iter()
        .filter(|(key, value)| {
            !value.is_empty()
                && !key.eq_ignore_ascii_case("sign")
                && !key.eq_ignore_ascii_case("sign_type")
        })
        .collect::<Vec<_>>();
    signed_params.sort_by(|(left, _), (right, _)| left.cmp(right));

    let sign_body = signed_params
        .into_iter()
        .map(|(key, value)| format!("{key}={value}"))
        .collect::<Vec<_>>()
        .join("&");
    let sign_source = if sign_body.is_empty() {
        format!("key={secret_key}")
    } else {
        format!("{sign_body}&key={secret_key}")
    };

    format!("{:x}", md5::compute(sign_source)).to_ascii_uppercase()
}

pub fn verify_md5(params: &[(String, String)], secret_key: &str) -> bool {
    let Some(provided_sign) = params
        .iter()
        .find(|(key, _)| key.eq_ignore_ascii_case("sign"))
        .map(|(_, value)| value)
    else {
        return false;
    };

    sign_md5(params, secret_key).eq_ignore_ascii_case(provided_sign)
}

pub fn trade_status_to_order_status(trade_status: &str) -> &'static str {
    match trade_status {
        "WAIT_BUYER_PAY" => STATUS_PENDING,
        "TRADE_SUCCESS" => STATUS_PAID,
        "TRADE_CLOSED" => STATUS_CLOSED,
        "TRADE_REFUND" => STATUS_REFUNDED,
        "TRADE_FREEZE" => STATUS_FROZEN,
        "TRADE_UNFREEZE" => STATUS_UNFROZEN,
        _ => STATUS_FAILED,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_cents_as_yuan_amount() {
        assert_eq!(cents_to_amount(5800), "58.00");
        assert_eq!(cents_to_amount(5805), "58.05");
        assert_eq!(cents_to_amount(5850), "58.50");
    }

    #[test]
    fn signs_md5_with_sorted_non_empty_params() {
        let params = vec![
            ("total_amount".to_string(), "58.00".to_string()),
            ("sign".to_string(), "ignored".to_string()),
            ("empty".to_string(), String::new()),
            ("pid".to_string(), "20881234".to_string()),
            ("sign_type".to_string(), SIGN_TYPE_MD5.to_string()),
        ];
        let expected = format!(
            "{:x}",
            md5::compute("pid=20881234&total_amount=58.00&key=secret")
        )
        .to_ascii_uppercase();

        assert_eq!(sign_md5(&params, "secret"), expected);
    }

    #[test]
    fn verifies_md5_signature_case_insensitively() {
        let mut params = vec![
            ("pid".to_string(), "20881234".to_string()),
            ("out_trade_no".to_string(), "OA123".to_string()),
            ("total_amount".to_string(), "58.00".to_string()),
            ("sign_type".to_string(), SIGN_TYPE_MD5.to_string()),
        ];
        let sign = sign_md5(&params, "secret").to_ascii_lowercase();
        params.push(("sign".to_string(), sign));

        assert!(verify_md5(&params, "secret"));
        assert!(!verify_md5(&params, "wrong-secret"));
    }
}
