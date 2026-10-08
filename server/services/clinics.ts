import { randomUUID } from "node:crypto";
import { z } from "zod";
import { atomic, one, many, type Database } from "../db/database.ts";
import { ApiError } from "../middleware/auth.ts";
import { clinicDayKey } from "../../src/domain/queue.js";
import { clinicValue, publicQueue } from "./queueService.ts";
import type { ManagedClinic, AllClinicsState, Appointment } from "../../src/types/local.ts";

export async function listClinics(db: Database, includeInactive = false): Promise<ManagedClinic[]> {
  const rows = await many<{ id: string }>(
    db,
    `SELECT id FROM clinics ${includeInactive ? "" : "WHERE active=1"} ORDER BY created_at,id`,
  );
  return Promise.all(rows.map(async (c) => (await clinicValue(db, c.id)) as ManagedClinic));
}
const clinicSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    publicName: z.string().trim().min(1).max(120),
    address: z.string().trim().min(1).max(250),
    phone: z.string().trim().min(1).max(30),
    department: z.string().trim().min(1).max(120),
    doctor: z.string().trim().min(1).max(120),
    opening: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    closing: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    prefix: z.string().regex(/^[A-Z]{1,5}$/),
    showNext: z.boolean(),
    avgMin: z.number().int().min(1).max(120),
    active: z.boolean(),
    consultationFee: z.number().int().min(0).max(10000000).nullable(),
  })
  .strict()
  .refine((c) => c.opening < c.closing, { message: "Closing time must be after opening time." });
export async function saveClinic(
  db: Database,
  input: unknown,
  id?: string,
): Promise<ManagedClinic> {
  const c = clinicSchema.parse(input);
  return atomic(db, async () => {
    const stamp = new Date().toISOString(),
      clinicId = id ?? randomUUID();
    if (id) await clinicValue(db, id);
    if (id)
      await db
        .prepare(
          "UPDATE clinics SET name=?,display_name=?,address=?,phone=?,department=?,doctor_name=?,opening_time=?,closing_time=?,average_consultation_minutes=?,token_prefix=?,public_display_show_next=?,active=?,consultation_fee=?,updated_at=? WHERE id=?",
        )
        .run(
          c.name,
          c.publicName,
          c.address,
          c.phone,
          c.department,
          c.doctor,
          c.opening,
          c.closing,
          c.avgMin,
          c.prefix,
          c.showNext ? 1 : 0,
          c.active ? 1 : 0,
          c.consultationFee,
          stamp,
          id,
        );
    else
      await db
        .prepare(
          "INSERT INTO clinics (id,name,display_name,address,phone,department,doctor_name,opening_time,closing_time,average_consultation_minutes,token_prefix,public_display_show_next,active,consultation_fee,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        )
        .run(
          clinicId,
          c.name,
          c.publicName,
          c.address,
          c.phone,
          c.department,
          c.doctor,
          c.opening,
          c.closing,
          c.avgMin,
          c.prefix,
          c.showNext ? 1 : 0,
          c.active ? 1 : 0,
          c.consultationFee,
          stamp,
          stamp,
        );
    return (await clinicValue(db, clinicId)) as ManagedClinic;
  });
}
export async function allClinicsState(db: Database): Promise<AllClinicsState> {
  const day = clinicDayKey();
  const clinics = await Promise.all(
    (await listClinics(db, true)).map(async (clinic) => {
      const pub = await publicQueue(db, clinic.id);
      const counts = await one<{ patients: number; completed: number }>(
        db,
        "SELECT CAST(COUNT(DISTINCT t.patient_id) AS INTEGER) patients, CAST(COALESCE(SUM(CASE WHEN t.status='completed' THEN 1 ELSE 0 END),0) AS INTEGER) completed FROM tokens t JOIN daily_queues q ON q.id=t.queue_id WHERE q.clinic_id=? AND q.queue_date=?",
        clinic.id,
        day,
      );
      const appt = await one<{ n: number }>(
        db,
        "SELECT CAST(COUNT(*) AS INTEGER) n FROM appointments WHERE clinic_id=? AND substr(scheduled_at,1,10)=? AND status<>'cancelled'",
        clinic.id,
        day,
      );
      return {
        clinic,
        status: pub.status,
        waiting: pub.waitingTokens.length,
        currentToken: pub.currentToken,
        appointments: appt!.n,
        completed: counts!.completed,
        patients: counts!.patients,
      };
    }),
  );
  const distinct = await one<{ n: number }>(
    db,
    "SELECT CAST(COUNT(DISTINCT t.patient_id) AS INTEGER) n FROM tokens t JOIN daily_queues q ON q.id=t.queue_id WHERE q.queue_date=?",
    day,
  );
  return {
    clinics,
    totals: {
      clinics: clinics.length,
      patients: distinct!.n,
      waiting: clinics.reduce((s, c) => s + c.waiting, 0),
      appointments: clinics.reduce((s, c) => s + c.appointments, 0),
      completed: clinics.reduce((s, c) => s + c.completed, 0),
    },
  };
}
export async function appointments(db: Database, clinicId?: string): Promise<Appointment[]> {
  if (clinicId) await clinicValue(db, clinicId);
  const rows = await many<{
    id: string;
    clinic_id: string;
    clinic_name: string;
    patient_id: string;
    full_name: string;
    scheduled_at: string;
    status: Appointment["status"];
    reason: string;
  }>(
    db,
    `SELECT a.*,c.name clinic_name,u.full_name FROM appointments a JOIN clinics c ON c.id=a.clinic_id JOIN users u ON u.id=a.patient_id ${clinicId ? "WHERE a.clinic_id=?" : ""} ORDER BY a.scheduled_at DESC LIMIT 200`,
    ...(clinicId ? [clinicId] : []),
  );
  return rows.map((a) => ({
    id: a.id,
    clinicId: a.clinic_id,
    clinicName: a.clinic_name,
    patientId: a.patient_id,
    patientName: a.full_name,
    scheduledAt: a.scheduled_at,
    status: a.status,
    reason: a.reason,
  }));
}
export async function createAppointment(
  db: Database,
  clinicId: string,
  adminId: string,
  input: unknown,
) {
  const c = z
    .object({
      patientId: z.string().min(1).max(100),
      scheduledAt: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
        .refine((s) => {
          const d = new Date(s + ":00Z");
          return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 16) === s;
        }),
      reason: z.string().trim().max(300),
    })
    .strict()
    .parse(input);
  return atomic(db, async () => {
    const clinic = await clinicValue(db, clinicId);
    if (!clinic.active) throw new ApiError(409, "CLINIC_INACTIVE", "This clinic is inactive.");
    if (!(await one(db, "SELECT id FROM users WHERE id=? AND role='patient'", c.patientId)))
      throw new ApiError(400, "INVALID_PATIENT", "Choose a patient account.");
    const id = randomUUID(),
      stamp = new Date().toISOString();
    // Appointment wall times are clinic-local (Asia/Karachi), matching queue dates.
    await db
      .prepare(
        "INSERT INTO appointments (id,clinic_id,patient_id,scheduled_at,status,reason,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
      )
      .run(id, clinicId, c.patientId, c.scheduledAt, "scheduled", c.reason, adminId, stamp, stamp);
    return { id };
  });
}
