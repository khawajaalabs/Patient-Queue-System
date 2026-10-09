import { GlobalSearch, OperationalReports } from "@/components/final-operations";
import { ClinicSwitcher, useClinicContext } from "@/providers/clinic-provider";
import { ProtectedRoute } from "@/components/protected-route";
import { useAuth } from "@/providers/auth-provider";
import { logout } from "@/services/auth";
import { runAction } from "@/services/queue";
import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useState } from "react";
import { History, LayoutGrid, ListOrdered, Monitor, Settings, Users, Menu } from "lucide-react";
import { Logo, LiveDot } from "@/components/qc";
import { useQueue } from "@/lib/queue-store";
import { cn } from "@/lib/utils";
import { Notifications, QueueBoundary } from "@/components/queue-feedback";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

export const Route = createFileRoute("/admin")({ component: AdminLayout });
const nav = [
  { to: "/admin", label: "Overview", icon: LayoutGrid, exact: true },
  { to: "/admin/live-queue", label: "Live Queue", icon: ListOrdered },
  { to: "/admin/history", label: "Queue History", icon: History },
  { to: "/admin/patients", label: "Patients", icon: Users },
  { to: "/admin/clinics", label: "Clinics", icon: LayoutGrid },
  { to: "/admin/appointments", label: "Appointments", icon: History },
  { to: "/admin/doctor-schedule", label: "Doctor Schedule", icon: History },
  { to: "/admin/staff", label: "Staff", icon: Users },
  { to: "/admin/billing", label: "Billing", icon: ListOrdered },
  { to: "/admin/documents", label: "Documents", icon: History },
  { to: "/admin/activity", label: "Activity", icon: History },
  { to: "/admin/follow-ups", label: "follow ups", icon: Settings },
  { to: "/admin/reports", label: "reports", icon: Settings },
  { to: "/admin/branding", label: "branding", icon: Settings },
  { to: "/admin/account", label: "account", icon: Settings },
  { to: "/admin/data-management", label: "data management", icon: Settings },
  { to: "/admin/settings", label: "Settings", icon: Settings },
] as const;
function AdminNavigation({ onNavigate }: { onNavigate?: () => void }) {
  const { selected } = useClinicContext();
  return (
    <nav className="mt-8 space-y-1">
      {nav.map((n) => (
        <Link
          key={n.to}
          to={n.to}
          onClick={onNavigate}
          activeOptions={{ exact: "exact" in n }}
          className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/75 transition hover:bg-sidebar-accent"
          activeProps={{
            className: "!bg-sidebar-accent !text-sidebar-accent-foreground font-medium",
          }}
        >
          <n.icon className="size-4" />
          {n.label}
        </Link>
      ))}
      {selected !== "all" && (
        <a
          href={`/public-display?clinicId=${encodeURIComponent(selected === "all" ? "northstar" : selected)}`}
          target="_blank"
          onClick={onNavigate}
          className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/75 hover:bg-sidebar-accent"
        >
          <Monitor className="size-4" />
          Public display
        </a>
      )}
    </nav>
  );
}
function AdminLayout() {
  return (
    <ProtectedRoute role="admin">
      <AdminLayoutContent />
    </ProtectedRoute>
  );
}
function AdminLayoutContent() {
  const { profile } = useAuth();
  const { selected } = useClinicContext();
  const initials =
    profile?.fullName
      .split(/\s+/)
      .map((n) => n[0])
      .slice(0, 2)
      .join("") ?? "";
  const { open, clinic, queueDate } = useQueue();
  const { pathname } = useLocation();
  const [menu, setMenu] = useState(false);
  const date = new Date(`${queueDate}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen overflow-y-auto w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-3 py-5 lg:flex">
        <Logo className="px-2" />
        <AdminNavigation />
        <button
          aria-label="Sign out"
          onClick={() => void runAction(logout, "Signed out.")}
          className="mt-auto flex items-center gap-3 rounded-lg p-2 hover:bg-sidebar-accent"
        >
          <div className="grid size-8 place-items-center rounded-full bg-primary-soft text-xs font-semibold text-accent-foreground">
            {initials}
          </div>
          <div className="text-sm leading-tight">
            <div className="font-medium">{profile?.fullName}</div>
            <div className="text-xs text-muted-foreground">Doctor / Administrator</div>
          </div>
        </button>
      </aside>
      <Sheet open={menu} onOpenChange={setMenu}>
        <SheetContent side="left" className="w-72 bg-sidebar">
          <SheetHeader>
            <SheetTitle>
              <Logo />
            </SheetTitle>
            <SheetDescription>Clinic staff navigation</SheetDescription>
          </SheetHeader>
          <AdminNavigation onNavigate={() => setMenu(false)} />
          <button
            className="mt-8 block rounded-lg px-3 py-3 text-sm"
            onClick={() => {
              setMenu(false);
              void runAction(logout, "Signed out.");
            }}
          >
            {profile?.fullName} · Sign out
          </button>
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b border-border bg-background/85 px-4 backdrop-blur md:gap-4 md:px-8">
          <button
            aria-label="Open navigation"
            onClick={() => setMenu(true)}
            className="grid size-11 shrink-0 place-items-center rounded-lg hover:bg-muted lg:hidden"
          >
            <Menu className="size-5" />
          </button>
          <Logo className="[&>span]:hidden sm:[&>span]:inline lg:hidden" />
          <div className="hidden text-sm lg:block">
            <span className="font-medium">{selected === "all" ? "All Clinics" : clinic.name}</span>
            <span className="ml-3 text-muted-foreground">{date}</span>
          </div>
          <div className="min-w-0 max-w-40">
            <ClinicSwitcher all />
          </div>
          <span
            className={cn(
              "ml-auto hidden sm:inline-flex shrink-0 items-center gap-2 rounded-full px-2 py-1 text-xs font-medium sm:px-3",
              open ? "bg-success-soft text-success" : "bg-muted text-muted-foreground",
            )}
          >
            {open ? <LiveDot /> : <span className="size-2 rounded-full bg-current" />}
            {open ? "Queue open" : "Queue closed"}
          </span>
          <GlobalSearch />
          <Notifications role="admin" />
        </header>
        <main className="mx-auto w-full max-w-[1240px] flex-1 px-5 py-8 md:px-8 md:py-10">
          <QueueBoundary kind={pathname === "/admin" || pathname === "/admin/" ? "hero" : "list"}>
            {selected === "all" && (pathname === "/admin" || pathname === "/admin/") ? (
              <OperationalReports />
            ) : selected === "all" &&
              ["/admin/queue", "/admin/live-queue", "/admin/settings"].includes(pathname) ? (
              <p className="surface p-8 text-sm text-muted-foreground">
                Choose a clinic above to manage its queue or settings.
              </p>
            ) : (
              <>
                <Outlet />
                {(pathname === "/admin" || pathname === "/admin/") && (
                  <section className="mt-10">
                    <OperationalReports />
                  </section>
                )}
              </>
            )}
          </QueueBoundary>
        </main>
      </div>
    </div>
  );
}
