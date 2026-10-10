import { useState } from "react";
import { api } from "@/api/client";
import { Btn, Field } from "@/components/qc";
import { SelectField } from "@/components/form-controls";
import { friendlyError } from "@/services/errors";
import type { AppointmentAttachment } from "@/types/clinical-workflow";
export interface SelectedAttachment {
  key: string;
  file: File;
  title: string;
  type: string;
  state: string;
  error: string;
}
const kinds = [
  "lab_report",
  "imaging_report",
  "old_prescription",
  "referral",
  "medical_document",
  "other",
];
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
        Supporting files <span className="text-muted-foreground">(optional)</span>
      </h2>
      <p className="text-sm text-muted-foreground">
        Up to 10 files. PDF, JPEG or PNG, up to 10 MB each. Files remain private.
      </p>
      <label className="block text-sm">
        Add files
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
                  !["application/pdf", "image/jpeg", "image/png"].includes(f.type),
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
                title: file.name.replace(/\.[^.]+$/, ""),
                type: "medical_document",
                state: "Waiting to upload",
                error: "",
              })),
            ]);
          }}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      {files.map((f, i) => (
        <div key={f.key} className="rounded-lg border border-border p-4 space-y-3">
          <p className="break-all text-sm text-muted-foreground">
            {f.file.name} · {(f.file.size / 1024).toFixed(0)} KB
          </p>
          <Field
            label={`File title ${i + 1}`}
            required
            maxLength={160}
            value={f.title}
            disabled={disabled}
            onChange={(e) =>
              onChange(files.map((x) => (x.key === f.key ? { ...x, title: e.target.value } : x)))
            }
          />
          <label className="block text-sm">
            Document type {i + 1}
            <SelectField
              aria-label={`Document type ${i + 1}`}
              value={f.type}
              disabled={disabled}
              onChange={(e) =>
                onChange(files.map((x) => (x.key === f.key ? { ...x, type: e.target.value } : x)))
              }
            >
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {k.replaceAll("_", " ")}
                </option>
              ))}
            </SelectField>
          </label>
          <p role="status" className="text-sm">
            {f.state}
          </p>
          {f.error && (
            <p role="alert" className="text-sm text-destructive">
              {f.error}
            </p>
          )}
          <Btn
            type="button"
            variant="ghost"
            disabled={disabled || f.state === "Uploaded"}
            onClick={() => onChange(files.filter((x) => x.key !== f.key))}
          >
            Remove file {i + 1}
          </Btn>
        </div>
      ))}
    </section>
  );
}
export async function uploadAppointmentFiles(
  id: string,
  files: SelectedAttachment[],
  progress: (key: string, state: string, error?: string) => void,
) {
  let failed = 0;
  for (const f of files) {
    if (f.state === "Uploaded") continue;
    let prepared: string | undefined;
    try {
      progress(f.key, "Preparing upload");
      const p = await api<{ id: string; uploadUrl: string }>(
        `/appointments/${encodeURIComponent(id)}/attachments`,
        {
          method: "POST",
          body: {
            title: f.title,
            type: f.type,
            filename: f.file.name,
            mime: f.file.type,
            size: f.file.size,
          },
        },
      );
      prepared = p.id;
      progress(f.key, "Uploading");
      const response = await fetch(p.uploadUrl, {
        method: "PUT",
        body: f.file,
        headers: { "Content-Type": f.file.type },
        signal: AbortSignal.timeout(60000),
      });
      if (!response.ok) throw new Error("Upload failed. Try this file again.");
      progress(f.key, "Checking file");
      await api(`/appointment-attachments/${p.id}/complete`, { method: "POST", body: {} });
      progress(f.key, "Uploaded");
    } catch (e) {
      failed++;
      progress(f.key, "Upload failed", friendlyError(e));
      if (prepared)
        try {
          await api(`/appointment-attachments/${prepared}`, { method: "DELETE" });
        } catch {
          /* Server retains the private path for cleanup. */
        }
    }
  }
  return failed;
}
export function AppointmentFiles({ files }: { files: AppointmentAttachment[] }) {
  const [error, setError] = useState("");
  return (
    <div className="space-y-3">
      {files.length ? (
        files.map((f) => (
          <article key={f.id} className="rounded-lg border border-border p-4">
            <h3 className="break-words font-semibold">{f.title}</h3>
            <p className="break-all text-sm text-muted-foreground">
              {f.type.replaceAll("_", " ")} · {f.filename} · {f.createdAt.slice(0, 10)} · {f.status}
            </p>
            {f.status === "ready" && (
              <Btn
                type="button"
                variant="ghost"
                onClick={() => {
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
                }}
              >
                Download file
              </Btn>
            )}
          </article>
        ))
      ) : (
        <p className="text-sm text-muted-foreground">No supporting files attached.</p>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
