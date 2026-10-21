import {
  AttentionEditor,
  PriorityBadge,
  AttentionBadges,
} from "@/components/appointment-attention";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { TemporalInput, SelectField } from "@/components/form-controls";
import { StartConsultation } from "@/components/clinical";
import { useClinicContext } from "@/providers/clinic-provider";
import { runAction } from "@/services/queue";
import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
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

const queueColumns = "xl:grid-cols-[88px_72px_minmax(0,1fr)_84px_94px_300px]";

export const Route = createFileRoute("/admin/queue")({
  head: () => ({ meta: [{ title: "Live queue — Neuro Spine Care Center Admin" }] }),
  component: LiveQueue,
});
function RowActions({
  entry,
  onDetails,
  onTags,
}: {
  entry: Entry;
  onDetails: () => void;
  onTags: () => void;
}) {
  const q = useQueue(),
    { selected } = useClinicContext();
  const today =
    q.queueDate ===
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date());
  const serving = entry.status === "serving",
    inConsultation = entry.visitStatus === "in_progress";
  const mayCall =
    today &&
    q.open &&
    !q.serving &&
    q.waiting[0]?.id === entry.id &&
    q.waiting[0]?.token === entry.token;
  return (
    <div className="flex flex-wrap items-center gap-2 xl:flex-nowrap xl:justify-end">
      {today && serving && entry.patientId && !inConsultation && (
        <StartConsultation
          compact
          patientId={entry.patientId}
          clinicId={entry.clinicId ?? selected}
          tokenId={entry.id}
          appointmentId={entry.appointmentId ?? undefined}
        />
      )}
      {today && serving && inConsultation && entry.visitId && (
        <a
          className="whitespace-nowrap text-sm text-primary hover:underline"
          href={"/admin/visits/" + entry.visitId}
        >
          Continue consultation
        </a>
      )}
      <Btn
        variant="secondary"
        className="h-10 whitespace-nowrap px-3"
        disabled={
          today && ((entry.status === "waiting" && !mayCall) || (serving && inConsultation))
        }
        title={
          inConsultation
            ? "Complete the consultation before marking this token done."
            : entry.status === "waiting" && !mayCall
              ? "Complete or skip the current patient, then call the first waiting token."
              : undefined
        }
        onClick={() => {
          if (today && entry.status === "waiting")
            void runAction(
              () => actions.call(entry.token),
              `Token ${entry.token} is now being served.`,
            );
          else if (today && serving)
            void runAction(() => actions.markDone(entry.token), "Patient marked as completed.");
          else onDetails();
        }}
      >
        {!today ? "Details" : entry.status === "waiting" ? "Call" : serving ? "Done" : "Details"}
      </Btn>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label={`More actions for ${entry.token}`}
            className="grid size-11 shrink-0 place-items-center rounded-lg hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <MoreHorizontal className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onDetails}>View details</DropdownMenuItem>
          {entry.appointmentId && (
            <DropdownMenuItem onSelect={onTags}>Manage tags</DropdownMenuItem>
          )}
          {today && serving && (
            <DropdownMenuItem
              onSelect={() =>
                void runAction(() => actions.callAgain(entry.token), `Calling ${entry.token} again`)
              }
            >
              Call again
            </DropdownMenuItem>
          )}
          {today && !inConsultation && ["waiting", "serving"].includes(entry.status) && (
            <DropdownMenuItem
              onSelect={() => void runAction(() => actions.skip(entry.token), "Token skipped.")}
            >
              Skip
            </DropdownMenuItem>
          )}
          {today && entry.status === "skipped" && (
            <DropdownMenuItem
              onSelect={() =>
                void runAction(() => actions.requeue(entry.token), "Patient moved back to queue.")
              }
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
  useEffect(() => {
    q.setQueueDate(
      new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date()),
    );
    return () =>
      q.setQueueDate(
        new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date()),
      );
  }, [q.setQueueDate]);
  const [filter, setFilter] = useState<"all" | Status>("all");
  const [term, setTerm] = useState("");
  const [selected, setSelected] = useState<Entry | null>(null);
  const [tagAppointment, setTagAppointment] = useState<string | null>(null);
  const rows = q.queue.filter(
    (e) =>
      (filter === "all" || e.status === filter) &&
      `${e.token} ${e.name}`.toLowerCase().includes(term.trim().toLowerCase()),
  );
  const next = q.waiting[0];
  return (
    <>
      <PageHeader
        title="Live queue"
        sub="Manage today's patient flow."
        right={
          <div className="flex flex-wrap gap-2">
            {q.queueDate ===
              new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date()) && (
              <QueueToggle />
            )}
            <Btn
              disabled={
                !next ||
                Boolean(q.serving) ||
                !q.open ||
                q.queueDate !==
                  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date())
              }
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
      <label className="mb-5 block max-w-xs text-sm">
        Queue date
        <TemporalInput
          type="date"
          value={q.queueDate}
          onChange={(e) => q.setQueueDate(e.target.value)}
          className="mt-2"
        />
      </label>
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
      <div className="surface overflow-hidden" role="table" aria-label="Live queue">
        <div
          role="row"
          className={cn(
            "sr-only gap-3 border-b border-border px-5 py-3 text-xs text-muted-foreground xl:not-sr-only xl:grid xl:px-5 xl:py-3",
            queueColumns,
          )}
        >
          {["Time", "Token", "Patient", "Priority", "Status", "Actions"].map((label) => (
            <span role="columnheader" key={label}>
              {label}
            </span>
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
            role="row"
            key={entry.id ?? entry.token}
            className={cn(
              "grid min-w-0 grid-cols-2 items-center gap-x-3 gap-y-2 border-b border-border px-4 py-3 last:border-0 sm:px-5 xl:gap-3",
              queueColumns,
              entry.status === "serving" ? "bg-info-soft/40" : "hover:bg-muted/30",
            )}
          >
            <p role="cell" className="tabular text-sm text-muted-foreground">
              {entry.scheduledAt ? formatTime(entry.scheduledAt.slice(11)) : "—"}
            </p>
            <div role="cell" className="text-right xl:text-left">
              <button
                onClick={() => setSelected(entry)}
                className="tabular text-sm font-semibold text-primary hover:underline"
              >
                {entry.token}
              </button>
            </div>
            <div role="cell" className="col-span-2 min-w-0 xl:col-span-1">
              <button
                title={entry.name}
                onClick={() => setSelected(entry)}
                className="max-w-full break-words text-left text-sm font-medium hover:underline xl:line-clamp-2"
              >
                {entry.name}
              </button>
              {!!entry.attention?.tags.length && (
                <div className="mt-1.5">
                  <AttentionBadges attention={entry.attention} descriptiveOnly />
                </div>
              )}
            </div>
            <div role="cell">
              <PriorityBadge priority={entry.attention?.priority} />
            </div>
            <div role="cell" className="text-right xl:text-left">
              <StatusPill status={entry.status} />
            </div>
            <div role="cell" className="col-span-2 xl:col-span-1">
              <RowActions
                entry={entry}
                onDetails={() => setSelected(entry)}
                onTags={() => setTagAppointment(entry.appointmentId ?? null)}
              />
            </div>
          </div>
        ))}
      </div>
      <Dialog
        open={!!tagAppointment}
        onOpenChange={(open) => {
          if (!open) setTagAppointment(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogTitle>Appointment tags</DialogTitle>
          <DialogDescription>Staff workflow classification for this appointment.</DialogDescription>
          {tagAppointment && <AttentionEditor appointmentId={tagAppointment} onChanged={q.retry} />}
        </DialogContent>
      </Dialog>
      <PatientDrawer entry={selected} onClose={() => setSelected(null)} />
    </>
  );
}
