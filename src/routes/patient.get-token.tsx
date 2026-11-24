import { createFileRoute, redirect } from "@tanstack/react-router";
import { Join } from "./patient.join-queue";
export const Route = createFileRoute("/patient/get-token")({
  beforeLoad: () => {
    throw redirect({ to: "/patient/appointments", search: { book: 1 } as never });
  },
  head: () => ({ meta: [{ title: "Book an appointment — Neuro Spine Care Center" }] }),
  component: Join,
});
