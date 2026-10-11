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
