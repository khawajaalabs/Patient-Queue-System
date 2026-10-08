import { useState } from "react";
import { api } from "@/api/client";
import { Btn, Field } from "@/components/qc";
import { friendlyError } from "@/services/errors";
import type { ClinicalVisit } from "@/types/clinical";
export const noteFields = [
  ["reasonForVisit", "Reason for visit"],
  ["chiefComplaint", "Chief complaint"],
  ["historyNotes", "Symptoms / history (doctor only)"],
  ["examinationNotes", "Examination notes (doctor only)"],
  ["diagnosis", "Diagnosis"],
  ["treatmentPlan", "Treatment plan (patient visible)"],
  ["followUpInstructions", "Follow-up instructions (patient visible)"],
  ["privateNotes", "Private doctor notes"],
  ["patientSummary", "Patient-visible summary"],
] as const;
const vitalFields = [
  ["systolic", "Systolic (mmHg)", 1, 400],
  ["diastolic", "Diastolic (mmHg)", 1, 300],
  ["pulse", "Pulse (bpm)", 1, 400],
  ["temperature", "Temperature (°C)", 20, 50],
  ["respiratoryRate", "Respiratory rate / min", 1, 100],
  ["oxygenSaturation", "SpO2 (%)", 0, 100],
  ["weight", "Weight (kg)", 0.1, 700],
  ["height", "Height (cm)", 1, 300],
] as const;
export function VisitEditor({
  visit,
  onSaved,
}: {
  visit: ClinicalVisit;
  onSaved: (v: ClinicalVisit) => void;
}) {
  const [draft, setDraft] = useState(() => ({
    reasonForVisit: visit.reasonForVisit,
    chiefComplaint: visit.chiefComplaint,
    historyNotes: visit.historyNotes,
    examinationNotes: visit.examinationNotes,
    diagnosis: visit.diagnosis ?? "",
    releaseDiagnosis: visit.releaseDiagnosis,
    treatmentPlan: visit.treatmentPlan,
    followUpInstructions: visit.followUpInstructions,
    followUpDate: visit.followUpDate,
    privateNotes: visit.privateNotes,
    patientSummary: visit.patientSummary,
    vitals: { ...visit.vitals },
    prescription: {
      instructions: visit.prescription.instructions,
      items: visit.prescription.items.map((m) => ({ ...m })),
    },
  }));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const save = async (complete = false) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const data = await api<ClinicalVisit>(
        `/admin/visits/${visit.id}${complete ? "/complete" : ""}`,
        { method: complete ? "POST" : "PUT", body: draft },
      );
      onSaved(data);
      window.dispatchEvent(new Event("queuecare:refresh"));
      setMessage(
        complete
          ? "Visit completed. Patient-visible information is now available in the portal."
          : "Draft saved.",
      );
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="space-y-6"
    >
      <section className="surface p-6">
        <h2 className="mb-5 text-lg font-semibold">
          Vitals <span className="text-sm font-normal text-muted-foreground">(optional)</span>
        </h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {vitalFields.map(([key, label, min, max]) => (
            <Field
              key={key}
              label={label}
              type="number"
              step="any"
              min={min}
              max={max}
              value={draft.vitals[key] ?? ""}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  vitals: {
                    ...d.vitals,
                    [key]: e.target.value === "" ? null : Number(e.target.value),
                  },
                }))
              }
            />
          ))}
        </div>
      </section>
      <section className="surface p-6">
        <h2 className="mb-5 text-lg font-semibold">Clinical notes</h2>
        <div className="grid gap-5 md:grid-cols-2">
          {noteFields.map(([key, label]) => (
            <label key={key} className="block text-sm font-medium">
              {label}
              <textarea
                rows={3}
                maxLength={2000}
                className="mt-2 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm font-normal outline-none focus:border-primary"
                value={draft[key]}
                onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
              />
            </label>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-6">
          <label className="text-sm">
            <input
              type="checkbox"
              className="mr-2 accent-primary"
              checked={draft.releaseDiagnosis}
              onChange={(e) => setDraft((d) => ({ ...d, releaseDiagnosis: e.target.checked }))}
            />
            Release diagnosis to patient on completion
          </label>
          <Field
            label="Follow-up date (optional)"
            type="date"
            value={draft.followUpDate ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, followUpDate: e.target.value || null }))}
          />
        </div>
      </section>
      <section className="surface p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Prescription</h2>
          <Btn
            type="button"
            variant="secondary"
            disabled={draft.prescription.items.length >= 20}
            onClick={() =>
              setDraft((d) => ({
                ...d,
                prescription: {
                  ...d.prescription,
                  items: [
                    ...d.prescription.items,
                    { medicine: "", dose: "", frequency: "", duration: "", instructions: "" },
                  ],
                },
              }))
            }
          >
            Add medicine
          </Btn>
        </div>
        <div className="space-y-5">
          {draft.prescription.items.map((m, index) => (
            <div key={index} className="rounded-lg border border-border p-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {(
                  [
                    ["medicine", "Medicine name", 160],
                    ["dose", "Strength / dose", 120],
                    ["frequency", "Frequency", 120],
                    ["duration", "Duration", 120],
                    ["instructions", "Instructions", 300],
                  ] as const
                ).map(([key, label, max]) => (
                  <Field
                    key={key}
                    label={`${label} ${index + 1}`}
                    maxLength={max}
                    required={key === "medicine"}
                    value={m[key]}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        prescription: {
                          ...d.prescription,
                          items: d.prescription.items.map((item, i) =>
                            i === index ? { ...item, [key]: e.target.value } : item,
                          ),
                        },
                      }))
                    }
                  />
                ))}
              </div>
              <Btn
                type="button"
                variant="ghost"
                className="mt-2"
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    prescription: {
                      ...d.prescription,
                      items: d.prescription.items.filter((_, i) => i !== index),
                    },
                  }))
                }
              >
                Remove medicine {index + 1}
              </Btn>
            </div>
          ))}
        </div>
        <label className="mt-5 block text-sm font-medium">
          General prescription instructions
          <textarea
            rows={3}
            maxLength={1000}
            className="mt-2 w-full rounded-lg border border-input bg-card p-3 text-sm font-normal"
            value={draft.prescription.instructions}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                prescription: { ...d.prescription, instructions: e.target.value },
              }))
            }
          />
        </label>
      </section>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-sm text-success">
          {message}
        </p>
      )}
      <div className="sticky bottom-4 flex flex-wrap gap-3 rounded-xl border border-border bg-background/95 p-4 shadow-soft">
        <Btn type="submit" variant="secondary" disabled={busy}>
          Save draft
        </Btn>
        <Btn
          type="submit"
          disabled={busy}
          onClick={(e) => {
            const form = e.currentTarget.form;
            if (form?.reportValidity()) {
              e.preventDefault();
              void save(true);
            }
          }}
        >
          Complete Visit
        </Btn>
        <p className="self-center text-xs text-muted-foreground">
          Completion releases the patient summary and locks this record.
        </p>
      </div>
    </form>
  );
}
