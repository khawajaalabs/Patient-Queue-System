import { SelectField } from "@/components/form-controls";
import { useEffect, useState } from "react";
import { api } from "@/api/client";
import { useAuth } from "@/providers/auth-provider";
import { useClinicContext } from "@/providers/clinic-provider";
import { ClinicalLoading, StartConsultation, useClinicalData } from "@/components/clinical";
import { Btn, Field, PageHeader } from "@/components/qc";
import { PatientPicker } from "@/components/patient-picker";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { friendlyError } from "@/services/errors";
import type { Appointment } from "@/types/local";
const dayKey = (d: Date) =>
  [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
export function AppointmentCalendar() {
  const { selected } = useClinicContext(),
    { profile } = useAuth(),
    [view, setView] = useState("week"),
    [date, setDate] = useState(() =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Karachi",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date()),
    ),
    [status, setStatus] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [edit, setEdit] = useState<Appointment | "new" | null>(null);
  const target =
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("appointmentId");
  const remote = useClinicalData<Appointment[]>(
      "/schedule?clinicId=" + encodeURIComponent(selected),
    ),
    admin = profile?.role === "admin";
  useEffect(() => {
    const fn = () => remote.reload();
    window.addEventListener("queuecare:updated", fn);
    return () => window.removeEventListener("queuecare:updated", fn);
  }, [selected]);
  useEffect(() => setEdit(null), [selected]);
  useEffect(() => {
    const found = remote.data?.find((a) => a.id === target);
    if (found) {
      setView("list");
      setDate(found.scheduledAt.slice(0, 10));
    }
  }, [remote.data, target]);
  const start = new Date(date + "T12:00:00"),
    end = new Date(start);
  if (view === "week") {
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    end.setTime(+start);
    end.setDate(end.getDate() + 6);
  } else if (view === "month") {
    start.setDate(1);
    end.setMonth(end.getMonth() + 1, 0);
  }
  const filtered = remote.data
    ?.filter(
      (a) =>
        (!status || a.status === status) &&
        (view === "list" ||
          (a.scheduledAt.slice(0, 10) >= dayKey(start) &&
            a.scheduledAt.slice(0, 10) <= dayKey(end))),
    )
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const days: Date[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) days.push(new Date(d));
  async function action(a: Appointment, target: string, time = a.scheduledAt) {
    setBusy(true);
    setError("");
    try {
      await api("/operations/appointments/" + encodeURIComponent(a.id), {
        method: "PUT",
        body: { status: target, scheduledAt: time },
      });
      setEdit(null);
      remote.reload();
      window.dispatchEvent(new Event("queuecare:refresh"));
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  function card(a: Appointment) {
    return (
      <article
        key={a.id}
        id={"appointment-" + a.id}
        className={
          "min-w-0 rounded-lg border bg-card p-3 " +
          (a.id === target ? "border-primary ring-1 ring-primary" : "border-border")
        }
      >
        <p className="break-words text-sm font-medium">{a.patientName}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {a.scheduledAt.replace("T", " ")} · {a.clinicName}
        </p>
        <p className="mt-1 text-xs">{a.status.replaceAll("_", " ")}</p>
        {!["completed", "cancelled", "no_show"].includes(a.status) && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Btn variant="secondary" disabled={busy} onClick={() => setEdit(a)}>
              Manage
            </Btn>
            {admin && (
              <StartConsultation
                patientId={a.patientId}
                clinicId={a.clinicId}
                appointmentId={a.id}
              />
            )}
          </div>
        )}
      </article>
    );
  }
  return (
    <>
      <PageHeader
        title="Appointments"
        sub="Schedule in clinic local time. Clinic hours and appointment slot spacing apply."
        right={selected !== "all" && <Btn onClick={() => setEdit("new")}>Add appointment</Btn>}
      />
      <div className="surface mb-5 flex flex-wrap items-end gap-3 p-4">
        {["day", "week", "month", "list"].map((v) => (
          <Btn variant={view === v ? "primary" : "secondary"} key={v} onClick={() => setView(v)}>
            {v}
          </Btn>
        ))}
        <Field
          label="Date"
          type="date"
          value={date}
          onChange={(e) => {
            if (e.target.value) setDate(e.target.value);
          }}
        />
        <label className="text-sm">
          Status
          <SelectField
            className="ml-2 rounded-lg border border-input bg-card p-2"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All statuses</option>
            {["scheduled", "confirmed", "checked_in", "completed", "cancelled", "no_show"].map(
              (s) => (
                <option key={s}>{s}</option>
              ),
            )}
          </SelectField>
        </label>
        <Btn variant="secondary" onClick={remote.reload}>
          Refresh
        </Btn>
      </div>
      {error && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {error}
        </p>
      )}
      {!remote.data ? (
        <ClinicalLoading error={remote.error} retry={remote.reload} />
      ) : view === "list" ? (
        <div className="grid gap-3 md:grid-cols-2">
          {filtered?.map(card)}
          {!filtered?.length && (
            <p className="surface p-6 text-sm">No appointments match these filters.</p>
          )}
        </div>
      ) : (
        <>
          <div
            className={
              "grid gap-3 " +
              (view === "day" ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2 xl:grid-cols-7")
            }
          >
            {days.map((d) => (
              <section key={dayKey(d)} className="surface min-w-0 p-3">
                <h2 className="mb-3 text-sm font-semibold">
                  {d.toLocaleDateString("en-GB", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  })}
                </h2>
                <div className="space-y-2">
                  {filtered?.filter((a) => a.scheduledAt.startsWith(dayKey(d))).map(card)}
                  {!filtered?.some((a) => a.scheduledAt.startsWith(dayKey(d))) && (
                    <p className="text-xs text-muted-foreground">No appointments</p>
                  )}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
      <Dialog
        open={!!edit}
        onOpenChange={(o) => {
          if (!o) setEdit(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogTitle>{edit === "new" ? "Book appointment" : "Manage appointment"}</DialogTitle>
          <DialogDescription>
            {edit && edit !== "new"
              ? edit.patientName + " · " + edit.clinicName
              : "Select an existing patient for this clinic."}
          </DialogDescription>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <form
            key={edit === "new" ? "new" : edit?.id}
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget),
                time = String(f.get("scheduledAt"));
              if (edit && edit !== "new") {
                void action(edit, "scheduled", time);
                return;
              }
              setBusy(true);
              setError("");
              void api(
                (admin ? "/admin/appointments" : "/staff/appointments") +
                  "?clinicId=" +
                  encodeURIComponent(selected),
                {
                  method: "POST",
                  body: {
                    patientId: String(f.get("patientId")),
                    scheduledAt: time,
                    reason: String(f.get("reason") ?? ""),
                  },
                },
              )
                .then(() => {
                  setEdit(null);
                  remote.reload();
                })
                .catch((e) => setError(friendlyError(e)))
                .finally(() => setBusy(false));
            }}
          >
            {edit === "new" && <PatientPicker />}
            <Field
              required
              label="Date and time"
              name="scheduledAt"
              type="datetime-local"
              defaultValue={edit && edit !== "new" ? edit.scheduledAt : date + "T09:00"}
            />
            {edit === "new" && <Field label="Reason (optional)" name="reason" maxLength={300} />}
            <Btn disabled={busy}>{edit === "new" ? "Book appointment" : "Reschedule"}</Btn>
          </form>
          {edit && edit !== "new" && (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
              {[
                ["confirmed", "Confirm"],
                ["checked_in", "Check in"],
                ["no_show", "Mark no-show"],
                ["cancelled", "Cancel appointment"],
              ].map(([s, label]) => (
                <Btn
                  variant="secondary"
                  disabled={busy}
                  key={s}
                  onClick={() => void action(edit, s!)}
                >
                  {label}
                </Btn>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
