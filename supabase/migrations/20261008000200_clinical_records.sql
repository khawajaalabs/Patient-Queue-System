-- Additive clinical records; original operational visits and all existing IDs are preserved.
SET search_path TO queuecare, pg_catalog;
CREATE TABLE patient_profiles (
 user_id TEXT PRIMARY KEY REFERENCES users(id), date_of_birth DATE, gender TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '',
 emergency_contact_name TEXT NOT NULL DEFAULT '', emergency_contact_phone TEXT NOT NULL DEFAULT '', blood_group TEXT NOT NULL DEFAULT '',
 allergies TEXT NOT NULL DEFAULT '', chronic_conditions TEXT NOT NULL DEFAULT '', current_medications TEXT NOT NULL DEFAULT '', general_notes TEXT NOT NULL DEFAULT '', updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO patient_profiles(user_id) SELECT id FROM users WHERE role='patient';
CREATE UNIQUE INDEX appointments_identity_clinic ON appointments(id,clinic_id,patient_id);
CREATE TABLE encounters (
 id TEXT PRIMARY KEY, patient_id TEXT NOT NULL REFERENCES users(id), clinic_id TEXT NOT NULL REFERENCES clinics(id), doctor_id TEXT NOT NULL REFERENCES users(id),
 appointment_id TEXT UNIQUE, token_id TEXT UNIQUE, queue_id TEXT,
 visit_at TIMESTAMPTZ NOT NULL, status TEXT NOT NULL DEFAULT 'in_progress' CHECK(status IN ('in_progress','completed')),
 reason_for_visit TEXT NOT NULL DEFAULT '', chief_complaint TEXT NOT NULL DEFAULT '', history_notes TEXT NOT NULL DEFAULT '', examination_notes TEXT NOT NULL DEFAULT '',
 diagnosis TEXT NOT NULL DEFAULT '', release_diagnosis INTEGER NOT NULL DEFAULT 0 CHECK(release_diagnosis IN(0,1)), treatment_plan TEXT NOT NULL DEFAULT '',
 follow_up_instructions TEXT NOT NULL DEFAULT '', follow_up_date DATE, private_notes TEXT NOT NULL DEFAULT '', patient_summary TEXT NOT NULL DEFAULT '',
 created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL, completed_at TIMESTAMPTZ,
 CHECK((status='completed' AND completed_at IS NOT NULL) OR (status='in_progress' AND completed_at IS NULL)),
 CHECK((token_id IS NULL AND queue_id IS NULL) OR (token_id IS NOT NULL AND queue_id IS NOT NULL)),
 FOREIGN KEY(appointment_id,clinic_id,patient_id) REFERENCES appointments(id,clinic_id,patient_id),
 FOREIGN KEY(queue_id,clinic_id) REFERENCES daily_queues(id,clinic_id),
 FOREIGN KEY(queue_id,token_id) REFERENCES tokens(queue_id,id), FOREIGN KEY(token_id,patient_id) REFERENCES tokens(id,patient_id)
);
CREATE UNIQUE INDEX encounter_active_patient_clinic ON encounters(patient_id,clinic_id) WHERE status='in_progress';
CREATE INDEX encounter_patient_timeline ON encounters(patient_id,visit_at DESC);
CREATE INDEX encounter_clinic_status ON encounters(clinic_id,status,visit_at);
CREATE TABLE visit_vitals (
 encounter_id TEXT PRIMARY KEY REFERENCES encounters(id), systolic DOUBLE PRECISION CHECK(systolic BETWEEN 1 AND 400), diastolic DOUBLE PRECISION CHECK(diastolic BETWEEN 1 AND 300),
 pulse DOUBLE PRECISION CHECK(pulse BETWEEN 1 AND 400), temperature DOUBLE PRECISION CHECK(temperature BETWEEN 20 AND 50), respiratory_rate DOUBLE PRECISION CHECK(respiratory_rate BETWEEN 1 AND 100),
 oxygen_saturation DOUBLE PRECISION CHECK(oxygen_saturation BETWEEN 0 AND 100), weight DOUBLE PRECISION CHECK(weight BETWEEN 0.1 AND 700), height DOUBLE PRECISION CHECK(height BETWEEN 1 AND 300)
);
CREATE TABLE prescriptions (
 id TEXT PRIMARY KEY, encounter_id TEXT NOT NULL UNIQUE REFERENCES encounters(id), doctor_id TEXT NOT NULL REFERENCES users(id), prescribed_at TIMESTAMPTZ NOT NULL, instructions TEXT NOT NULL DEFAULT ''
);
CREATE TABLE prescription_items (
 id TEXT PRIMARY KEY, prescription_id TEXT NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE, position INTEGER NOT NULL CHECK(position>0),
 medicine TEXT NOT NULL, dose TEXT NOT NULL DEFAULT '', frequency TEXT NOT NULL DEFAULT '', duration TEXT NOT NULL DEFAULT '', instructions TEXT NOT NULL DEFAULT '', UNIQUE(prescription_id,position)
);
CREATE INDEX prescription_items_prescription ON prescription_items(prescription_id,position);
ALTER TABLE patient_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY express_backend ON patient_profiles FOR ALL TO queuecare_backend USING(true) WITH CHECK(true);
REVOKE ALL ON patient_profiles FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON patient_profiles TO queuecare_backend;
ALTER TABLE encounters ENABLE ROW LEVEL SECURITY;
CREATE POLICY express_backend ON encounters FOR ALL TO queuecare_backend USING(true) WITH CHECK(true);
REVOKE ALL ON encounters FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON encounters TO queuecare_backend;
ALTER TABLE visit_vitals ENABLE ROW LEVEL SECURITY;
CREATE POLICY express_backend ON visit_vitals FOR ALL TO queuecare_backend USING(true) WITH CHECK(true);
REVOKE ALL ON visit_vitals FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON visit_vitals TO queuecare_backend;
ALTER TABLE prescriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY express_backend ON prescriptions FOR ALL TO queuecare_backend USING(true) WITH CHECK(true);
REVOKE ALL ON prescriptions FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON prescriptions TO queuecare_backend;
ALTER TABLE prescription_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY express_backend ON prescription_items FOR ALL TO queuecare_backend USING(true) WITH CHECK(true);
REVOKE ALL ON prescription_items FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON prescription_items TO queuecare_backend;
RESET search_path;
