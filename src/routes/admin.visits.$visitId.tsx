import { createFileRoute } from "@tanstack/react-router";
import { Consultation } from "@/screens/admin-visit-screen";
export { Consultation } from "@/screens/admin-visit-screen";

export const Route = createFileRoute("/admin/visits/$visitId")({
  component: Consultation,
});
