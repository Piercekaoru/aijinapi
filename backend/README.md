# OpenAchieve Backend

Rust `actix-web` + PostgreSQL API relay for OpenAI-compatible Chat Completions and Anthropic-compatible Messages.

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

curl http://127.0.0.1:8080/v1/messages \
  -H "Authorization: Bearer <customer_key>" \
  -H "Content-Type: application/json" \
  -d '{"model":"minimax-m3","max_tokens":256,"messages":[{"role":"user","content":[{"type":"text","text":"hello"}]}]}'
```

Customer API keys are only shown once by `create_key`. The database stores only the SHA-256 hash.

## Upstream Keys

Use comma-separated `OPENCODE_ZEN_API_KEYS` and `OPENCODE_GO_API_KEYS` for rotation and
failover. Keep Zen and Go keys separate so Free traffic cannot silently spend Go quota.
The backend requires a Zen key list at startup.

## Model Routing

Free users can call the runtime OpenCode Zen free model pool. The backend refreshes
the Zen model list, cautiously admits `*-free` models plus `big-pickle`, probes
availability, and fail-closes stale catalogs. Plus users can call the current Zen
free pool plus the paid Plus model pool routed through OpenCode Go.

`minimax-m3` is additionally exposed to all users through `POST /v1/messages`.
It is routed to OpenCode Go `.../v1/messages`, remains visible in public/account
surfaces, and does **not** count against monthly quota.
