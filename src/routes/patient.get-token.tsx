import { createFileRoute } from "@tanstack/react-router";
import { Join } from "./patient.join-queue";
export const Route = createFileRoute("/patient/get-token")({
  head: () => ({ meta: [{ title: "Get a token — QueueCare" }] }),
  component: Join,
});
