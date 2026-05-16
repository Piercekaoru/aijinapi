# OpenAchieve Backend

Rust `actix-web` + PostgreSQL API relay for OpenAI-compatible requests.

## Local Setup

```bash
cd backend
cp .env.example .env
# edit DATABASE_URL and OPENCODE_GO_API_KEY
# or set OPENCODE_GO_API_KEYS=key1,key2 for upstream key rotation
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

## Upstream Keys

Use `OPENCODE_GO_API_KEY` and optional `OPENCODE_ZEN_API_KEY` for single-key deployments.
For rotation and failover, use comma-separated `OPENCODE_GO_API_KEYS` and
`OPENCODE_ZEN_API_KEYS`. If Zen keys are omitted, Zen falls back to the Go key list.

## Model Routing

Free users can call the OpenCode Zen free model pool: `big-pickle`,
`deepseek-v4-flash-free`, `minimax-m2.5-free`, `ring-2.6-1t-free`, and
`nemotron-3-super-free`. Plus users can call those same Zen free models plus the
paid Plus model pool routed through OpenCode Go.
