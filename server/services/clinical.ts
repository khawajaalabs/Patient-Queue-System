import { audit, notification } from "./operations.ts";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { atomic, one, many, type Database } from "../db/database.ts";
import { ApiError } from "../middleware/auth.ts";
import { clinicValue } from "./queueService.ts";
import type {
  PatientProfile,
  ClinicalVisit,
  PatientVisit,
  Vitals,
} from "../../src/types/clinical.ts";
type Row = Record<string, unknown>;
const str = (r: Row, k: string) =>
  r[k] instanceof Date ? (r[k] as Date).toISOString() : String(r[k] ?? "");
const nullable = (r: Row, k: string) => (r[k] == null ? null : str(r, k));
const calendarDate = (r: Row, k: string) => {
  const value = r[k];
  if (value == null) return null;
  if (value instanceof Date)
    return [
      value.getFullYear(),
      String(value.getMonth() + 1).padStart(2, "0"),
      String(value.getDate()).padStart(2, "0"),
    ].join("-");
  return String(value).slice(0, 10);
};
const text = z.string().trim().max(2000);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(s + "T00:00:00Z");
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  })
  .nullable();
export const demographicsSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120),
    phone: z.string().trim().min(7).max(30),
    dateOfBirth: date.refine(
      (s) => !s || s <= new Date().toISOString().slice(0, 10),
      "Date of birth cannot be in the future.",
    ),
    gender: z.enum(["", "female", "male", "other", "prefer_not_to_say"]),
    address: z.string().trim().max(500),
    emergencyContactName: z.string().trim().max(120),
    emergencyContactPhone: z.string().trim().max(30),
    bloodGroup: z.enum(["", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "unknown"]),
  })
  .strict();
const clinicalProfileSchema = z
  .object({
    allergies: text,
    chronicConditions: text,
    currentMedications: text,
    generalNotes: text,
  })
  .strict();
const number = (min: number, max: number) => z.number().finite().min(min).max(max).nullable();
export const recordSchema = z
  .object({
    reasonForVisit: text,
    chiefComplaint: text,
    historyNotes: text,
    examinationNotes: text,
    diagnosis: text,
    releaseDiagnosis: z.boolean(),
    treatmentPlan: text,
    followUpInstructions: text,
    followUpDate: date,
    privateNotes: text,
    patientSummary: text,
    vitals: z
      .object({
        systolic: number(1, 400),
        diastolic: number(1, 300),
        pulse: number(1, 400),
        temperature: number(20, 50),
        respiratoryRate: number(1, 100),
        oxygenSaturation: number(0, 100),
        weight: number(0.1, 700),
        height: number(1, 300),
      })
      .strict(),
    prescription: z
      .object({
        instructions: z.string().trim().max(1000),
        items: z
          .array(
            z
              .object({
                strength: z.string().trim().max(120).optional(),
                dosageForm: z.string().trim().max(120).optional(),
                catalogId: z.string().max(100).nullable().optional(),
                medicine: z.string().trim().min(1).max(160),
                dose: z.string().trim().max(120),
                frequency: z.string().trim().max(120),
                duration: z.string().trim().max(120),
                instructions: z.string().trim().max(300),
              })
              .strict(),
          )
          .max(20),
      })
      .strict(),
  })
  .strict();
async function patient(db: Database, id: string) {
  const u = await one<Row>(
    db,
    "SELECT id,full_name,email,phone FROM users WHERE id=? AND role='patient' AND NOT EXISTS (SELECT 1 FROM staff_profiles sp WHERE sp.user_id=users.id)",
    id,
  );
  if (!u) throw new ApiError(404, "PATIENT_NOT_FOUND", "Patient not found.");
  return u;
}
export async function profile(db: Database, id: string, admin = false): Promise<PatientProfile> {
  const u = await patient(db, id),
    p = (await one<Row>(db, "SELECT * FROM patient_profiles WHERE user_id=?", id)) ?? {};
  return {
    id,
    fullName: str(u, "full_name"),
    email: str(u, "email"),
    phone: str(u, "phone"),
    dateOfBirth: calendarDate(p, "date_of_birth"),
    gender: str(p, "gender"),
    address: str(p, "address"),
    emergencyContactName: str(p, "emergency_contact_name"),
    emergencyContactPhone: str(p, "emergency_contact_phone"),
    bloodGroup: str(p, "blood_group"),
    allergies: str(p, "allergies"),
    chronicConditions: str(p, "chronic_conditions"),
    currentMedications: str(p, "current_medications"),
    ...(admin ? { generalNotes: str(p, "general_notes") } : {}),
  };
}
export async function saveProfile(
  db: Database,
  id: string,
  input: unknown,
  clinical = false,
  actorId = id,
) {
  const c = clinical ? clinicalProfileSchema.parse(input) : demographicsSchema.parse(input);
  return atomic(db, async () => {
    await patient(db, id);
    const stamp = new Date().toISOString();
    await db
      .prepare(
        "INSERT INTO patient_profiles(user_id,updated_at) VALUES (?,?) ON CONFLICT(user_id) DO NOTHING",
      )
      .run(id, stamp);
    if ("allergies" in c)
      await db
        .prepare(
          "UPDATE patient_profiles SET allergies=?,chronic_conditions=?,current_medications=?,general_notes=?,updated_at=? WHERE user_id=?",
        )
        .run(c.allergies, c.chronicConditions, c.currentMedications, c.generalNotes, stamp, id);
    else {
      await db
        .prepare("UPDATE users SET full_name=?,phone=?,updated_at=? WHERE id=?")
        .run(c.fullName, c.phone, stamp, id);
      await db
        .prepare(
          "UPDATE patient_profiles SET date_of_birth=?,gender=?,address=?,emergency_contact_name=?,emergency_contact_phone=?,blood_group=?,updated_at=? WHERE user_id=?",
        )
        .run(
          c.dateOfBirth,
          c.gender,
          c.address,
          c.emergencyContactName,
          c.emergencyContactPhone,
          c.bloodGroup,
          stamp,
          id,
        );
    }
    await audit(
      db,
      actorId,
      clinical ? "patient.clinical_profile.updated" : "patient.demographics.updated",
      "patient",
      id,
    );
    return profile(db, id, clinical);
  });
}
const select =
  "SELECT e.*,u.full_name patient_name,c.name clinic_name,c.address clinic_address,c.phone clinic_phone,d.full_name doctor_name,t.token_code,a.scheduled_at appointment_at FROM encounters e JOIN users u ON u.id=e.patient_id JOIN clinics c ON c.id=e.clinic_id JOIN users d ON d.id=e.doctor_id LEFT JOIN tokens t ON t.id=e.token_id LEFT JOIN appointments a ON a.id=e.appointment_id";
export async function visitDetail(
  db: Database,
  id: string,
  patientId?: string,
): Promise<ClinicalVisit | PatientVisit> {
  const e = await one<Row>(
    db,
    select + " WHERE e.id=?" + (patientId ? " AND e.patient_id=? AND e.status='completed'" : ""),
    id,
    ...(patientId ? [patientId] : []),
  );
  if (!e) throw new ApiError(404, "VISIT_NOT_FOUND", "Visit not found.");
  const p = await one<Row>(db, "SELECT * FROM prescriptions WHERE encounter_id=?", id);
  const items = p
    ? await many<Row>(
        db,
        "SELECT i.medicine,i.dose,i.frequency,i.duration,i.instructions,d.strength,d.dosage_form,d.catalog_id FROM prescription_items i LEFT JOIN prescription_item_details d ON d.item_id=i.id WHERE i.prescription_id=? ORDER BY i.position",
        str(p, "id"),
      )
    : [];
  const common: PatientVisit = {
    id,
    patientId: str(e, "patient_id"),
    patientName: str(e, "patient_name"),
    clinicId: str(e, "clinic_id"),
    clinicName: str(e, "clinic_name"),
    clinicAddress: str(e, "clinic_address"),
    clinicPhone: str(e, "clinic_phone"),
    doctorName: str(e, "doctor_name"),
    visitAt: str(e, "visit_at"),
    status: str(e, "status") as PatientVisit["status"],
    patientSummary: str(e, "patient_summary"),
    diagnosis: Number(e["release_diagnosis"]) === 1 ? str(e, "diagnosis") : null,
    treatmentPlan: str(e, "treatment_plan"),
    followUpInstructions: str(e, "follow_up_instructions"),
    followUpDate: calendarDate(e, "follow_up_date"),
    completedAt: nullable(e, "completed_at"),
    prescription: {
      ...(p ? { id: str(p, "id"), prescribedAt: str(p, "prescribed_at") } : {}),
      instructions: p ? str(p, "instructions") : "",
      items: items.map((i) => ({
        ...(i["strength"] == null
          ? {}
          : {
              strength: str(i, "strength"),
              dosageForm: str(i, "dosage_form"),
              catalogId: nullable(i, "catalog_id"),
            }),
        medicine: str(i, "medicine"),
        dose: str(i, "dose"),
        frequency: str(i, "frequency"),
        duration: str(i, "duration"),
        instructions: str(i, "instructions"),
      })),
    },
  };
  // Explicit patient projection: never return e.*, private notes, drafts or clinical working notes.
  if (patientId) return common;
  const v = (await one<Row>(db, "SELECT * FROM visit_vitals WHERE encounter_id=?", id)) ?? {};
  const value = (k: string) => (v[k] == null ? null : Number(v[k]));
  const vitals: Vitals = {
    systolic: value("systolic"),
    diastolic: value("diastolic"),
    pulse: value("pulse"),
    temperature: value("temperature"),
    respiratoryRate: value("respiratory_rate"),
    oxygenSaturation: value("oxygen_saturation"),
    weight: value("weight"),
    height: value("height"),
  };
  return {
    ...common,
    doctorId: str(e, "doctor_id"),
    appointmentId: nullable(e, "appointment_id"),
    appointmentAt: nullable(e, "appointment_at"),
    tokenId: nullable(e, "token_id"),
    tokenCode: nullable(e, "token_code"),
    reasonForVisit: str(e, "reason_for_visit"),
    chiefComplaint: str(e, "chief_complaint"),
    historyNotes: str(e, "history_notes"),
    examinationNotes: str(e, "examination_notes"),
    diagnosis: str(e, "diagnosis"),
    releaseDiagnosis: Boolean(e["release_diagnosis"]),
    privateNotes: str(e, "private_notes"),
    createdAt: str(e, "created_at"),
    updatedAt: str(e, "updated_at"),
    vitals,
  };
}
export async function visits(db: Database, patientId: string, portal = false) {
  await patient(db, patientId);
  const ids = await many<{ id: string }>(
    db,
    "SELECT id FROM encounters WHERE patient_id=?" +
      (portal ? " AND status='completed'" : "") +
      " ORDER BY visit_at DESC,id DESC LIMIT 200",
    patientId,
  );
  return Promise.all(ids.map((v) => visitDetail(db, v.id, portal ? patientId : undefined)));
}
export async function startVisit(
  db: Database,
  patientId: string,
  doctorId: string,
  input: unknown,
  actorId = doctorId,
) {
  const c = z
    .object({
      clinicId: z.string().min(1).max(100),
      appointmentId: z.string().min(1).max(100).optional(),
      tokenId: z.string().min(1).max(100).optional(),
    })
    .strict()
    .parse(input);
  return atomic(db, async () => {
    await patient(db, patientId);
    const clinic = await clinicValue(db, c.clinicId);
    let reason = "",
      token: Row | undefined,
      appointment: Row | undefined;
    if (c.appointmentId) {
      appointment = await one<Row>(
        db,
        "SELECT * FROM appointments WHERE id=? AND patient_id=? AND clinic_id=?",
        c.appointmentId,
        patientId,
        c.clinicId,
      );
      if (!appointment) throw new ApiError(404, "APPOINTMENT_NOT_FOUND", "Appointment not found.");
      reason = str(appointment, "reason");
    }
    if (c.tokenId)
      token = await one<Row>(
        db,
        "SELECT t.* FROM tokens t JOIN daily_queues q ON q.id=t.queue_id WHERE t.id=? AND t.patient_id=? AND q.clinic_id=?",
        c.tokenId,
        patientId,
        c.clinicId,
      );
    else
      token = await one<Row>(
        db,
        "SELECT t.* FROM tokens t JOIN daily_queues q ON q.id=t.queue_id WHERE t.patient_id=? AND q.clinic_id=? AND t.status='serving'",
        patientId,
        c.clinicId,
      );
    if (c.tokenId && !token) throw new ApiError(404, "TOKEN_NOT_FOUND", "Token not found.");
    const existing = await one<Row>(
      db,
      "SELECT id,token_id,appointment_id FROM encounters WHERE patient_id=? AND clinic_id=? AND (status='in_progress' OR token_id=? OR appointment_id=?) ORDER BY visit_at DESC LIMIT 1",
      patientId,
      c.clinicId,
      token ? str(token, "id") : null,
      c.appointmentId ?? null,
    );
    if (existing) {
      if (
        (c.tokenId && existing["token_id"] && existing["token_id"] !== c.tokenId) ||
        (c.appointmentId &&
          existing["appointment_id"] &&
          existing["appointment_id"] !== c.appointmentId)
      )
        throw new ApiError(
          409,
          "ACTIVE_VISIT",
          "Finish the current consultation for this patient first.",
        );
      const current = (await visitDetail(db, str(existing, "id"))) as ClinicalVisit;
      if (current.status === "in_progress") {
        if (token && str(token, "status") !== "serving")
          throw new ApiError(
            409,
            "TOKEN_NOT_SERVING",
            "Call the patient before starting consultation.",
          );
        await db
          .prepare(
            "UPDATE encounters SET token_id=COALESCE(token_id,?),queue_id=COALESCE(queue_id,?),appointment_id=COALESCE(appointment_id,?) WHERE id=?",
          )
          .run(
            token ? str(token, "id") : null,
            token ? str(token, "queue_id") : null,
            c.appointmentId ?? null,
            current.id,
          );
      }
      return visitDetail(db, current.id);
    }
    if (token && str(token, "status") !== "serving")
      throw new ApiError(
        409,
        "TOKEN_NOT_SERVING",
        "Call the patient before starting consultation.",
      );
    if (appointment && str(appointment, "status") !== "scheduled")
      throw new ApiError(409, "APPOINTMENT_CLOSED", "This appointment is no longer scheduled.");
    if (!clinic.active && !token)
      throw new ApiError(409, "CLINIC_INACTIVE", "Choose an active clinic.");
    const id = randomUUID(),
      stamp = new Date().toISOString();
    await db
      .prepare(
        "INSERT INTO encounters(id,patient_id,clinic_id,doctor_id,appointment_id,token_id,queue_id,visit_at,reason_for_visit,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      )
      .run(
        id,
        patientId,
        c.clinicId,
        doctorId,
        c.appointmentId ?? null,
        token ? str(token, "id") : null,
        token ? str(token, "queue_id") : null,
        stamp,
        reason || (token ? str(token, "reason_for_visit") : ""),
        stamp,
        stamp,
      );
    await audit(db, actorId, "visit.started", "visit", id, c.clinicId);
    return visitDetail(db, id);
  });
}
export async function saveVisit(db: Database, id: string, input: unknown, complete = false) {
  const c = recordSchema.parse(input);
  return atomic(db, async () => {
    const e = await one<Row>(db, "SELECT * FROM encounters WHERE id=?", id);
    if (!e) throw new ApiError(404, "VISIT_NOT_FOUND", "Visit not found.");
    if (e["status"] === "completed") {
      if (complete) return visitDetail(db, id);
      throw new ApiError(409, "VISIT_COMPLETED", "Completed visits are read-only.");
    }
    const stamp = new Date().toISOString();
    if (complete && e["token_id"]) {
      const token = await one<Row>(
        db,
        "SELECT t.*,q.current_token_id FROM tokens t JOIN daily_queues q ON q.id=t.queue_id WHERE t.id=?",
        str(e, "token_id"),
      );
      if (!token || token["status"] !== "serving" || token["current_token_id"] !== e["token_id"])
        throw new ApiError(
          409,
          "TOKEN_NOT_SERVING",
          "The linked token must be serving before completing this consultation.",
        );
      await db
        .prepare("UPDATE tokens SET status='completed',completed_at=?,updated_at=? WHERE id=?")
        .run(stamp, stamp, str(e, "token_id"));
      await db
        .prepare("UPDATE daily_queues SET current_token_id=NULL,updated_at=? WHERE id=?")
        .run(stamp, str(e, "queue_id"));
      await db
        .prepare(
          "INSERT INTO visits(id,clinic_id,patient_id,doctor_id,queue_id,token_id,completed_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(token_id) DO NOTHING",
        )
        .run(
          randomUUID(),
          str(e, "clinic_id"),
          str(e, "patient_id"),
          str(e, "doctor_id"),
          str(e, "queue_id"),
          str(e, "token_id"),
          stamp,
        );
    }
    if (complete && e["appointment_id"])
      await db
        .prepare("UPDATE appointments SET status='completed',updated_at=? WHERE id=?")
        .run(stamp, str(e, "appointment_id"));
    await db
      .prepare(
        "UPDATE encounters SET reason_for_visit=?,chief_complaint=?,history_notes=?,examination_notes=?,diagnosis=?,release_diagnosis=?,treatment_plan=?,follow_up_instructions=?,follow_up_date=?,private_notes=?,patient_summary=?,status=?,completed_at=?,updated_at=? WHERE id=?",
      )
      .run(
        c.reasonForVisit,
        c.chiefComplaint,
        c.historyNotes,
        c.examinationNotes,
        c.diagnosis,
        c.releaseDiagnosis ? 1 : 0,
        c.treatmentPlan,
        c.followUpInstructions,
        c.followUpDate,
        c.privateNotes,
        c.patientSummary,
        complete ? "completed" : "in_progress",
        complete ? stamp : null,
        stamp,
        id,
      );
    const v = c.vitals;
    await db
      .prepare(
        "INSERT INTO visit_vitals(encounter_id,systolic,diastolic,pulse,temperature,respiratory_rate,oxygen_saturation,weight,height) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(encounter_id) DO UPDATE SET systolic=excluded.systolic,diastolic=excluded.diastolic,pulse=excluded.pulse,temperature=excluded.temperature,respiratory_rate=excluded.respiratory_rate,oxygen_saturation=excluded.oxygen_saturation,weight=excluded.weight,height=excluded.height",
      )
      .run(
        id,
        v.systolic,
        v.diastolic,
        v.pulse,
        v.temperature,
        v.respiratoryRate,
        v.oxygenSaturation,
        v.weight,
        v.height,
      );
    const previous = await one<{ id: string }>(
        db,
        "SELECT id FROM prescriptions WHERE encounter_id=?",
        id,
      ),
      pid = previous?.id ?? randomUUID();
    await db
      .prepare(
        "INSERT INTO prescriptions(id,encounter_id,doctor_id,prescribed_at,instructions) VALUES (?,?,?,?,?) ON CONFLICT(encounter_id) DO UPDATE SET instructions=excluded.instructions,prescribed_at=excluded.prescribed_at",
      )
      .run(pid, id, str(e, "doctor_id"), stamp, c.prescription.instructions);
    await db.prepare("DELETE FROM prescription_items WHERE prescription_id=?").run(pid);
    for (const [index, item] of c.prescription.items.entries()) {
      const itemId = randomUUID();
      if (
        item.catalogId &&
        !(await one(
          db,
          "SELECT id FROM medicine_catalog WHERE id=? AND clinic_id=?",
          item.catalogId,
          str(e, "clinic_id"),
        ))
      )
        throw new ApiError(400, "INVALID_MEDICINE", "Choose a medicine from this clinic library.");
      await db
        .prepare(
          "INSERT INTO prescription_items(id,prescription_id,position,medicine,dose,frequency,duration,instructions) VALUES (?,?,?,?,?,?,?,?)",
        )
        .run(
          itemId,
          pid,
          index + 1,
          item.medicine,
          item.dose,
          item.frequency,
          item.duration,
          item.instructions,
        );
      if (item.strength !== undefined || item.dosageForm !== undefined || item.catalogId)
        await db
          .prepare("INSERT INTO prescription_item_details VALUES (?,?,?,?)")
          .run(itemId, item.strength ?? "", item.dosageForm ?? "", item.catalogId ?? null);
    }
    await audit(
      db,
      str(e, "doctor_id"),
      complete ? "visit.completed" : "visit.updated",
      "visit",
      id,
      str(e, "clinic_id"),
    );
    if (c.prescription.items.length)
      await audit(db, str(e, "doctor_id"), "prescription.saved", "visit", id, str(e, "clinic_id"));
    if (complete) {
      await notification(
        db,
        str(e, "patient_id"),
        "visit.released",
        "Visit summary available",
        "A completed visit is available in your patient portal.",
        "visit",
        id,
        str(e, "clinic_id"),
      );
      if (c.prescription.items.length)
        await notification(
          db,
          str(e, "patient_id"),
          "prescription.available",
          "Prescription available",
          "Your prescription is available in the patient portal.",
          "prescription",
          id,
          str(e, "clinic_id"),
        );
    }
    return visitDetail(db, id);
  });
}
export async function patientRecord(db: Database, id: string) {
  return {
    profile: await profile(db, id, true),
    visits: await visits(db, id),
    queueHistory: (
      await many<Row>(
        db,
        "SELECT t.id,t.token_code,t.status,q.queue_date,c.name clinic_name FROM tokens t JOIN daily_queues q ON q.id=t.queue_id JOIN clinics c ON c.id=q.clinic_id WHERE t.patient_id=? ORDER BY t.joined_at DESC LIMIT 100",
        id,
      )
    ).map((t) => ({
      id: str(t, "id"),
      clinicName: str(t, "clinic_name"),
      tokenCode: str(t, "token_code"),
      date: str(t, "queue_date"),
      status: str(t, "status"),
    })),
  };
}
