import { createFileRoute } from "@tanstack/react-router";
import { LiveQueue } from "@/screens/admin-queue-screen";
export { LiveQueue } from "@/screens/admin-queue-screen";

export const Route = createFileRoute("/admin/queue")({
  component: LiveQueue,
});
