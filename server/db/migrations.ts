import type { DatabaseSync } from "node:sqlite";
export function migrate(db: DatabaseSync) {
  const version = Number(db.prepare("PRAGMA user_version").get()?.["user_version"] ?? 0);
  if (version > 3) throw new Error("This database was created by a newer QueueCare version.");
  if (version >= 1) {
    if (version === 1) migrateAuthentication(db);
    if (version < 3) migrateClinics(db);
    return;
  }
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
  migrateAuthentication(db);
  migrateClinics(db);
}

function migrateAuthentication(db: DatabaseSync) {
  db.exec(`BEGIN IMMEDIATE;
 CREATE TABLE google_identities (provider_subject TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE, created_at TEXT NOT NULL);
 CREATE TABLE auth_requests (token_hash TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('oauth','google_profile','recovery','password_reset')), user_id TEXT REFERENCES users(id) ON DELETE CASCADE, payload TEXT, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL);
 CREATE INDEX auth_requests_user_kind ON auth_requests(user_id,kind);
 CREATE INDEX auth_requests_expiry ON auth_requests(expires_at);
 CREATE TABLE auth_rate_limits (bucket TEXT PRIMARY KEY, attempts INTEGER NOT NULL CHECK(attempts>0), expires_at INTEGER NOT NULL);
 CREATE INDEX auth_rate_limits_expiry ON auth_rate_limits(expires_at);
 PRAGMA user_version=2;
 COMMIT;`);
}

function migrateClinics(db: DatabaseSync) {
  db.exec(`BEGIN IMMEDIATE;
ALTER TABLE clinics ADD COLUMN active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1));
ALTER TABLE clinics ADD COLUMN consultation_fee INTEGER CHECK(consultation_fee >= 0);
CREATE TABLE appointments (
 id TEXT PRIMARY KEY, clinic_id TEXT NOT NULL REFERENCES clinics(id), patient_id TEXT NOT NULL REFERENCES users(id),
 scheduled_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','completed','cancelled')),
 reason TEXT NOT NULL DEFAULT '', created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX appointments_clinic_date ON appointments(clinic_id,scheduled_at,status);
CREATE INDEX appointments_patient ON appointments(patient_id,scheduled_at);
CREATE UNIQUE INDEX daily_queues_id_clinic ON daily_queues(id,clinic_id);
CREATE UNIQUE INDEX tokens_id_patient ON tokens(id,patient_id);
CREATE UNIQUE INDEX tokens_queue_id ON tokens(queue_id,id);
CREATE TABLE visits (
 id TEXT PRIMARY KEY, clinic_id TEXT NOT NULL REFERENCES clinics(id), patient_id TEXT NOT NULL REFERENCES users(id),
 doctor_id TEXT NOT NULL REFERENCES users(id), queue_id TEXT NOT NULL, token_id TEXT NOT NULL UNIQUE,
 completed_at TEXT NOT NULL,
 FOREIGN KEY(queue_id,clinic_id) REFERENCES daily_queues(id,clinic_id),
 FOREIGN KEY(queue_id,token_id) REFERENCES tokens(queue_id,id),
 FOREIGN KEY(token_id,patient_id) REFERENCES tokens(id,patient_id)
);
CREATE INDEX visits_clinic_date ON visits(clinic_id,completed_at);
CREATE INDEX visits_patient ON visits(patient_id,completed_at);
PRAGMA user_version=3; COMMIT;`);
}
