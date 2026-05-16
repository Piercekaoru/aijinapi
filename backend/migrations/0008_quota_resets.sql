CREATE TABLE IF NOT EXISTS quota_resets (
  id BIGSERIAL PRIMARY KEY,
  actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  scope TEXT NOT NULL DEFAULT 'global',
  effective_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quota_resets_scope_effective
  ON quota_resets (scope, effective_at DESC);
