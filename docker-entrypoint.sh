#!/bin/sh
set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

if [ -z "${OPENCODE_GO_API_KEY:-}" ]; then
  echo "OPENCODE_GO_API_KEY is required" >&2
  exit 1
fi

./backend/migrate
./backend/aijinapi-backend &
backend_pid="$!"

cleanup() {
  kill "$backend_pid" 2>/dev/null || true
}
trap cleanup INT TERM EXIT

node server.js &
frontend_pid="$!"

wait "$frontend_pid"
