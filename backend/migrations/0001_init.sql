CREATE TABLE IF NOT EXISTS api_keys (
  id BIGSERIAL PRIMARY KEY,
  key_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  monthly_request_limit INTEGER NOT NULL DEFAULT 1000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys (key_hash);

CREATE TABLE IF NOT EXISTS usage_events (
  id BIGSERIAL PRIMARY KEY,
  api_key_id BIGINT REFERENCES api_keys(id) ON DELETE SET NULL,
  model TEXT,
  path TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  is_stream BOOLEAN NOT NULL DEFAULT FALSE,
  upstream_latency_ms INTEGER,
  error_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usage_events_api_key_month
  ON usage_events (api_key_id, created_at);

CREATE TABLE IF NOT EXISTS rate_limits (
  api_key_id BIGINT NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  window_start TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (api_key_id, window_start)
);
