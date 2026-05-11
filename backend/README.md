# AIJinAPI Backend

Rust `actix-web` + PostgreSQL API relay for OpenAI-compatible requests.

## Local Setup

```bash
cd backend
cp .env.example .env
# edit DATABASE_URL and OPENCODE_GO_API_KEY
cargo run --bin migrate
cargo run --bin create_key -- --name "test customer"
cargo run
```

The server listens on `127.0.0.1:8080` by default.

## API

```bash
curl http://127.0.0.1:8080/health

curl http://127.0.0.1:8080/v1/models \
  -H "Authorization: Bearer <customer_key>"

curl http://127.0.0.1:8080/v1/chat/completions \
  -H "Authorization: Bearer <customer_key>" \
  -H "Content-Type: application/json" \
  -d '{"model":"qwen3.6-plus","messages":[{"role":"user","content":"hello"}]}'
```

Customer API keys are only shown once by `create_key`. The database stores only the SHA-256 hash.
