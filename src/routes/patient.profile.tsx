import { SelectField } from "@/components/form-controls";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "@/api/client";
import { restoreSession } from "@/services/auth";
import { PageHeader, Btn, Field } from "@/components/qc";
import { ClinicalLoading, useClinicalData } from "@/components/clinical";
import { friendlyError } from "@/services/errors";
import type { PatientProfile } from "@/types/clinical";
export const Route = createFileRoute("/patient/profile")({ component: Profile });
function Profile() {
  const remote = useClinicalData<PatientProfile>("/patient/profile");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  if (!remote.data) return <ClinicalLoading error={remote.error} retry={remote.reload} />;
  const p = remote.data;
  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      value = (k: string) => String(f.get(k) ?? "");
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api("/patient/profile", {
        method: "PUT",
        body: {
          fullName: value("fullName"),
          phone: value("phone"),
          dateOfBirth: value("dateOfBirth") || null,
          gender: value("gender"),
          address: value("address"),
          emergencyContactName: value("emergencyContactName"),
          emergencyContactPhone: value("emergencyContactPhone"),
          bloodGroup: value("bloodGroup"),
        },
      });
      await restoreSession();
      setMessage("Your profile has been saved.");
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeader title="My profile" sub="One patient profile, shared across your clinics." />
      <form onSubmit={save} className="surface space-y-5 p-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Full name"
            name="fullName"
            required
            minLength={2}
            maxLength={120}
            defaultValue={p.fullName}
          />
          <Field label="Email (sign-in identity)" value={p.email} readOnly />
          <Field
            label="Phone"
            name="phone"
            required
            minLength={7}
            maxLength={30}
            defaultValue={p.phone}
          />
          <Field
            label="Date of birth"
            name="dateOfBirth"
            type="date"
            max={new Date().toISOString().slice(0, 10)}
            defaultValue={p.dateOfBirth ?? ""}
          />
          <label className="block text-sm font-medium">
            Gender
            <SelectField
              name="gender"
              defaultValue={p.gender}
              className="mt-2 block h-11 w-full rounded-lg border border-input bg-card px-3"
            >
              {[
                ["", "Not provided"],
                ["female", "Female"],
                ["male", "Male"],
                ["other", "Other"],
                ["prefer_not_to_say", "Prefer not to say"],
              ].map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </SelectField>
          </label>
          <label className="block text-sm font-medium">
            Blood group
            <SelectField
              name="bloodGroup"
              defaultValue={p.bloodGroup}
              className="mt-2 block h-11 w-full rounded-lg border border-input bg-card px-3"
            >
              {["", "unknown", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((id) => (
                <option key={id} value={id}>
                  {id || "Not provided"}
                </option>
              ))}
            </SelectField>
          </label>
          <Field label="Address" name="address" maxLength={500} defaultValue={p.address} />
          <Field
            label="Emergency contact name"
            name="emergencyContactName"
            maxLength={120}
            defaultValue={p.emergencyContactName}
          />
          <Field
            label="Emergency contact phone"
            name="emergencyContactPhone"
            maxLength={30}
            defaultValue={p.emergencyContactPhone}
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="text-sm text-success">
            {message}
          </p>
        )}
        <Btn disabled={busy}>{busy ? "Saving…" : "Save profile"}</Btn>
      </form>
      <section className="surface mt-6 p-6">
        <h2 className="text-lg font-semibold">Doctor-recorded information</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Contact your clinic to correct clinical information.
        </p>
        <dl className="mt-5 grid gap-5 sm:grid-cols-3">
          {[
            ["Allergies", p.allergies],
            ["Chronic conditions", p.chronicConditions],
            ["Current medications", p.currentMedications],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-sm font-medium">{label}</dt>
              <dd className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                {value || "None recorded"}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}
