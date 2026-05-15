use rand::{Rng, distr::Alphanumeric};
use sha2::{Digest, Sha256};

pub const CUSTOMER_KEY_PREFIX: &str = "openachieve_";

pub fn hash_key(key: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(key.as_bytes());
    hex::encode(hasher.finalize())
}

pub fn generate_customer_key() -> String {
    let suffix: String = rand::rng()
        .sample_iter(&Alphanumeric)
        .take(40)
        .map(char::from)
        .collect();
    format!("{CUSTOMER_KEY_PREFIX}{suffix}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hashes_are_stable_and_not_plaintext() {
        let hash = hash_key("openachieve_test");
        assert_eq!(hash, hash_key("openachieve_test"));
        assert_ne!(hash, "openachieve_test");
        assert_eq!(hash.len(), 64);
    }

    #[test]
    fn generated_keys_have_expected_prefix() {
        let key = generate_customer_key();
        assert!(key.starts_with(CUSTOMER_KEY_PREFIX));
        assert!(key.len() > 20);
    }
}
