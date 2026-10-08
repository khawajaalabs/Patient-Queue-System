import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/qc";
import { useClinicalData, ClinicalLoading, VisitTimeline } from "@/components/clinical";
import type { PatientVisit } from "@/types/clinical";
export const Route = createFileRoute("/patient/visits")({ component: Visits });
function Visits() {
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
