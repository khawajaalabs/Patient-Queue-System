import { uploadPrivateFile } from "@/lib/private-upload";
import { useState } from "react";
import { api } from "@/api/client";
import { Btn } from "@/components/qc";
import { friendlyError } from "@/services/errors";
import type { AppointmentAttachment } from "@/types/clinical-workflow";
import { MedicalScanViewer, type ScanDocument } from "@/components/medical-scan-viewer";

export interface SelectedAttachment {
  key: string;
  file: File;
  title: string;
  type: string;
  state: string;
  error: string;
}

export function AttachmentFields({
  files,
  onChange,
  disabled = false,
}: {
  files: SelectedAttachment[];
  onChange: (f: SelectedAttachment[]) => void;
  disabled?: boolean;
}) {
  const [error, setError] = useState("");
  return (
    <section className="space-y-3">
      <h2>
        Supporting Documents <span className="text-muted-foreground">(optional)</span>
      </h2>
      <p className="text-sm text-muted-foreground">
        Up to 10 files. PDF, JPEG or PNG, up to 10 MB each. Files remain private.
      </p>
      <label className="block text-sm">
        Choose Files
        <input
          aria-label="Add supporting files"
          type="file"
          multiple
          accept="application/pdf,image/jpeg,image/png"
          disabled={disabled}
          className="mt-2 block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-border file:bg-muted file:px-4 file:py-2"
          onChange={(e) => {
            const incoming = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (files.length + incoming.length > 10) {
              setError("Select no more than 10 files.");
              return;
            }
            if (
              incoming.some(
                (f) =>
                  f.size === 0 ||
                  f.size > 10485760 ||
                  !["application/pdf", "image/jpeg", "image/png"].includes(f.type) ||
                  !/\.(pdf|jpe?g|png)$/i.test(f.name),
              )
            ) {
              setError("Choose PDF, JPEG or PNG files between 1 byte and 10 MB.");
              return;
            }
            setError("");
            onChange([
              ...files,
              ...incoming.map((file) => ({
                key: crypto.randomUUID(),
                file,
                title: file.name.replace(/\.[^.]+$/, "") || file.name,
                type: "medical_document",
                state: "Waiting to upload",
                error: "",
              })),
            ]);
          }}
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {files.map((f, i) => (
        <div key={f.key} className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <input
            className="rounded border border-border px-2 py-1 text-sm"
            aria-label={`File title ${i + 1}`}
            value={f.title}
            disabled={disabled}
            onChange={(e) =>
              onChange(files.map((x) => (x.key === f.key ? { ...x, title: e.target.value } : x)))
            }
          />
          <span className="text-xs text-muted-foreground">
            {f.state} {f.error && `— ${f.error}`}
          </span>
          <button
            type="button"
            className="text-xs text-destructive hover:underline"
            disabled={disabled || f.state === "Uploaded"}
            onClick={() => onChange(files.filter((x) => x.key !== f.key))}
          >
            Remove
          </button>
        </div>
      ))}
    </section>
  );
}

export async function uploadAppointmentFiles(
  id: string,
  files: SelectedAttachment[],
  progress: (key: string, state: string, err?: string) => void,
) {
  let failed = 0;
  for (const f of files) {
    if (f.state === "Uploaded") continue;
    let prepared: string | null = null;
    try {
      progress(f.key, "Preparing upload");
      const p = await api<{ id: string; uploadUrl?: string; ready?: boolean }>(
        `/appointments/${encodeURIComponent(id)}/attachments`,
        {
          method: "POST",
          body: {
            filename: f.file.name,
            mime: f.file.type,
            size: f.file.size,
            title: f.title || f.file.name,
            type: f.type,
            uploadKey: f.key,
          },
        },
      );
      prepared = p.id;
      if (p.ready) {
        progress(f.key, "Uploaded");
        continue;
      }
      if (!p.uploadUrl) throw Error("Unable to prepare this upload.");
      progress(f.key, "Uploading 0%");
      await uploadPrivateFile(p.uploadUrl, f.file, (percent) =>
        progress(f.key, `Uploading ${percent}%`),
      );
      progress(f.key, "Finishing");
      await api(`/appointment-attachments/${p.id}/complete`, { method: "POST", body: {} });
      progress(f.key, "Uploaded");
    } catch (e) {
      failed++;
      progress(f.key, "Upload failed", friendlyError(e));
      if (prepared) {
        try {
          await api(`/appointment-attachments/${prepared}`, { method: "DELETE" });
        } catch {
          /* Best effort */
        }
      }
    }
  }
  return failed;
}

export function AppointmentFiles({ files }: { files: AppointmentAttachment[] }) {
  const [error, setError] = useState("");
  const [activeScan, setActiveScan] = useState<ScanDocument | null>(null);

  const viewScan = (f: AppointmentAttachment) => {
    setError("");
    void api<{ url: string }>(`/appointment-attachments/${f.id}/download`)
      .then((d) => {
        setActiveScan({
          id: f.id,
          title: f.title,
          url: d.url,
          filename: f.filename,
          mimeType: f.mime,
          documentType: f.type,
          size: f.size,
        });
      })
      .catch((e) => setError(friendlyError(e)));
  };

  const downloadFile = (f: AppointmentAttachment) => {
    setError("");
    void api<{ url: string }>(`/appointment-attachments/${f.id}/download`)
      .then((d) => {
        const a = document.createElement("a");
        a.href = d.url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.click();
      })
      .catch((e) => setError(friendlyError(e)));
  };

  return (
    <div className="space-y-3">
      {files.length ? (
        files.map((f) => (
          <article
            key={f.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4 bg-muted/20"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base">🩻</span>
                <h3 className="break-words font-semibold">{f.title}</h3>
                <span className="rounded bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground uppercase">
                  {f.type.replaceAll("_", " ")}
                </span>
              </div>
              <p className="mt-1 break-all text-xs text-muted-foreground">
                {f.filename} · {f.createdAt.slice(0, 10)} · {(f.size / 1024).toFixed(0)} KB ·{" "}
                {f.status}
              </p>
            </div>
            {f.status === "ready" && (
              <div className="flex items-center gap-2">
                <Btn
                  type="button"
                  variant="primary"
                  className="bg-cyan-600 hover:bg-cyan-700 text-white text-xs py-1"
                  onClick={() => viewScan(f)}
                >
                  🔍 View Scan
                </Btn>
                <Btn
                  type="button"
                  variant="secondary"
                  className="text-xs py-1"
                  onClick={() => downloadFile(f)}
                >
                  Download ⤓
                </Btn>
              </div>
            )}
          </article>
        ))
      ) : (
        <p className="text-sm text-muted-foreground">No supporting files attached.</p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Interactive Medical Scan Viewer Modal */}
      {activeScan && <MedicalScanViewer scan={activeScan} onClose={() => setActiveScan(null)} />}
    </div>
  );
}
