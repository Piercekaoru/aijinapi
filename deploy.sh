#!/usr/bin/env bash
set -euo pipefail

BRANCH="${DEPLOY_BRANCH:-main}"
PROJECT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
ENV_FILE="${DEPLOY_ENV_FILE:-}"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-http://127.0.0.1:3000/api/backend/health}"
HEALTHCHECK_RETRIES="${HEALTHCHECK_RETRIES:-60}"
HEALTHCHECK_SLEEP_SECONDS="${HEALTHCHECK_SLEEP_SECONDS:-2}"
COMPOSE="docker compose"
COMPOSE_STARTED=0

cd "$PROJECT_DIR"

if [ -z "$ENV_FILE" ]; then
  if [ -f ".env.docker" ]; then
    ENV_FILE=".env.docker"
  elif [ -f ".env" ]; then
    ENV_FILE=".env"
  else
    echo "Missing .env.docker or .env in $PROJECT_DIR" >&2
    exit 1
  fi
fi

print_app_logs() {
  if [ "$COMPOSE_STARTED" -eq 1 ]; then
    $COMPOSE --env-file "$ENV_FILE" logs --tail=120 app >&2 || true
  fi
}

on_error() {
  status="$?"
  echo "Deploy failed with exit code $status" >&2
  print_app_logs
  exit "$status"
}

trap on_error ERR

echo "Deploying OpenAchieve from $PROJECT_DIR"
echo "Branch: $BRANCH"
echo "Env file: $ENV_FILE"

git fetch origin "$BRANCH"
current_branch="$(git branch --show-current)"
if [ "$current_branch" != "$BRANCH" ]; then
  git checkout "$BRANCH"
fi
git pull --ff-only origin "$BRANCH"

$COMPOSE --env-file "$ENV_FILE" config >/dev/null
$COMPOSE --env-file "$ENV_FILE" build app
$COMPOSE --env-file "$ENV_FILE" up -d --remove-orphans
COMPOSE_STARTED=1

echo "Waiting for health check: $HEALTHCHECK_URL"
i=1
while [ "$i" -le "$HEALTHCHECK_RETRIES" ]; do
  if curl -fsS "$HEALTHCHECK_URL" >/dev/null; then
    echo "Health check passed"
    if [ "${PRUNE_OLD_IMAGES:-false}" = "true" ]; then
      docker image prune -f
    fi
    echo "Deploy complete"
    exit 0
  fi

  sleep "$HEALTHCHECK_SLEEP_SECONDS"
  i=$((i + 1))
done

echo "Health check did not pass after $HEALTHCHECK_RETRIES attempts" >&2
print_app_logs
exit 1
