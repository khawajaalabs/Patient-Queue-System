import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/admin/data-management")({
  beforeLoad: () => {
    throw redirect({ to: "/admin" });
  },
});
