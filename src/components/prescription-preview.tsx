import type { PrintBrandingData } from "@/types/clinical-workflow";
import { useState } from "react";
import { createPortal } from "react-dom";
import { Btn } from "@/components/qc";
import { PrescriptionView, useClinicalData } from "@/components/clinical";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { PatientVisit } from "@/types/clinical";
export function PrescriptionPreview({ visit }: { visit: PatientVisit }) {
  const [open, setOpen] = useState(false);
  const branding = useClinicalData<PrintBrandingData>(
      open ? "/branding?clinicId=" + encodeURIComponent(visit.clinicId) : null,
    ),
    signature = useClinicalData<{ signature_url?: string }>(open ? "/branding/signature" : null);
  const identity = { branding: branding.data, signature: signature.data };
  return (
    <>
      <Btn type="button" variant="secondary" onClick={() => setOpen(true)}>
        Preview prescription
      </Btn>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="prescription-preview max-w-[min(1400px,calc(100vw-32px))]">
          <DialogTitle>Prescription preview</DialogTitle>
          <DialogDescription>
            {visit.status === "in_progress"
              ? "Unsaved draft. Previewing and printing do not save or complete the visit."
              : "Completed prescription. Printing does not change this record."}
          </DialogDescription>
          <div className="flex flex-wrap gap-3">
            <Btn type="button" variant="ghost" onClick={() => setOpen(false)}>
              Back to {visit.status === "in_progress" ? "edit" : "record"}
            </Btn>
            <Btn
              type="button"
              disabled={!branding.data || !signature.data}
              onClick={async () => {
                await document.fonts?.ready;
                await Promise.all(
                  Array.from(
                    document.querySelectorAll<HTMLImageElement>("#prescription-print-root img"),
                  ).map((img) => img.decode().catch(() => {})),
                );
                document.body.classList.add("printing-prescription");
                const clear = () => {
                  document.body.classList.remove("printing-prescription");
                  window.removeEventListener("afterprint", clear);
                };
                window.addEventListener("afterprint", clear);
                window.print();
                clear();
              }}
            >
              Print prescription
            </Btn>
          </div>
          {(branding.error || signature.error) && (
            <p role="alert">
              Unable to load print branding.{" "}
              <button
                type="button"
                onClick={() => {
                  branding.reload();
                  signature.reload();
                }}
              >
                Retry print metadata
              </button>
            </p>
          )}
          <PrescriptionView visit={visit} printIdentity={identity} />
        </DialogContent>
      </Dialog>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div id="prescription-print-root" aria-hidden="true">
            <PrescriptionView visit={visit} printIdentity={identity} />
          </div>,
          document.body,
        )}
    </>
  );
}
