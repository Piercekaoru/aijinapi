UPDATE users
SET monthly_request_limit = 1500
WHERE plan = 'plus'
  AND plan_status = 'active'
  AND plus_expires_at > now();
