import { createFileRoute } from "@tanstack/react-router";
import { AdminDocuments } from "@/screens/admin-documents-screen";
export { AdminDocuments } from "@/screens/admin-documents-screen";

export const Route = createFileRoute("/admin/documents")({
  component: AdminDocuments,
});
