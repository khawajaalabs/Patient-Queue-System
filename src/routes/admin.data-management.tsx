import { createFileRoute } from "@tanstack/react-router";
import { DataManagement } from "@/components/final-operations";
export const Route = createFileRoute("/admin/data-management")({ component: DataManagement });
