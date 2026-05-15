CREATE TABLE IF NOT EXISTS admin_audit_events (
  id BIGSERIAL PRIMARY KEY,
  actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  actor_email TEXT NOT NULL,
  target_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  target_email TEXT NOT NULL,
  action TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_events_actor_created
  ON admin_audit_events (actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_events_target_created
  ON admin_audit_events (target_user_id, created_at DESC);
