-- Additive multi-clinic foundation. Existing identities and queue records are unchanged.
SET search_path TO queuecare, pg_catalog;
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

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE visits ENABLE ROW LEVEL SECURITY;
CREATE POLICY express_backend ON appointments FOR ALL TO queuecare_backend USING(true) WITH CHECK(true);
CREATE POLICY express_backend ON visits FOR ALL TO queuecare_backend USING(true) WITH CHECK(true);
REVOKE ALL ON appointments,visits FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON appointments,visits TO queuecare_backend;
RESET search_path;
