import { api } from "@/api/client";
import { useState } from "react";
import { Btn } from "@/components/qc";
import { StartConsultation } from "@/components/clinical";
import { friendlyError } from "@/services/errors";
import type { FlowAppointment } from "@/types/workflow";
export const todayKey = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export function AppointmentNextAction({
  a,
  onChanged,
}: {
  a: FlowAppointment;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function checkIn() {
    setBusy(true);
    setError("");
    try {
      await api("/operations/appointments/" + a.id, {
        method: "PUT",
        body: { status: "checked_in", scheduledAt: a.scheduledAt },
      });
      onChanged();
      window.dispatchEvent(new Event("queuecare:refresh"));
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  let action;
  if (a.visitId)
    action = (
      <a className="text-primary hover:underline" href={"/admin/visits/" + a.visitId}>
        {a.visitStatus === "completed" ? "View visit" : "Continue consultation"} →
      </a>
    );
  else if (["completed", "cancelled", "no_show"].includes(a.status))
    action = (
      <a
        className="text-primary"
        href={
          "/admin/patient-record/" +
          a.patientId +
          "?clinicId=" +
          a.clinicId +
          "&appointmentId=" +
          a.id +
          (a.tokenId ? "&tokenId=" + a.tokenId : "")
        }
      >
        View record →
      </a>
    );
  else if (a.tokenStatus === "serving")
    action = (
      <StartConsultation
        patientId={a.patientId}
        clinicId={a.clinicId}
        appointmentId={a.id}
        tokenId={a.tokenId}
      />
    );
  else if (a.status === "checked_in")
    action = (
      <a
        className="text-primary"
        href={
          "/admin/patient-record/" +
          a.patientId +
          "?clinicId=" +
          a.clinicId +
          "&appointmentId=" +
          a.id +
          (a.tokenId ? "&tokenId=" + a.tokenId : "")
        }
      >
        Open patient →
      </a>
    );
  else if (a.scheduledAt.startsWith(todayKey()))
    action = (
      <Btn variant="secondary" disabled={busy} onClick={() => void checkIn()}>
        {busy ? "Checking in…" : "Check in"}
      </Btn>
    );
  else
    action = (
      <a
        className="text-primary"
        href={
          "/admin/patient-record/" +
          a.patientId +
          "?clinicId=" +
          a.clinicId +
          "&appointmentId=" +
          a.id +
          (a.tokenId ? "&tokenId=" + a.tokenId : "")
        }
      >
        Open patient →
      </a>
    );
  return (
    <div>
      {action}
      {error && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
export function AppointmentRows({
  items,
  onChanged,
  onOpen,
}: {
  items: FlowAppointment[];
  onChanged: () => void;
  onOpen?: (a: FlowAppointment) => void;
}) {
  return (
    <div className="divide-y divide-border">
      <div className="hidden grid-cols-[90px_1.2fr_1fr_1fr_100px_150px] gap-3 px-5 py-3 text-xs text-muted-foreground xl:grid">
        {["Time", "Patient", "Clinic", "Reason", "Status", "Action"].map((l) => (
          <span key={l}>{l}</span>
        ))}
      </div>
      {items.map((a) => (
        <div
          id={"appointment-" + a.id}
          key={a.id}
          className="grid min-w-0 items-center gap-3 px-5 py-4 text-sm sm:grid-cols-2 xl:grid-cols-[90px_1.2fr_1fr_1fr_100px_150px]"
        >
          <span className="text-muted-foreground">
            {a.scheduledAt.slice(11)}
            <span className="block text-xs">{a.scheduledAt.slice(0, 10)}</span>
          </span>
          <div className="min-w-0">
            <a
              className="break-words font-medium hover:text-primary"
              href={
                "/admin/patient-record/" +
                a.patientId +
                "?clinicId=" +
                a.clinicId +
                "&appointmentId=" +
                a.id +
                (a.tokenId ? "&tokenId=" + a.tokenId : "")
              }
            >
              {a.patientName}
            </a>
            {onOpen && (
              <button className="mt-1 block text-xs text-primary" onClick={() => onOpen(a)}>
                Appointment details
              </button>
            )}
          </div>
          <span className="break-words text-muted-foreground">{a.clinicName}</span>
          <span className="break-words">{a.reason || "—"}</span>
          <span className="text-xs text-muted-foreground">
            {a.visitStatus === "in_progress"
              ? "In consultation"
              : a.tokenStatus === "serving"
                ? "Serving"
                : a.status.replaceAll("_", " ")}
          </span>
          <AppointmentNextAction a={a} onChanged={onChanged} />
        </div>
      ))}
    </div>
  );
}
