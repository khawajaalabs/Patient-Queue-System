import { useState } from "react";
import { createPortal } from "react-dom";
import { Btn } from "@/components/qc";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { ClinicalVisit, PatientVisit } from "@/types/clinical";

interface VisitSummaryProps {
  visit: ClinicalVisit | PatientVisit;
  triggerLabel?: string;
  className?: string;
}

export function VisitSummaryReport({
  visit,
  triggerLabel = "📄 Full Visit Summary",
  className,
}: VisitSummaryProps) {
  const [open, setOpen] = useState(false);

  // Cast safely to check for ClinicalVisit specific fields
  const clinical = visit as Partial<ClinicalVisit>;
  const vitals = clinical.vitals;

  // Calculate BMI if height and weight exist
  const bmi =
    vitals?.height && vitals?.weight && vitals.height > 0
      ? (vitals.weight / Math.pow(vitals.height / 100, 2)).toFixed(1)
      : null;

  const handlePrint = async () => {
    await document.fonts?.ready;
    document.body.classList.add("printing-summary");
    const cleanup = () => {
      document.body.classList.remove("printing-summary");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
    cleanup();
  };

  const reportSheet = (
    <article className="visit-summary-sheet mx-auto max-w-4xl bg-white p-8 text-slate-900 shadow-sm border border-slate-200 rounded-lg text-sm leading-relaxed print:m-0 print:max-w-none print:border-none print:p-0 print:shadow-none">
      {/* Clinic Letterhead */}
      <header className="border-b-2 border-slate-900 pb-5 mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-950 uppercase">
              {visit.clinicName || "Neuro Spine Care Center"}
            </h1>
            <p className="text-xs text-slate-600 mt-1 font-medium">
              {visit.clinicAddress || "14 Canal View Road, Lahore"}
            </p>
            <p className="text-xs text-slate-600">
              Phone: {visit.clinicPhone || "+92 42 3500 1200"}
            </p>
          </div>
          <div className="text-right">
            <span className="inline-block bg-slate-900 text-white font-semibold text-xs px-3 py-1 uppercase tracking-wider rounded">
              Clinical Visit Summary
            </span>
            <div className="mt-2 text-xs text-slate-600">
              <div>
                <strong>Date:</strong>{" "}
                {new Date(visit.visitAt).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </div>
              {clinical.tokenCode && (
                <div>
                  <strong>Token:</strong>{" "}
                  <span className="font-mono font-bold text-sm text-slate-900">
                    {clinical.tokenCode}
                  </span>
                </div>
              )}
              <div className="font-mono text-[11px] text-slate-500">ID: {visit.id.slice(0, 8)}</div>
            </div>
          </div>
        </div>
      </header>

      {/* Patient & Doctor Banner */}
      <section className="grid grid-cols-2 gap-4 rounded-md bg-slate-50 p-4 border border-slate-200 mb-6 text-xs">
        <div>
          <h2 className="font-semibold text-slate-950 text-xs uppercase tracking-wider text-slate-500 mb-1">
            Patient Information
          </h2>
          <div className="text-sm font-bold text-slate-900">{visit.patientName}</div>
          <div className="text-slate-600 mt-0.5">
            Patient ID: <span className="font-mono">{visit.patientId.slice(0, 8)}</span>
          </div>
        </div>
        <div className="text-right">
          <h2 className="font-semibold text-slate-950 text-xs uppercase tracking-wider text-slate-500 mb-1">
            Attending Physician
          </h2>
          <div className="text-sm font-bold text-slate-900">
            {visit.doctorName || "Dr. Ayesha Raza"}
          </div>
          <div className="text-slate-600 mt-0.5">Consultant Neurosurgeon & Spine Specialist</div>
        </div>
      </section>

      {/* Recorded Vitals Table */}
      {vitals && (vitals.systolic || vitals.temperature || vitals.pulse || vitals.weight) && (
        <section className="mb-6">
          <h3 className="font-bold text-xs uppercase tracking-wider text-slate-700 mb-2 border-b border-slate-200 pb-1">
            Recorded Physical Vitals
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 text-center text-xs">
            {vitals.systolic && (
              <div className="rounded border border-slate-200 p-2 bg-slate-50/50">
                <span className="text-[10px] text-slate-500 block">Blood Pressure</span>
                <span className="font-bold text-slate-900 text-sm font-mono">
                  {vitals.systolic}/{vitals.diastolic || 80}{" "}
                  <span className="text-[10px] font-normal text-slate-500">mmHg</span>
                </span>
              </div>
            )}
            {vitals.pulse && (
              <div className="rounded border border-slate-200 p-2 bg-slate-50/50">
                <span className="text-[10px] text-slate-500 block">Heart Rate</span>
                <span className="font-bold text-slate-900 text-sm font-mono">
                  {vitals.pulse} <span className="text-[10px] font-normal text-slate-500">bpm</span>
                </span>
              </div>
            )}
            {vitals.temperature && (
              <div className="rounded border border-slate-200 p-2 bg-slate-50/50">
                <span className="text-[10px] text-slate-500 block">Body Temp</span>
                <span className="font-bold text-slate-900 text-sm font-mono">
                  {vitals.temperature}{" "}
                  <span className="text-[10px] font-normal text-slate-500">°F</span>
                </span>
              </div>
            )}
            {vitals.weight && (
              <div className="rounded border border-slate-200 p-2 bg-slate-50/50">
                <span className="text-[10px] text-slate-500 block">Weight</span>
                <span className="font-bold text-slate-900 text-sm font-mono">
                  {vitals.weight} <span className="text-[10px] font-normal text-slate-500">kg</span>
                </span>
              </div>
            )}
            {vitals.height && (
              <div className="rounded border border-slate-200 p-2 bg-slate-50/50">
                <span className="text-[10px] text-slate-500 block">Height</span>
                <span className="font-bold text-slate-900 text-sm font-mono">
                  {vitals.height} <span className="text-[10px] font-normal text-slate-500">cm</span>
                </span>
              </div>
            )}
            {bmi && (
              <div className="rounded border border-slate-200 p-2 bg-slate-50/50">
                <span className="text-[10px] text-slate-500 block">BMI</span>
                <span className="font-bold text-slate-900 text-sm font-mono">{bmi}</span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Clinical Notes & Diagnosis */}
      <section className="mb-6 space-y-3">
        <h3 className="font-bold text-xs uppercase tracking-wider text-slate-700 mb-2 border-b border-slate-200 pb-1">
          Clinical Assessment & Diagnosis
        </h3>
        {clinical.chiefComplaint && (
          <div>
            <span className="font-semibold text-slate-900 text-xs">Chief Complaint: </span>
            <span className="text-slate-700 text-xs">{clinical.chiefComplaint}</span>
          </div>
        )}
        {visit.diagnosis && (
          <div className="rounded border border-cyan-200 bg-cyan-50/50 p-3">
            <span className="font-bold text-cyan-950 text-xs block mb-0.5">
              Primary Clinical Diagnosis:
            </span>
            <span className="text-cyan-900 text-sm font-medium">{visit.diagnosis}</span>
          </div>
        )}
        {visit.patientSummary && (
          <div>
            <span className="font-semibold text-slate-900 text-xs block mb-1">
              Clinical Observations & Summary:
            </span>
            <p className="text-xs text-slate-700 whitespace-pre-wrap">{visit.patientSummary}</p>
          </div>
        )}
        {visit.treatmentPlan && (
          <div>
            <span className="font-semibold text-slate-900 text-xs block mb-1">Treatment Plan:</span>
            <p className="text-xs text-slate-700 whitespace-pre-wrap">{visit.treatmentPlan}</p>
          </div>
        )}
      </section>

      {/* Prescribed Medications Table */}
      {visit.prescription?.items && visit.prescription.items.length > 0 && (
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-2 border-b border-slate-200 pb-1">
            <span className="text-lg font-serif font-bold text-cyan-800">℞</span>
            <h3 className="font-bold text-xs uppercase tracking-wider text-slate-700">
              Prescribed Medications
            </h3>
          </div>
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-100 text-slate-600 font-semibold">
                <th className="py-2 px-3">#</th>
                <th className="py-2 px-3">Medicine Name & Strength</th>
                <th className="py-2 px-3">Dosage / Form</th>
                <th className="py-2 px-3">Frequency</th>
                <th className="py-2 px-3">Duration</th>
                <th className="py-2 px-3">Instructions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visit.prescription.items.map((m, idx) => (
                <tr key={idx} className="hover:bg-slate-50/60">
                  <td className="py-2.5 px-3 font-mono text-slate-400">{idx + 1}</td>
                  <td className="py-2.5 px-3 font-semibold text-slate-900">
                    {m.medicine}{" "}
                    {m.strength && (
                      <span className="font-normal text-slate-500">({m.strength})</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-slate-700">
                    {m.dosageForm || "Tablet"} · {m.dose}
                  </td>
                  <td className="py-2.5 px-3 font-medium text-slate-800">{m.frequency}</td>
                  <td className="py-2.5 px-3 text-slate-700">{m.duration}</td>
                  <td className="py-2.5 px-3 text-slate-600 italic">
                    {m.instructions || "As directed"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visit.prescription.instructions && (
            <p className="mt-2 text-xs text-slate-600 italic">
              <strong>General Rx Notes:</strong> {visit.prescription.instructions}
            </p>
          )}
        </section>
      )}

      {/* Follow-up & Doctor Verification Footer */}
      <footer className="mt-8 pt-6 border-t border-slate-200">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-md text-xs space-y-1">
            {visit.followUpDate && (
              <div className="font-semibold text-slate-900">
                Recommended Follow-up:{" "}
                <span className="text-cyan-800 font-bold">
                  {new Date(visit.followUpDate).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </span>
              </div>
            )}
            {visit.followUpInstructions && (
              <p className="text-slate-600 text-xs">{visit.followUpInstructions}</p>
            )}
            <p className="text-[11px] text-slate-400 mt-2">
              Generated by Neuro Spine Care Center Hospital Information System. This document is an
              authoritative summary of the outpatient consultation.
            </p>
          </div>

          <div className="text-center min-w-[180px]">
            <div className="h-14 border-b border-dashed border-slate-400 mb-1 flex items-end justify-center pb-1">
              <span className="font-serif italic text-sm text-slate-600">
                {visit.doctorName || "Dr. Ayesha Raza"}
              </span>
            </div>
            <div className="text-xs font-bold text-slate-900">Authorized Medical Sign-off</div>
            <div className="text-[10px] text-slate-500">Neuro Spine Care Center</div>
          </div>
        </div>
      </footer>
    </article>
  );

  return (
    <>
      <Btn type="button" variant="secondary" className={className} onClick={() => setOpen(true)}>
        {triggerLabel}
      </Btn>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[min(1100px,calc(100vw-32px))] max-h-[92vh] overflow-y-auto">
          <DialogTitle className="flex items-center justify-between pr-8">
            <span>Clinical Encounter & Visit Summary</span>
            <span className="text-xs font-normal text-muted-foreground font-mono">
              Visit #{visit.id.slice(0, 8)}
            </span>
          </DialogTitle>
          <DialogDescription>
            Official comprehensive clinical record for outpatient review, printing, or archiving.
          </DialogDescription>

          <div className="flex flex-wrap items-center justify-between gap-3 my-2 border-b border-border pb-3">
            <span className="text-xs text-muted-foreground">
              Tip: Click <strong>"Print Summary / Save as PDF"</strong> to print directly or save as
              an official PDF file.
            </span>
            <div className="flex gap-2">
              <Btn type="button" variant="ghost" onClick={() => setOpen(false)}>
                Close
              </Btn>
              <Btn
                type="button"
                variant="primary"
                onClick={handlePrint}
                className="bg-cyan-600 hover:bg-cyan-700 text-white"
              >
                🖨️ Print Summary / Save as PDF
              </Btn>
            </div>
          </div>

          {reportSheet}
        </DialogContent>
      </Dialog>

      {/* Dedicated Portal for Clean Window Print */}
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            id="visit-summary-print-root"
            className="hidden print:block print:fixed print:inset-0 print:bg-white print:z-[9999]"
            aria-hidden="true"
          >
            {reportSheet}
          </div>,
          document.body,
        )}
    </>
  );
}
