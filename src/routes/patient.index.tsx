import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/patient/")({
  beforeLoad: () => {
    throw redirect({ to: "/patient/dashboard" });
  },
});
