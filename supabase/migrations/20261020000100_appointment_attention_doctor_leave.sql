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
