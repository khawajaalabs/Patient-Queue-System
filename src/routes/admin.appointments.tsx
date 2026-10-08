import { StartConsultation } from "@/components/clinical";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api } from "@/api/client";
import { useClinicContext } from "@/providers/clinic-provider";
import { PageHeader, Btn, Field } from "@/components/qc";
import { friendlyError } from "@/services/errors";
import type { Appointment } from "@/types/local";
export const Route = createFileRoute("/admin/appointments")({ component: Appointments });
function Appointments() {
  const { selected } = useClinicContext();
  const [items, setItems] = useState<Appointment[]>([]),
    [patients, setPatients] = useState<{ id: string; name: string }[]>([]),
    [adding, setAdding] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setAdding(false);
    setItems([]);
    const refresh = async () => {
      try {
        const [rows, options] = await Promise.all([
          api<Appointment[]>(`/admin/appointments?clinicId=${encodeURIComponent(selected)}`),
          api<{ id: string; name: string }[]>("/admin/patient-options"),
        ]);
        if (active) {
          setItems(rows);
          setPatients(options);
          setError("");
        }
      } catch (e) {
        if (active) setError(friendlyError(e));
      }
    };
    void refresh();
    return () => {
      active = false;
    };
  }, [selected, attempt]);
  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api(`/admin/appointments?clinicId=${encodeURIComponent(selected)}`, {
        method: "POST",
        body: {
          patientId: String(data.get("patientId")),
          scheduledAt: String(data.get("scheduledAt")),
          reason: String(data.get("reason") ?? ""),
        },
      });
      setAdding(false);
      setAttempt((a) => a + 1);
      window.dispatchEvent(new Event("queuecare:refresh"));
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeader
        title="Appointments"
        sub={
          selected === "all"
            ? "Appointments across all clinics."
            : "Appointments for the selected clinic."
        }
        right={selected !== "all" && <Btn onClick={() => setAdding(true)}>Add appointment</Btn>}
      />
      {error && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {error}
        </p>
      )}
      {adding && (
        <form onSubmit={save} className="surface mb-6 space-y-5 p-6">
          <label className="block text-sm font-medium">
            Patient
            <select
              required
              name="patientId"
              className="mt-2 block w-full rounded-lg border border-input bg-card p-3"
            >
              <option value="">Choose an existing patient</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <Field
            label="Date and time (clinic local time)"
            name="scheduledAt"
            type="datetime-local"
            required
          />
          <Field label="Reason (optional)" name="reason" maxLength={300} />
          <div className="flex gap-3">
            <Btn disabled={busy}>{busy ? "Saving…" : "Save appointment"}</Btn>
            <Btn type="button" variant="secondary" onClick={() => setAdding(false)} disabled={busy}>
              Cancel
            </Btn>
          </div>
        </form>
      )}
      <div className="surface overflow-hidden">
        {items.length ? (
          items.map((a) => (
            <div
              key={a.id}
              className="flex flex-wrap justify-between gap-4 border-b border-border p-5 last:border-0"
            >
              <div>
                <p className="text-sm font-medium">{a.patientName}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {a.clinicName} · {a.scheduledAt.replace("T", " ")}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-muted-foreground">{a.status}</span>
                {a.status === "scheduled" && (
                  <StartConsultation
                    patientId={a.patientId}
                    clinicId={a.clinicId}
                    appointmentId={a.id}
                  />
                )}
              </div>
            </div>
          ))
        ) : (
          <p className="p-10 text-center text-sm text-muted-foreground">No appointments yet.</p>
        )}
      </div>
    </>
  );
}
