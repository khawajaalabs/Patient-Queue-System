import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, Btn } from "@/components/qc";
import { useClinicalData, ClinicalLoading } from "@/components/clinical";

import type { AppointmentContext } from "@/types/clinical-workflow";
export const Route = createFileRoute("/patient/appointment/$appointmentId")({
  component: AppointmentDetail,
});
function AppointmentDetail() {
  const { appointmentId } = Route.useParams();
  const remote = useClinicalData<AppointmentContext>(
    `/appointments/${encodeURIComponent(appointmentId)}/context`,
  );
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
      </section>
      <a className="mt-6 inline-block text-sm text-primary" href="/patient/appointments">
        Back to appointments
      </a>
    </>
  );
}
