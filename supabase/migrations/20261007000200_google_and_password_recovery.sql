-- Additive authentication storage. Existing users, sessions, tokens and visits are untouched.
SET search_path TO queuecare, pg_catalog;
CREATE TABLE google_identities (
  provider_subject TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);
CREATE TABLE auth_requests (
  token_hash TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('oauth','google_profile','recovery','password_reset')),
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  payload TEXT,
  expires_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE INDEX auth_requests_user_kind ON auth_requests(user_id,kind);
CREATE INDEX auth_requests_expiry ON auth_requests(expires_at);
CREATE TABLE auth_rate_limits (
  bucket TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL CHECK(attempts > 0),
  expires_at BIGINT NOT NULL
);
CREATE INDEX auth_rate_limits_expiry ON auth_rate_limits(expires_at);
ALTER TABLE google_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_rate_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY express_backend ON google_identities FOR ALL TO queuecare_backend USING (true) WITH CHECK (true);
CREATE POLICY express_backend ON auth_requests FOR ALL TO queuecare_backend USING (true) WITH CHECK (true);
CREATE POLICY express_backend ON auth_rate_limits FOR ALL TO queuecare_backend USING (true) WITH CHECK (true);
REVOKE ALL ON google_identities, auth_requests, auth_rate_limits FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON google_identities, auth_requests, auth_rate_limits TO queuecare_backend;
RESET search_path;
