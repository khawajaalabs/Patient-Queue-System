import { NextPatient } from "@/components/next-patient";
import { DoctorSnapshot } from "@/components/doctor-snapshot";
import { PrescriptionPreview } from "@/components/prescription-preview";
import { DocumentsPanel } from "@/components/documents-panel";
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
  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title={v.status === "completed" ? "Completed visit" : "Consultation"}
          sub={`${v.patientName} · ${v.clinicName}`}
          right={
            <div className="flex flex-wrap gap-2">
              <a
                href={
                  "/admin/billing?clinicId=" +
                  encodeURIComponent(v.clinicId) +
                  "&patientId=" +
                  encodeURIComponent(v.patientId) +
                  "&visitId=" +
                  encodeURIComponent(v.id)
                }
              >
                <Btn variant="secondary">Create Invoice</Btn>
              </a>
              <Link to="/admin/patient-record/$patientId" params={{ patientId: v.patientId }}>
                <Btn variant="secondary">Patient record</Btn>
              </Link>
            </div>
          }
        />
        <DoctorSnapshot
          patientId={v.patientId}
          appointmentId={v.appointmentId}
          record={record.data ?? undefined}
        />
        {v.status === "in_progress" ? (
          <VisitEditor
            key={v.id + v.updatedAt}
            visit={v}
            previous={record.data?.visits.filter((item) => item.id !== v.id) ?? []}
            onSaved={(value) => {
              setSaved(value);
              record.reload();
              toast.success(value.status === "completed" ? "Visit completed." : "Draft saved.");
            }}
          />
        ) : (
          <>
            <div className="mb-6 flex flex-wrap items-center gap-4">
              <a href={"/admin?clinicId=" + v.clinicId}>
                <Btn>Back to today’s queue</Btn>
              </a>
              <NextPatient clinicId={v.clinicId} patientId={v.patientId} />
            </div>
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
            <PrescriptionPreview visit={v} />
          </>
        )}
        <div className="mt-6 print:hidden">
          <DocumentsPanel patientId={v.patientId} visitId={v.id} clinicId={v.clinicId} />
        </div>
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
