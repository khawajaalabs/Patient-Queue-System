import { randomUUID } from "node:crypto";
import { atomic, one, type Database } from "../db/database.ts";
import { ApiError } from "../middleware/auth.ts";
import { audit } from "./operations.ts";
export async function ensureAppointmentQueue(
  db: Database,
  clinicId: string,
  day: string,
  actor: string,
) {
  const existing = await one<{ id: string }>(
    db,
    "SELECT id FROM daily_queues WHERE clinic_id=? AND queue_date=?",
    clinicId,
    day,
  );
  if (existing) return existing.id;
  const id = randomUUID(),
    stamp = new Date().toISOString();
  await db
    .prepare("INSERT INTO daily_queues VALUES (?,?,?,?,?,?,?,?,?,?,?)")
    .run(id, clinicId, day, "open", 1, null, stamp, null, actor, stamp, stamp);
  return id;
}
export async function appointmentToken(db: Database, appointmentId: string) {
  return atomic(db, async () => {
    const existing = await one<{ id: string; token_code: string }>(
      db,
      "SELECT id,token_code FROM tokens WHERE appointment_id=?",
      appointmentId,
    );
    if (existing) return { id: existing.id, tokenCode: existing.token_code };
    const a = await one<{
      patient_id: string;
      clinic_id: string;
      scheduled_at: string;
      status: string;
      reason: string;
      created_by: string;
    }>(db, "SELECT * FROM appointments WHERE id=?", appointmentId);
    if (!a || ["cancelled", "completed"].includes(a.status))
      throw new ApiError(
        409,
        "APPOINTMENT_REQUIRED",
        "A valid appointment is required for a token.",
      );
    const c = await one<{ active: number; token_prefix: string; department: string }>(
      db,
      "SELECT * FROM clinics WHERE id=?",
      a.clinic_id,
    );
    if (!c?.active) throw new ApiError(409, "CLINIC_INACTIVE", "This clinic is inactive.");
    const qid = await ensureAppointmentQueue(
      db,
      a.clinic_id,
      a.scheduled_at.slice(0, 10),
      a.created_by,
    );
    const q = await one<{ next_token_number: number }>(
      db,
      "SELECT next_token_number FROM daily_queues WHERE id=?",
      qid,
    );
    const number = q!.next_token_number;
    if (number > 999) throw new ApiError(409, "QUEUE_FULL", "This appointment queue is full.");
    const order = (await one<{ n: number }>(
      db,
      "SELECT COALESCE(MAX(queue_order),0)+1 n FROM tokens WHERE queue_id=?",
      qid,
    ))!.n;
    const id = randomUUID(),
      stamp = new Date().toISOString(),
      code = `${c.token_prefix}-${String(number).padStart(3, "0")}`;
    await db
      .prepare(
        "INSERT INTO tokens (id,queue_id,patient_id,appointment_id,token_number,token_code,queue_order,department,reason_for_visit,status,joined_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
      )
      .run(
        id,
        qid,
        a.patient_id,
        appointmentId,
        number,
        code,
        order,
        c.department,
        a.reason,
        "waiting",
        stamp,
        stamp,
        stamp,
      );
    await db
      .prepare(
        "UPDATE daily_queues SET next_token_number=next_token_number+1,updated_at=? WHERE id=?",
      )
      .run(stamp, qid);
    return { id, tokenCode: code };
  });
}
export async function giveUpToken(db: Database, patientId: string, tokenId: string) {
  return atomic(db, async () => {
    const t = await one<{ id: string; appointment_id: string; status: string; clinic_id: string }>(
      db,
      "SELECT t.*,q.clinic_id FROM tokens t JOIN daily_queues q ON q.id=t.queue_id WHERE t.id=? AND t.patient_id=? AND t.appointment_id IS NOT NULL",
      tokenId,
      patientId,
    );
    if (!t) throw new ApiError(404, "NOT_FOUND", "Token not found.");
    if (t.status === "cancelled") return { id: t.id };
    if (
      !["waiting", "skipped"].includes(t.status) ||
      (await one(
        db,
        "SELECT id FROM encounters WHERE token_id=? OR appointment_id=?",
        t.id,
        t.appointment_id,
      ))
    )
      throw new ApiError(409, "INVALID_STATUS", "This token can no longer be given up.");
    const stamp = new Date().toISOString();
    await db
      .prepare("UPDATE appointments SET status='cancelled',updated_at=? WHERE id=?")
      .run(stamp, t.appointment_id);
    await db
      .prepare(
        "INSERT INTO appointment_workflow VALUES (?,?,?) ON CONFLICT(appointment_id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at",
      )
      .run(t.appointment_id, "cancelled", stamp);
    await audit(db, patientId, "token.given_up", "token", t.id, t.clinic_id);
    return { id: t.id };
  });
}
