export type Role = "patient" | "admin" | "receptionist" | "nurse";
export type TokenStatus = "waiting" | "serving" | "skipped" | "completed" | "cancelled";
export type QueueStatus = "open" | "closed";
export interface UserProfile {
  id: string;
  uid: string;
  fullName: string;
  email: string;
  phone: string;
  role: Role;
  clinicId?: string;
}
export interface ClinicConfig {
  id?: string;
  active?: boolean;
  consultationFee?: number | null;
  name: string;
  publicDisplayName: string;
  address: string;
  phone: string;
  department: string;
  doctorName: string;
  openingTime: string;
  closingTime: string;
  averageConsultationMinutes: number;
  tokenPrefix: string;
  publicDisplayShowNext: boolean;
}
export interface DailyQueue {
  id: string;
  clinicId: string;
  queueDate: string;
  status: QueueStatus;
  nextTokenNumber: number;
  currentTokenId: string | null;
}
export interface QueueToken {
  clinicId?: string;
  clinicName?: string;
  id: string;
  tokenCode: string;
  tokenNumber: number;
  patientId: string;
  patientName: string;
  phone: string;
  reasonForVisit: string;
  department: string;
  status: TokenStatus;
  queueDate: string;
  queueOrder: number;
  joinedAt: string;
  calledAt: string | null;
  completedAt: string | null;
  skippedAt: string | null;
  cancelledAt: string | null;
  lastCalledAt: string | null;
  callCount: number;
}
export interface PublicQueue {
  name: string;
  displayName: string;
  department: string;
  tokenPrefix: string;
  averageConsultationMinutes: number;
  publicDisplayShowNext: boolean;
  queueDate: string;
  status: QueueStatus | "unavailable";
  currentToken: string | null;
  nextTokens: string[];
  waitingTokens: { tokenCode: string; queueOrder: number }[];
  updatedAt: string;
}
export interface PatientRow {
  user: Pick<UserProfile, "id" | "fullName" | "phone">;
  visit: QueueToken | null;
}
export interface QueueResponse {
  clinic: ClinicConfig;
  public: PublicQueue;
  mine: QueueToken | null;
  queue: QueueToken[];
  history: QueueToken[];
  patients: PatientRow[];
}
export type Status = "waiting" | "serving" | "done" | "skipped" | "left";
export type Entry = {
  clinicId?: string | undefined;
  clinicName?: string | undefined;
  department?: string | undefined;
  token: string;
  id?: string | undefined;
  patientId?: string | undefined;
  queueOrder?: number | undefined;
  skippedAt?: string | undefined;
  cancelledAt?: string | undefined;
  name: string;
  phone: string;
  reason: string;
  status: Status;
  joinedAt: string;
  joinedAtMillis?: number | undefined;
  servedAt?: string | undefined;
  completedAt?: string | undefined;
  date?: string | undefined;
  waitMin?: number | undefined;
};
export type Clinic = {
  name: string;
  address: string;
  phone: string;
  department: string;
  doctor: string;
  opening: string;
  closing: string;
  prefix: string;
  publicName: string;
  showNext: boolean;
};
export type LoadState = "ready" | "loading" | "error";

export interface ManagedClinic extends ClinicConfig {
  id: string;
  active: boolean;
  consultationFee: number | null;
}
export interface ClinicSummary {
  clinic: ManagedClinic;
  status: string;
  waiting: number;
  currentToken: string | null;
  appointments: number;
  completed: number;
  patients: number;
}
export interface AllClinicsState {
  clinics: ClinicSummary[];
  totals: {
    clinics: number;
    patients: number;
    waiting: number;
    appointments: number;
    completed: number;
  };
}
export interface Appointment {
  id: string;
  clinicId: string;
  clinicName: string;
  patientId: string;
  patientName: string;
  scheduledAt: string;
  status: "scheduled" | "confirmed" | "checked_in" | "completed" | "cancelled" | "no_show";
  reason: string;
}
