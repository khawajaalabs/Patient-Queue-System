import { AppointmentCalendar } from "@/components/appointment-calendar";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api } from "@/api/client";
import { Btn, Field, Logo, PageHeader } from "@/components/qc";
import { ProtectedRoute } from "@/components/protected-route";
import { useAuth } from "@/providers/auth-provider";
import { ClinicSwitcher, useClinicContext } from "@/providers/clinic-provider";
import { useClinicalData, ClinicalLoading } from "@/components/clinical";
import { NotificationCenter } from "@/components/notification-center";
import { BillingWorkspace } from "@/components/billing-workspace";
import { DocumentsPanel } from "@/components/documents-panel";
import { PatientPicker } from "@/components/patient-picker";
import { logout } from "@/services/auth";
import { friendlyError } from "@/services/errors";
import type { Appointment, ClinicConfig } from "@/types/local";
import type { PatientProfile, Vitals } from "@/types/clinical";
export const Route = createFileRoute("/staff")({ component: StaffWorkspace });
type StaffState = {
  clinic: ClinicConfig;
  queue: {
    id: string;
    patientId: string;
    patientName: string;
    phone: string;
    tokenCode: string;
    status: string;
  }[];
  patients: { id: string; name: string; phone: string }[];
  appointments: Appointment[];
};
function StaffWorkspace() {
  const { profile } = useAuth();
  return (
    <ProtectedRoute role={profile?.role === "receptionist" ? "receptionist" : "nurse"}>
      <Workspace />
    </ProtectedRoute>
  );
}
function Workspace() {
  const { profile } = useAuth(),
    { selected } = useClinicContext();
  const remote = useClinicalData<StaffState>(
    "/staff/state?clinicId=" + encodeURIComponent(selected),
  );
  const [tab, setTab] = useState("queue"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [prep, setPrep] = useState<string | null>(null),
    [patient, setPatient] = useState<string | null>(null),
    [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null),
    [lookup, setLookup] = useState<{ id: string; name: string } | null>(null);
  const nurse = profile?.role === "nurse";
  useEffect(() => {
    const reload = () => remote.reload();
    window.addEventListener("queuecare:updated", reload);
    const t = setInterval(reload, 30000);
    return () => {
      window.removeEventListener("queuecare:updated", reload);
      clearInterval(t);
    };
  }, [selected]);
  useEffect(() => {
    setPrep(null);
    setPatient(null);
    setEditingAppointment(null);
    setLookup(null);
  }, [selected]);
  async function action(path: string, body: unknown, method = "POST") {
    setBusy(true);
    setError("");
    try {
      const data = await api(path + "?clinicId=" + encodeURIComponent(selected), { method, body });
      remote.reload();
      window.dispatchEvent(new Event("queuecare:refresh"));
      return data;
    } catch (e) {
      setError(friendlyError(e));
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function prepare(patientId: string, tokenId?: string, appointmentId?: string) {
    const result = (await action("/staff/prepare", {
      patientId,
      ...(tokenId ? { tokenId } : {}),
      ...(appointmentId ? { appointmentId } : {}),
    })) as { id: string } | null;
    if (result) {
      setPrep(result.id);
      setTab("preparation");
    }
  }
  async function lookupPatient(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    try {
      const email = String(new FormData(e.currentTarget).get("email"));
      setLookup(
        await api(
          "/staff/patient-lookup?clinicId=" +
            encodeURIComponent(selected) +
            "&email=" +
            encodeURIComponent(email),
        ),
      );
    } catch (e) {
      setLookup(null);
      setError(friendlyError(e));
    }
  }
  const state = remote.data;
  return (
    <div className="min-h-screen">
      <header className="flex flex-wrap items-center gap-4 border-b border-border px-5 py-4 md:px-8">
        <Logo />
        <span className="text-sm text-muted-foreground">
          {profile?.fullName} · {nurse ? "Nurse / Assistant" : "Receptionist"}
        </span>
        <div className="ml-auto flex items-center gap-3">
          <ClinicSwitcher />
          <NotificationCenter />
          <a className="text-sm text-primary" href="/account">
            Account
          </a>
          <Btn variant="ghost" onClick={() => void logout()}>
            Sign out
          </Btn>
        </div>
      </header>
      <main className="mx-auto max-w-[1240px] px-5 py-8 md:px-8">
        <PageHeader title="Clinic workspace" sub={state?.clinic.name ?? "Assigned clinics only"} />
        <nav className="mb-6 flex flex-wrap gap-2">
          {[
            "queue",
            "appointments",
            "patients",
            ...(nurse ? ["preparation", "documents"] : ["billing"]),
          ].map((t) => (
            <Btn key={t} variant={tab === t ? "primary" : "ghost"} onClick={() => setTab(t)}>
              {t[0]?.toUpperCase() + t.slice(1)}
            </Btn>
          ))}
        </nav>
        {error && (
          <p role="alert" className="mb-5 text-sm text-destructive">
            {error}
          </p>
        )}
        {!state ? (
          <ClinicalLoading error={remote.error} retry={remote.reload} />
        ) : (
          <>
            {tab === "queue" && (
              <>
                <div className="mb-5 flex flex-wrap gap-3">
                  {[
                    ["open", "Open queue"],
                    ["close", "Close queue"],
                    ["callNext", "Call next"],
                    ["callAgain", "Call again"],
                  ].map(([id, label]) => (
                    <Btn
                      key={id}
                      variant="secondary"
                      disabled={busy}
                      onClick={() => void action("/staff/queue/" + id, {})}
                    >
                      {label}
                    </Btn>
                  ))}
                </div>
                <form
                  onSubmit={(e) => void lookupPatient(e)}
                  className="surface mb-5 flex flex-wrap items-end gap-4 p-5"
                >
                  <Field
                    label="Check in a registered patient by exact email"
                    name="email"
                    type="email"
                    required
                  />
                  <Btn disabled={busy}>Find patient</Btn>
                  {lookup && (
                    <div className="flex items-center gap-3 text-sm">
                      <span>{lookup.name}</span>
                      <Btn
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void action("/staff/check-in", { patientId: lookup.id, reason: "" })
                        }
                      >
                        Check in
                      </Btn>
                    </div>
                  )}
                </form>
                <div className="surface divide-y divide-border">
                  {state.queue.map((t) => (
                    <article
                      key={t.id}
                      className="flex flex-wrap items-center justify-between gap-4 p-5"
                    >
                      <div>
                        <p className="font-medium">
                          {t.tokenCode} · {t.patientName}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {t.phone} · {t.status}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {["waiting", "serving"].includes(t.status) && (
                          <Btn
                            variant="ghost"
                            disabled={busy}
                            onClick={() => void action("/staff/queue/skip", { token: t.tokenCode })}
                          >
                            Skip
                          </Btn>
                        )}
                        {t.status === "skipped" && (
                          <Btn
                            variant="secondary"
                            disabled={busy}
                            onClick={() =>
                              void action("/staff/queue/requeue", { token: t.tokenCode })
                            }
                          >
                            Move back
                          </Btn>
                        )}
                        {nurse && t.status === "serving" && (
                          <Btn disabled={busy} onClick={() => void prepare(t.patientId, t.id)}>
                            Prepare consultation
                          </Btn>
                        )}
                      </div>
                    </article>
                  ))}
                  {!state.queue.length && (
                    <p className="p-6 text-sm text-muted-foreground">No queue tokens today.</p>
                  )}
                </div>
              </>
            )}
            {tab === "appointments" &&
              (!nurse ? (
                <AppointmentCalendar />
              ) : (
                <div className="surface divide-y divide-border">
                  {state.appointments.map((a) => (
                    <article key={a.id} className="space-y-3 p-5">
                      <p className="font-medium">{a.patientName}</p>
                      <p className="text-sm">
                        {a.scheduledAt.replace("T", " ")} · {a.status}
                      </p>
                      {["scheduled", "confirmed", "checked_in"].includes(a.status) && (
                        <Btn onClick={() => void prepare(a.patientId, undefined, a.id)}>
                          Prepare consultation
                        </Btn>
                      )}
                    </article>
                  ))}
                  {!state.appointments.length && <p className="p-6 text-sm">No appointments.</p>}
                </div>
              ))}
            {tab === "patients" && (
              <>
                <div className="surface divide-y divide-border">
                  {state.patients.map((p) => (
                    <button
                      key={p.id}
                      className="block w-full p-5 text-left hover:bg-muted/40"
                      onClick={() => setPatient(p.id)}
                    >
                      <p className="font-medium">{p.name}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{p.phone}</p>
                    </button>
                  ))}
                  {!state.patients.length && (
                    <p className="p-6 text-sm text-muted-foreground">
                      No patients in this clinic yet.
                    </p>
                  )}
                </div>
                {patient && (
                  <DemographicEditor
                    patientId={patient}
                    clinicId={selected}
                    onSaved={() => remote.reload()}
                  />
                )}
              </>
            )}
            {tab === "preparation" &&
              nurse &&
              (prep ? (
                <NursePreparation id={prep} />
              ) : (
                <p className="surface p-6 text-sm text-muted-foreground">
                  Open a patient from the serving queue or a scheduled appointment to prepare their
                  consultation.
                </p>
              ))}
            {tab === "documents" && nurse && <DocumentsPanel />}
            {tab === "billing" && !nurse && <BillingWorkspace />}
          </>
        )}
      </main>
    </div>
  );
}
function DemographicEditor({
  patientId,
  clinicId,
  onSaved,
}: {
  patientId: string;
  clinicId: string;
  onSaved: () => void;
}) {
  const remote = useClinicalData<PatientProfile>(
      "/staff/patients/" + patientId + "?clinicId=" + encodeURIComponent(clinicId),
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  if (!remote.data) return <ClinicalLoading error={remote.error} retry={remote.reload} />;
  const p = remote.data;
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api("/staff/patients/" + patientId + "?clinicId=" + encodeURIComponent(clinicId), {
        method: "PUT",
        body: {
          ...Object.fromEntries(
            [
              "fullName",
              "phone",
              "gender",
              "address",
              "emergencyContactName",
              "emergencyContactPhone",
              "bloodGroup",
            ].map((k) => [k, String(f.get(k) ?? "")]),
          ),
          dateOfBirth: String(f.get("dateOfBirth") ?? "") || null,
        },
      });
      onSaved();
      setError("");
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form key={patientId} onSubmit={(e) => void save(e)} className="surface mt-5 space-y-4 p-6">
      <h2 className="font-semibold">Patient demographics</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {[
          ["fullName", "Full name"],
          ["phone", "Phone"],
          ["address", "Address"],
          ["emergencyContactName", "Emergency contact"],
          ["emergencyContactPhone", "Emergency phone"],
        ].map(([key, label]) => (
          <Field
            key={key}
            name={key}
            label={label!}
            required={key === "fullName" || key === "phone"}
            defaultValue={String(p[key as keyof PatientProfile] ?? "")}
            maxLength={key === "address" ? 500 : 120}
          />
        ))}
        <Field
          label="Date of birth"
          name="dateOfBirth"
          type="date"
          defaultValue={p.dateOfBirth ?? ""}
        />
        <label className="text-sm">
          Gender
          <select
            name="gender"
            defaultValue={p.gender}
            className="mt-2 block w-full rounded-lg border bg-card p-3"
          >
            {["", "female", "male", "other", "prefer_not_to_say"].map((v) => (
              <option key={v} value={v}>
                {v.replaceAll("_", " ") || "Not provided"}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Blood group
          <select
            name="bloodGroup"
            defaultValue={p.bloodGroup}
            className="mt-2 block w-full rounded-lg border bg-card p-3"
          >
            {["", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "unknown"].map((v) => (
              <option key={v} value={v}>
                {v || "Not provided"}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Btn disabled={busy}>Save demographics</Btn>
    </form>
  );
}
function NursePreparation({ id }: { id: string }) {
  const remote = useClinicalData<{
    status: string;
    reason_for_visit: string;
    chief_complaint: string;
    vitals: Record<string, number | null> | null;
  }>("/staff/preparations/" + id);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const fields = [
    ["systolic", "Systolic (mmHg)", "systolic"],
    ["diastolic", "Diastolic (mmHg)", "diastolic"],
    ["pulse", "Pulse (bpm)", "pulse"],
    ["temperature", "Temperature (°C)", "temperature"],
    ["respiratoryRate", "Respiratory rate (/min)", "respiratory_rate"],
    ["oxygenSaturation", "SpO2 (%)", "oxygen_saturation"],
    ["weight", "Weight (kg)", "weight"],
    ["height", "Height (cm)", "height"],
  ] as const;
  if (!remote.data) return <ClinicalLoading error={remote.error} retry={remote.reload} />;
  const d = remote.data;
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      vitals = Object.fromEntries(
        fields.map(([key]) => [key, f.get(key) === "" ? null : Number(f.get(key))]),
      ) as unknown as Vitals;
    setBusy(true);
    setError("");
    try {
      await api("/staff/preparations/" + id, {
        method: "PUT",
        body: {
          reasonForVisit: String(f.get("reason")),
          chiefComplaint: String(f.get("complaint")),
          vitals,
        },
      });
      setMessage("Consultation preparation saved.");
      window.dispatchEvent(new Event("queuecare:refresh"));
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form key={id} onSubmit={(e) => void save(e)} className="surface space-y-5 p-6">
      <h2 className="text-lg font-semibold">Consultation preparation</h2>
      <p className="text-sm text-muted-foreground">
        Optional measurements only. Final clinical decisions remain with the doctor.
      </p>
      <fieldset disabled={d.status !== "in_progress" || busy} className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Reason for visit"
          name="reason"
          defaultValue={d.reason_for_visit}
          maxLength={2000}
        />
        <Field
          label="Chief complaint"
          name="complaint"
          defaultValue={d.chief_complaint}
          maxLength={2000}
        />
        {fields.map(([key, label, column]) => (
          <Field
            key={key}
            label={label}
            name={key}
            type="number"
            step="any"
            defaultValue={d.vitals?.[column] ?? ""}
          />
        ))}
        <Btn disabled={d.status !== "in_progress" || busy}>Save preparation</Btn>
      </fieldset>
      {message && (
        <p role="status" className="text-sm text-success">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
