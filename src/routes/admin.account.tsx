import { createFileRoute } from "@tanstack/react-router";
import { AccountSettings } from "@/components/final-operations";
export const Route = createFileRoute("/admin/account")({ component: AccountSettings });
