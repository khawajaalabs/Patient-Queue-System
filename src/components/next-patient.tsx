import { useClinicalData } from "@/components/clinical";
import type { TodayState } from "@/types/workflow";
export function NextPatient({ clinicId, patientId }: { clinicId: string; patientId: string }) {
  const remote = useClinicalData<TodayState>(
    "/admin/today?clinicId=" + encodeURIComponent(clinicId),
  );
  const token = remote.data?.queue.find(
    (t) => t.patient_id !== patientId && ["serving", "waiting"].includes(t.status),
  );
  const appointment = remote.data?.appointments.find(
    (a) =>
      a.patientId !== patientId &&
      !["completed", "cancelled", "no_show"].includes(a.status) &&
      a.visitStatus !== "completed",
  );
  const target = token?.patient_id ?? appointment?.patientId;
  const href = target
    ? "/admin/patient-record/" +
      target +
      "?" +
      new URLSearchParams({
        clinicId,
        ...(token ? { tokenId: token.id } : {}),
        ...(appointment && appointment.patientId === target
          ? { appointmentId: appointment.id }
          : {}),
      })
    : "/admin/appointments?clinicId=" + encodeURIComponent(clinicId);
  return (
    <a className="text-sm text-primary" href={href}>
      {target ? "Open next patient" : "View appointments"} →
    </a>
  );
}
