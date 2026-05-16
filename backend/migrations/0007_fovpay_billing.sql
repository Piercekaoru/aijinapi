CREATE TABLE IF NOT EXISTS billing_orders (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'fovpay',
  out_trade_no TEXT NOT NULL UNIQUE,
  provider_trade_no TEXT,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'CNY',
  paytype_code TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  pay_url TEXT,
  notify_payload TEXT,
  paid_at TIMESTAMPTZ,
  granted_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_orders_user_created
  ON billing_orders (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_billing_orders_status
  ON billing_orders (status);
