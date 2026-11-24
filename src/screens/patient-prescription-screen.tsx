import { getRouteApi } from "@tanstack/react-router";
const routeApi = getRouteApi("/patient/prescription/$visitId");
import { PatientVisitView } from "@/components/clinical";
import { useClinicalData, ClinicalLoading } from "@/data/use-clinical-data";
import type { PatientVisit } from "@/types/clinical";

export function Prescription() {
  const { visitId } = routeApi.useParams();
  const remote = useClinicalData<PatientVisit>(`/patient/visits/${encodeURIComponent(visitId)}`);
  return remote.data ? (
    <PatientVisitView visit={remote.data} prescriptionOnly />
  ) : (
    <ClinicalLoading error={remote.error} retry={remote.reload} />
  );
}
