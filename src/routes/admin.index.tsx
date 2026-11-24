import { createFileRoute } from "@tanstack/react-router";
import { Today } from "@/screens/admin-today-screen";
export { Today } from "@/screens/admin-today-screen";

export const Route = createFileRoute("/admin/")({
  component: Today,
});
