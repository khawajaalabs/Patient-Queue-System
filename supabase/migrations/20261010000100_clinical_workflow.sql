-- Additive clinical workflow: no changes or backfill to historical tables.
SET search_path=queuecare,public;
CREATE TABLE appointment_context (appointment_id TEXT PRIMARY KEY REFERENCES appointments(id) ON DELETE CASCADE, patient_notes TEXT NOT NULL DEFAULT '' CHECK(length(patient_notes)<=2000), created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE appointment_attachments (
 id TEXT PRIMARY KEY, appointment_id TEXT NOT NULL, patient_id TEXT NOT NULL REFERENCES users(id), clinic_id TEXT NOT NULL REFERENCES clinics(id), uploaded_by TEXT NOT NULL REFERENCES users(id),
 title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 160), document_type TEXT NOT NULL CHECK(document_type IN ('lab_report','imaging_report','old_prescription','referral','medical_document','other')),
 original_filename TEXT NOT NULL, mime_type TEXT NOT NULL CHECK(mime_type IN ('application/pdf','image/jpeg','image/png')), file_size INTEGER NOT NULL CHECK(file_size BETWEEN 1 AND 10485760), storage_path TEXT NOT NULL UNIQUE,
 status TEXT NOT NULL CHECK(status IN ('pending','ready','failed','discarded')), expires_at BIGINT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 FOREIGN KEY(appointment_id,clinic_id,patient_id) REFERENCES appointments(id,clinic_id,patient_id));
CREATE INDEX appointment_attachments_owner ON appointment_attachments(appointment_id,patient_id,status);
CREATE INDEX appointment_attachments_cleanup ON appointment_attachments(status,expires_at);
CREATE TABLE medicine_catalog (
 id TEXT PRIMARY KEY, clinic_id TEXT NOT NULL REFERENCES clinics(id), name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 160), strength TEXT NOT NULL DEFAULT '', dosage_form TEXT NOT NULL DEFAULT '',
 default_dose TEXT NOT NULL DEFAULT '', default_frequency TEXT NOT NULL DEFAULT '', default_duration TEXT NOT NULL DEFAULT '', default_instructions TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)), created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX medicine_catalog_clinic ON medicine_catalog(clinic_id,active,name);
CREATE TABLE prescription_item_details (item_id TEXT PRIMARY KEY REFERENCES prescription_items(id) ON DELETE CASCADE, strength TEXT NOT NULL DEFAULT '', dosage_form TEXT NOT NULL DEFAULT '', catalog_id TEXT REFERENCES medicine_catalog(id));
ALTER TABLE appointment_context ENABLE ROW LEVEL SECURITY;
CREATE POLICY express_backend ON appointment_context FOR ALL TO queuecare_backend USING(true) WITH CHECK(true);
REVOKE ALL ON appointment_context FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON appointment_context TO queuecare_backend;

ALTER TABLE appointment_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY express_backend ON appointment_attachments FOR ALL TO queuecare_backend USING(true) WITH CHECK(true);
REVOKE ALL ON appointment_attachments FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON appointment_attachments TO queuecare_backend;

ALTER TABLE medicine_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY express_backend ON medicine_catalog FOR ALL TO queuecare_backend USING(true) WITH CHECK(true);
REVOKE ALL ON medicine_catalog FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON medicine_catalog TO queuecare_backend;

ALTER TABLE prescription_item_details ENABLE ROW LEVEL SECURITY;
CREATE POLICY express_backend ON prescription_item_details FOR ALL TO queuecare_backend USING(true) WITH CHECK(true);
REVOKE ALL ON prescription_item_details FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON prescription_item_details TO queuecare_backend;
RESET search_path;
