import { PageHeader } from "@/components/qc";
import { VisitTimeline } from "@/components/clinical";
import { useClinicalData, ClinicalLoading } from "@/data/use-clinical-data";
import type { PatientVisit } from "@/types/clinical";

export function Visits() {
  const remote = useClinicalData<PatientVisit[]>("/patient/visits");
  if (!remote.data) return <ClinicalLoading error={remote.error} retry={remote.reload} />;
  return (
    <>
      <PageHeader
        title="My visits"
        sub="Completed visits and released summaries across all your clinics."
      />
      <VisitTimeline visits={remote.data} />
    </>
  );
}
