import { useClinicalData, ClinicalLoading } from "@/components/clinical";
import { AppointmentFiles } from "@/components/appointment-files";
import type { ClinicalRecord } from "@/types/clinical";
import type { AppointmentContext } from "@/types/clinical-workflow";
export function DoctorSnapshot({
  patientId,
  appointmentId,
  record: provided,
}: {
  patientId: string;
  appointmentId?: string | null;
  record?: ClinicalRecord | undefined;
}) {
  const remote = useClinicalData<ClinicalRecord>(
      provided ? null : `/admin/patients/${encodeURIComponent(patientId)}/record`,
    ),
    context = useClinicalData<AppointmentContext>(
      appointmentId ? `/appointments/${encodeURIComponent(appointmentId)}/context` : null,
    );
  const record = provided ?? remote.data;
  if (!record) return <ClinicalLoading error={remote.error} retry={remote.reload} />;
  const p = record.profile,
    previous = record.visits
      .filter((v) => v.status === "completed")
      .sort((a, b) => b.visitAt.localeCompare(a.visitAt))[0];
  return (
    <section className="surface space-y-4 p-5 my-5">
      <div className="flex flex-wrap justify-between gap-3">
        <h2>Patient snapshot</h2>
        <a className="text-sm underline" href={`/admin/patient-record/${patientId}`}>
          View full history
        </a>
      </div>
      <p className="text-sm">
        {p.fullName} ·{" "}
        {p.dateOfBirth
          ? `Born ${p.dateOfBirth} (${new Date().getFullYear() - Number(p.dateOfBirth.slice(0, 4)) - (new Date().toISOString().slice(5, 10) < p.dateOfBirth.slice(5, 10) ? 1 : 0)} years)`
          : "Date of birth not provided"}{" "}
        · {p.gender || "Gender not provided"} · {p.bloodGroup || "Blood group not recorded"}
      </p>
      <dl className="grid gap-3 sm:grid-cols-3">
        {[
          ["Allergies", p.allergies],
          ["Conditions", p.chronicConditions],
          ["Current medicines", p.currentMedications],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-sm font-semibold">{label}</dt>
            <dd className="text-sm break-words whitespace-pre-wrap">{value || "None recorded"}</dd>
          </div>
        ))}
      </dl>
      {appointmentId &&
        (context.data ? (
          <section className="space-y-3 border-t pt-4">
            <h3>Current appointment</h3>
            <p className="break-words">{context.data.reason || "No reason provided"}</p>
            <p className="whitespace-pre-wrap break-words text-sm">
              {context.data.patientNotes || "No additional patient notes"}
            </p>
            <AppointmentFiles files={context.data.attachments} />
          </section>
        ) : (
          <ClinicalLoading error={context.error} retry={context.reload} />
        ))}
      <section className="border-t pt-4">
        <h3>Latest completed visit</h3>
        {previous ? (
          <>
            <p className="text-sm">
              {previous.clinicName} · {previous.visitAt.slice(0, 10)}
            </p>
            <p className="text-sm break-words whitespace-pre-wrap">
              {previous.diagnosis || "No diagnosis recorded"}
            </p>
            <p className="text-sm break-words whitespace-pre-wrap">{previous.treatmentPlan}</p>
            <p className="text-sm break-words">
              {previous.prescription.items.map((m) => m.medicine).join(", ") || "No prescription"}
            </p>
            {previous.followUpInstructions && (
              <p className="text-sm whitespace-pre-wrap break-words">
                {previous.followUpInstructions}
              </p>
            )}
            {previous.followUpDate && <p className="text-sm">Follow-up: {previous.followUpDate}</p>}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No completed clinical visits.</p>
        )}
      </section>
    </section>
  );
}
