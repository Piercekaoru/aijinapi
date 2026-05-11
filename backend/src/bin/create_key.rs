use std::env;

use aijinapi_backend::{
    config::Config,
    keys::{generate_customer_key, hash_key},
};
use sqlx::postgres::PgPoolOptions;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    let config = Config::from_env()?;
    let args = parse_args()?;
    let plain_key = generate_customer_key();
    let key_hash = hash_key(&plain_key);
    let key_prefix: String = plain_key.chars().take(14).collect();
    let monthly_limit = args
        .monthly_request_limit
        .unwrap_or(config.default_monthly_request_limit.max(1));

    let db = PgPoolOptions::new()
        .max_connections(1)
        .connect(&config.database_url)
        .await?;

    let id: i64 = sqlx::query_scalar(
        r#"
        INSERT INTO api_keys (key_hash, name, monthly_request_limit, key_prefix)
        VALUES ($1, $2, $3, $4)
        RETURNING id
        "#,
    )
    .bind(key_hash)
    .bind(&args.name)
    .bind(monthly_limit)
    .bind(key_prefix)
    .fetch_one(&db)
    .await?;

    println!("created API key id: {id}");
    println!("name: {}", args.name);
    println!("monthly_request_limit: {monthly_limit}");
    println!("customer_key: {plain_key}");
    println!("Store this key now. It is not recoverable from the database.");

    Ok(())
}

struct Args {
    name: String,
    monthly_request_limit: Option<i32>,
}

fn parse_args() -> anyhow::Result<Args> {
    let mut name: Option<String> = None;
    let mut monthly_request_limit: Option<i32> = None;
    let mut iter = env::args().skip(1);

    while let Some(arg) = iter.next() {
        match arg.as_str() {
            "--name" => {
                name = iter.next();
            }
            "--monthly-request-limit" => {
                monthly_request_limit = Some(
                    iter.next()
                        .ok_or_else(|| anyhow::anyhow!("--monthly-request-limit requires a value"))?
                        .parse()?,
                );
            }
            "--help" | "-h" => {
                print_help();
                std::process::exit(0);
            }
            other => {
                anyhow::bail!("unknown argument: {other}");
            }
        }
    }

    Ok(Args {
        name: name.ok_or_else(|| anyhow::anyhow!("--name is required"))?,
        monthly_request_limit,
    })
}

fn print_help() {
    println!(
        "Usage: cargo run --bin create_key -- --name <customer> [--monthly-request-limit 500]"
    );
}
