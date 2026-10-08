export interface StaffAccount {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: "receptionist" | "nurse";
  active: boolean;
  clinics: { id: string; name: string }[];
  last_activity_at: string | null;
}
export interface PatientDocument {
  id: string;
  patient_id: string;
  clinic_id: string;
  visit_id: string | null;
  document_type: string;
  title: string;
  description: string;
  original_filename: string;
  mime_type: string;
  file_size: number;
  patient_visible: number;
  created_at: string;
  clinic_name: string;
}
export interface Invoice {
  appointment_id?: string | null;
  id: string;
  invoice_number: string;
  patient_id: string;
  patient_name: string;
  clinic_id: string;
  clinic_name: string;
  clinic_address?: string;
  clinic_phone?: string;
  visit_id: string | null;
  status: "draft" | "unpaid" | "partially_paid" | "paid" | "void";
  subtotal: number;
  discount: number;
  total: number;
  amount_paid: number;
  balance: number;
  issued_at: string | null;
  due_at: string | null;
  created_at: string;
  items?: { description: string; quantity: number; unit_price: number; total: number }[];
  payments?: { id: string; amount: number; method: string; reference: string; paid_at: string }[];
}
export interface AppNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  entity_type: string;
  entity_id: string;
  clinic_id: string | null;
  read_at: string | null;
  created_at: string;
}
export interface Activity {
  id: string;
  actor_name: string;
  actor_user_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  clinic_id: string | null;
  clinic_name: string | null;
  detail: string;
  created_at: string;
}
export const money = (minor: number) =>
  new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minor / 100);
export const decimalMinor = (value: string) => {
  if (!/^\d+(\.\d{1,2})?$/.test(value))
    throw Error("Enter a positive amount with at most two decimal places.");
  const [whole, decimal = ""] = value.split(".");
  const minor = Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
  if (!Number.isSafeInteger(minor) || minor > 100000000) throw Error("Amount is too large.");
  return minor;
};
