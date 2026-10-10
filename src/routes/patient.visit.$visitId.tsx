import { createFileRoute } from "@tanstack/react-router";
import { useClinicalData, ClinicalLoading, PatientVisitView } from "@/components/clinical";
import type { PatientVisit } from "@/types/clinical";
export const Route = createFileRoute("/patient/visit/$visitId")({ component: Detail });
function Detail() {
  const { visitId } = Route.useParams();
  const remote = useClinicalData<PatientVisit>(`/patient/visits/${encodeURIComponent(visitId)}`);
  return remote.data ? (
    <>
      <PatientVisitView visit={remote.data} />
      <div className="mt-6 print:hidden"></div>
    </>
  ) : (
    <ClinicalLoading error={remote.error} retry={remote.reload} />
  );
}
