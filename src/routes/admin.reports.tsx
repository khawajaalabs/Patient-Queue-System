import { createFileRoute } from "@tanstack/react-router";
import { AdminReports } from "@/screens/admin-reports-screen";
export { AdminReports } from "@/screens/admin-reports-screen";

export const Route = createFileRoute("/admin/reports")({
  component: AdminReports,
});
