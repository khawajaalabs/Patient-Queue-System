import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/patient/documents")({
  beforeLoad: () => {
    throw redirect({ to: "/patient/dashboard" });
  },
});
