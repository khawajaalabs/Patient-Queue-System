import { ClinicSwitcher } from "@/providers/clinic-provider";
import { ProtectedRoute } from "@/components/protected-route";
import { useAuth } from "@/providers/auth-provider";
import { logout } from "@/services/auth";
import { runAction } from "@/services/queue";
import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { Bell, History, Home, Ticket, Activity } from "lucide-react";
import { Notifications, QueueBoundary } from "@/components/queue-feedback";
import { useQueue } from "@/lib/queue-store";
import { Logo } from "@/components/qc";

export const Route = createFileRoute("/patient")({ component: PatientLayout });

const links = [
  { to: "/patient/dashboard", label: "Home", icon: Home },
  { to: "/patient/live-queue", label: "Live queue", icon: Activity },
  { to: "/patient/get-token", label: "Get token", icon: Ticket },
  { to: "/patient/history", label: "History", icon: History },
] as const;

function PatientLayout() {
  return (
    <ProtectedRoute role="patient">
      <PatientLayoutContent />
    </ProtectedRoute>
  );
}
function PatientLayoutContent() {
  const { profile } = useAuth();
  const initials =
    profile?.fullName
      .split(/\s+/)
      .map((n) => n[0])
      .slice(0, 2)
      .join("") ?? "";
  const { pathname } = useLocation();

  return (
    <div className="min-h-screen pb-24 md:pb-0">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center gap-3 px-5 py-3 md:gap-6">
          <Link to="/patient/dashboard">
            <Logo />
          </Link>
          <nav className="hidden gap-1 md:flex">
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition hover:text-foreground"
                activeProps={{ className: "!text-foreground bg-muted font-medium" }}
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <div className="max-w-48 sm:max-w-64">
              <ClinicSwitcher />
            </div>
            <Notifications role="patient" />
            <button
              aria-label="Sign out"
              onClick={() => void runAction(logout, "Signed out.")}
              className="grid size-9 place-items-center rounded-full bg-primary-soft text-sm font-semibold text-accent-foreground"
            >
              {initials}
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-8 md:py-12">
        <nav aria-label="Patient records" className="mb-6 flex flex-wrap gap-2 print:hidden">
          {[
            { to: "/patient/profile", label: "My profile" },
            { to: "/patient/visits", label: "My visits" },
            { to: "/patient/prescriptions", label: "Prescriptions" },
            { to: "/patient/appointments", label: "Appointments" },
            { to: "/patient/documents", label: "Documents" },
            { to: "/patient/billing", label: "Billing" },
          ].map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
              activeProps={{ className: "!text-primary bg-primary-soft font-medium" }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <QueueBoundary kind={pathname.includes("history") ? "list" : "hero"}>
          <Outlet />
        </QueueBoundary>
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-border bg-card/95 backdrop-blur md:hidden">
        {links.map((l) => (
          <Link
            key={l.to}
            to={l.to}
            className="flex flex-col items-center gap-1 py-2.5 text-[11px] text-muted-foreground"
            activeProps={{ className: "!text-primary font-medium" }}
          >
            <l.icon className="size-5" />
            {l.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
