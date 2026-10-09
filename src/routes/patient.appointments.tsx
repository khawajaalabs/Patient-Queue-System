import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Btn, Field } from "@/components/qc";
import { useState } from "react";
import { SelectField } from "@/components/form-controls";
import { appointmentTimeLabel } from "@/lib/appointment-time";
import { AppointmentSlotPicker } from "@/components/appointment-slot-picker";
import { useClinicContext } from "@/providers/clinic-provider";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { api } from "@/api/client";
import { friendlyError } from "@/services/errors";
import { useClinicalData, ClinicalLoading } from "@/components/clinical";
import type { Appointment } from "@/types/local";
export const Route = createFileRoute("/patient/appointments")({ component: Appointments });
export function Appointments() {
  const remote = useClinicalData<Appointment[]>("/patient/appointments");
  const { clinics, selected } = useClinicContext();
  const [booking, setBooking] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("book") === "1",
  );
  const [clinicId, setClinicId] = useState(selected === "all" ? "" : selected);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0);
  return (
    <>
      <PageHeader title="My appointments" sub="Appointments across your clinics." />
      <div className="mb-5">
        <Btn
          onClick={() => {
            setBooking(true);
            setError("");
          }}
        >
          Book appointment
        </Btn>
      </div>
      {!remote.data ? (
        <ClinicalLoading error={remote.error} retry={remote.reload} />
      ) : (
        <div className="surface divide-y divide-border">
          {remote.data.map((a) => (
            <article key={a.id} className="p-5">
              <h2 className="font-medium">{a.clinicName}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {a.scheduledAt.slice(0, 10)} {appointmentTimeLabel(a.scheduledAt.slice(11))} ·{" "}
                {a.status}
              </p>
              <p className="mt-1 text-sm">{a.reason}</p>
            </article>
          ))}
          {!remote.data.length && (
            <p className="p-6 text-sm text-muted-foreground">No appointments scheduled.</p>
          )}
        </div>
      )}
      <Dialog open={booking} onOpenChange={setBooking}>
        <DialogContent>
          <DialogTitle>Book appointment</DialogTitle>
          <DialogDescription>Choose a clinic, date and available time.</DialogDescription>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              setBusy(true);
              setError("");
              void api("/patient/appointments", {
                method: "POST",
                body: {
                  clinicId,
                  scheduledAt: String(f.get("scheduledAt") ?? ""),
                  reason: String(f.get("reason") ?? ""),
                },
              })
                .then(() => {
                  setBooking(false);
                  remote.reload();
                  window.dispatchEvent(new Event("queuecare:refresh"));
                })
                .catch((e) => {
                  setError(friendlyError(e));
                  setRefresh((n) => n + 1);
                })
                .finally(() => setBusy(false));
            }}
          >
            <label className="block space-y-1.5 text-sm font-medium">
              Clinic
              <SelectField
                className="w-full"
                required
                aria-label="Clinic"
                value={clinicId}
                onChange={(e) => {
                  setClinicId(e.target.value);
                  setError("");
                }}
              >
                <option value="">Select a clinic</option>
                {clinics
                  .filter((c) => c.active !== false)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </SelectField>
            </label>
            {clinicId && <AppointmentSlotPicker clinicId={clinicId} refresh={refresh} />}
            <Field label="Reason for appointment (optional)" name="reason" maxLength={300} />
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Btn disabled={busy || !clinicId}>{busy ? "Booking…" : "Confirm booking"}</Btn>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
