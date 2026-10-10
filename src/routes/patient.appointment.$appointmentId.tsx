import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, Btn } from "@/components/qc";
import { useClinicalData, ClinicalLoading } from "@/components/clinical";
import {
  AttachmentFields,
  AppointmentFiles,
  uploadAppointmentFiles,
  type SelectedAttachment,
} from "@/components/appointment-files";
import type { AppointmentContext } from "@/types/clinical-workflow";
export const Route = createFileRoute("/patient/appointment/$appointmentId")({
  component: AppointmentDetail,
});
function AppointmentDetail() {
  const { appointmentId } = Route.useParams();
  const remote = useClinicalData<AppointmentContext>(
    `/appointments/${encodeURIComponent(appointmentId)}/context`,
  );
  const [files, setFiles] = useState<SelectedAttachment[]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  if (!remote.data) return <ClinicalLoading error={remote.error} retry={remote.reload} />;
  const a = remote.data;
  return (
    <>
      <PageHeader
        title="Appointment details"
        sub={`${a.clinicName} · ${a.scheduledAt.replace("T", " ")} · ${a.status}`}
      />
      <section className="surface space-y-5 p-6">
        <div>
          <h2>Reason for appointment</h2>
          <p className="whitespace-pre-wrap break-words">{a.reason || "Not provided"}</p>
        </div>
        <div>
          <h2>Your notes</h2>
          <p className="whitespace-pre-wrap break-words">
            {a.patientNotes || "No additional notes."}
          </p>
        </div>
        <h2>Supporting files</h2>
        <AppointmentFiles files={a.attachments} />
      </section>
      {!["completed", "cancelled"].includes(a.status) && (
        <form
          className="surface mt-6 p-6 space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            setBusy(true);
            void uploadAppointmentFiles(a.id, files, (key, state, error = "") =>
              setFiles((current) =>
                current.map((f) => (f.key === key ? { ...f, state, error } : f)),
              ),
            )
              .then((failed) => {
                setMessage(
                  failed
                    ? "Appointment preserved. Retry the files that failed."
                    : "Files uploaded.",
                );
                remote.reload();
              })
              .finally(() => setBusy(false));
          }}
        >
          <AttachmentFields files={files} onChange={setFiles} disabled={busy} />
          <Btn disabled={busy || !files.some((f) => f.state !== "Uploaded")}>
            {busy ? "Uploading files…" : "Upload files"}
          </Btn>
          <p role="status">{message}</p>
        </form>
      )}
    </>
  );
}
