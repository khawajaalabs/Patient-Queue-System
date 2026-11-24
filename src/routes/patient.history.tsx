import { createFileRoute } from "@tanstack/react-router";
import { History } from "@/screens/patient-history-screen";
export { History } from "@/screens/patient-history-screen";

export const Route = createFileRoute("/patient/history")({
  component: History,
});
