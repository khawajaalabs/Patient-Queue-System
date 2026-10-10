import { createFileRoute } from "@tanstack/react-router";
import { MedicineLibrary } from "@/components/medicine-library";
export const Route = createFileRoute("/admin/medicine-library")({ component: MedicineLibrary });
