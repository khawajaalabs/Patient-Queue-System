import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/qc";
import { useClinicalData, ClinicalLoading } from "@/components/clinical";
import type { Appointment } from "@/types/local";
export const Route = createFileRoute("/patient/appointments")({ component: Appointments });
function Appointments() {
  const remote = useClinicalData<Appointment[]>("/patient/appointments");
  return (
    <>
      <PageHeader title="My appointments" sub="Appointments across your clinics." />
      {!remote.data ? (
        <ClinicalLoading error={remote.error} retry={remote.reload} />
      ) : (
        <div className="surface divide-y divide-border">
          {remote.data.map((a) => (
            <article key={a.id} className="p-5">
              <h2 className="font-medium">{a.clinicName}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {a.scheduledAt.replace("T", " ")} · {a.status}
              </p>
              <p className="mt-1 text-sm">{a.reason}</p>
            </article>
          ))}
          {!remote.data.length && (
            <p className="p-6 text-sm text-muted-foreground">No appointments scheduled.</p>
          )}
        </div>
      )}
    </>
  );
}
