import { SearchableChoice } from "@/components/searchable-choice";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api } from "@/api/client";
import { useAuth } from "@/providers/auth-provider";
import { useClinicContext } from "@/providers/clinic-provider";
import { PageHeader, Btn, Field } from "@/components/qc";
import { friendlyError } from "@/services/errors";
import type { ManagedClinic } from "@/types/local";
export const Route = createFileRoute("/admin/clinics")({ component: Clinics });
export function Clinics() {
  const { profile } = useAuth(),
    { select } = useClinicContext();
  const [clinics, setClinics] = useState<ManagedClinic[]>([]),
    [editing, setEditing] = useState<ManagedClinic | null | undefined>(undefined),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [city, setCity] = useState(""),
    [area, setArea] = useState(""),
    [created, setCreated] = useState<ManagedClinic | null>(null);
  const load = async () => {
    try {
      setClinics(await api<ManagedClinic[]>("/admin/clinics"));
      setError("");
    } catch (e) {
      setError(friendlyError(e));
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const value = (key: string) => String(data.get(key) ?? "");
    if (!editing && (!city.trim() || !area.trim())) {
      setError("Select or enter a city and area before creating this clinic.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await api<ManagedClinic>(`/admin/clinics${editing ? `/${editing.id}` : ""}`, {
        method: editing ? "PUT" : "POST",
        body: {
          city,
          area,
          name: value("name"),
          publicName: editing?.publicDisplayName ?? value("name"),
          address: value("address"),
          phone: value("phone"),
          department: editing?.department ?? "General",
          doctor: editing?.doctorName ?? profile?.fullName ?? "Doctor",
          opening: value("opening"),
          closing: value("closing"),
          showNext: editing?.publicDisplayShowNext ?? true,
          active: data.get("active") === "on",
          consultationFee: value("fee") === "" ? null : Number(value("fee")),
        },
      });
      if (!editing) setCreated(result);
      setEditing(undefined);
      await load();
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
        title="Clinics"
        sub="Manage your clinic locations. Patient profiles stay shared across clinics."
        right={
          editing === undefined && (
            <Btn
              onClick={() => {
                setEditing(null);
                setCity("");
                setArea("");
                setCreated(null);
              }}
            >
              Add clinic
            </Btn>
          )
        }
      />
      {created && (
        <div className="surface mb-6 p-5">
          <p className="font-medium">Clinic created.</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Next: set when you are available at this clinic.
          </p>
          <a
            className="mt-4 inline-block text-primary"
            href={"/admin/doctor-schedule?clinicId=" + created.id}
          >
            Set doctor schedule →
          </a>
        </div>
      )}
      {error && (
        <p role="alert" className="mb-5 text-sm text-destructive">
          {error}
        </p>
      )}
      {editing !== undefined && (
        <form onSubmit={save} key={editing?.id ?? "new"} className="surface mb-8 space-y-5 p-6">
          <h2 className="text-lg font-semibold">{editing ? "Edit clinic" : "New clinic"}</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <SearchableChoice
              label="City"
              value={city}
              allowCreate
              options={clinics.map((c) => c.city || "")}
              onChange={(v) => {
                setCity(v);
                setArea("");
              }}
            />
            <SearchableChoice
              label="Area"
              value={area}
              allowCreate
              disabled={!city}
              options={clinics.filter((c) => c.city === city).map((c) => c.area || "")}
              onChange={setArea}
            />
            <Field
              label="Clinic name"
              name="name"
              required
              maxLength={120}
              defaultValue={editing?.name ?? ""}
            />
            <Field
              label="Address"
              name="address"
              required
              maxLength={250}
              defaultValue={editing?.address ?? ""}
            />
            <Field
              label="Phone"
              name="phone"
              required
              maxLength={30}
              defaultValue={editing?.phone ?? ""}
            />
            <Field
              label="Opening time"
              name="opening"
              type="time"
              required
              defaultValue={editing?.openingTime ?? "09:00"}
            />
            <Field
              label="Closing time"
              name="closing"
              type="time"
              required
              defaultValue={editing?.closingTime ?? "17:00"}
            />
            <Field
              label="Consultation fee (optional)"
              name="fee"
              type="number"
              min={0}
              max={10000000}
              defaultValue={editing?.consultationFee ?? ""}
            />
          </div>
          <div className="flex flex-wrap gap-6 text-sm">
            <label>
              <input
                type="checkbox"
                name="active"
                defaultChecked={editing?.active ?? true}
                className="mr-2 accent-primary"
              />
              Active clinic
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            Deactivating stops new tokens and queue openings. Existing records remain available.
          </p>
          <div className="flex gap-3">
            <Btn disabled={busy}>{busy ? "Saving…" : "Save clinic"}</Btn>
            <Btn
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => setEditing(undefined)}
            >
              Cancel
            </Btn>
          </div>
        </form>
      )}
      <div className="surface divide-y divide-border">
        {!clinics.length && (
          <p className="p-6 text-sm text-muted-foreground">
            Add your first clinic to start scheduling patients.
          </p>
        )}
        {clinics.map((c) => (
          <article key={c.id} className="p-5">
            <div className="flex justify-between gap-3">
              <h2 className="font-semibold">{c.name}</h2>
              <span className={c.active ? "text-xs text-success" : "text-xs text-muted-foreground"}>
                {c.active ? "Active" : "Inactive"}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {c.city && c.area ? `${c.area} · ${c.city}` : "Location details incomplete"}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">{c.address}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {c.department} · {c.phone}
            </p>
            <p className="mt-3 text-sm">
              {c.openingTime} – {c.closingTime}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Btn
                variant="secondary"
                onClick={() => {
                  setEditing(c);
                  setCity(c.city || "");
                  setArea(c.area || "");
                  setCreated(null);
                }}
              >
                Edit clinic
              </Btn>
              <Btn variant="ghost" onClick={() => select(c.id)}>
                Select clinic
              </Btn>
              <a
                className="inline-flex items-center px-3 text-sm text-primary hover:underline"
                target="_blank"
                rel="noreferrer"
                href={`/public-display?clinicId=${encodeURIComponent(c.id)}`}
              >
                Public display
              </a>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
