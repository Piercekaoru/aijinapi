ALTER TABLE users
  ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS plan_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS monthly_request_limit INTEGER NOT NULL DEFAULT 500,
  ADD COLUMN IF NOT EXISTS plus_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS plus_expires_at TIMESTAMPTZ;

UPDATE users
SET monthly_request_limit = 500
WHERE monthly_request_limit IS NULL OR monthly_request_limit <> 500;

CREATE INDEX IF NOT EXISTS idx_users_plan_status ON users (plan, plan_status);
