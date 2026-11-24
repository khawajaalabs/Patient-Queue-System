import { getRouteApi } from "@tanstack/react-router";
const routeApi = getRouteApi("/patient/visit/$visitId");
import { PatientVisitView } from "@/components/clinical";
import { useClinicalData, ClinicalLoading } from "@/data/use-clinical-data";
import type { PatientVisit } from "@/types/clinical";

export function Detail() {
  const { visitId } = routeApi.useParams();
  const remote = useClinicalData<PatientVisit>(`/patient/visits/${encodeURIComponent(visitId)}`);
  return remote.data ? (
    <>
      <PatientVisitView visit={remote.data} />
    </>
  ) : (
    <ClinicalLoading error={remote.error} retry={remote.reload} />
  );
}
