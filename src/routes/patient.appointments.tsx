import { PatientDemographics } from "@/components/patient-demographics";
import {
  AttachmentFields,
  uploadAppointmentFiles,
  type SelectedAttachment,
} from "@/components/appointment-files";
import type { PatientProfile } from "@/types/clinical";
import { TokenActions } from "@/components/appointment-tokens";
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
  const patient = useClinicalData<PatientProfile>("/patient/profile");
  const [files, setFiles] = useState<SelectedAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const progress = (key: string, state: string, error = "") =>
    setFiles((previous) => previous.map((f) => (f.key === key ? { ...f, state, error } : f)));
  const remote = useClinicalData<Appointment[]>("/patient/appointments");
  const { clinics, selected } = useClinicContext();
  const [booking, setBooking] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("book") === "1",
  );
  const [clinicId, setClinicId] = useState(selected === "all" ? "" : selected);
  const [notes, setNotes] = useState(""),
    [review, setReview] = useState<{
      scheduledAt: string;
      reason: string;
      dateOfBirth: string;
      gender: string;
    } | null>(null);
  const [confirmed, setConfirmed] = useState<{
    id: string;
    token: { id: string; tokenCode: string; status: string };
    scheduledAt: string;
  } | null>(null);
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
            setFiles([]);
            setConfirmed(null);
          }}
        >
          Book appointment
        </Btn>
      </div>
      {confirmed && (
        <section className="surface mb-5 p-6" role="status">
          <h2 className="font-semibold">Appointment confirmed</h2>
          <p className="mt-2 text-sm">{confirmed.scheduledAt.replace("T", " ")}</p>
          <p className="tabular mt-3 text-4xl font-semibold text-primary">
            {confirmed.token.tokenCode}
          </p>
          <a
            className="mt-4 inline-block text-primary"
            href={"/patient/appointment/" + confirmed.id}
          >
            View appointment →
          </a>
          <TokenActions token={confirmed.token} onChanged={remote.reload} />
          {files.length > 0 && (
            <div className="mt-4 space-y-3">
              <p role="status">
                {files.every((f) => f.state === "Uploaded")
                  ? "All supporting documents uploaded privately."
                  : "Your appointment is confirmed. Retry any unfinished supporting documents below; do not book again."}
              </p>
              <AttachmentFields files={files} onChange={setFiles} disabled={uploading} />
              <Btn
                type="button"
                disabled={uploading || files.every((f) => f.state === "Uploaded")}
                onClick={() => {
                  setUploading(true);
                  void uploadAppointmentFiles(confirmed.id, files, progress).finally(() =>
                    setUploading(false),
                  );
                }}
              >
                Retry unfinished uploads
              </Btn>
            </div>
          )}
        </section>
      )}
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
              {a.token && (
                <p className="mt-2 text-sm font-semibold text-primary">Token {a.token.tokenCode}</p>
              )}
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
      <Dialog
        open={booking}
        onOpenChange={(open) => {
          if (!busy) setBooking(open);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
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
                  dateOfBirth: String(f.get("dateOfBirth") ?? ""),
                  gender: String(f.get("gender") ?? ""),
                });
                return;
              }
              setBusy(true);
              setError("");
              void (async () => {
                if (!patient.data)
                  throw Error("Your patient profile is still loading. Please try again.");
                await api("/patient/profile", {
                  method: "PUT",
                  body: {
                    fullName: patient.data.fullName,
                    phone: patient.data.phone,
                    address: patient.data.address,
                    dateOfBirth: review.dateOfBirth,
                    gender: review.gender,
                  },
                });
                const booked = await api<{ id: string; token: { id: string; tokenCode: string } }>(
                  "/patient/appointments",
                  {
                    method: "POST",
                    body: {
                      clinicId,
                      scheduledAt: review.scheduledAt,
                      reason: review.reason,
                      patientNotes: notes,
                    },
                  },
                );
                setConfirmed({
                  ...booked,
                  token: { ...booked.token, status: "waiting" },
                  scheduledAt: review.scheduledAt,
                });
                if (files.length) {
                  await uploadAppointmentFiles(booked.id, files, progress);
                }
                patient.reload();
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
            <div hidden={!!review} className="space-y-4">
              {patient.data ? (
                <PatientDemographics key={patient.data.id} patient={patient.data} required />
              ) : (
                <ClinicalLoading error={patient.error} retry={patient.reload} />
              )}
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
            <AttachmentFields files={files} onChange={setFiles} disabled={busy} />
            {review && (
              <section className="space-y-3 rounded-lg border p-4">
                <h2>Review your appointment</h2>
                <p>
                  {clinics.find((c) => c.id === clinicId)?.name} ·{" "}
                  {review.scheduledAt.replace("T", " ")}
                </p>
                <p>
                  Gender: {review.gender.replaceAll("_", " ")} · Date of birth: {review.dateOfBirth}
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
            <Btn disabled={busy || !clinicId || !patient.data}>
              {busy ? "Booking…" : review ? "Confirm booking" : "Review booking"}
            </Btn>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
