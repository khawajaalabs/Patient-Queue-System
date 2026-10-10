import type { Appointment, ManagedClinic } from "./local";
export type Condition = { id: string; name: string; count?: number };
export type PatientSearchRow = {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  last_visit: string | null;
  clinic_name: string | null;
  conditions: Condition[];
};
export type FlowAppointment = Appointment & {
  visitId?: string;
  visitStatus?: string;
  tokenId?: string;
  tokenStatus?: string;
};
export type TodayState = {
  completedToday?: number;
  date: string;
  clinics: ManagedClinic[];
  setup: "clinic" | "schedule" | "ready";
  unscheduled: ManagedClinic[];
  appointments: FlowAppointment[];
  queue: {
    id: string;
    patient_id: string;
    patient_name: string;
    clinic_id: string;
    clinic_name: string;
    token_code: string;
    status: string;
    reason_for_visit: string;
  }[];
  inProgress: {
    id: string;
    patient_id: string;
    patient_name: string;
    clinic_id: string;
    clinic_name: string;
  }[];
};
