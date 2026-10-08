import { createFileRoute } from "@tanstack/react-router";
import { OperationalReports } from "@/components/final-operations";
export const Route = createFileRoute("/admin/reports")({
  component: () => <OperationalReports reports />,
});
