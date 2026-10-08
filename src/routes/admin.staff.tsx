import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "@/api/client";
import { Btn, Field, PageHeader } from "@/components/qc";
import { useClinicalData, ClinicalLoading } from "@/components/clinical";
import { useClinicContext } from "@/providers/clinic-provider";
import { friendlyError } from "@/services/errors";
import type { StaffAccount } from "@/types/operations";
export const Route = createFileRoute("/admin/staff")({ component: Staff });
function Staff() {
  const remote = useClinicalData<StaffAccount[]>("/admin/staff"),
    { clinics } = useClinicContext();
  const [editing, setEditing] = useState<StaffAccount | null>(null),
    [adding, setAdding] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const password = String(f.get("password") ?? "");
      await api("/admin/staff" + (editing ? "/" + editing.id : ""), {
        method: editing ? "PUT" : "POST",
        body: {
          fullName: String(f.get("fullName")),
          email: String(f.get("email")),
          phone: String(f.get("phone")),
          role: String(f.get("role")),
          active: f.get("active") === "on",
          clinicIds: f.getAll("clinics").map(String),
          ...(password ? { password } : {}),
        },
      });
      setAdding(false);
      setEditing(null);
      remote.reload();
      window.dispatchEvent(new Event("queuecare:refresh"));
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        title="Staff"
        sub="Clinic assignments and secure staff access."
        right={
          <Btn
            onClick={() => {
              setEditing(null);
              setAdding(true);
              setError("");
            }}
          >
            Add staff
          </Btn>
        }
      />
      {error && (
        <p role="alert" className="mb-5 text-sm text-destructive">
          {error}
        </p>
      )}
      {adding && (
        <form
          key={editing?.id ?? "new"}
          onSubmit={(e) => void save(e)}
          className="surface mb-6 space-y-5 p-6"
        >
          <h2 className="text-lg font-semibold">{editing ? "Edit staff access" : "Add staff"}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              name="fullName"
              label="Full name"
              defaultValue={editing?.name}
              required
              minLength={2}
              maxLength={120}
            />
            <Field name="email" label="Email" type="email" defaultValue={editing?.email} required />
            <Field
              name="phone"
              label="Phone"
              defaultValue={editing?.phone}
              required
              minLength={7}
            />
            <label className="text-sm font-medium">
              Role
              <select
                name="role"
                defaultValue={editing?.role ?? "receptionist"}
                className="mt-2 block w-full rounded-lg border bg-card p-3"
              >
                <option value="receptionist">Receptionist</option>
                <option value="nurse">Nurse / Assistant</option>
              </select>
            </label>
            <Field
              name="password"
              label={editing ? "New password (leave blank to keep)" : "Initial password"}
              type="password"
              autoComplete="new-password"
              required={!editing}
              minLength={12}
              maxLength={72}
            />
          </div>
          <fieldset>
            <legend className="mb-3 text-sm font-medium">Assigned clinics</legend>
            <div className="flex flex-wrap gap-4">
              {clinics.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="clinics"
                    value={c.id}
                    defaultChecked={editing?.clinics.some((x) => x.id === c.id)}
                  />
                  {c.name}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={editing?.active ?? true} />
            Active account
          </label>
          <p className="text-xs text-muted-foreground">
            Share the initial password securely. Changes revoke existing staff sessions.
          </p>
          <div className="flex gap-3">
            <Btn disabled={busy}>{busy ? "Saving…" : "Save staff"}</Btn>
            <Btn type="button" variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Btn>
          </div>
        </form>
      )}
      {!remote.data ? (
        <ClinicalLoading error={remote.error} retry={remote.reload} />
      ) : (
        <div className="surface divide-y divide-border">
          {remote.data.map((s) => (
            <article key={s.id} className="flex flex-wrap items-center justify-between gap-4 p-5">
              <div>
                <h2 className="font-medium">{s.name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {s.email} · {s.role === "nurse" ? "Nurse / Assistant" : "Receptionist"} ·{" "}
                  {s.active ? "Active" : "Inactive"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {s.clinics.map((c) => c.name).join(" · ")}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {s.last_activity_at
                    ? "Last sign-in: " + new Date(s.last_activity_at).toLocaleString()
                    : "No sign-in recorded"}
                </p>
              </div>
              <Btn
                variant="secondary"
                onClick={() => {
                  setEditing(s);
                  setAdding(true);
                  setError("");
                }}
              >
                Edit / assign clinics
              </Btn>
            </article>
          ))}
          {!remote.data.length && (
            <p className="p-6 text-sm text-muted-foreground">No staff accounts yet.</p>
          )}
        </div>
      )}
    </>
  );
}
