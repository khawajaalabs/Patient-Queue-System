import { friendlyError } from "@/services/errors";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { actions, useQueue } from "@/lib/queue-store";
import { Btn, Field, PageHeader } from "@/components/qc";
export const Route = createFileRoute("/admin/settings")({
  head: () => ({ meta: [{ title: "Settings — QueueCare Admin" }] }),
  component: Settings,
});
function Settings() {
  const { clinic, avgMin } = useQueue();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const text = (key: string) => String(data.get(key) ?? "").trim();
    if (text("opening") >= text("closing")) {
      setError("Closing time must be after opening time.");
      return;
    }
    if (!["name", "address", "phone", "publicName"].every((key) => text(key).length)) {
      setError("Please fill in the clinic information.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      await actions.saveSettings(
        {
          ...clinic,
          name: text("name"),
          address: text("address"),
          phone: text("phone"),
          department: text("department"),
          doctor: text("doctor"),
          opening: text("opening"),
          closing: text("closing"),
          prefix: text("prefix").toUpperCase(),
          publicName: text("publicName"),
          showNext: data.has("showNext"),
        },
        Number(data.get("avgMin")),
      );
      toast.success("Settings saved.");
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <PageHeader title="Settings" sub="Clinic details and queue preferences." />
      <form onSubmit={save} className="max-w-3xl space-y-7">
        <section className="surface p-6 sm:p-7">
          <h2 className="text-lg font-semibold tracking-tight">Clinic Information</h2>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <Field label="Clinic name" name="name" defaultValue={clinic.name} required />
            <Field label="Phone" name="phone" type="tel" defaultValue={clinic.phone} required />
            <Field label="Department" name="department" defaultValue={clinic.department} required />
            <Field label="Doctor" name="doctor" defaultValue={clinic.doctor} required />
            <div className="sm:col-span-2">
              <Field label="Address" name="address" defaultValue={clinic.address} required />
            </div>
          </div>
        </section>
        <section className="surface p-6 sm:p-7">
          <h2 className="text-lg font-semibold tracking-tight">Queue Configuration</h2>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <Field
              label="Opening time"
              name="opening"
              type="time"
              defaultValue={clinic.opening}
              required
            />
            <Field
              label="Closing time"
              name="closing"
              type="time"
              defaultValue={clinic.closing}
              required
            />
            <Field
              label="Average consultation time (minutes)"
              name="avgMin"
              type="number"
              min={1}
              max={120}
              step={1}
              defaultValue={avgMin}
              required
            />
            <Field
              label="Token prefix"
              name="prefix"
              maxLength={5}
              pattern="[A-Za-z]{1,5}"
              defaultValue={clinic.prefix}
              required
            />
          </div>
        </section>
        <section className="surface p-6 sm:p-7">
          <h2 className="text-lg font-semibold tracking-tight">Public Display Settings</h2>
          <div className="mt-5 space-y-5">
            <Field
              label="Public clinic name"
              name="publicName"
              defaultValue={clinic.publicName}
              required
            />
            <label className="flex min-h-11 items-center justify-between gap-4 text-sm font-medium">
              Show next tokens
              <input
                name="showNext"
                type="checkbox"
                defaultChecked={clinic.showNext}
                className="size-5 accent-primary"
              />
            </label>
          </div>
        </section>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-4">
          <Btn type="submit" size="lg" disabled={saving}>
            Save changes
          </Btn>
          <p className="text-xs text-muted-foreground">
            Saved preferences apply to the clinic and public display.
          </p>
        </div>
      </form>
    </>
  );
}
