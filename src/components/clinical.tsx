import { useEffect, useState } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { api } from "@/api/client";
import { Btn, PageHeader } from "@/components/qc";
import { friendlyError } from "@/services/errors";
import type { ClinicalVisit, PatientVisit } from "@/types/clinical";
export function useClinicalData<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!path) return;
    const c = new AbortController();
    setData(null);
    setError("");
    api<T>(path, { signal: c.signal })
      .then(setData)
      .catch((e) => {
        if (!c.signal.aborted) setError(friendlyError(e));
      });
    return () => c.abort();
  }, [path, attempt]);
  return { data, error, reload: () => setAttempt((n) => n + 1) };
}
export function ClinicalLoading({ error, retry }: { error: string; retry: () => void }) {
  return (
    <div className="surface p-8 text-sm">
      {error ? (
        <>
          <p role="alert" className="mb-4 text-destructive">
            {error}
          </p>
          <Btn variant="secondary" onClick={retry}>
            Try again
          </Btn>
        </>
      ) : (
        <p className="text-muted-foreground">Loading patient record…</p>
      )}
    </div>
  );
}
export function StartConsultation({
  patientId,
  clinicId,
  tokenId,
  appointmentId,
}: {
  patientId: string;
  clinicId: string;
  tokenId?: string | undefined;
  appointmentId?: string | undefined;
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const start = async () => {
    setBusy(true);
    setError("");
    try {
      const visit = await api<ClinicalVisit>(
        `/admin/patients/${encodeURIComponent(patientId)}/visits`,
        {
          method: "POST",
          body: {
            clinicId,
            ...(tokenId ? { tokenId } : {}),
            ...(appointmentId ? { appointmentId } : {}),
          },
        },
      );
      window.dispatchEvent(new Event("queuecare:refresh"));
      await navigate({ to: "/admin/visits/$visitId", params: { visitId: visit.id } });
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <Btn type="button" disabled={busy || clinicId === "all"} onClick={() => void start()}>
        {busy ? "Opening…" : "Start Consultation"}
      </Btn>
      {clinicId === "all" && (
        <p className="mt-2 text-xs text-muted-foreground">
          Select a clinic to start a consultation.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
export function VisitTimeline({
  visits,
  admin = false,
}: {
  visits: PatientVisit[];
  admin?: boolean;
}) {
  return (
    <div className="surface overflow-hidden">
      {visits.length ? (
        visits.map((v) => (
          <Link
            key={v.id}
            to={admin ? "/admin/visits/$visitId" : "/patient/visit/$visitId"}
            params={{ visitId: v.id }}
            className="block border-b border-border p-5 last:border-0 hover:bg-muted/40"
          >
            <div className="flex flex-wrap justify-between gap-2">
              <p className="font-medium">{v.clinicName}</p>
              <span className="text-xs text-muted-foreground">
                {new Date(v.visitAt).toLocaleDateString("en-GB", { timeZone: "Asia/Karachi" })} ·{" "}
                {v.status === "completed" ? "Completed" : "In progress"}
              </span>
            </div>
            <p className="mt-2 text-sm">
              {admin ? (v as ClinicalVisit).reasonForVisit : v.patientSummary || "Visit summary"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {v.diagnosis || "Diagnosis not released"}
            </p>
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span>{v.doctorName}</span>
              <span>
                {v.prescription.items.length ? "Prescription available" : "No prescription"}
              </span>
              {v.followUpDate && <span>Follow-up: {v.followUpDate}</span>}
            </div>
          </Link>
        ))
      ) : (
        <p className="p-8 text-sm text-muted-foreground">
          No clinical visits yet. Previous queue tokens remain in queue history.
        </p>
      )}
    </div>
  );
}
export function PrescriptionView({ visit }: { visit: PatientVisit }) {
  return (
    <section className="prescription-sheet surface mt-6 p-6 md:p-9">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div>
          <h2 className="text-2xl font-semibold">{visit.clinicName}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{visit.clinicAddress}</p>
          <p className="text-sm text-muted-foreground">{visit.clinicPhone}</p>
        </div>
        <div className="text-sm">
          <p className="font-medium">Prescription</p>
          <p>{visit.doctorName}</p>
          <p>
            {new Date(visit.prescription.prescribedAt ?? visit.visitAt).toLocaleDateString(
              "en-GB",
              { timeZone: "Asia/Karachi" },
            )}
          </p>
        </div>
      </div>
      <p className="my-5 text-sm">
        <span className="text-muted-foreground">Patient: </span>
        <strong>{visit.patientName}</strong>
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[540px] text-left text-sm">
          <thead className="border-b border-border text-muted-foreground">
            <tr>
              {["Medicine", "Dose", "Frequency", "Duration", "Instructions"].map((h) => (
                <th key={h} className="px-2 py-3 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visit.prescription.items.map((m, i) => (
              <tr key={i} className="border-b border-border">
                {[m.medicine, m.dose, m.frequency, m.duration, m.instructions].map((v, j) => (
                  <td key={j} className="whitespace-pre-wrap px-2 py-4 align-top">
                    {v || "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!visit.prescription.items.length && (
        <p className="py-5 text-sm text-muted-foreground">No medicines prescribed.</p>
      )}
      {visit.prescription.instructions && (
        <p className="mt-6 whitespace-pre-wrap text-sm">{visit.prescription.instructions}</p>
      )}
      {visit.followUpDate && <p className="mt-5 text-sm">Follow-up: {visit.followUpDate}</p>}
      <p className="mt-2 whitespace-pre-wrap text-sm">{visit.followUpInstructions}</p>
    </section>
  );
}
export function PatientVisitView({
  visit,
  prescriptionOnly = false,
}: {
  visit: PatientVisit;
  prescriptionOnly?: boolean;
}) {
  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title={prescriptionOnly ? "Prescription" : "Visit details"}
          sub={`${visit.clinicName} · ${new Date(visit.visitAt).toLocaleDateString("en-GB", { timeZone: "Asia/Karachi" })}`}
          right={
            <Btn variant="secondary" onClick={() => window.print()}>
              Print prescription
            </Btn>
          }
        />
        {!prescriptionOnly && (
          <section className="surface space-y-5 p-6">
            {[
              ["Visit summary", visit.patientSummary],
              ["Diagnosis", visit.diagnosis],
              ["Treatment plan", visit.treatmentPlan],
              ["Follow-up instructions", visit.followUpInstructions],
            ].map(([label, value]) => (
              <div key={label}>
                <h2 className="text-sm font-semibold">{label}</h2>
                <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                  {value || "Not provided"}
                </p>
              </div>
            ))}
          </section>
        )}
      </div>
      <PrescriptionView visit={visit} />
    </>
  );
}
