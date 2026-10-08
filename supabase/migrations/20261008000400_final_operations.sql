SET search_path=queuecare,pg_catalog;
CREATE TABLE doctor_profiles (
 user_id TEXT PRIMARY KEY REFERENCES users(id), full_name TEXT NOT NULL DEFAULT '', title TEXT NOT NULL DEFAULT '', specialty TEXT NOT NULL DEFAULT '', license TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', photo_url TEXT NOT NULL DEFAULT '', signature_url TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL
);
CREATE TABLE clinic_branding (
 clinic_id TEXT PRIMARY KEY REFERENCES clinics(id), email TEXT NOT NULL DEFAULT '', logo_url TEXT NOT NULL DEFAULT '', footer TEXT NOT NULL DEFAULT '', slot_minutes INTEGER NOT NULL DEFAULT 15 CHECK(slot_minutes BETWEEN 5 AND 120), updated_at TEXT NOT NULL
);
CREATE TABLE appointment_workflow (
 appointment_id TEXT PRIMARY KEY REFERENCES appointments(id), status TEXT NOT NULL CHECK(status IN ('scheduled','confirmed','checked_in','cancelled','no_show')), updated_at TEXT NOT NULL
);
CREATE TABLE follow_up_actions (
 encounter_id TEXT PRIMARY KEY REFERENCES encounters(id), follow_up_date TEXT, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','contacted','booked','completed')), appointment_id TEXT REFERENCES appointments(id), updated_by TEXT NOT NULL REFERENCES users(id), updated_at TEXT NOT NULL
);
CREATE TABLE email_delivery_log (
 id TEXT PRIMARY KEY, notification_id TEXT NOT NULL UNIQUE REFERENCES notifications(id), user_id TEXT NOT NULL REFERENCES users(id), status TEXT NOT NULL CHECK(status IN ('pending','sent','failed')), attempts INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, sent_at TEXT
);
CREATE INDEX follow_up_date_status ON follow_up_actions(follow_up_date,status);
CREATE INDEX email_delivery_pending ON email_delivery_log(status,created_at);
ALTER TABLE doctor_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY express_backend ON doctor_profiles FOR ALL TO queuecare_backend USING(true) WITH CHECK(true);
REVOKE ALL ON doctor_profiles FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON doctor_profiles TO queuecare_backend;
ALTER TABLE clinic_branding ENABLE ROW LEVEL SECURITY;
CREATE POLICY express_backend ON clinic_branding FOR ALL TO queuecare_backend USING(true) WITH CHECK(true);
REVOKE ALL ON clinic_branding FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON clinic_branding TO queuecare_backend;
ALTER TABLE appointment_workflow ENABLE ROW LEVEL SECURITY;
CREATE POLICY express_backend ON appointment_workflow FOR ALL TO queuecare_backend USING(true) WITH CHECK(true);
REVOKE ALL ON appointment_workflow FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON appointment_workflow TO queuecare_backend;
ALTER TABLE follow_up_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY express_backend ON follow_up_actions FOR ALL TO queuecare_backend USING(true) WITH CHECK(true);
REVOKE ALL ON follow_up_actions FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON follow_up_actions TO queuecare_backend;
ALTER TABLE email_delivery_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY express_backend ON email_delivery_log FOR ALL TO queuecare_backend USING(true) WITH CHECK(true);
REVOKE ALL ON email_delivery_log FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON email_delivery_log TO queuecare_backend;
RESET search_path;
