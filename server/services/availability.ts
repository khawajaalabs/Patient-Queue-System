import { randomUUID } from "node:crypto";
import { z } from "zod";
import { atomic, many, one, type Database } from "../db/database.ts";
import { ApiError } from "../middleware/auth.ts";
import { audit } from "./operations.ts";

const clock = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(s + "T12:00:00Z");
    return Number.isFinite(+d) && d.toISOString().slice(0, 10) === s;
  }, "Choose a valid date.");
const scheduleInput = z
  .object({
    slotMinutes: z.number().int().min(5).max(120),
    windows: z
      .array(
        z
          .object({ weekday: z.number().int().min(0).max(6), startTime: clock, endTime: clock })
          .strict(),
      )
      .max(100),
  })
  .strict();
export type AvailabilityWindow = z.infer<typeof scheduleInput>["windows"][number];
const minute = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
const hhmm = (n: number) =>
  String(Math.floor(n / 60)).padStart(2, "0") + ":" + String(n % 60).padStart(2, "0");
export function timeLabel(s: string) {
  const h = Number(s.slice(0, 2));
  return `${h % 12 || 12}:${s.slice(3, 5)} ${h < 12 ? "AM" : "PM"}`;
}
async function configuration(db: Database, clinicId: string) {
  const clinic = await one<{
    name: string;
    active: number;
    opening_time: string;
    closing_time: string;
  }>(db, "SELECT name,active,opening_time,closing_time FROM clinics WHERE id=?", clinicId);
  if (!clinic || !clinic.active)
    throw new ApiError(409, "CLINIC_INACTIVE", "Choose an active clinic.");
  const doctor = await one<{ id: string }>(
    db,
    "SELECT id FROM users WHERE role='admin' ORDER BY created_at,id LIMIT 1",
  );
  if (!doctor) throw new ApiError(409, "NO_DOCTOR", "Doctor availability has not been configured.");
  const branding = await one<{ slot_minutes: number }>(
    db,
    "SELECT slot_minutes FROM clinic_branding WHERE clinic_id=?",
    clinicId,
  );
  return { clinic, doctorId: doctor.id, slotMinutes: branding?.slot_minutes ?? 15 };
}
export async function doctorSchedule(db: Database, clinicId: string) {
  const { clinic, doctorId, slotMinutes } = await configuration(db, clinicId);
  const windows = await many<AvailabilityWindow>(
    db,
    'SELECT weekday,start_time AS "startTime",end_time AS "endTime" FROM doctor_availability WHERE doctor_user_id=? AND clinic_id=? ORDER BY weekday,start_time',
    doctorId,
    clinicId,
  );
  return {
    windows,
    slotMinutes,
    openingTime: clinic.opening_time,
    closingTime: clinic.closing_time,
  };
}
export async function saveDoctorSchedule(
  db: Database,
  clinicId: string,
  actorId: string,
  input: unknown,
) {
  const { windows, slotMinutes } = scheduleInput.parse(input);
  return atomic(db, async () => {
    const { clinic, doctorId } = await configuration(db, clinicId);
    const others = await many<{
      weekday: number;
      start_time: string;
      end_time: string;
      name: string;
    }>(
      db,
      "SELECT a.weekday,a.start_time,a.end_time,c.name FROM doctor_availability a JOIN clinics c ON c.id=a.clinic_id WHERE a.doctor_user_id=? AND a.clinic_id<>?",
      doctorId,
      clinicId,
    );
    for (const [i, w] of windows.entries()) {
      if (
        w.startTime >= w.endTime ||
        w.startTime < clinic.opening_time ||
        w.endTime > clinic.closing_time
      )
        throw new ApiError(
          409,
          "OUTSIDE_HOURS",
          "Doctor hours must start before they end and fit within clinic opening hours.",
        );
      if (
        windows
          .slice(0, i)
          .some(
            (x) => x.weekday === w.weekday && x.startTime < w.endTime && x.endTime > w.startTime,
          )
      )
        throw new ApiError(409, "SCHEDULE_CONFLICT", "Doctor hours overlap on the same day.");
      const conflict = others.find(
        (x) => x.weekday === w.weekday && x.start_time < w.endTime && x.end_time > w.startTime,
      );
      if (conflict)
        throw new ApiError(
          409,
          "SCHEDULE_CONFLICT",
          `You already work at ${conflict.name} from ${timeLabel(conflict.start_time)} to ${timeLabel(conflict.end_time)} on ${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][w.weekday]}.`,
        );
    }
    await db
      .prepare("DELETE FROM doctor_availability WHERE doctor_user_id=? AND clinic_id=?")
      .run(doctorId, clinicId);
    const stamp = new Date().toISOString();
    for (const w of windows)
      await db
        .prepare(
          "INSERT INTO doctor_availability (id,doctor_user_id,clinic_id,weekday,start_time,end_time,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
        )
        .run(randomUUID(), doctorId, clinicId, w.weekday, w.startTime, w.endTime, stamp, stamp);
    await db
      .prepare(
        "INSERT INTO clinic_branding (clinic_id,slot_minutes,updated_at) VALUES (?,?,?) ON CONFLICT(clinic_id) DO UPDATE SET slot_minutes=excluded.slot_minutes,updated_at=excluded.updated_at",
      )
      .run(clinicId, slotMinutes, stamp);
    await audit(db, actorId, "doctor.schedule.updated", "clinic", clinicId, clinicId);
    return doctorSchedule(db, clinicId);
  });
}
export async function availableSlots(db: Database, clinicId: string, day: string, exclude = "") {
  date.parse(day);
  const { clinic, doctorId, slotMinutes } = await configuration(db, clinicId);
  const windows = await many<{ start_time: string; end_time: string }>(
    db,
    "SELECT start_time,end_time FROM doctor_availability WHERE doctor_user_id=? AND clinic_id=? AND weekday=? ORDER BY start_time",
    doctorId,
    clinicId,
    new Date(day + "T12:00:00Z").getUTCDay(),
  );
  // A single doctor serves every clinic. Legacy appointments retain their clinic duration;
  // new appointments store a duration snapshot so later settings do not shrink reservations.
  const booked = await many<{ scheduled_at: string; duration: number }>(
    db,
    "SELECT a.scheduled_at,COALESCE(s.duration_minutes,b.slot_minutes,15) duration FROM appointments a LEFT JOIN appointment_slots s ON s.appointment_id=a.id LEFT JOIN clinic_branding b ON b.clinic_id=a.clinic_id LEFT JOIN appointment_workflow w ON w.appointment_id=a.id WHERE a.id<>? AND a.status<>'cancelled' AND COALESCE(w.status,a.status) NOT IN ('cancelled','no_show') AND substr(a.scheduled_at,1,10)=?",
    exclude,
    day,
  );
  const slots: { value: string; label: string }[] = [];
  for (const w of windows) {
    for (
      let start = minute(w.start_time);
      start + slotMinutes <= minute(w.end_time);
      start += slotMinutes
    ) {
      const value = day + "T" + hhmm(start);
      if (
        start < minute(clinic.opening_time) ||
        start + slotMinutes > minute(clinic.closing_time) ||
        +new Date(value + ":00+05:00") <= Date.now()
      )
        continue;
      if (
        booked.some(
          (b) =>
            start < minute(b.scheduled_at.slice(11)) + b.duration &&
            start + slotMinutes > minute(b.scheduled_at.slice(11)),
        )
      )
        continue;
      slots.push({ value, label: timeLabel(hhmm(start)) });
    }
  }
  return { slots, slotMinutes, timezone: "Asia/Karachi", doctorId };
}
export async function validateAvailableSlot(
  db: Database,
  clinicId: string,
  time: string,
  exclude = "",
) {
  const result = await availableSlots(db, clinicId, time.slice(0, 10), exclude);
  if (!result.slots.some((s) => s.value === time))
    throw new ApiError(
      409,
      "SLOT_TAKEN",
      "This appointment time is unavailable or was just booked. Please choose another available time.",
    );
  return { doctorId: result.doctorId, slotMinutes: result.slotMinutes };
}
export async function rememberSlot(
  db: Database,
  id: string,
  slot: { doctorId: string; slotMinutes: number },
) {
  await db
    .prepare(
      "INSERT INTO appointment_slots (appointment_id,doctor_user_id,duration_minutes) VALUES (?,?,?) ON CONFLICT(appointment_id) DO UPDATE SET doctor_user_id=excluded.doctor_user_id,duration_minutes=excluded.duration_minutes",
    )
    .run(id, slot.doctorId, slot.slotMinutes);
}
