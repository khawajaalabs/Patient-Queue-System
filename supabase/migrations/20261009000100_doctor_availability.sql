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
