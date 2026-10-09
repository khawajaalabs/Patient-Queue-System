import type { DatabaseSync } from "node:sqlite";
export function migrate(db: DatabaseSync) {
  const version = Number(db.prepare("PRAGMA user_version").get()?.["user_version"] ?? 0);
  if (version > 7) throw new Error("This database was created by a newer QueueCare version.");
  if (version >= 1) {
    if (version === 1) migrateAuthentication(db);
    if (version < 3) migrateClinics(db);
    if (version < 4) migrateClinical(db);
    if (version < 5) migrateOperations(db);
    if (version < 6) migrateFinal(db);
    if (version < 7) migrateAvailability(db);
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
  migrateClinical(db);
  migrateOperations(db);
  migrateFinal(db);
  migrateAvailability(db);
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

function migrateClinical(db: DatabaseSync) {
  db.exec(`BEGIN IMMEDIATE;
CREATE TABLE patient_profiles (
 user_id TEXT PRIMARY KEY REFERENCES users(id), date_of_birth DATE, gender TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '',
 emergency_contact_name TEXT NOT NULL DEFAULT '', emergency_contact_phone TEXT NOT NULL DEFAULT '', blood_group TEXT NOT NULL DEFAULT '',
 allergies TEXT NOT NULL DEFAULT '', chronic_conditions TEXT NOT NULL DEFAULT '', current_medications TEXT NOT NULL DEFAULT '', general_notes TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO patient_profiles(user_id) SELECT id FROM users WHERE role='patient';
CREATE UNIQUE INDEX appointments_identity_clinic ON appointments(id,clinic_id,patient_id);
CREATE TABLE encounters (
 id TEXT PRIMARY KEY, patient_id TEXT NOT NULL REFERENCES users(id), clinic_id TEXT NOT NULL REFERENCES clinics(id), doctor_id TEXT NOT NULL REFERENCES users(id),
 appointment_id TEXT UNIQUE, token_id TEXT UNIQUE, queue_id TEXT,
 visit_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'in_progress' CHECK(status IN ('in_progress','completed')),
 reason_for_visit TEXT NOT NULL DEFAULT '', chief_complaint TEXT NOT NULL DEFAULT '', history_notes TEXT NOT NULL DEFAULT '', examination_notes TEXT NOT NULL DEFAULT '',
 diagnosis TEXT NOT NULL DEFAULT '', release_diagnosis INTEGER NOT NULL DEFAULT 0 CHECK(release_diagnosis IN(0,1)), treatment_plan TEXT NOT NULL DEFAULT '',
 follow_up_instructions TEXT NOT NULL DEFAULT '', follow_up_date DATE, private_notes TEXT NOT NULL DEFAULT '', patient_summary TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT,
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
 encounter_id TEXT PRIMARY KEY REFERENCES encounters(id), systolic REAL CHECK(systolic BETWEEN 1 AND 400), diastolic REAL CHECK(diastolic BETWEEN 1 AND 300),
 pulse REAL CHECK(pulse BETWEEN 1 AND 400), temperature REAL CHECK(temperature BETWEEN 20 AND 50), respiratory_rate REAL CHECK(respiratory_rate BETWEEN 1 AND 100),
 oxygen_saturation REAL CHECK(oxygen_saturation BETWEEN 0 AND 100), weight REAL CHECK(weight BETWEEN 0.1 AND 700), height REAL CHECK(height BETWEEN 1 AND 300)
);
CREATE TABLE prescriptions (
 id TEXT PRIMARY KEY, encounter_id TEXT NOT NULL UNIQUE REFERENCES encounters(id), doctor_id TEXT NOT NULL REFERENCES users(id), prescribed_at TEXT NOT NULL, instructions TEXT NOT NULL DEFAULT ''
);
CREATE TABLE prescription_items (
 id TEXT PRIMARY KEY, prescription_id TEXT NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE, position INTEGER NOT NULL CHECK(position>0),
 medicine TEXT NOT NULL, dose TEXT NOT NULL DEFAULT '', frequency TEXT NOT NULL DEFAULT '', duration TEXT NOT NULL DEFAULT '', instructions TEXT NOT NULL DEFAULT '', UNIQUE(prescription_id,position)
);
CREATE INDEX prescription_items_prescription ON prescription_items(prescription_id,position);
PRAGMA user_version=4; COMMIT;`);
}

function migrateOperations(db: DatabaseSync) {
  db.exec(`BEGIN IMMEDIATE;
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
PRAGMA user_version=5; COMMIT;`);
}

function migrateFinal(db: DatabaseSync) {
  db.exec(`BEGIN IMMEDIATE;
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

PRAGMA user_version=6; COMMIT;`);
}

function migrateAvailability(db: DatabaseSync) {
  db.exec(`BEGIN IMMEDIATE;
 CREATE TABLE doctor_availability (
 id TEXT PRIMARY KEY, doctor_user_id TEXT NOT NULL REFERENCES users(id), clinic_id TEXT NOT NULL REFERENCES clinics(id),
 weekday INTEGER NOT NULL CHECK(weekday BETWEEN 0 AND 6), start_time TEXT NOT NULL, end_time TEXT NOT NULL,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, CHECK(start_time<end_time), UNIQUE(doctor_user_id,clinic_id,weekday,start_time));
 CREATE INDEX doctor_availability_day ON doctor_availability(doctor_user_id,weekday,start_time,end_time);
 CREATE INDEX doctor_availability_clinic ON doctor_availability(clinic_id,weekday);
 CREATE TABLE appointment_slots (appointment_id TEXT PRIMARY KEY REFERENCES appointments(id) ON DELETE CASCADE,
 doctor_user_id TEXT NOT NULL REFERENCES users(id), duration_minutes INTEGER NOT NULL CHECK(duration_minutes BETWEEN 5 AND 120));
 PRAGMA user_version=7;
 COMMIT;`);
}
