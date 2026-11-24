import { createFileRoute } from "@tanstack/react-router";
import { AdminHistory } from "@/screens/admin-history-screen";
export { AdminHistory } from "@/screens/admin-history-screen";

export const Route = createFileRoute("/admin/history")({
  component: AdminHistory,
});
