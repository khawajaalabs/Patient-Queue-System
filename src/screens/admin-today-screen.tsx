import { useEffect } from "react";
import {
  CalendarDays,
  CheckCircle2,
  RefreshCw,
  Stethoscope,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useClinicContext } from "@/providers/clinic-provider";
import { useClinicalData, ClinicalLoading } from "@/data/use-clinical-data";
import { PageHeader, Btn, StatusPill, LiveDot } from "@/components/qc";
import { AppointmentRows } from "@/components/appointment-rows";
import { cn } from "@/lib/utils";
import type { Status } from "@/lib/queue-store";
import type { TodayState } from "@/types/workflow";

/** Queue statuses come from the database; the pill vocabulary differs slightly. */
function pillFor(status: string): Status {
  if (status === "completed") return "done";
  if (["waiting", "serving", "skipped", "reserved", "left"].includes(status))
    return status as Status;
  return "waiting";
}

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number | string;
  hint: string;
  icon: LucideIcon;
  tone: string;
}) {
  return (
    <div className="surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            {label}
          </p>
          <p className="tabular mt-2 text-3xl font-semibold tracking-tight">{value}</p>
        </div>
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-lg", tone)}>
          <Icon className="size-5" />
        </span>
      </div>
      <p className="mt-3 truncate text-xs text-muted-foreground" title={hint}>
        {hint}
      </p>
    </div>
  );
}

export function Today() {
  const { selected } = useClinicContext(),
    remote = useClinicalData<TodayState>("/admin/today?clinicId=" + encodeURIComponent(selected));
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!document.hidden) remote.reload();
    }, 30000);
    return () => clearInterval(timer);
  }, [remote.reload]);
  if (!remote.data) return <ClinicalLoading error={remote.error} retry={remote.reload} />;
  const d = remote.data,
    waiting = d.queue.filter((t) => t.status === "waiting"),
    serving = d.queue.filter((t) => t.status === "serving"),
    completedTokens = d.queue.filter((t) => t.status === "completed").length,
    completedToday = d.completedToday ?? completedTokens,
    next = d.appointments.filter(
      (a) =>
        !["completed", "cancelled", "no_show"].includes(a.status) && a.visitStatus !== "completed",
    ),
    booked = d.appointments.filter((a) => !["cancelled", "no_show"].includes(a.status)),
    scheduled = booked.filter((a) => ["scheduled", "confirmed"].includes(a.status)).length,
    checkedIn = booked.filter((a) => a.status === "checked_in").length,
    awaitingCheckIn = next.filter((a) => ["scheduled", "confirmed"].includes(a.status)).length,
    rank = (s: string) => (s === "serving" ? 0 : s === "waiting" ? 1 : s === "skipped" ? 2 : 3),
    activeQueue = d.queue
      .filter((t) => ["serving", "waiting", "skipped"].includes(t.status))
      .sort((a, b) => rank(a.status) - rank(b.status)),
    breakdown = d.clinics.map((c) => ({
      clinic: c,
      booked: booked.filter((a) => a.clinicId === c.id).length,
      waiting: d.queue.filter((t) => t.clinic_id === c.id && t.status === "waiting").length,
      serving: d.queue.filter((t) => t.clinic_id === c.id && t.status === "serving").length,
      completed: d.queue.filter((t) => t.clinic_id === c.id && t.status === "completed").length,
      inProgress: d.inProgress.filter((v) => v.clinic_id === c.id).length,
    })),
    maxBooked = Math.max(1, ...breakdown.map((b) => b.booked)),
    showBreakdown = breakdown.length > 0,
    queueUrl = "/admin/live-queue?clinicId=" + encodeURIComponent(selected);
  if (d.setup !== "ready") {
    return (
      <>
        <PageHeader
          title="Home"
          sub={
            (selected === "all" ? "All clinics" : d.clinics[0]?.name || "Clinic setup") +
            " · " +
            d.date
          }
          right={
            <a href="/admin/appointments">
              <Btn variant="secondary">View appointments</Btn>
            </a>
          }
        />
        <section className="surface p-6">
          <h2 className="text-lg font-semibold">
            {d.setup === "clinic" ? "Add your first clinic" : "Set your doctor schedule"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {d.setup === "clinic"
              ? "Add a clinic, set when you are available, then patients can book."
              : "Set your clinic hours before patients can book appointments."}
          </p>
          <ol className="my-5 space-y-2 text-sm">
            <li>1. Add clinic</li>
            <li>2. Set doctor schedule</li>
            <li>3. Patients can book</li>
          </ol>
          {d.setup === "clinic" && (
            <a href="/admin/clinics">
              <Btn>Add clinic</Btn>
            </a>
          )}
        </section>
      </>
    );
  }
  return (
    <>
      <PageHeader
        title="Home"
        sub={
          (selected === "all" ? "All clinics" : d.clinics[0]?.name || "Clinic setup") +
          " · " +
          d.date
        }
        right={
          <div className="flex flex-wrap items-center gap-2">
            <Btn variant="ghost" onClick={remote.reload}>
              <RefreshCw className="size-4" />
              Refresh
            </Btn>
            <a href="/admin/appointments">
              <Btn variant="secondary">All appointments</Btn>
            </a>
            <a href={queueUrl}>
              <Btn>Open live queue</Btn>
            </a>
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard
          label="Appointments today"
          value={booked.length}
          hint={`${scheduled} scheduled · ${checkedIn} checked in`}
          icon={CalendarDays}
          tone="bg-primary-soft text-primary"
        />
        <StatCard
          label="Patients waiting"
          value={waiting.length}
          hint={
            waiting.length ? `Next token ${waiting[0]?.token_code ?? ""}` : "Nobody in the queue"
          }
          icon={Users}
          tone="bg-warning-soft text-warning"
        />
        <StatCard
          label="Currently serving"
          value={serving.length}
          hint={
            serving.length ? serving.map((t) => t.token_code).join(" · ") : "Nobody being called"
          }
          icon={Stethoscope}
          tone="bg-info-soft text-info"
        />
        <StatCard
          label="Completed today"
          value={completedToday}
          hint={`${completedTokens} tokens closed`}
          icon={CheckCircle2}
          tone="bg-success-soft text-success"
        />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <section className="surface overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold">Live queue</h2>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-2.5 py-1 text-xs font-medium text-primary">
                <LiveDot />
                {activeQueue.length} in queue
              </span>
            </div>
            <a className="text-sm text-primary hover:underline" href={queueUrl}>
              Open queue →
            </a>
          </div>
          {activeQueue.length ? (
            <div className="divide-y divide-border">
              <div className="hidden gap-4 px-5 py-3 text-xs text-muted-foreground lg:grid lg:grid-cols-[86px_1.4fr_1fr_100px_1fr_112px]">
                <span>Token</span>
                <span>Patient</span>
                <span>Clinic</span>
                <span>Status</span>
                <span>Reason</span>
                <span>Action</span>
              </div>
              {activeQueue.map((t) => (
                <div
                  key={t.id}
                  className="grid items-center gap-3 px-5 py-3.5 text-sm lg:grid-cols-[86px_1.4fr_1fr_100px_1fr_112px]"
                >
                  <span className="tabular font-semibold">{t.token_code}</span>
                  <div className="min-w-0">
                    <a
                      className="block truncate font-medium hover:text-primary"
                      href={
                        "/admin/patient-record/" +
                        t.patient_id +
                        "?clinicId=" +
                        encodeURIComponent(t.clinic_id)
                      }
                    >
                      {t.patient_name}
                    </a>
                    <span className="block truncate text-xs text-muted-foreground lg:hidden">
                      {t.clinic_name}
                    </span>
                  </div>
                  <span className="hidden truncate text-muted-foreground lg:block">
                    {t.clinic_name}
                  </span>
                  <span>
                    <StatusPill status={pillFor(t.status)} />
                  </span>
                  <span className="truncate text-muted-foreground">
                    {t.reason_for_visit || "—"}
                  </span>
                  <a
                    className="text-primary hover:underline"
                    href={
                      "/admin/patient-record/" +
                      t.patient_id +
                      "?clinicId=" +
                      encodeURIComponent(t.clinic_id)
                    }
                  >
                    Open record →
                  </a>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-5 py-8 text-center">
              <p className="text-sm font-medium">No patients in the queue right now.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Booked appointments appear here automatically with their token.
              </p>
              <a className="mt-3 inline-block text-sm text-primary" href={queueUrl}>
                Open the queue →
              </a>
            </div>
          )}
          <div className="flex items-center justify-between border-t border-border bg-muted/40 px-5 py-3 text-xs text-muted-foreground">
            <span>
              {completedTokens} completed · {waiting.length} waiting · {serving.length} serving
            </span>
            <a className="text-primary hover:underline" href="/admin/history">
              Queue history →
            </a>
          </div>
        </section>

        {showBreakdown && (
          <section className="surface overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="font-semibold">Booked by clinic</h2>
              <a className="text-sm text-primary hover:underline" href="/admin/appointments">
                Details →
              </a>
            </div>
            <ul className="divide-y divide-border">
              {breakdown.map((b) => (
                <li key={b.clinic.id} className="px-5 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm font-medium">{b.clinic.name}</span>
                    <span className="tabular shrink-0 text-sm font-semibold">{b.booked}</span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${Math.round((b.booked / maxBooked) * 100)}%` }}
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{b.waiting} waiting</span>
                    <span>{b.serving} serving</span>
                    <span>{b.completed} completed</span>
                    {b.inProgress > 0 && (
                      <span className="text-info">{b.inProgress} in consultation</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between border-t border-border bg-muted/40 px-5 py-3 text-sm">
              <span className="text-muted-foreground">Total appointments booked</span>
              <span className="tabular font-semibold">{booked.length}</span>
            </div>
          </section>
        )}
      </div>

      <section className="surface mb-6 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 className="font-semibold">Next up</h2>
          <a
            className="text-sm text-primary hover:underline"
            href="/admin/appointments?view=upcoming"
          >
            All {booked.length} appointments today →
          </a>
        </div>
        {next.length ? (
          <>
            <AppointmentRows items={next.slice(0, 10)} onChanged={remote.reload} />
            {next.length > 10 && (
              <div className="border-t border-border bg-muted/40 px-5 py-3 text-xs text-muted-foreground">
                Showing 10 of {next.length} remaining appointments.
              </div>
            )}
          </>
        ) : (
          <div className="p-5 text-sm">
            <p>No upcoming appointments remain for today.</p>
            <a className="mt-3 inline-block text-primary" href="/admin/appointments?view=upcoming">
              View upcoming →
            </a>
          </div>
        )}
      </section>

      <section className="surface overflow-hidden">
        <h2 className="border-b border-border px-5 py-4 font-semibold">Needs attention</h2>
        {awaitingCheckIn > 0 && (
          <a
            className="block border-b border-border p-5 text-sm text-primary"
            href="/admin/appointments"
          >
            {awaitingCheckIn} appointments waiting for check-in →
          </a>
        )}
        {d.inProgress.map((v) => (
          <a
            key={v.id}
            className="flex flex-wrap justify-between gap-2 border-b border-border p-5 text-sm"
            href={"/admin/visits/" + v.id}
          >
            <span>{v.patient_name} · consultation in progress</span>
            <span className="text-primary">Continue consultation →</span>
          </a>
        ))}
        {d.unscheduled.map((c) => (
          <a
            key={c.id}
            href="/admin/clinics"
            className="block border-b border-border p-5 text-sm text-primary"
          >
            Set schedule for {c.name} →
          </a>
        ))}
        {!awaitingCheckIn && !d.inProgress.length && !d.unscheduled.length && (
          <p className="p-5 text-sm text-muted-foreground">You’re up to date.</p>
        )}
      </section>

      <a href="/admin/reports" className="mt-6 inline-block text-sm text-primary">
        View reports and analytics →
      </a>
    </>
  );
}
