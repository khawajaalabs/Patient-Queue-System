import { createFileRoute } from "@tanstack/react-router";
import { Clinics } from "@/screens/admin-clinics-screen";
export { Clinics } from "@/screens/admin-clinics-screen";

export const Route = createFileRoute("/admin/clinics")({
  component: Clinics,
});
