import { clinicDayKey } from "./queue.js";
export const patientToday = (now = new Date()) => clinicDayKey(now);
export function validBirthDate(value: string, today = patientToday()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value > today) return false;
  const d = new Date(value + "T12:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
export function ageOnDate(dob: string | null, date = patientToday()): number | null {
  if (!dob || !validBirthDate(dob, date)) return null;
  const years = Number(date.slice(0, 4)) - Number(dob.slice(0, 4));
  return years - (date.slice(5) < dob.slice(5) ? 1 : 0);
}
