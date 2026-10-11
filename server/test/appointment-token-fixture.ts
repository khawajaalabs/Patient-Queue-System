import { randomUUID } from "node:crypto";
import { atomic, one, type Database, type UserRow } from "../db/database.ts";
import { appointmentToken } from "../services/appointment-tokens.ts";
import { clinicDayKey } from "../../src/domain/queue.js";
import { patientState } from "../services/queueService.ts";
/** Appointment fixture for queue regressions; availability itself is tested through the booking API. */
export async function bookedToken(
  db: Database,
  patient: UserRow,
  clinicId = "northstar",
  reason = "",
  reuse = true,
) {
  return atomic(db, async () => {
    const day = clinicDayKey();
    const existing = reuse
      ? await one<{ id: string }>(
          db,
          "SELECT a.id FROM appointments a JOIN tokens t ON t.appointment_id=a.id WHERE a.patient_id=? AND a.clinic_id=? AND substr(a.scheduled_at,1,10)=? AND a.status='scheduled' AND t.status IN ('waiting','serving','skipped') ORDER BY a.scheduled_at LIMIT 1",
          patient.id,
          clinicId,
          day,
        )
      : undefined;
    const id = existing?.id ?? randomUUID();
    if (!existing) {
      const n = (await one<{ n: number }>(
        db,
        "SELECT COUNT(*) n FROM appointments WHERE substr(scheduled_at,1,10)=?",
        day,
      ))!.n;
      const time =
          String(9 + Math.floor(n / 60)).padStart(2, "0") + ":" + String(n % 60).padStart(2, "0"),
        stamp = new Date().toISOString();
      await db
        .prepare("INSERT INTO appointments VALUES (?,?,?,?,?,?,?,?,?)")
        .run(
          id,
          clinicId,
          patient.id,
          day + "T" + time,
          "scheduled",
          reason,
          patient.id,
          stamp,
          stamp,
        );
    }
    const token = await appointmentToken(db, id);
    const history = (await patientState(db, patient.id, clinicId)).history;
    return history.find((t) => t.id === token.id)!;
  });
}
