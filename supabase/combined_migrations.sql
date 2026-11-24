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
-- Phase 3: additive operations, private documents and financial tracking. Existing rows untouched.
SET search_path TO queuecare, pg_catalog;
CREATE TABLE staff_profiles (user_id TEXT PRIMARY KEY REFERENCES users(id), role TEXT NOT NULL CHECK(role IN ('receptionist','nurse')), active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_activity_at TEXT);
CREATE TABLE staff_clinics (staff_id TEXT NOT NULL REFERENCES staff_profiles(user_id), clinic_id TEXT NOT NULL REFERENCES clinics(id), PRIMARY KEY(staff_id,clinic_id));
CREATE INDEX staff_clinics_clinic ON staff_clinics(clinic_id,staff_id);
CREATE UNIQUE INDEX encounters_identity_clinic_patient ON encounters(id,clinic_id,patient_id);
CREATE TABLE patient_documents (id TEXT PRIMARY KEY, patient_id TEXT NOT NULL REFERENCES users(id), clinic_id TEXT NOT NULL REFERENCES clinics(id), visit_id TEXT, uploaded_by TEXT NOT NULL REFERENCES users(id), document_type TEXT NOT NULL CHECK(document_type IN ('lab_report','imaging_report','referral','medical_document','other')), title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', storage_path TEXT NOT NULL UNIQUE, original_filename TEXT NOT NULL, mime_type TEXT NOT NULL CHECK(mime_type IN ('application/pdf','image/jpeg','image/png')), file_size INTEGER NOT NULL CHECK(file_size>0 AND file_size<=10485760), patient_visible INTEGER NOT NULL DEFAULT 0 CHECK(patient_visible IN(0,1)), status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','ready')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(visit_id,clinic_id,patient_id) REFERENCES encounters(id,clinic_id,patient_id));
CREATE INDEX documents_patient ON patient_documents(patient_id,status,patient_visible,created_at);
CREATE INDEX documents_clinic ON patient_documents(clinic_id,created_at);
CREATE TABLE invoices (id TEXT PRIMARY KEY, invoice_number TEXT NOT NULL UNIQUE, patient_id TEXT NOT NULL REFERENCES users(id), clinic_id TEXT NOT NULL REFERENCES clinics(id), visit_id TEXT, appointment_id TEXT, status TEXT NOT NULL CHECK(status IN ('draft','unpaid','partially_paid','paid','void')), subtotal INTEGER NOT NULL CHECK(subtotal>=0), discount INTEGER NOT NULL CHECK(discount>=0 AND discount<=subtotal), total INTEGER NOT NULL CHECK(total=subtotal-discount), amount_paid INTEGER NOT NULL DEFAULT 0 CHECK(amount_paid>=0 AND amount_paid<=total), balance INTEGER NOT NULL CHECK(balance=total-amount_paid), issued_at TEXT, due_at TEXT, created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(visit_id,clinic_id,patient_id) REFERENCES encounters(id,clinic_id,patient_id), FOREIGN KEY(appointment_id,clinic_id,patient_id) REFERENCES appointments(id,clinic_id,patient_id));
CREATE INDEX invoices_clinic ON invoices(clinic_id,created_at);
CREATE INDEX invoices_patient ON invoices(patient_id,created_at);
CREATE TABLE invoice_items (id TEXT PRIMARY KEY, invoice_id TEXT NOT NULL REFERENCES invoices(id), position INTEGER NOT NULL, description TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity>0 AND quantity<=1000), unit_price INTEGER NOT NULL CHECK(unit_price>=0), total INTEGER NOT NULL CHECK(total=quantity*unit_price), UNIQUE(invoice_id,position));
CREATE TABLE payments (id TEXT PRIMARY KEY, invoice_id TEXT NOT NULL REFERENCES invoices(id), amount INTEGER NOT NULL CHECK(amount>0), method TEXT NOT NULL CHECK(method IN ('cash','card','bank_transfer','other')), reference TEXT NOT NULL DEFAULT '', paid_at TEXT NOT NULL, recorded_by TEXT NOT NULL REFERENCES users(id), request_id TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL);
CREATE INDEX payments_invoice ON payments(invoice_id,paid_at);
CREATE TABLE notifications (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), type TEXT NOT NULL, title TEXT NOT NULL, message TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, clinic_id TEXT REFERENCES clinics(id), read_at TEXT, created_at TEXT NOT NULL, UNIQUE(user_id,type,entity_id));
CREATE INDEX notifications_user ON notifications(user_id,created_at);
CREATE TABLE audit_logs (id TEXT PRIMARY KEY, actor_user_id TEXT NOT NULL REFERENCES users(id), action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, clinic_id TEXT REFERENCES clinics(id), detail TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
CREATE INDEX audit_clinic_date ON audit_logs(clinic_id,created_at);
CREATE INDEX audit_actor_date ON audit_logs(actor_user_id,created_at);
ALTER TABLE staff_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY express_backend ON staff_profiles FOR ALL TO queuecare_backend USING(true) WITH CHECK(true);
REVOKE ALL ON staff_profiles FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON staff_profiles TO queuecare_backend;
ALTER TABLE staff_clinics ENABLE ROW LEVEL SECURITY;
CREATE POLICY express_backend ON staff_clinics FOR ALL TO queuecare_backend USING(true) WITH CHECK(true);
REVOKE ALL ON staff_clinics FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON staff_clinics TO queuecare_backend;
ALTER TABLE patient_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY express_backend ON patient_documents FOR ALL TO queuecare_backend USING(true) WITH CHECK(true);
REVOKE ALL ON patient_documents FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON patient_documents TO queuecare_backend;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY express_backend ON invoices FOR ALL TO queuecare_backend USING(true) WITH CHECK(true);
REVOKE ALL ON invoices FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON invoices TO queuecare_backend;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY express_backend ON invoice_items FOR ALL TO queuecare_backend USING(true) WITH CHECK(true);
REVOKE ALL ON invoice_items FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON invoice_items TO queuecare_backend;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY express_backend ON payments FOR ALL TO queuecare_backend USING(true) WITH CHECK(true);
REVOKE ALL ON payments FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON payments TO queuecare_backend;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY express_backend ON notifications FOR ALL TO queuecare_backend USING(true) WITH CHECK(true);
REVOKE ALL ON notifications FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON notifications TO queuecare_backend;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY express_backend ON audit_logs FOR ALL TO queuecare_backend USING(true) WITH CHECK(true);
REVOKE ALL ON audit_logs FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON audit_logs TO queuecare_backend;
RESET search_path;
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
SET search_path=queuecare,pg_catalog;
CREATE TABLE doctor_availability (
 id TEXT PRIMARY KEY,
 doctor_user_id TEXT NOT NULL REFERENCES users(id),
 clinic_id TEXT NOT NULL REFERENCES clinics(id),
 weekday INTEGER NOT NULL CHECK(weekday BETWEEN 0 AND 6),
 start_time TEXT NOT NULL CHECK(start_time ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'),
 end_time TEXT NOT NULL CHECK(end_time ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 CHECK(start_time<end_time), UNIQUE(doctor_user_id,clinic_id,weekday,start_time)
);
CREATE INDEX doctor_availability_day ON doctor_availability(doctor_user_id,weekday,start_time,end_time);
CREATE INDEX doctor_availability_clinic ON doctor_availability(clinic_id,weekday);
CREATE TABLE appointment_slots (
 appointment_id TEXT PRIMARY KEY REFERENCES appointments(id) ON DELETE CASCADE,
 doctor_user_id TEXT NOT NULL REFERENCES users(id),
 duration_minutes INTEGER NOT NULL CHECK(duration_minutes BETWEEN 5 AND 120)
);
-- Use the same transaction lock as Express: direct concurrent schedule writes cannot overlap.
CREATE FUNCTION validate_doctor_availability() RETURNS trigger LANGUAGE plpgsql SET search_path=queuecare,pg_catalog AS $$
DECLARE c RECORD;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext(TG_TABLE_SCHEMA || ':queue'));
 SELECT * INTO c FROM clinics WHERE id=NEW.clinic_id;
 IF c.active<>1 OR NEW.start_time<c.opening_time OR NEW.end_time>c.closing_time THEN
  RAISE EXCEPTION 'Doctor availability must fit within an active clinic''s opening hours';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.doctor_user_id AND role='admin') THEN
  RAISE EXCEPTION 'Doctor must be an administrator';
 END IF;
 IF EXISTS(SELECT 1 FROM doctor_availability a WHERE a.id<>NEW.id AND a.doctor_user_id=NEW.doctor_user_id AND a.weekday=NEW.weekday AND a.start_time<NEW.end_time AND a.end_time>NEW.start_time) THEN
  RAISE EXCEPTION 'Doctor availability overlaps another window';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER doctor_availability_validation BEFORE INSERT OR UPDATE ON doctor_availability FOR EACH ROW EXECUTE FUNCTION validate_doctor_availability();
ALTER TABLE doctor_availability ENABLE ROW LEVEL SECURITY;
CREATE POLICY express_backend ON doctor_availability FOR ALL TO queuecare_backend USING(true) WITH CHECK(true);
REVOKE ALL ON doctor_availability FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON doctor_availability TO queuecare_backend;
ALTER TABLE appointment_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY express_backend ON appointment_slots FOR ALL TO queuecare_backend USING(true) WITH CHECK(true);
REVOKE ALL ON appointment_slots FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON appointment_slots TO queuecare_backend;
REVOKE ALL ON FUNCTION validate_doctor_availability() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION validate_doctor_availability() TO queuecare_backend;
RESET search_path;
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
SET search_path TO queuecare,pg_catalog;
ALTER TABLE clinics ADD COLUMN city TEXT CHECK(city IS NULL OR length(city)<=120);
ALTER TABLE clinics ADD COLUMN area TEXT CHECK(area IS NULL OR length(area)<=120);
CREATE INDEX clinics_location ON clinics(city,area,active);
CREATE TABLE conditions (id TEXT PRIMARY KEY, name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 120), normalized_name TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)), created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE patient_conditions (id TEXT PRIMARY KEY, patient_id TEXT NOT NULL REFERENCES users(id), condition_id TEXT NOT NULL REFERENCES conditions(id), source TEXT NOT NULL DEFAULT 'manual' CHECK(source='manual'), recorded_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(patient_id,condition_id));
CREATE INDEX patient_conditions_condition ON patient_conditions(condition_id,patient_id);
CREATE INDEX patient_conditions_patient ON patient_conditions(patient_id,created_at);
ALTER TABLE conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_conditions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON conditions,patient_conditions FROM PUBLIC,anon,authenticated;
CREATE POLICY express_backend ON conditions FOR ALL TO queuecare_backend USING(true) WITH CHECK(true);
CREATE POLICY express_backend ON patient_conditions FOR ALL TO queuecare_backend USING(true) WITH CHECK(true);
GRANT SELECT,INSERT,UPDATE,DELETE ON conditions,patient_conditions TO queuecare_backend;
RESET search_path;
SET search_path TO queuecare,pg_catalog;
ALTER TABLE tokens ADD COLUMN appointment_id TEXT REFERENCES appointments(id);
DROP INDEX one_serving_visit;
CREATE UNIQUE INDEX one_serving_appointment ON tokens(queue_id) WHERE appointment_id IS NOT NULL AND status='serving';
CREATE UNIQUE INDEX tokens_appointment_unique ON tokens(appointment_id) WHERE appointment_id IS NOT NULL;
DROP INDEX one_active_visit;
CREATE UNIQUE INDEX one_active_legacy_visit ON tokens(queue_id,patient_id) WHERE appointment_id IS NULL AND status IN ('waiting','serving','skipped');

CREATE FUNCTION check_appointment_token() RETURNS trigger LANGUAGE plpgsql SET search_path=queuecare,pg_catalog AS $$
BEGIN
 IF TG_OP='UPDATE' AND OLD.appointment_id IS NOT NULL AND NEW.appointment_id IS DISTINCT FROM OLD.appointment_id THEN RAISE EXCEPTION 'Appointment token linkage is immutable'; END IF;
 IF NEW.appointment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM appointments a JOIN daily_queues q ON q.id=NEW.queue_id WHERE a.id=NEW.appointment_id AND a.patient_id=NEW.patient_id AND a.clinic_id=q.clinic_id AND substr(a.scheduled_at,1,10)=q.queue_date) THEN RAISE EXCEPTION 'Appointment token identity mismatch'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER tokens_appointment_identity BEFORE INSERT OR UPDATE ON tokens FOR EACH ROW EXECUTE FUNCTION check_appointment_token();
CREATE FUNCTION sync_appointment_token() RETURNS trigger LANGUAGE plpgsql SET search_path=queuecare,pg_catalog AS $$
DECLARE target daily_queues%ROWTYPE; seq integer; ord integer; prefix text;
BEGIN
 IF EXISTS(SELECT 1 FROM tokens WHERE appointment_id=OLD.id) THEN
 IF NEW.patient_id<>OLD.patient_id OR NEW.clinic_id<>OLD.clinic_id OR (OLD.status='cancelled' AND NEW.status<>'cancelled') OR ((NEW.scheduled_at<>OLD.scheduled_at OR NEW.status='cancelled') AND EXISTS(SELECT 1 FROM tokens WHERE appointment_id=OLD.id AND status IN ('serving','completed'))) THEN RAISE EXCEPTION 'Appointment token cannot be changed in this state'; END IF;
 IF substr(NEW.scheduled_at,1,10)<>substr(OLD.scheduled_at,1,10) THEN
 SELECT * INTO target FROM daily_queues WHERE clinic_id=NEW.clinic_id AND queue_date=substr(NEW.scheduled_at,1,10) FOR UPDATE;
 IF target.id IS NULL THEN RAISE EXCEPTION 'Appointment queue required'; END IF;
 seq:=target.next_token_number;
 IF seq>999 THEN RAISE EXCEPTION 'Appointment queue full'; END IF;
 SELECT COALESCE(MAX(queue_order),0)+1 INTO ord FROM tokens WHERE queue_id=target.id;
 SELECT token_prefix INTO prefix FROM clinics WHERE id=NEW.clinic_id;
 UPDATE tokens SET queue_id=target.id,token_number=seq,token_code=prefix||'-'||lpad(seq::text,3,'0'),queue_order=ord,updated_at=NEW.updated_at WHERE appointment_id=NEW.id;
 UPDATE daily_queues SET next_token_number=seq+1,updated_at=NEW.updated_at WHERE id=target.id;
 END IF;
 IF NEW.status='completed' THEN UPDATE tokens SET status='completed',completed_at=COALESCE(completed_at,NEW.updated_at),updated_at=NEW.updated_at WHERE appointment_id=NEW.id; END IF;
 IF NEW.status='cancelled' THEN UPDATE tokens SET status='cancelled',cancelled_at=NEW.updated_at,updated_at=NEW.updated_at WHERE appointment_id=NEW.id; END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER appointment_token_sync AFTER UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION sync_appointment_token();
REVOKE ALL ON FUNCTION check_appointment_token(),sync_appointment_token() FROM PUBLIC,anon,authenticated;
-- Preserve append-only audit permissions: the foreign-key action clears only the deleted clinic pointer.
ALTER TABLE audit_logs DROP CONSTRAINT audit_logs_clinic_id_fkey;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_clinic_id_fkey FOREIGN KEY(clinic_id) REFERENCES clinics(id) ON DELETE SET NULL;
RESET search_path;
SET search_path=queuecare,pg_catalog;
CREATE TABLE appointment_attention (appointment_id TEXT PRIMARY KEY REFERENCES appointments(id) ON DELETE CASCADE, priority TEXT NOT NULL DEFAULT 'routine' CHECK(priority IN ('routine','urgent','critical')));
CREATE TABLE appointment_attention_tags (appointment_id TEXT NOT NULL REFERENCES appointments(id) ON DELETE CASCADE, tag TEXT NOT NULL CHECK(tag IN ('follow_up','needs_assistance','special_attention','review_required')), PRIMARY KEY(appointment_id,tag));
CREATE TABLE doctor_leave (id TEXT PRIMARY KEY, doctor_user_id TEXT NOT NULL REFERENCES users(id), start_date TEXT NOT NULL, end_date TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '' CHECK(length(reason)<=300), created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, CHECK(start_date<=end_date), UNIQUE(doctor_user_id,start_date,end_date));
CREATE INDEX doctor_leave_dates ON doctor_leave(doctor_user_id,start_date,end_date);

-- The existing backend transaction lock serializes leave against bookings and rescheduling.
CREATE FUNCTION validate_doctor_leave() RETURNS trigger LANGUAGE plpgsql SET search_path=queuecare,pg_catalog AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext(TG_TABLE_SCHEMA || ':queue'));
 IF NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.doctor_user_id AND role='admin') OR NEW.start_date !~ '^\d{4}-\d{2}-\d{2}$' OR NEW.end_date !~ '^\d{4}-\d{2}-\d{2}$' OR NEW.start_date::date::text<>NEW.start_date OR NEW.end_date::date::text<>NEW.end_date THEN RAISE EXCEPTION 'Invalid doctor leave'; END IF;
 IF EXISTS(SELECT 1 FROM doctor_leave WHERE id<>NEW.id AND doctor_user_id=NEW.doctor_user_id AND start_date<=NEW.end_date AND end_date>=NEW.start_date) THEN RAISE EXCEPTION 'Doctor leave overlaps an existing entry'; END IF;
 IF EXISTS(SELECT 1 FROM appointments a LEFT JOIN appointment_workflow w ON w.appointment_id=a.id WHERE substr(a.scheduled_at,1,10) BETWEEN NEW.start_date AND NEW.end_date AND a.status NOT IN ('cancelled','completed') AND COALESCE(w.status,a.status) NOT IN ('cancelled','completed','no_show')) THEN RAISE EXCEPTION 'Existing appointments require attention before leave'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER doctor_leave_validation BEFORE INSERT OR UPDATE ON doctor_leave FOR EACH ROW EXECUTE FUNCTION validate_doctor_leave();
CREATE FUNCTION block_appointments_during_leave() RETURNS trigger LANGUAGE plpgsql SET search_path=queuecare,pg_catalog AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext(TG_TABLE_SCHEMA || ':queue'));
 IF NEW.status NOT IN ('cancelled','completed') AND EXISTS(SELECT 1 FROM doctor_leave WHERE start_date<=substr(NEW.scheduled_at,1,10) AND end_date>=substr(NEW.scheduled_at,1,10)) THEN RAISE EXCEPTION 'Doctor is on leave on this date'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER appointment_leave_validation BEFORE INSERT OR UPDATE OF scheduled_at,status,clinic_id ON appointments FOR EACH ROW EXECUTE FUNCTION block_appointments_during_leave();
ALTER TABLE appointment_attention ENABLE ROW LEVEL SECURITY;
CREATE POLICY express_backend ON appointment_attention FOR ALL TO queuecare_backend USING(true) WITH CHECK(true);
REVOKE ALL ON appointment_attention FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON appointment_attention TO queuecare_backend;
ALTER TABLE appointment_attention_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY express_backend ON appointment_attention_tags FOR ALL TO queuecare_backend USING(true) WITH CHECK(true);
REVOKE ALL ON appointment_attention_tags FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON appointment_attention_tags TO queuecare_backend;
ALTER TABLE doctor_leave ENABLE ROW LEVEL SECURITY;
CREATE POLICY express_backend ON doctor_leave FOR ALL TO queuecare_backend USING(true) WITH CHECK(true);
REVOKE ALL ON doctor_leave FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON doctor_leave TO queuecare_backend;
REVOKE ALL ON FUNCTION validate_doctor_leave(),block_appointments_during_leave() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION validate_doctor_leave(),block_appointments_during_leave() TO queuecare_backend;
RESET search_path;
