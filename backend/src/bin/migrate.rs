use aijinapi_backend::config::Config;
use sqlx::postgres::PgPoolOptions;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    let config = Config::from_env()?;
    let db = PgPoolOptions::new()
        .max_connections(1)
        .connect(&config.database_url)
        .await?;

    sqlx::migrate!("./migrations").run(&db).await?;
    println!("migrations applied");
    Ok(())
}
