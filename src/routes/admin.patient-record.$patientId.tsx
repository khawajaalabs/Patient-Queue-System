import { createFileRoute } from "@tanstack/react-router";
import { PatientRecord } from "@/screens/admin-patient-record-screen";
export { PatientRecord } from "@/screens/admin-patient-record-screen";

export const Route = createFileRoute("/admin/patient-record/$patientId")({
  component: PatientRecord,
});
