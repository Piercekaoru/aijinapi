# AGENTS.md — OpenAchieve

An AI API relay service for Chinese developers. Next.js 15 frontend + Rust (actix-web) backend + PostgreSQL.

## Project identity

- **Product**: "OpenAchieve" (OpenAchieve) — OpenAI-compatible API proxy targeting the Chinese market
- **Package name**: `openachieve-next` (pnpm workspace root)
- **Backend crate**: `openachieve-backend`
- **Upstream providers**: OpenCode Zen (free tier) and OpenCode Go (plus tier) at `opencode.ai`

## Architecture

```
Browser → Next.js (:3000) ──rewrites──→ Rust backend (:8080) ──→ OpenCode upstream
                                      └── Postgres (openachieve)
```

- Next.js `rewrites()` proxies `/api/backend/:path*` and public `/v1/:path*` → `http://127.0.0.1:8080/:path*`
- Next.js output mode is `standalone` (docker-ready)
- Frontend pages are a mix of React components and static HTML pages loaded via `lib/html-page.ts` (the `.html` files at the root like `openachieve-landing.html`)
- Tailwind CSS **v4** with `@import "tailwindcss"` (not v3 `@tailwind` directives)
- shadcn/ui uses `base-nova` style with `neutral` baseColor

## Prerequisites

- **pnpm** 9.x (lockfile is pnpm-lock.yaml; npm/yarn won't work)
- **Rust** toolchain (edition 2024, 1.95+ in Docker)
- **PostgreSQL** 16 (local or Docker)
- Environment variables: see `.env.docker.example` / `backend/.env.example`

## Development commands

```bash
# Frontend only
pnpm dev                    # Next.js dev server (no backend — API calls will fail)
pnpm build                  # production build
pnpm lint                   # ESLint (ignores backend/ via eslint.config.mjs)

# Backend (run from backend/)
cp .env.example .env        # edit DATABASE_URL + OPENCODE_GO_API_KEY(S)
cargo run --bin migrate     # run DB migrations (MUST run before backend starts)
cargo run --bin create_key -- --name "customer name"  # create API key (shown once!)
cargo run                   # start backend on 127.0.0.1:8080

# Backend tests (from backend/)
cargo test                  # all tests
cargo test --lib            # unit tests only
cargo test --test integration  # integration tests (backend/tests/)

# Docker (full stack)
docker compose --env-file .env.docker up --build

# Production deploy from server project directory
./deploy.sh
```

**Critical order**: `migrate` → optional `create_key`/`set_plan` → `cargo run` (or Docker entrypoint handles this)

## Backend details

### Binaries
| Binary | Purpose |
|---|---|
| `openachieve-backend` | Main HTTP server (actix-web, port 8080) |
| `migrate` | Runs all SQL migrations in `backend/migrations/` |
| `create_key` | Creates an API key for an email (SHA-256 hashed, plaintext shown once) |
| `set_plan` | Sets user plan (free/plus) and monthly quota |

### API routes (`routes.rs`)
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | none | Health check |
| POST | `/auth/register` | none | Email + password registration |
| POST | `/auth/login` | none | Session login |
| GET | `/auth/me` | session | Current user info |
| GET | `/dashboard` | session | Usage stats + API key list |
| POST | `/dashboard/api-keys` | session | Create new API key |
| GET | `/v1/models` | API key | List available models |
| POST | `/v1/chat/completions` | API key | OpenAI-compatible chat (stream/non-stream) |

### Auth system
- **User sessions**: 30-day expiry, SHA-256 hashed bearer tokens (stored in `sessions` table)
- **API keys**: prefix `openachieve_` (random suffix), SHA-256 hashed, plaintext returned only on creation (stored in `api_keys` table)
- User passwords: argon2 hashed

### Model routing
- **Free tier** (plan="free"): 5 OpenCode Zen free models, routed to **Zen** upstream
  - big-pickle, deepseek-v4-flash-free, minimax-m2.5-free, ring-2.6-1t-free, nemotron-3-super-free
- **Plus tier** (plan="plus", status="active", not expired): all Free models plus 10 paid Plus models
  - Free models continue routing to **Zen**
  - Paid Plus models route to **Go**
  - glm-5.1, glm-5, kimi-k2.5, kimi-k2.6, deepseek-v4-pro, deepseek-v4-flash,
  - mimo-v2.5, mimo-v2.5-pro, qwen3.6-plus, qwen3.5-plus
- Monthly limits: free=500, plus=1500 (`DEFAULT_MONTHLY_REQUEST_LIMIT` is the legacy/default key-creation fallback)

### Config from env vars
All via `Config::from_env()` — see `backend/src/config.rs`. Key ones:
- `DATABASE_URL` (required)
- `OPENCODE_GO_API_KEYS` or `OPENCODE_GO_API_KEY` (required; plural comma-separated form enables upstream key rotation)
- `OPENCODE_ZEN_API_KEYS` or `OPENCODE_ZEN_API_KEY` (optional; Zen falls back to Go key list if unset)
- `SERVER_HOST`, `SERVER_PORT` (default 127.0.0.1:8080)
- `CORS_ALLOWED_ORIGINS` (comma-separated, defaults localhost:3000-3002)
- Upstream URLs default to `https://opencode.ai/zen/...` and `https://opencode.ai/zen/go/...`

## Frontend details

### Page structure
| Route | Page file | Static HTML? |
|---|---|---|
| `/` | `app/page.tsx` | Yes (openachieve-landing.html) |
| `/login` | `app/login/page.tsx` | Yes (openachieve-login.html) |
| `/models` | `app/models/page.tsx` | Yes (openachieve-models.html) |
| `/dashboard` | `app/dashboard/page.tsx` | No (full React) |
| `/account` | `app/account/page.tsx` | No (full React) |
| `/playground` | `app/playground/page.tsx` | No (full React) |
| `/docs` | `app/docs/page.tsx` | No (full React) |

Static HTML pages use `getStaticHtmlPage()` from `lib/html-page.ts` to parse the `.html` files at the project root. The html loads into `<div dangerouslySetInnerHTML>` with extracted styles.

### Component conventions
- Components in `app/components/` are page-specific (SiteHeader, SiteFooter, StaticHtmlPage)
- shadcn/ui components in `components/ui/` (generated by `shadcn` CLI)
- `cn()` utility from `@/lib/utils` for className merging (clsx + tailwind-merge)

### Important constraints
- **pnpm only** — `packageManager: "pnpm@9.15.9"` in package.json
- **Tailwind v4** — uses CSS `@import "tailwindcss"` syntax, not v3 postcss plugin
- **TypeScript strict** mode enabled
- ESLint ignores `backend/`, `.next/`, `node_modules/` — backend has its own Rust linting
- No README.md exists at the project root

## Environment & secrets

- **Root `.env` / `.env.docker`**: contains Docker production env, including real upstream keys — DO NOT commit
- **`backend/.env`**: contains DB URL, API keys, upstream URLs (also DO NOT commit)
- Docker: secrets passed through `docker compose --env-file .env.docker`

## Testing

- **Frontend**: no test suite configured (no vitest/jest in package.json)
- **Backend**: Rust tests via `cargo test`. Integration tests use `wiremock` for upstream mocking (`backend/tests/`). Run with `cargo test` from `backend/`.
