import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/admin/branding")({
  beforeLoad: () => {
    throw redirect({ to: "/admin" });
  },
});
