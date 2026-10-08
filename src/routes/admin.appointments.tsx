import { createFileRoute } from "@tanstack/react-router";
import { AppointmentCalendar } from "@/components/appointment-calendar";
export const Route = createFileRoute("/admin/appointments")({ component: AppointmentCalendar });
