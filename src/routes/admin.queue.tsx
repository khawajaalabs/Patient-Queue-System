import { SelectField } from "@/components/form-controls";
import { StartConsultation } from "@/components/clinical";
import { useClinicContext } from "@/providers/clinic-provider";
import { runAction } from "@/services/queue";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, Search, MoreHorizontal } from "lucide-react";
import { actions, formatTime, useQueue, type Entry, type Status } from "@/lib/queue-store";
import { Btn, PageHeader, StatusPill } from "@/components/qc";
import { PatientDrawer } from "@/components/patient-drawer";
import { EmptyQueue, NoQueue, QueueToggle } from "@/components/admin-queue-states";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/queue")({
  head: () => ({ meta: [{ title: "Live queue — QueueCare Admin" }] }),
  component: LiveQueue,
});
function RowActions({ entry, onDetails }: { entry: Entry; onDetails: () => void }) {
  const q = useQueue();
  const { selected } = useClinicContext();
  const mayCall = !q.serving && q.waiting[0]?.token === entry.token;
  const active = entry.status === "waiting" || entry.status === "serving";
  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      {entry.status === "serving" && entry.patientId && (
        <StartConsultation
          patientId={entry.patientId}
          clinicId={entry.clinicId ?? selected}
          tokenId={entry.id}
        />
      )}
      <Btn
        variant="secondary"
        disabled={entry.status === "waiting" && !mayCall}
        title={
          entry.status === "waiting" && !mayCall
            ? "Complete or skip the current patient, then call the first waiting token."
            : undefined
        }
        className="h-11 px-3"
        onClick={() => {
          if (entry.status === "waiting") {
            void runAction(
              () => actions.call(entry.token),
              `Token ${entry.token} is now being served.`,
            );
          } else if (entry.status === "serving") {
            void runAction(() => actions.markDone(entry.token), "Patient marked as completed.");
          } else onDetails();
        }}
      >
        {entry.status === "waiting" ? "Call" : entry.status === "serving" ? "Done" : "Details"}
      </Btn>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label={`More actions for ${entry.token}`}
            className="grid size-11 place-items-center rounded-lg hover:bg-muted"
          >
            <MoreHorizontal className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onDetails}>View details</DropdownMenuItem>
          {entry.status === "serving" && (
            <DropdownMenuItem
              onSelect={() =>
                void runAction(() => actions.callAgain(entry.token), `Calling ${entry.token} again`)
              }
            >
              Call again
            </DropdownMenuItem>
          )}
          {active && (
            <DropdownMenuItem
              onSelect={() => {
                void runAction(() => actions.skip(entry.token), "Token skipped.");
              }}
            >
              Skip
            </DropdownMenuItem>
          )}
          {entry.status === "skipped" && (
            <DropdownMenuItem
              onSelect={() => {
                void runAction(() => actions.requeue(entry.token), "Patient moved back to queue.");
              }}
            >
              Move back to queue
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
export function LiveQueue() {
  const q = useQueue();
  const [filter, setFilter] = useState<"all" | Status>("all");
  const [term, setTerm] = useState("");
  const [selected, setSelected] = useState<Entry | null>(null);
  const rows = q.queue.filter(
    (e) =>
      (filter === "all" || e.status === filter) &&
      `${e.token} ${e.name}`.toLowerCase().includes(term.trim().toLowerCase()),
  );
  const next = q.waiting[0];
  if (!q.openedToday)
    return (
      <>
        <PageHeader title="Live queue" sub="Manage today's patient flow." />
        <NoQueue />
      </>
    );
  return (
    <>
      <PageHeader
        title="Live queue"
        sub="Manage today's patient flow."
        right={
          <div className="flex flex-wrap gap-2">
            <QueueToggle />
            <Btn
              disabled={!next || Boolean(q.serving)}
              title={q.serving ? "Mark done or skip the current patient first." : undefined}
              onClick={() => {
                void runAction(
                  () => actions.callNext(),
                  `Token ${next!.token} is now being served.`,
                );
              }}
            >
              Call next <ArrowRight className="size-4" />
            </Btn>
          </div>
        }
      />
      <dl className="mb-7 grid grid-cols-2 gap-4 rounded-xl border border-border bg-card px-5 py-5 lg:grid-cols-4">
        {[
          ["Queue status", q.open ? "Queue Open" : "Queue Closed"],
          ["Started", formatTime(q.clinic.opening)],
          ["Current token", q.serving?.token ?? "—"],
          ["Waiting", `${q.waiting.length} patients`],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="tabular mt-1.5 text-lg font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      {q.open && q.waiting.length === 0 && q.queue.length > 0 && <EmptyQueue />}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <label className="relative min-w-0 flex-1 sm:max-w-sm">
          <span className="sr-only">Search by patient or token</span>
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search by patient or token"
            className="h-11 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Status</span>
          <SelectField
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
            className="h-11 rounded-lg border border-input bg-card px-3"
          >
            {[
              ["all", "All"],
              ["waiting", "Waiting"],
              ["serving", "Serving"],
              ["done", "Completed"],
              ["skipped", "Skipped"],
              ["left", "Cancelled"],
            ].map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectField>
        </label>
      </div>
      <div className="surface overflow-hidden">
        <div className="hidden grid-cols-[80px_minmax(120px,1fr)_95px_75px_100px_120px] gap-3 border-b border-border px-5 py-3 text-xs text-muted-foreground xl:grid">
          {["Token", "Patient", "Joined", "Waiting", "Status", "Actions"].map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
        {rows.length === 0 &&
          (q.queue.filter((e) => e.status !== "left").length === 0 ? (
            <EmptyQueue />
          ) : (
            <p className="px-6 py-14 text-center text-sm text-muted-foreground">
              No tokens match this view.
            </p>
          ))}
        {rows.map((entry) => (
          <div
            key={entry.token}
            className={cn(
              "grid gap-3 border-b border-border px-5 py-4 last:border-0 sm:grid-cols-[minmax(0,1fr)_auto] xl:grid-cols-[80px_minmax(120px,1fr)_95px_75px_100px_120px] xl:items-center",
              entry.status === "serving" && "bg-info-soft/60",
            )}
          >
            <button
              onClick={() => setSelected(entry)}
              className="text-left font-semibold text-primary hover:underline"
            >
              <span className="tabular text-lg xl:text-base">{entry.token}</span>
              <span className="ml-3 text-sm font-medium text-foreground xl:hidden">
                {entry.name}
              </span>
            </button>
            <button
              onClick={() => setSelected(entry)}
              className="hidden text-left text-sm font-medium hover:underline xl:block"
            >
              {entry.name}
            </button>
            <p className="tabular text-sm text-muted-foreground sm:col-start-1 xl:col-auto">
              <span className="xl:hidden">Joined </span>
              {entry.joinedAt}
            </p>
            <p className="tabular text-sm text-muted-foreground">
              <span className="xl:hidden">Waiting </span>
              {entry.waitMin ?? 0} min
            </p>
            <div>
              <StatusPill status={entry.status} />
            </div>
            <RowActions entry={entry} onDetails={() => setSelected(entry)} />
          </div>
        ))}
      </div>
      <PatientDrawer entry={selected} onClose={() => setSelected(null)} />
    </>
  );
}
