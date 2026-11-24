import { DoctorLeave } from "@/components/doctor-leave";
import { DoctorScheduleEditor } from "@/components/doctor-schedule-editor";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/qc";
import { useClinicContext } from "@/providers/clinic-provider";
export const Route = createFileRoute("/admin/doctor-schedule")({ component: DoctorSchedule });
export function DoctorSchedule() {
  const { selected, clinics } = useClinicContext();
  const clinicParamId =
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("clinicId");
  const [clinicId, setClinicId] = useState<string>(
    clinicParamId ?? (selected === "all" ? "" : selected),
  );
  useEffect(() => {
    const next = clinicParamId ?? (selected === "all" ? "" : selected);
    setClinicId(next);
  }, [clinicParamId, selected]);
  const clinic = clinics.find((c) => c.id === clinicId);
  return (
    <>
      <PageHeader
        title="Doctor Schedule"
        sub="Weekly availability and appointment duration for each clinic."
      />
      {clinicId ? (
        <DoctorScheduleEditor
          clinicId={clinicId}
          clinicName={clinic?.name}
          onSaved={() => window.dispatchEvent(new Event("queuecare:refresh"))}
        />
      ) : (
        <div className="surface p-6 text-sm text-muted-foreground">
          Select a clinic to configure doctor hours.
        </div>
      )}
      <DoctorLeave />
    </>
  );
}
