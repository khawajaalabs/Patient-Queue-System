-- QueueCare persistence is private to the Express server; no browser SDK table access.
CREATE ROLE queuecare_backend NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE SCHEMA queuecare;
GRANT USAGE ON SCHEMA queuecare TO queuecare_backend;
REVOKE ALL ON SCHEMA queuecare FROM PUBLIC, anon, authenticated;
SET search_path TO queuecare, pg_catalog;

    CREATE TABLE users (
      id TEXT PRIMARY KEY, full_name TEXT NOT NULL, email TEXT NOT NULL CHECK (email = lower(email)) UNIQUE, phone TEXT NOT NULL,
      password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('patient','admin')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE clinics (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, display_name TEXT NOT NULL, address TEXT NOT NULL, phone TEXT NOT NULL,
      department TEXT NOT NULL, doctor_name TEXT NOT NULL, opening_time TEXT NOT NULL, closing_time TEXT NOT NULL,
      average_consultation_minutes INTEGER NOT NULL CHECK(average_consultation_minutes BETWEEN 1 AND 120),
      token_prefix TEXT NOT NULL, public_display_show_next INTEGER NOT NULL CHECK(public_display_show_next IN (0,1)),
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE daily_queues (
      id TEXT PRIMARY KEY, clinic_id TEXT NOT NULL REFERENCES clinics(id), queue_date TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('open','closed')), next_token_number INTEGER NOT NULL DEFAULT 1,
      current_token_id TEXT, opened_at TEXT NOT NULL, closed_at TEXT, created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(clinic_id,queue_date)
    );
    CREATE TABLE tokens (
      id TEXT PRIMARY KEY, queue_id TEXT NOT NULL REFERENCES daily_queues(id), patient_id TEXT NOT NULL REFERENCES users(id),
      token_number INTEGER NOT NULL, token_code TEXT NOT NULL, queue_order INTEGER NOT NULL, department TEXT NOT NULL,
      reason_for_visit TEXT NOT NULL DEFAULT '', status TEXT NOT NULL CHECK(status IN ('waiting','serving','skipped','completed','cancelled')),
      joined_at TEXT NOT NULL, called_at TEXT, last_called_at TEXT, call_count INTEGER NOT NULL DEFAULT 0,
      completed_at TEXT, skipped_at TEXT, cancelled_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      insertion_order BIGINT GENERATED ALWAYS AS IDENTITY,
      UNIQUE(queue_id,token_number), UNIQUE(queue_id,queue_order), UNIQUE(queue_id,id)
    );
    CREATE UNIQUE INDEX one_active_visit ON tokens(queue_id,patient_id) WHERE status IN ('waiting','serving','skipped');
    CREATE UNIQUE INDEX one_serving_visit ON tokens(queue_id) WHERE status='serving';
    CREATE INDEX queue_ordering ON tokens(queue_id,status,queue_order);
    CREATE INDEX patient_history ON tokens(patient_id,joined_at DESC);
    CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at BIGINT NOT NULL);
    CREATE INDEX session_expiry ON sessions(expires_at);

ALTER TABLE daily_queues ADD CONSTRAINT current_token_same_queue FOREIGN KEY (id,current_token_id) REFERENCES tokens(queue_id,id) DEFERRABLE INITIALLY DEFERRED;
CREATE UNIQUE INDEX users_email_normalized ON users(lower(email));
CREATE INDEX tokens_queue_patient ON tokens(queue_id,patient_id);
CREATE INDEX sessions_user ON sessions(user_id);
ALTER TABLE daily_queues ADD CONSTRAINT next_token_range CHECK (next_token_number BETWEEN 1 AND 201);
ALTER TABLE tokens ADD CONSTRAINT token_number_range CHECK (token_number BETWEEN 1 AND 200);
ALTER TABLE tokens ADD CONSTRAINT token_order_positive CHECK (queue_order > 0);
ALTER TABLE tokens ADD CONSTRAINT call_count_positive CHECK (call_count >= 0);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY express_backend ON users FOR ALL TO queuecare_backend USING (true) WITH CHECK (true);
REVOKE ALL ON users FROM PUBLIC, anon, authenticated;
ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;
CREATE POLICY express_backend ON clinics FOR ALL TO queuecare_backend USING (true) WITH CHECK (true);
REVOKE ALL ON clinics FROM PUBLIC, anon, authenticated;
ALTER TABLE daily_queues ENABLE ROW LEVEL SECURITY;
CREATE POLICY express_backend ON daily_queues FOR ALL TO queuecare_backend USING (true) WITH CHECK (true);
REVOKE ALL ON daily_queues FROM PUBLIC, anon, authenticated;
ALTER TABLE tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY express_backend ON tokens FOR ALL TO queuecare_backend USING (true) WITH CHECK (true);
REVOKE ALL ON tokens FROM PUBLIC, anon, authenticated;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY express_backend ON sessions FOR ALL TO queuecare_backend USING (true) WITH CHECK (true);
REVOKE ALL ON sessions FROM PUBLIC, anon, authenticated;

REVOKE ALL ON ALL SEQUENCES IN SCHEMA queuecare FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA queuecare REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA queuecare REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA queuecare TO queuecare_backend;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA queuecare TO queuecare_backend;
RESET search_path;
