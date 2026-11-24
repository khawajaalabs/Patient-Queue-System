import { uploadPrivateFile } from "@/lib/private-upload";
import { SelectField } from "@/components/form-controls";
import { PatientPicker } from "@/components/patient-picker";
import { useState } from "react";
import { api } from "@/api/client";
import { Btn, Field } from "@/components/qc";
import { useClinicalData, ClinicalLoading } from "@/data/use-clinical-data";
import { useAuth } from "@/providers/auth-provider";
import { useClinicContext } from "@/providers/clinic-provider";
import { friendlyError } from "@/services/errors";
import type { PatientDocument } from "@/types/operations";
import { MedicalScanViewer, type ScanDocument } from "@/components/medical-scan-viewer";

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
    { selected: contextClinic, clinics } = useClinicContext();
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
    [progress, setProgress] = useState(""),
    [query, setQuery] = useState(""),
    [categoryFilter, setCategoryFilter] = useState<"all" | "imaging" | "labs" | "other">("all"),
    [activeScan, setActiveScan] = useState<ScanDocument | null>(null);

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
      const uploadClinic = selected === "all" ? String(f.get("uploadClinic") ?? "") : selected;
      if (!uploadClinic || uploadClinic === "all")
        throw Error("Choose the clinic this report belongs to.");
      setProgress("Preparing upload");
      const init = await api<{ id: string; url?: string; ready?: boolean }>("/documents/upload", {
        method: "POST",
        body: {
          patientId: patientId ?? String(f.get("patientId")),
          clinicId: uploadClinic,
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

  async function viewScan(d: PatientDocument) {
    setError("");
    try {
      const result = await api<{ url: string }>("/documents/" + d.id + "/download");
      setActiveScan({
        id: d.id,
        title: d.title,
        url: result.url,
        filename: d.original_filename,
        mimeType: d.mime_type,
        documentType: d.document_type,
        clinicName: d.clinic_name,
        size: d.file_size,
      });
    } catch (e) {
      setError(friendlyError(e));
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

  const documents = remote.data ?? [];
  // Search covers patient identity, clinic and file metadata so staff can find
  // a scan without knowing which clinic it was uploaded to.
  const needle = query.trim().toLowerCase();
  const searchable = (d: PatientDocument) =>
    !needle ||
    [d.patient_name, d.patient_phone, d.clinic_name, d.title, d.original_filename, d.description]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(needle));
  const filteredDocuments = documents.filter((d) => {
    if (!searchable(d)) return false;
    if (categoryFilter === "all") return true;
    if (categoryFilter === "imaging") return d.document_type === "imaging_report";
    if (categoryFilter === "labs") return d.document_type === "lab_report";
    return d.document_type !== "imaging_report" && d.document_type !== "lab_report";
  });

  const imagingCount = documents.filter((d) => d.document_type === "imaging_report").length;
  const labCount = documents.filter((d) => d.document_type === "lab_report").length;

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">
            {visitId
              ? "Consultation Attachments & Imaging"
              : "Diagnostic Imaging & Medical Reports"}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Encrypted private files. Secure in-browser radiography inspection & PDF reports.
          </p>
        </div>

        {/* Category Tabs */}
        <div className="flex flex-wrap gap-1 rounded-lg border border-border p-1 bg-muted/30 text-xs">
          <button
            type="button"
            onClick={() => setCategoryFilter("all")}
            className={`rounded-md px-3 py-1 font-medium transition-all ${
              categoryFilter === "all"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            All ({documents.length})
          </button>
          <button
            type="button"
            onClick={() => setCategoryFilter("imaging")}
            className={`rounded-md px-3 py-1 font-medium transition-all ${
              categoryFilter === "imaging"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            🩻 MRI & X-Ray ({imagingCount})
          </button>
          <button
            type="button"
            onClick={() => setCategoryFilter("labs")}
            className={`rounded-md px-3 py-1 font-medium transition-all ${
              categoryFilter === "labs"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            🧪 Lab Reports ({labCount})
          </button>
          <button
            type="button"
            onClick={() => setCategoryFilter("other")}
            className={`rounded-md px-3 py-1 font-medium transition-all ${
              categoryFilter === "other"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Other Documents
          </button>
        </div>
      </div>

      {!patientId && !portal && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-full max-w-sm">
            <Field
              label="Search scans & documents"
              placeholder="Patient name, phone, clinic or file title"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <p role="status" className="pb-3 text-xs text-muted-foreground">
            {filteredDocuments.length} of {documents.length} documents
          </p>
        </div>
      )}

      {canUpload && (
        <form onSubmit={(e) => void upload(e)} className="surface overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/30 px-6 py-4">
            <div>
              <h3 className="font-semibold">Upload patient report</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                MRI, X-ray, CT scans, lab reports and other documents · PDF, JPG or PNG · up to 10
                MB
              </p>
            </div>
            <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary">
              Private · doctor only
            </span>
          </div>
          <div className="space-y-4 p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              {selected === "all" && (
                <label className="text-sm font-medium">
                  Clinic
                  <SelectField
                    name="uploadClinic"
                    required
                    className="mt-2 block w-full rounded-lg border border-input bg-card p-3 text-sm"
                  >
                    <option value="">Choose a clinic</option>
                    {(clinics ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </SelectField>
                </label>
              )}
              {!patientId && <PatientPicker />}
              <Field
                label="Title"
                name="title"
                maxLength={160}
                required
                placeholder="e.g. MRI Lumbar Spine"
              />
              <label className="text-sm font-medium">
                Document type
                <SelectField
                  name="type"
                  className="mt-2 block w-full rounded-lg border bg-card p-3"
                >
                  {["imaging_report", "lab_report", "referral", "medical_document", "other"].map(
                    (t) => (
                      <option key={t} value={t}>
                        {t === "imaging_report"
                          ? "🩻 MRI / X-Ray / CT (Imaging)"
                          : t === "lab_report"
                            ? "🧪 Lab Report"
                            : t.replaceAll("_", " ")}
                      </option>
                    ),
                  )}
                </SelectField>
              </label>
              <Field
                label="Description"
                name="description"
                maxLength={1000}
                placeholder="Optional clinical notes"
              />
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
                <span className="break-all font-mono text-xs">
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
              Files stay private. Only a doctor can release them to the patient portal.
            </p>
            {progress && (
              <p role="status" className="text-sm font-medium text-primary">
                {progress}
              </p>
            )}
            <Btn disabled={busy || !chosen}>{busy ? "Uploading…" : "Upload document"}</Btn>
          </div>
        </form>
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
          {filteredDocuments.map((d) => (
            <article key={d.id} className="flex flex-wrap items-center justify-between gap-4 p-5">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg">
                    {d.document_type === "imaging_report"
                      ? "🩻"
                      : d.document_type === "lab_report"
                        ? "🧪"
                        : "📄"}
                  </span>
                  <h3 className="font-semibold">{d.title}</h3>
                  <span className="rounded bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground uppercase">
                    {d.document_type.replaceAll("_", " ")}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {!patientId && d.patient_name && (
                    <span className="font-medium text-foreground">
                      {d.patient_name}
                      {d.patient_phone ? ` · ${d.patient_phone}` : ""} ·{" "}
                    </span>
                  )}
                  {d.clinic_name} · {new Date(d.created_at).toLocaleDateString()} ·{" "}
                  {d.original_filename} ({(d.file_size / 1024).toFixed(0)} KB)
                  {d.visit_id ? " · Linked visit" : ""}
                </p>
                {d.description && (
                  <p className="mt-1.5 text-sm text-muted-foreground">{d.description}</p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Btn
                  variant="primary"
                  onClick={() => void viewScan(d)}
                  className="bg-cyan-600 hover:bg-cyan-700 text-white"
                >
                  🔍 View Scan / Report
                </Btn>
                <Btn variant="secondary" onClick={() => void download(d)}>
                  Download ⤓
                </Btn>
                {profile?.role === "admin" && (
                  <Btn variant="ghost" onClick={() => void release(d)}>
                    {d.patient_visible ? "Withdraw release" : "Release to patient"}
                  </Btn>
                )}
              </div>
            </article>
          ))}
          {!filteredDocuments.length && (
            <p className="p-6 text-center text-sm text-muted-foreground">
              {needle
                ? `No documents match “${query.trim()}”. Try a patient name, phone number or clinic.`
                : "No documents found in this category."}
            </p>
          )}
        </div>
      )}

      {/* Interactive Medical Scan Viewer Modal */}
      {activeScan && <MedicalScanViewer scan={activeScan} onClose={() => setActiveScan(null)} />}
    </section>
  );
}
