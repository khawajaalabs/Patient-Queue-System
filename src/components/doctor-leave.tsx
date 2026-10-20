import { useRef, useState } from "react";
import { useClinicalData, ClinicalLoading } from "@/components/clinical";
import { api } from "@/api/client";
import { Btn, Field } from "@/components/qc";
import { ConfirmAction } from "@/components/queue-feedback";
import { friendlyError } from "@/services/errors";
import { clinicDayKey } from "@/utils/clinic-date";
type Leave = { id: string; startDate: string; endDate: string; reason: string };
type Conflict = {
  id: string;
  clinicId: string;
  clinicName: string;
  patientName: string;
  scheduledAt: string;
};
const dateLabel = (s: string) =>
  new Date(s + "T12:00:00Z").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Karachi",
  });
export function DoctorLeave() {
  const remote = useClinicalData<Leave[]>("/admin/doctor-leave"),
    [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [review, setReview] = useState(false),
    [conflicts, setConflicts] = useState<Conflict[] | null>(null),
    [error, setError] = useState(""),
    [past, setPast] = useState(false);
  const lock = useRef(false);
  async function operation(kind: "review" | "save" | "remove", id?: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      if (kind === "review") {
        const rows = await api<Conflict[]>(
          "/admin/doctor-leave/conflicts?startDate=" +
            encodeURIComponent(start) +
            "&endDate=" +
            encodeURIComponent(end),
        );
        setConflicts(rows);
        setReview(rows.length === 0);
      } else {
        await api("/admin/doctor-leave" + (id ? "/" + id : ""), {
          method: kind === "save" ? "POST" : "DELETE",
          ...(kind === "save" ? { body: { startDate: start, endDate: end, reason } } : {}),
        });
        setReview(false);
        setConflicts(null);
        remote.reload();
        window.dispatchEvent(new Event("queuecare:refresh"));
        if (kind === "save") {
          setStart("");
          setEnd("");
          setReason("");
        }
      }
    } catch (e) {
      setReview(false);
      setError(friendlyError(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const invalidate = () => {
    setReview(false);
    setConflicts(null);
    setError("");
  };
  return (
    <section className="surface mt-6 space-y-5 p-5 sm:p-6" aria-labelledby="leave-heading">
      <div>
        <h2 id="leave-heading" className="font-semibold">
          Special Days Off / Manage Leave
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Temporary leave applies to the doctor across all clinics. Weekly working hours stay
          unchanged.
        </p>
      </div>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void operation("review");
        }}
      >
        <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Leave starts"
            type="date"
            min={clinicDayKey()}
            required
            value={start}
            onChange={(e) => {
              setStart(e.target.value);
              if (!end || end < e.target.value) setEnd(e.target.value);
              invalidate();
            }}
          />
          <Field
            label="Leave ends"
            type="date"
            min={start || clinicDayKey()}
            required
            value={end}
            onChange={(e) => {
              setEnd(e.target.value);
              invalidate();
            }}
          />
          <div className="sm:col-span-2">
            <Field
              label="Reason (optional)"
              maxLength={300}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                invalidate();
              }}
            />
          </div>
        </fieldset>
        <Btn type="submit" variant="secondary" disabled={busy || !start || !end}>
          {busy ? "Checking…" : "Review leave"}
        </Btn>
      </form>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {!!conflicts?.length && (
        <div className="rounded-lg border border-warning/30 bg-warning-soft p-4">
          <p role="alert" className="text-sm">
            This date range has {conflicts.length} existing appointment
            {conflicts.length === 1 ? "" : "s"} that require attention. Review and resolve them
            before saving leave.
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            {conflicts.map((a) => (
              <li key={a.id}>
                <a
                  className="text-primary hover:underline"
                  href={
                    "/admin/appointments?clinicId=" +
                    encodeURIComponent(a.clinicId) +
                    "&appointmentId=" +
                    encodeURIComponent(a.id)
                  }
                >
                  {a.patientName} · {a.clinicName} · {a.scheduledAt.replace("T", " ")}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {review && (
        <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-4">
          <p className="text-sm">
            No conflicting appointments. Block new bookings from {dateLabel(start)} to{" "}
            {dateLabel(end)} at every clinic?
          </p>
          <Btn disabled={busy} onClick={() => void operation("save")}>
            {busy ? "Saving…" : "Confirm leave"}
          </Btn>
        </div>
      )}
      <div className="border-t border-border pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">{past ? "Past leave" : "Upcoming leave"}</h3>
          <Btn type="button" variant="ghost" onClick={() => setPast((v) => !v)}>
            {past ? "Show upcoming" : "Show past leave"}
          </Btn>
        </div>
        {!Array.isArray(remote.data) ? (
          <ClinicalLoading error={remote.error} retry={remote.reload} />
        ) : (
          <ul className="divide-y divide-border">
            {remote.data
              .filter((l) => (past ? l.endDate < clinicDayKey() : l.endDate >= clinicDayKey()))
              .map((l) => (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {dateLabel(l.startDate)}
                      {l.endDate !== l.startDate ? " – " + dateLabel(l.endDate) : ""}
                    </p>
                    {l.reason && (
                      <p className="mt-1 break-words text-sm text-muted-foreground">{l.reason}</p>
                    )}
                  </div>
                  {!past && (
                    <ConfirmAction
                      title="Remove this leave?"
                      description="Normal recurring availability will return, subject to existing bookings and clinic hours."
                      cancel="Keep leave"
                      confirm="Remove leave"
                      onConfirm={() => void operation("remove", l.id)}
                    >
                      <Btn type="button" variant="danger" disabled={busy}>
                        Remove leave
                      </Btn>
                    </ConfirmAction>
                  )}
                </li>
              ))}
            {!remote.data.some((l) =>
              past ? l.endDate < clinicDayKey() : l.endDate >= clinicDayKey(),
            ) && (
              <li className="py-5 text-sm text-muted-foreground">
                {past ? "No past leave." : "No upcoming leave."}
              </li>
            )}
          </ul>
        )}
      </div>
    </section>
  );
}
