import { ClinicLocationPicker } from "@/components/clinic-location-picker";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Btn, Field } from "@/components/qc";
import { useState } from "react";
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
  const [notes, setNotes] = useState(""),
    [review, setReview] = useState<{ scheduledAt: string; reason: string } | null>(null);
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
            setReview(null);
            setNotes("");
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
              <a
                className="mt-3 inline-block text-sm underline"
                href={`/patient/appointment/${a.id}`}
              >
                View appointment details
              </a>
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
              if (!review) {
                setReview({
                  scheduledAt: String(f.get("scheduledAt") ?? ""),
                  reason: String(f.get("reason") ?? ""),
                });
                return;
              }
              setBusy(true);
              setError("");
              void (async () => {
                await api("/patient/appointments", {
                  method: "POST",
                  body: {
                    clinicId,
                    scheduledAt: review.scheduledAt,
                    reason: review.reason,
                    patientNotes: notes,
                  },
                });
                remote.reload();
                window.dispatchEvent(new Event("queuecare:refresh"));
                setBooking(false);
              })()
                .catch((e) => {
                  setError(friendlyError(e));
                  {
                    setReview(null);
                    setRefresh((n) => n + 1);
                  }
                })
                .finally(() => setBusy(false));
            }}
          >
            <div hidden={!!review}>
              <ClinicLocationPicker
                value={clinicId}
                onChange={(v) => {
                  setClinicId(v);
                  setError("");
                }}
              />
              {clinicId && <AppointmentSlotPicker clinicId={clinicId} refresh={refresh} />}
              <Field label="Reason for appointment (optional)" name="reason" maxLength={300} />
              <label className="mt-4 block text-sm">
                Patient notes (optional)
                <textarea
                  aria-label="Patient notes (optional)"
                  maxLength={2000}
                  rows={3}
                  className="mt-2 w-full rounded-lg border border-input p-3"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
            </div>
            {review && (
              <section className="space-y-3 rounded-lg border p-4">
                <h2>Review your appointment</h2>
                <p>
                  {clinics.find((c) => c.id === clinicId)?.name} ·{" "}
                  {review.scheduledAt.replace("T", " ")}
                </p>
                <p className="break-words">{review.reason || "No reason provided"}</p>
                <p className="whitespace-pre-wrap break-words">{notes}</p>
                {
                  <Btn
                    type="button"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => setReview(null)}
                  >
                    Back to edit
                  </Btn>
                }
              </section>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Btn disabled={busy || !clinicId}>
              {busy ? "Booking…" : review ? "Confirm booking" : "Review booking"}
            </Btn>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
