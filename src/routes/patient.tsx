import { createFileRoute } from "@tanstack/react-router";
import { PatientLayout } from "@/screens/patient-layout-screen";
export { PatientLayout } from "@/screens/patient-layout-screen";

export const Route = createFileRoute("/patient")({
  component: PatientLayout,
});
