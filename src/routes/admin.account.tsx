import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/admin/account")({
  beforeLoad: () => {
    throw redirect({ to: "/admin" });
  },
});
