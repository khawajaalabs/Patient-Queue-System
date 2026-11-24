import { createFileRoute } from "@tanstack/react-router";
import { Prescription } from "@/screens/patient-prescription-screen";
export { Prescription } from "@/screens/patient-prescription-screen";

export const Route = createFileRoute("/patient/prescription/$visitId")({
  component: Prescription,
});
