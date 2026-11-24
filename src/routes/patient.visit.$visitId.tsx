import { createFileRoute } from "@tanstack/react-router";
import { Detail } from "@/screens/patient-visit-screen";
export { Detail } from "@/screens/patient-visit-screen";

export const Route = createFileRoute("/patient/visit/$visitId")({
  component: Detail,
});
