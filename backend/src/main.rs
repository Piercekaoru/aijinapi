use actix_cors::Cors;
use actix_web::{App, HttpServer, http::header, middleware::Logger, web};
use openachieve_backend::{config::Config, routes, state::AppState, upstream::UpstreamKeyRing};
use reqwest::Client;
use sqlx::postgres::PgPoolOptions;
use tracing::info;

#[actix_web::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "openachieve_backend=info,actix_web=info".into()),
        )
        .init();

    let config = Config::from_env()?;
    let db = PgPoolOptions::new()
        .max_connections(10)
        .connect(&config.database_url)
        .await?;
    let http = Client::builder().build()?;
    let bind_addr = (config.server_host, config.server_port);
    let upstream_keys = UpstreamKeyRing::from_config(&config);

    info!(host = %bind_addr.0, port = bind_addr.1, "starting openachieve backend");

    HttpServer::new(move || {
        let cors = config
            .cors_allowed_origins
            .iter()
            .fold(Cors::default(), |cors, origin| cors.allowed_origin(origin))
            .allowed_methods(["GET", "POST", "OPTIONS"])
            .allowed_headers([header::AUTHORIZATION, header::CONTENT_TYPE])
            .max_age(3600);

        App::new()
            .wrap(Logger::default())
            .wrap(cors)
            .app_data(web::Data::new(AppState {
                config: config.clone(),
                db: db.clone(),
                http: http.clone(),
                upstream_keys: upstream_keys.clone(),
            }))
            .configure(routes::configure)
    })
    .bind(bind_addr)?
    .run()
    .await?;

    Ok(())
}
