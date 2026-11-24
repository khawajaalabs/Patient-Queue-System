import { createFileRoute } from "@tanstack/react-router";
import { Appointments } from "@/screens/patient-appointments-screen";
export { Appointments } from "@/screens/patient-appointments-screen";

export const Route = createFileRoute("/patient/appointments")({
  component: Appointments,
});
