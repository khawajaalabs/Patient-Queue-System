import type { DatabaseSync } from "node:sqlite";
export function migrate(db: DatabaseSync) {
  const version = Number(db.prepare("PRAGMA user_version").get()?.["user_version"] ?? 0);
  if (version > 1) throw new Error("This database was created by a newer QueueCare version.");
  if (version === 1) return;
  db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE users (
      id TEXT PRIMARY KEY, full_name TEXT NOT NULL, email TEXT NOT NULL COLLATE NOCASE UNIQUE, phone TEXT NOT NULL,
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
      current_token_id TEXT REFERENCES tokens(id), opened_at TEXT NOT NULL, closed_at TEXT, created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(clinic_id,queue_date)
    );
    CREATE TABLE tokens (
      id TEXT PRIMARY KEY, queue_id TEXT NOT NULL REFERENCES daily_queues(id), patient_id TEXT NOT NULL REFERENCES users(id),
      token_number INTEGER NOT NULL, token_code TEXT NOT NULL, queue_order INTEGER NOT NULL, department TEXT NOT NULL,
      reason_for_visit TEXT NOT NULL DEFAULT '', status TEXT NOT NULL CHECK(status IN ('waiting','serving','skipped','completed','cancelled')),
      joined_at TEXT NOT NULL, called_at TEXT, last_called_at TEXT, call_count INTEGER NOT NULL DEFAULT 0,
      completed_at TEXT, skipped_at TEXT, cancelled_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      UNIQUE(queue_id,token_number), UNIQUE(queue_id,queue_order)
    );
    CREATE UNIQUE INDEX one_active_visit ON tokens(queue_id,patient_id) WHERE status IN ('waiting','serving','skipped');
    CREATE UNIQUE INDEX one_serving_visit ON tokens(queue_id) WHERE status='serving';
    CREATE INDEX queue_ordering ON tokens(queue_id,status,queue_order);
    CREATE INDEX patient_history ON tokens(patient_id,joined_at DESC);
    CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
    CREATE INDEX session_expiry ON sessions(expires_at);
    PRAGMA user_version=1;
    COMMIT;`);
}
