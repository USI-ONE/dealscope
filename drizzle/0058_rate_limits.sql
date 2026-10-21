-- Fixed-window rate limiting for sign-in, password reset and public token endpoints. Additive only.
CREATE TABLE IF NOT EXISTS rate_limits (
  key text PRIMARY KEY,
  count integer NOT NULL DEFAULT 0,
  reset_at timestamptz NOT NULL
);
