import { SelectField } from "@/components/form-controls";
import { DocumentsPanel } from "@/components/documents-panel";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "@/api/client";
import { useClinicContext } from "@/providers/clinic-provider";
import { PageHeader, Btn } from "@/components/qc";
import {
  useClinicalData,
  ClinicalLoading,
  StartConsultation,
  VisitTimeline,
} from "@/components/clinical";
import { friendlyError } from "@/services/errors";
import type { ClinicalRecord } from "@/types/clinical";
export const Route = createFileRoute("/admin/patient-record/$patientId")({
  component: PatientRecord,
});
function PatientRecord() {
  const { patientId } = Route.useParams(),
    { selected } = useClinicContext();
  const record = useClinicalData<ClinicalRecord>(
    `/admin/patients/${encodeURIComponent(patientId)}/record`,
  );
  const [filter, setFilter] = useState("all"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (!record.data) return <ClinicalLoading error={record.error} retry={record.reload} />;
  const { profile: p, visits, queueHistory } = record.data;
  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api(`/admin/patients/${encodeURIComponent(patientId)}/clinical-profile`, {
        method: "PUT",
        body: Object.fromEntries(
          ["allergies", "chronicConditions", "currentMedications", "generalNotes"].map((k) => [
            k,
            String(f.get(k) ?? ""),
          ]),
        ),
      });
      record.reload();
      window.dispatchEvent(new Event("queuecare:refresh"));
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeader
        title={p.fullName}
        sub="Global patient record · history across all clinics"
        right={<StartConsultation patientId={p.id} clinicId={selected} />}
      />
      <section className="surface mb-6 p-6">
        <h2 className="mb-4 text-lg font-semibold">Patient overview</h2>
        <dl className="grid gap-5 text-sm sm:grid-cols-2 md:grid-cols-3">
          {[
            ["Date of birth", p.dateOfBirth],
            ["Gender", p.gender.replaceAll("_", " ")],
            ["Blood group", p.bloodGroup],
            ["Phone", p.phone],
            ["Email", p.email],
            ["Address", p.address],
            ["Emergency contact", `${p.emergencyContactName} ${p.emergencyContactPhone}`.trim()],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="mt-1 break-words font-medium">{value || "Not provided"}</dd>
            </div>
          ))}
        </dl>
      </section>
      <form onSubmit={save} className="surface mb-8 p-6">
        <h2 className="mb-5 text-lg font-semibold">Relevant clinical information</h2>
        <div className="grid gap-5 md:grid-cols-2">
          {(
            [
              ["allergies", "Allergies"],
              ["chronicConditions", "Chronic conditions"],
              ["currentMedications", "Current medications"],
              ["generalNotes", "General patient notes (doctor only)"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block text-sm font-medium">
              {label}
              <textarea
                key={p[key]}
                name={key}
                rows={3}
                maxLength={2000}
                defaultValue={p[key] ?? ""}
                className="mt-2 w-full rounded-lg border border-input bg-card p-3 text-sm font-normal"
              />
            </label>
          ))}
        </div>
        {error && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {error}
          </p>
        )}
        <Btn className="mt-5" disabled={busy}>
          Save clinical information
        </Btn>
      </form>
      <div className="mb-8">
        <DocumentsPanel patientId={p.id} />
      </div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">Clinical visit history</h2>
        <SelectField
          aria-label="Filter visit clinic"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-lg border border-input bg-card p-2 text-sm"
        >
          <option value="all">All clinics</option>
          {[...new Map(visits.map((v) => [v.clinicId, v.clinicName])).entries()].map(
            ([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ),
          )}
        </SelectField>
      </div>
      <VisitTimeline
        visits={visits.filter((v) => filter === "all" || v.clinicId === filter)}
        admin
      />
      <h2 className="mb-4 mt-8 text-lg font-semibold">Queue history</h2>
      <div className="surface divide-y divide-border">
        {queueHistory.length ? (
          queueHistory.map((v) => (
            <div key={v.id} className="flex flex-wrap justify-between gap-3 p-4 text-sm">
              <span>
                {v.date} · {v.clinicName}
              </span>
              <span>
                {v.tokenCode} · {v.status}
              </span>
            </div>
          ))
        ) : (
          <p className="p-6 text-sm text-muted-foreground">No previous tokens.</p>
        )}
      </div>
      <Link to="/admin/patients" className="mt-6 inline-block text-sm text-primary">
        Back to patients
      </Link>
    </>
  );
}
