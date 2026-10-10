import { useState, useEffect } from "react";
import { api } from "@/api/client";
import { Btn, Field, PageHeader } from "@/components/qc";
import { useClinicContext } from "@/providers/clinic-provider";
import { useClinicalData, ClinicalLoading } from "@/components/clinical";
import { friendlyError } from "@/services/errors";
import type { CatalogMedicine } from "@/types/clinical-workflow";
export const medicineFields = [
  ["name", "Medicine name", 160],
  ["strength", "Strength (optional)", 120],
  ["dosageForm", "Dosage form (optional)", 120],
  ["defaultDose", "Default dose (optional)", 120],
  ["defaultFrequency", "Default frequency (optional)", 120],
  ["defaultDuration", "Default duration (optional)", 120],
  ["defaultInstructions", "Default instructions (optional)", 300],
] as const;
const blank = {
  name: "",
  strength: "",
  dosageForm: "",
  defaultDose: "",
  defaultFrequency: "",
  defaultDuration: "",
  defaultInstructions: "",
  active: true,
};
export function MedicineLibrary() {
  const { selected } = useClinicContext();
  const remote = useClinicalData<CatalogMedicine[]>(
    selected === "all" ? null : `/admin/medicine-library?clinicId=${encodeURIComponent(selected)}`,
  );
  const [draft, setDraft] = useState(blank),
    [editing, setEditing] = useState(""),
    [search, setSearch] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    setDraft(blank);
    setEditing("");
    setSearch("");
    setError("");
  }, [selected]);
  return (
    <>
      <PageHeader
        title="Medicine library"
        sub="Clinic-specific prescribing shortcuts. Custom medicines remain available in the consultation."
      />
      {selected === "all" ? (
        <p className="surface p-6">Select a clinic to manage its medicine library.</p>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <section className="surface p-6 space-y-4">
            <Field
              label="Search medicines"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {!remote.data ? (
              <ClinicalLoading error={remote.error} retry={remote.reload} />
            ) : (
              remote.data
                .filter((m) => m.name.toLowerCase().includes(search.toLowerCase()))
                .map((m) => (
                  <article key={m.id} className="border-b py-4">
                    <h2>{m.name}</h2>
                    <p className="text-sm text-muted-foreground">
                      {[m.strength, m.dosageForm, m.active ? "Active" : "Inactive"]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <Btn
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setEditing(m.id);
                        const { id: _id, clinicId: _clinic, ...values } = m;
                        setDraft(values);
                        setError("");
                      }}
                    >
                      Edit medicine
                    </Btn>
                  </article>
                ))
            )}
            {remote.data?.length === 0 && <p>No medicines saved. Add your first library entry.</p>}
          </section>
          <form
            className="surface p-6 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              void api(
                `/admin/medicine-library${editing ? "/" + editing : "?clinicId=" + encodeURIComponent(selected)}`,
                { method: editing ? "PUT" : "POST", body: draft },
              )
                .then(() => {
                  setDraft(blank);
                  setEditing("");
                  remote.reload();
                })
                .catch((e) => setError(friendlyError(e)))
                .finally(() => setBusy(false));
            }}
          >
            <h2>{editing ? "Edit medicine" : "Add medicine"}</h2>
            {medicineFields.map(([key, label, max]) => (
              <Field
                key={key}
                label={label}
                required={key === "name"}
                maxLength={max}
                value={draft[key]}
                onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
              />
            ))}
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(e) => setDraft((d) => ({ ...d, active: e.target.checked }))}
              />
              Active in suggestions
            </label>
            {error && <p role="alert">{error}</p>}
            <div className="flex gap-3">
              <Btn disabled={busy}>{busy ? "Saving medicine…" : "Save medicine"}</Btn>
              {editing && (
                <Btn
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setEditing("");
                    setDraft(blank);
                  }}
                >
                  Cancel edit
                </Btn>
              )}
            </div>
          </form>
        </div>
      )}
    </>
  );
}
