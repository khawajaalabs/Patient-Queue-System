export interface AppointmentAttachment {
  id: string;
  title: string;
  type: string;
  filename: string;
  mime: string;
  size: number;
  status: "pending" | "ready" | "failed" | "discarded";
  createdAt: string;
}
export interface AppointmentContext {
  id: string;
  clinicId: string;
  clinicName: string;
  patientId: string;
  scheduledAt: string;
  status: string;
  reason: string;
  patientNotes: string;
  attachments: AppointmentAttachment[];
}
export interface CatalogMedicine {
  id: string;
  clinicId: string;
  name: string;
  strength: string;
  dosageForm: string;
  defaultDose: string;
  defaultFrequency: string;
  defaultDuration: string;
  defaultInstructions: string;
  active: boolean;
}
export interface PrintBrandingData {
  clinic: { display_name: string; logo_url: string; footer: string; email: string };
  doctor: {
    full_name: string;
    title: string;
    specialty: string;
    license: string;
    phone: string;
    email: string;
    photo_url: string;
  } | null;
}
export interface PrintIdentity {
  branding: PrintBrandingData | null;
  signature: { signature_url?: string } | null;
}
