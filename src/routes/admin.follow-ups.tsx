import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/admin/follow-ups")({
  beforeLoad: () => {
    throw redirect({ to: "/admin" });
  },
});
