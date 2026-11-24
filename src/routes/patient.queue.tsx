import { createFileRoute, redirect } from "@tanstack/react-router";
import { QueuePage } from "@/screens/patient-queue-screen";
export { QueuePage } from "@/screens/patient-queue-screen";

export const Route = createFileRoute("/patient/queue")({
  beforeLoad: () => {
    throw redirect({ to: "/patient/live-queue" });
  },
  component: QueuePage,
});
