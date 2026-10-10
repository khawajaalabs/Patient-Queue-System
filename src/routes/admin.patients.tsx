import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useClinicalData, ClinicalLoading } from "@/components/clinical";
import { useClinicContext } from "@/providers/clinic-provider";
import { PageHeader, Btn, Field } from "@/components/qc";
import { SelectField } from "@/components/form-controls";
import type { Condition, PatientSearchRow } from "@/types/workflow";
export const Route = createFileRoute("/admin/patients")({ component: Patients });
export function Patients() {
  const { selected, clinics } = useClinicContext();
  const [q, setQ] = useState(""),
    [clinic, setClinic] = useState(selected),
    [group, setGroup] = useState(""),
    [clinical, setClinical] = useState("");
  const groups = useClinicalData<Condition[]>(
    "/admin/conditions?clinicId=" + encodeURIComponent(clinic),
  );
  const remote = useClinicalData<PatientSearchRow[]>(
    "/admin/patients/search?" +
      new URLSearchParams({ q, clinicId: clinic, conditionId: group, clinical }),
  );
  return (
    <>
      <PageHeader
        title="Patients"
        sub="Find a patient, open their record, and start a consultation."
      />
      <div className="mb-5 flex flex-wrap items-end gap-4">
        <div className="w-full max-w-sm">
          <Field
            label="Search patients"
            placeholder="Name, email or phone"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <label className="text-sm">
          Clinic
          <SelectField
            aria-label="Patient clinic"
            value={clinic}
            onChange={(e) => {
              setClinic(e.target.value);
              setGroup("");
            }}
          >
            <option value="all">All clinics</option>
            {clinics.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
        </label>
        <Field
          label="Free-text clinical matches"
          placeholder="Recorded condition or completed diagnosis"
          value={clinical}
          onChange={(e) => setClinical(e.target.value)}
        />
      </div>
      <section className="mb-5">
        <h2 className="mb-2 text-sm font-semibold">Condition groups</h2>
        <div className="flex flex-wrap gap-2">
          <Btn variant={group ? "ghost" : "secondary"} onClick={() => setGroup("")}>
            All patients
          </Btn>
          {groups.data
            ?.filter((c) => Number(c.count) > 0)
            .map((c) => (
              <Btn
                variant={group === c.id ? "secondary" : "ghost"}
                key={c.id}
                onClick={() => setGroup(c.id)}
              >
                {c.name} · {c.count}
              </Btn>
            ))}
        </div>
        {groups.data && !groups.data.some((c) => Number(c.count) > 0) && (
          <p className="mt-2 text-xs text-muted-foreground">
            Condition groups appear after you add conditions to patient records.
          </p>
        )}
        {groups.error && (
          <p role="alert" className="text-sm text-destructive">
            {groups.error}
          </p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          Group counts use explicit tags only; free-text matches do not assign a disease.
        </p>
      </section>
      {!remote.data ? (
        <ClinicalLoading error={remote.error} retry={remote.reload} />
      ) : (
        <div className="surface divide-y divide-border">
          <div className="hidden gap-4 px-5 py-3 text-xs text-muted-foreground lg:grid lg:grid-cols-[2fr_1fr_1fr_1fr_auto]">
            <span>Patient</span>
            <span>Last visit</span>
            <span>Clinic</span>
            <span>Conditions</span>
            <span>Action</span>
          </div>
          {remote.data.map((p) => (
            <div
              key={p.id}
              className="grid items-center gap-3 px-5 py-4 text-sm lg:grid-cols-[2fr_1fr_1fr_1fr_auto]"
            >
              <div className="min-w-0">
                <p className="font-medium">{p.full_name}</p>
                <p className="break-words text-xs text-muted-foreground">
                  {p.email} · {p.phone}
                </p>
              </div>
              <span className="text-muted-foreground">
                {p.last_visit?.slice(0, 10) || "No visits yet"}
              </span>
              <span>{p.clinic_name || "—"}</span>
              <span>{p.conditions.map((c) => c.name).join(", ") || "No tags"}</span>
              <a
                className="text-primary hover:underline"
                href={"/admin/patient-record/" + p.id + "?clinicId=" + encodeURIComponent(clinic)}
              >
                Open record →
              </a>
            </div>
          ))}
          {!remote.data.length && (
            <p className="p-6 text-sm text-muted-foreground">
              No patients match. Try another name, clinic or condition.
            </p>
          )}
        </div>
      )}
    </>
  );
}
