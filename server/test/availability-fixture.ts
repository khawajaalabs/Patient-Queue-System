import { saveDoctorSchedule } from "../services/availability.ts";
import { one, type Database } from "../db/database.ts";
// Explicit test setup only: production clinics are never given invented doctor hours.
export async function testDoctorHours(db: Database, clinicId: string) {
  const doctor = await one<{ id: string }>(
    db,
    "SELECT id FROM users WHERE role='admin' ORDER BY created_at,id LIMIT 1",
  );
  const clinic = await one<{ opening_time: string; closing_time: string }>(
    db,
    "SELECT opening_time,closing_time FROM clinics WHERE id=?",
    clinicId,
  );
  if (!doctor || !clinic) throw new Error("Test clinic/doctor missing");
  await saveDoctorSchedule(db, clinicId, doctor.id, {
    slotMinutes: 15,
    windows: Array.from({ length: 7 }, (_, weekday) => ({
      weekday,
      startTime: clinic.opening_time,
      endTime: clinic.closing_time,
    })),
  });
}
