import { createFileRoute } from "@tanstack/react-router";
import { BrandingSettings } from "@/components/final-operations";
export const Route = createFileRoute("/admin/branding")({ component: BrandingSettings });
