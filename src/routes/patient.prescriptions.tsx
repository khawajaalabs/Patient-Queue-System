import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/qc";
import { useClinicalData, ClinicalLoading } from "@/components/clinical";
import type { PatientVisit } from "@/types/clinical";
export const Route = createFileRoute("/patient/prescriptions")({ component: Prescriptions });
function Prescriptions() {
  const remote = useClinicalData<PatientVisit[]>("/patient/prescriptions");
  if (!remote.data) return <ClinicalLoading error={remote.error} retry={remote.reload} />;
  return (
    <>
      <PageHeader title="My prescriptions" sub="Prescriptions from your completed consultations." />
      <div className="surface divide-y divide-border">
        {remote.data.length ? (
          remote.data.map((v) => (
            <Link
              key={v.id}
              to="/patient/prescription/$visitId"
              params={{ visitId: v.id }}
              className="block p-5 hover:bg-muted/40"
            >
              <p className="font-medium">{v.clinicName}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {new Date(v.visitAt).toLocaleDateString("en-GB", { timeZone: "Asia/Karachi" })} ·{" "}
                {v.doctorName} · {v.prescription.items.length} medicine(s)
              </p>
            </Link>
          ))
        ) : (
          <p className="p-8 text-sm text-muted-foreground">No prescriptions yet.</p>
        )}
      </div>
    </>
  );
}
