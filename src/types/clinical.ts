export interface PatientProfile {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  dateOfBirth: string | null;
  gender: string;
  address: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  bloodGroup: string;
  allergies: string;
  chronicConditions: string;
  currentMedications: string;
  generalNotes?: string;
}
export interface Vitals {
  systolic: number | null;
  diastolic: number | null;
  pulse: number | null;
  temperature: number | null;
  respiratoryRate: number | null;
  oxygenSaturation: number | null;
  weight: number | null;
  height: number | null;
}
export interface Medicine {
  strength?: string;
  dosageForm?: string;
  catalogId?: string | null;
  medicine: string;
  dose: string;
  frequency: string;
  duration: string;
  instructions: string;
}
export interface Prescription {
  id?: string;
  prescribedAt?: string;
  instructions: string;
  items: Medicine[];
}
export interface PatientVisit {
  id: string;
  patientId: string;
  patientName: string;
  clinicId: string;
  clinicName: string;
  clinicAddress: string;
  clinicPhone: string;
  doctorName: string;
  visitAt: string;
  status: "in_progress" | "completed";
  patientSummary: string;
  diagnosis: string | null;
  treatmentPlan: string;
  followUpInstructions: string;
  followUpDate: string | null;
  completedAt: string | null;
  prescription: Prescription;
}
export interface ClinicalVisit extends PatientVisit {
  doctorId: string;
  appointmentId: string | null;
  tokenId: string | null;
  tokenCode: string | null;
  appointmentAt: string | null;
  reasonForVisit: string;
  chiefComplaint: string;
  historyNotes: string;
  examinationNotes: string;
  releaseDiagnosis: boolean;
  privateNotes: string;
  vitals: Vitals;
  createdAt: string;
  updatedAt: string;
}
export interface ClinicalRecord {
  profile: PatientProfile;
  visits: ClinicalVisit[];
  queueHistory: {
    id: string;
    clinicName: string;
    tokenCode: string;
    date: string;
    status: string;
  }[];
}
