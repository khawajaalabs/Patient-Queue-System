import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader, Btn } from "@/components/qc";
import {
  useClinicalData,
  ClinicalLoading,
  PrescriptionView,
  VisitTimeline,
} from "@/components/clinical";
import { VisitEditor, noteFields } from "@/components/visit-editor";
import type { ClinicalVisit, ClinicalRecord } from "@/types/clinical";
export const Route = createFileRoute("/admin/visits/$visitId")({ component: Consultation });
function Consultation() {
  const { visitId } = Route.useParams();
  const remote = useClinicalData<ClinicalVisit>(`/admin/visits/${encodeURIComponent(visitId)}`);
  const [saved, setSaved] = useState<ClinicalVisit | null>(null);
  const v = saved?.id === visitId ? saved : remote.data;
  const record = useClinicalData<ClinicalRecord>(
    v ? `/admin/patients/${encodeURIComponent(v.patientId)}/record` : null,
  );
  if (!v) return <ClinicalLoading error={remote.error} retry={remote.reload} />;
  const p = record.data?.profile;
  const today = new Date();
  const age = p?.dateOfBirth
    ? today.getFullYear() -
      Number(p.dateOfBirth.slice(0, 4)) -
      (today.toISOString().slice(5, 10) < p.dateOfBirth.slice(5, 10) ? 1 : 0)
    : null;
  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title={v.status === "completed" ? "Completed visit" : "Consultation"}
          sub={`${v.patientName} · ${v.clinicName}`}
          right={
            <Link to="/admin/patient-record/$patientId" params={{ patientId: v.patientId }}>
              <Btn variant="secondary">Patient record</Btn>
            </Link>
          }
        />
        <section className="surface mb-6 p-6">
          <div className="flex flex-wrap justify-between gap-4">
            <div>
              <h2 className="font-semibold">{v.patientName}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {age === null ? "Age not provided" : `${age} years`} ·{" "}
                {p?.gender || "Gender not provided"} · {v.clinicName}
              </p>
            </div>
            <div className="text-sm">
              <p>{v.tokenCode ? `Queue token: ${v.tokenCode}` : "No queue token"}</p>
              <p className="mt-1 text-muted-foreground">
                {v.appointmentAt
                  ? `Appointment: ${v.appointmentAt.replace("T", " ")}`
                  : "No linked appointment"}
              </p>
            </div>
          </div>
          <dl className="mt-5 grid gap-4 text-sm md:grid-cols-3">
            {[
              ["Allergies", p?.allergies],
              ["Conditions", p?.chronicConditions],
              ["Current medications", p?.currentMedications],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="font-medium">{label}</dt>
                <dd className="mt-1 whitespace-pre-wrap text-muted-foreground">
                  {p ? value || "None recorded" : "Loading patient information…"}
                </dd>
              </div>
            ))}
          </dl>
          {record.error && (
            <p role="alert" className="mt-4 text-sm text-destructive">
              {record.error}
            </p>
          )}
        </section>
        {v.status === "in_progress" ? (
          <VisitEditor
            key={v.id + v.updatedAt}
            visit={v}
            onSaved={(value) => {
              setSaved(value);
              record.reload();
              toast.success(value.status === "completed" ? "Visit completed." : "Draft saved.");
            }}
          />
        ) : (
          <>
            <div className="surface grid gap-5 p-6 md:grid-cols-2">
              {noteFields.map(([key, label]) => (
                <div key={key}>
                  <h2 className="text-sm font-semibold">{label}</h2>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                    {v[key] || "Not recorded"}
                  </p>
                </div>
              ))}
              <div>
                <h2 className="text-sm font-semibold">Vitals</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {Object.entries(v.vitals)
                    .filter(([, value]) => value !== null)
                    .map(([key, value]) => `${key}: ${value}`)
                    .join(" · ") || "Not recorded"}
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                Follow-up: {v.followUpDate ?? "Not scheduled"} · Completed records are read-only.
              </p>
            </div>
            <Btn className="mt-5" variant="secondary" onClick={() => window.print()}>
              Print prescription
            </Btn>
          </>
        )}
        <h2 className="mb-4 mt-8 text-lg font-semibold">Previous visits across clinics</h2>
        <VisitTimeline
          visits={record.data?.visits.filter((item) => item.id !== v.id).slice(0, 5) ?? []}
          admin
        />
      </div>
      {v.status === "completed" && <PrescriptionView visit={v} />}
    </>
  );
}
