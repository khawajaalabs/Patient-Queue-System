import { createFileRoute } from "@tanstack/react-router";
import { QueuePage } from "./patient.queue";
export const Route = createFileRoute("/patient/live-queue")({
  head: () => ({ meta: [{ title: "Live queue — Neuro Spine Care Center" }] }),
  component: QueuePage,
});
