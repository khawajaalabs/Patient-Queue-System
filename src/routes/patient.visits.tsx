import { createFileRoute } from "@tanstack/react-router";
import { Visits } from "@/screens/patient-visits-screen";
export { Visits } from "@/screens/patient-visits-screen";

export const Route = createFileRoute("/patient/visits")({
  component: Visits,
});
