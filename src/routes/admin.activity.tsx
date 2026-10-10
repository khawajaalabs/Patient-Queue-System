import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/admin/activity")({
  beforeLoad: () => {
    throw redirect({ to: "/admin" });
  },
});
