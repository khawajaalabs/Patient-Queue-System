import { uploadPrivateFile } from "@/lib/private-upload";
import { SelectField } from "@/components/form-controls";
import { PatientPicker } from "@/components/patient-picker";
import { useState } from "react";
import { api } from "@/api/client";
import { Btn, Field } from "@/components/qc";
import { useClinicalData, ClinicalLoading } from "@/components/clinical";
import { useAuth } from "@/providers/auth-provider";
import { useClinicContext } from "@/providers/clinic-provider";
import { friendlyError } from "@/services/errors";
import type { PatientDocument } from "@/types/operations";
export function DocumentsPanel({
  patientId,
  visitId,
  portal = false,
  clinicId,
}: {
  patientId?: string;
  visitId?: string;
  portal?: boolean;
  clinicId?: string;
}) {
  const { profile } = useAuth(),
    { selected: contextClinic } = useClinicContext();
  const selected = clinicId ?? contextClinic;
  const remote = useClinicalData<PatientDocument[]>(
    "/documents?clinicId=" +
      encodeURIComponent(portal ? "all" : selected) +
      (patientId ? "&patientId=" + encodeURIComponent(patientId) : "") +
      (visitId ? "&visitId=" + encodeURIComponent(visitId) : ""),
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [chosen, setChosen] = useState<File | null>(null),
    [uploadKey, setUploadKey] = useState(""),
    [progress, setProgress] = useState("");
  const canUpload = !portal && (profile?.role === "admin" || profile?.role === "nurse");
  async function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      f = new FormData(form),
      file = chosen;
    let pending: string | undefined;
    setBusy(true);
    setError("");
    try {
      if (!file || !file.size || file.size > 10485760)
        throw Error("Choose a file no larger than 10 MB.");
      if (!/\.(pdf|jpe?g|png)$/i.test(file.name))
        throw Error("Choose a PDF, JPG/JPEG or PNG file.");
      setProgress("Preparing upload");
      const init = await api<{ id: string; url?: string; ready?: boolean }>("/documents/upload", {
        method: "POST",
        body: {
          patientId: patientId ?? String(f.get("patientId")),
          clinicId: selected,
          visitId: visitId ?? null,
          documentType: String(f.get("type")),
          title: String(f.get("title")),
          description: String(f.get("description")),
          filename: file.name,
          mimeType: file.type,
          fileSize: file.size,
          uploadKey,
        },
      });
      pending = init.id;
      if (!init.ready) {
        if (!init.url) throw Error("Unable to prepare this upload.");
        await uploadPrivateFile(init.url, file, (percent) => setProgress(`Uploading ${percent}%`));
        setProgress("Checking file");
        await api("/documents/" + init.id + "/complete", { method: "POST", body: {} });
      }
      pending = undefined;
      form.reset();
      setChosen(null);
      setUploadKey("");
      setProgress("File uploaded privately.");
      remote.reload();
      window.dispatchEvent(new Event("queuecare:refresh"));
    } catch (e) {
      setProgress("");
      setError(friendlyError(e));
      if (pending)
        await api("/documents/" + pending + "/pending", { method: "DELETE" }).catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  async function download(d: PatientDocument) {
    setError("");
    try {
      const result = await api<{ url: string }>("/documents/" + d.id + "/download");
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(friendlyError(e));
    }
  }
  async function release(d: PatientDocument) {
    setError("");
    try {
      await api("/documents/" + d.id + "/release", {
        method: "PUT",
        body: { patientVisible: !d.patient_visible },
      });
      remote.reload();
      window.dispatchEvent(new Event("queuecare:refresh"));
    } catch (e) {
      setError(friendlyError(e));
    }
  }
  return (
    <section className="space-y-5">
      <h2 className="text-lg font-semibold">
        {visitId ? "Consultation Attachments" : "Documents & lab reports"}
      </h2>
      {canUpload && selected !== "all" && (
        <form onSubmit={(e) => void upload(e)} className="surface space-y-4 p-6">
          <h3 className="font-semibold">Upload a private document</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {!patientId && <PatientPicker />}
            <Field label="Title" name="title" maxLength={160} required />
            <label className="text-sm font-medium">
              Document type
              <SelectField name="type" className="mt-2 block w-full rounded-lg border bg-card p-3">
                {["lab_report", "imaging_report", "referral", "medical_document", "other"].map(
                  (t) => (
                    <option key={t} value={t}>
                      {t.replaceAll("_", " ")}
                    </option>
                  ),
                )}
              </SelectField>
            </label>
            <Field label="Description" name="description" maxLength={1000} />
            <label className="text-sm font-medium">
              Choose File · PDF, JPG or PNG · up to 10 MB
              <input
                aria-label="Document file"
                className="mt-2 block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-border file:bg-muted file:px-4 file:py-2"
                disabled={busy}
                onChange={(e) => {
                  setChosen(e.target.files?.[0] ?? null);
                  setUploadKey(crypto.randomUUID());
                  setError("");
                  setProgress("");
                }}
                name="file"
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                required={!chosen}
              />
            </label>
          </div>
          {chosen && (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="break-all">
                {chosen.name} · {(chosen.size / 1024).toFixed(0)} KB
              </span>
              <Btn
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={(e) => {
                  setChosen(null);
                  setUploadKey("");
                  const input =
                    e.currentTarget.form?.querySelector<HTMLInputElement>('input[type="file"]');
                  if (input) input.value = "";
                }}
              >
                Remove file
              </Btn>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Files remain private. Only the doctor can release them to the patient portal.
          </p>
          {progress && (
            <p role="status" className="text-sm">
              {progress}
            </p>
          )}
          <Btn disabled={busy || !chosen}>{busy ? "Uploading…" : "Upload document"}</Btn>
        </form>
      )}
      {canUpload && selected === "all" && (
        <p className="text-sm text-muted-foreground">Select a clinic to upload a document.</p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {!remote.data ? (
        <ClinicalLoading error={remote.error} retry={remote.reload} />
      ) : (
        <div className="surface divide-y divide-border">
          {remote.data.map((d) => (
            <article key={d.id} className="flex flex-wrap items-center justify-between gap-4 p-5">
              <div>
                <h3 className="font-medium">{d.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {d.document_type.replaceAll("_", " ")} · {d.clinic_name} ·{" "}
                  {new Date(d.created_at).toLocaleDateString()}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {d.original_filename} · {(d.file_size / 1024).toFixed(0)} KB{" "}
                  {d.visit_id ? "· Linked visit" : ""}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{d.description}</p>
              </div>
              <div className="flex gap-2">
                <Btn variant="secondary" onClick={() => void download(d)}>
                  View / download
                </Btn>
                {profile?.role === "admin" && (
                  <Btn variant="ghost" onClick={() => void release(d)}>
                    {d.patient_visible ? "Withdraw release" : "Release to patient"}
                  </Btn>
                )}
              </div>
            </article>
          ))}
          {!remote.data.length && (
            <p className="p-6 text-sm text-muted-foreground">No released documents available.</p>
          )}
        </div>
      )}
    </section>
  );
}
