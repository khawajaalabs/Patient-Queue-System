import { createFileRoute } from "@tanstack/react-router";
import { StaffWorkspace } from "@/screens/staff-screen";
export { StaffWorkspace } from "@/screens/staff-screen";

export const Route = createFileRoute("/staff")({
  component: StaffWorkspace,
});
