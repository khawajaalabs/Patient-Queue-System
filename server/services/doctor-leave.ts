import { randomUUID } from "node:crypto";
import { z } from "zod";
import { atomic, many, one, type Database } from "../db/database.ts";
import { ApiError } from "../middleware/auth.ts";
import { audit } from "./operations.ts";
import { availabilityDate, primaryDoctor } from "./availability.ts";
import { clinicDayKey } from "../../src/domain/queue.js";
const range = z
  .object({ startDate: availabilityDate, endDate: availabilityDate })
  .strict()
  .refine(
    (v) =>
      v.startDate <= v.endDate &&
      +new Date(v.endDate + "T12:00:00Z") - +new Date(v.startDate + "T12:00:00Z") <= 366 * 86400000,
    "Choose an ordered date range up to one year.",
  );
export async function leaveConflicts(db: Database, input: unknown) {
  const r = range.parse(input);
  return many(
    db,
    "SELECT a.id,a.clinic_id AS \"clinicId\",c.name AS \"clinicName\",u.full_name AS \"patientName\",a.scheduled_at AS \"scheduledAt\" FROM appointments a JOIN clinics c ON c.id=a.clinic_id JOIN users u ON u.id=a.patient_id LEFT JOIN appointment_workflow w ON w.appointment_id=a.id WHERE substr(a.scheduled_at,1,10) BETWEEN ? AND ? AND a.status NOT IN ('cancelled','completed') AND COALESCE(w.status,a.status) NOT IN ('cancelled','completed','no_show') ORDER BY a.scheduled_at,a.id",
    r.startDate,
    r.endDate,
  );
}
export async function doctorLeave(db: Database) {
  return many<{ id: string; startDate: string; endDate: string; reason: string }>(
    db,
    'SELECT id,start_date AS "startDate",end_date AS "endDate",reason FROM doctor_leave WHERE doctor_user_id=? ORDER BY start_date DESC,id',
    await primaryDoctor(db),
  );
}
export async function createDoctorLeave(db: Database, actor: string, input: unknown) {
  const { reason, ...dates } = z
    .object({
      startDate: availabilityDate,
      endDate: availabilityDate,
      reason: z.string().trim().max(300).default(""),
    })
    .strict()
    .parse(input);
  const r = range.parse(dates);
  if (r.startDate < clinicDayKey())
    throw new ApiError(400, "PAST_LEAVE", "Choose today or a future date.");
  return atomic(db, async () => {
    const doctor = await primaryDoctor(db);
    if (
      await one(
        db,
        "SELECT id FROM doctor_leave WHERE doctor_user_id=? AND start_date<=? AND end_date>=?",
        doctor,
        r.endDate,
        r.startDate,
      )
    )
      throw new ApiError(409, "LEAVE_OVERLAP", "This date range overlaps existing leave.");
    const conflicts = await leaveConflicts(db, r);
    if (conflicts.length)
      throw new ApiError(
        409,
        "LEAVE_APPOINTMENTS",
        `This date range has ${conflicts.length} existing appointments that require attention. Review and resolve them before saving leave.`,
      );
    const id = randomUUID(),
      stamp = new Date().toISOString();
    await db
      .prepare(
        "INSERT INTO doctor_leave (id,doctor_user_id,start_date,end_date,reason,created_by,created_at) VALUES (?,?,?,?,?,?,?)",
      )
      .run(id, doctor, r.startDate, r.endDate, reason, actor, stamp);
    await audit(
      db,
      actor,
      "doctor.leave.created",
      "doctor_leave",
      id,
      null,
      r.startDate + " to " + r.endDate,
    );
    return { id, ...r, reason };
  });
}
export async function removeDoctorLeave(db: Database, actor: string, id: string) {
  return atomic(db, async () => {
    const row = await one<{ start_date: string; end_date: string }>(
      db,
      "SELECT start_date,end_date FROM doctor_leave WHERE id=? AND doctor_user_id=?",
      id,
      await primaryDoctor(db),
    );
    if (!row) throw new ApiError(404, "NOT_FOUND", "Leave not found.");
    if (row.end_date < clinicDayKey())
      throw new ApiError(409, "PAST_LEAVE", "Past leave is retained for reference.");
    await db.prepare("DELETE FROM doctor_leave WHERE id=?").run(id);
    await audit(
      db,
      actor,
      "doctor.leave.removed",
      "doctor_leave",
      id,
      null,
      row.start_date + " to " + row.end_date,
    );
    return { id };
  });
}
