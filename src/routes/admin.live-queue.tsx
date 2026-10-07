import { createFileRoute } from "@tanstack/react-router";
import { LiveQueue } from "./admin.queue";
export const Route = createFileRoute("/admin/live-queue")({
  head: () => ({ meta: [{ title: "Live queue — QueueCare Admin" }] }),
  component: LiveQueue,
});
