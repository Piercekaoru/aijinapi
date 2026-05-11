use std::env;

use aijinapi_backend::{
    config::Config,
    plans::{FREE_MONTHLY_REQUEST_LIMIT, PLUS_MONTHLY_REQUEST_LIMIT},
};
use sqlx::postgres::PgPoolOptions;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    let config = Config::from_env()?;
    let args = parse_args()?;

    let db = PgPoolOptions::new()
        .max_connections(1)
        .connect(&config.database_url)
        .await?;

    let updated: Option<(i64, String, String, String, i32)> = match args.plan.as_str() {
        "plus" => {
            sqlx::query_as(
                r#"
                UPDATE users
                SET plan = 'plus',
                    plan_status = 'active',
                    monthly_request_limit = $3,
                    plus_started_at = now(),
                    plus_expires_at = now() + ($2::int || ' days')::interval
                WHERE email = $1
                RETURNING id, email, plan, plan_status, monthly_request_limit
                "#,
            )
            .bind(&args.email)
            .bind(args.days)
            .bind(PLUS_MONTHLY_REQUEST_LIMIT)
            .fetch_optional(&db)
            .await?
        }
        "free" => {
            sqlx::query_as(
                r#"
                UPDATE users
                SET plan = 'free',
                    plan_status = 'active',
                    monthly_request_limit = $2,
                    plus_started_at = NULL,
                    plus_expires_at = NULL
                WHERE email = $1
                RETURNING id, email, plan, plan_status, monthly_request_limit
                "#,
            )
            .bind(&args.email)
            .bind(FREE_MONTHLY_REQUEST_LIMIT)
            .fetch_optional(&db)
            .await?
        }
        other => anyhow::bail!("unsupported plan: {other}; use free or plus"),
    };

    let Some((id, email, plan, plan_status, monthly_request_limit)) = updated else {
        anyhow::bail!("user not found: {}", args.email);
    };

    println!("updated user id: {id}");
    println!("email: {email}");
    println!("plan: {plan}");
    println!("plan_status: {plan_status}");
    println!("monthly_request_limit: {monthly_request_limit}");
    if args.plan == "plus" {
        println!("plus_days: {}", args.days);
    }

    Ok(())
}

struct Args {
    email: String,
    plan: String,
    days: i32,
}

fn parse_args() -> anyhow::Result<Args> {
    let mut email: Option<String> = None;
    let mut plan: Option<String> = None;
    let mut days: i32 = 30;
    let mut iter = env::args().skip(1);

    while let Some(arg) = iter.next() {
        match arg.as_str() {
            "--email" => email = iter.next().map(|value| value.trim().to_ascii_lowercase()),
            "--plan" => plan = iter.next().map(|value| value.trim().to_ascii_lowercase()),
            "--days" => {
                days = iter
                    .next()
                    .ok_or_else(|| anyhow::anyhow!("--days requires a value"))?
                    .parse()?;
            }
            "--help" | "-h" => {
                print_help();
                std::process::exit(0);
            }
            other => anyhow::bail!("unknown argument: {other}"),
        }
    }

    Ok(Args {
        email: email.ok_or_else(|| anyhow::anyhow!("--email is required"))?,
        plan: plan.ok_or_else(|| anyhow::anyhow!("--plan is required"))?,
        days: days.max(1),
    })
}

fn print_help() {
    println!("Usage: cargo run --bin set_plan -- --email user@example.com --plan plus [--days 30]");
    println!("       cargo run --bin set_plan -- --email user@example.com --plan free");
}
