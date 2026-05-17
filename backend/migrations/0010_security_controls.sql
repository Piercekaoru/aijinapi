ALTER TABLE users
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS banned_reason TEXT,
  ADD COLUMN IF NOT EXISTS registration_ip TEXT,
  ADD COLUMN IF NOT EXISTS last_seen_ip TEXT,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_status ON users (status);
CREATE INDEX IF NOT EXISTS idx_users_registration_ip ON users (registration_ip);
CREATE INDEX IF NOT EXISTS idx_users_last_seen_ip ON users (last_seen_ip);

ALTER TABLE usage_events
  ADD COLUMN IF NOT EXISTS client_ip TEXT;

CREATE INDEX IF NOT EXISTS idx_usage_events_client_ip_created
  ON usage_events (client_ip, created_at DESC);

CREATE TABLE IF NOT EXISTS ip_rate_limit_windows (
  scope TEXT NOT NULL,
  ip TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  window_seconds INTEGER NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, ip, window_start, window_seconds)
);

CREATE INDEX IF NOT EXISTS idx_ip_rate_limit_windows_ip_updated
  ON ip_rate_limit_windows (ip, updated_at DESC);

CREATE TABLE IF NOT EXISTS ip_bans (
  id BIGSERIAL PRIMARY KEY,
  ip TEXT NOT NULL,
  reason TEXT NOT NULL,
  banned_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  lifted_at TIMESTAMPTZ,
  lifted_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  lift_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_ip_bans_ip_created
  ON ip_bans (ip, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ip_bans_active
  ON ip_bans (ip, expires_at)
  WHERE lifted_at IS NULL;

CREATE TABLE IF NOT EXISTS security_events (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  ip TEXT,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  api_key_id BIGINT REFERENCES api_keys(id) ON DELETE SET NULL,
  route TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_security_events_ip_created
  ON security_events (ip, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_events_user_created
  ON security_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_events_type_created
  ON security_events (event_type, created_at DESC);
