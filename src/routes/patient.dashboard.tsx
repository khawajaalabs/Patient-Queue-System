import { createFileRoute } from "@tanstack/react-router";
import { Dashboard } from "@/screens/patient-dashboard-screen";
export { Dashboard } from "@/screens/patient-dashboard-screen";

export const Route = createFileRoute("/patient/dashboard")({
  component: Dashboard,
});

export { QueueHero } from "@/screens/patient-dashboard-screen";
