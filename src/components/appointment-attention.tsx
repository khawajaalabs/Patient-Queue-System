import { useEffect, useRef, useState } from "react";
import { useClinicalData, ClinicalLoading } from "@/components/clinical";
import { api } from "@/api/client";
import { Btn } from "@/components/qc";
import { SelectField } from "@/components/form-controls";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  attentionTags,
  priorities,
  type AppointmentAttention,
} from "@/domain/appointment-attention";
import { friendlyError } from "@/services/errors";
import { cn } from "@/lib/utils";
export function PriorityBadge({
  priority = "routine",
}: {
  priority?: AppointmentAttention["priority"] | undefined;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center rounded-full px-2.5 py-1 text-xs font-medium",
        priority === "critical"
          ? "bg-destructive/10 text-destructive"
          : priority === "urgent"
            ? "bg-warning-soft text-warning"
            : "bg-muted text-muted-foreground",
      )}
    >
      {priority[0]!.toUpperCase() + priority.slice(1)}
    </span>
  );
}
export function AttentionBadges({
  attention,
  descriptiveOnly = false,
}: {
  attention?: AppointmentAttention | undefined;
  descriptiveOnly?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {!descriptiveOnly && <PriorityBadge priority={attention?.priority} />}{" "}
      {attention?.tags.map((tag) => (
        <span key={tag} className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
          {attentionTags[tag]}
        </span>
      ))}
    </div>
  );
}
type AttentionData = {
  current: AppointmentAttention;
  history: {
    actor: string;
    at: string;
    before: AppointmentAttention;
    after: AppointmentAttention;
  }[];
};
export function AttentionEditor({
  appointmentId,
  onChanged,
}: {
  appointmentId: string;
  onChanged?: (() => void) | undefined;
}) {
  const remote = useClinicalData<AttentionData>(
    "/admin/appointments/" + encodeURIComponent(appointmentId) + "/attention",
  );
  const [value, setValue] = useState<AppointmentAttention>({ priority: "routine", tags: [] }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  const locked = useRef(false);
  useEffect(() => {
    if (remote.data?.current) {
      setValue(remote.data.current);
      setSaved(false);
    }
  }, [remote.data, appointmentId]);
  async function save() {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      await api("/admin/appointments/" + encodeURIComponent(appointmentId) + "/attention", {
        method: "PUT",
        body: value,
      });
      remote.reload();
      onChanged?.();
      window.dispatchEvent(new Event("queuecare:refresh"));
      window.dispatchEvent(new Event("queuecare:updated"));
      setSaved(true);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  if (!remote.data?.current) return <ClinicalLoading error={remote.error} retry={remote.reload} />;
  return (
    <section className="space-y-4" aria-label="Appointment attention">
      <p className="text-sm text-muted-foreground">
        Staff workflow information only. Priority does not change queue order.
      </p>
      <fieldset disabled={busy} className="space-y-4">
        <label className="block space-y-2 text-sm font-medium">
          Appointment priority
          <SelectField
            aria-label="Appointment priority"
            value={value.priority}
            onChange={(e) => {
              setSaved(false);
              setValue((v) => ({
                ...v,
                priority: e.target.value as AppointmentAttention["priority"],
              }));
            }}
          >
            {priorities.map((p) => (
              <option key={p} value={p}>
                {p[0]!.toUpperCase() + p.slice(1)}
              </option>
            ))}
          </SelectField>
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          {Object.entries(attentionTags).map(([tag, label]) => (
            <label
              key={tag}
              className="flex min-h-11 items-center gap-3 rounded-lg border border-border px-3 text-sm"
            >
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={value.tags.includes(tag as keyof typeof attentionTags)}
                onChange={(e) => {
                  setSaved(false);
                  setValue((v) => ({
                    ...v,
                    tags: e.target.checked
                      ? [...v.tags, tag as keyof typeof attentionTags]
                      : v.tags.filter((t) => t !== tag),
                  }));
                }}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="text-sm text-primary">
          Tags saved.
        </p>
      )}
      <Btn type="button" disabled={busy} onClick={() => void save()}>
        {busy ? "Saving…" : "Save tags"}
      </Btn>
      <details className="border-t border-border pt-3">
        <summary className="cursor-pointer text-sm text-primary">Tag history</summary>
        <ul className="mt-3 space-y-3 text-sm">
          {remote.data.history.map((h, i) => (
            <li key={i}>
              <p>
                {h.actor} · {new Date(h.at).toLocaleString("en-GB", { timeZone: "Asia/Karachi" })}
              </p>
              <p className="text-xs text-muted-foreground">
                {h.before.priority} → {h.after.priority}
              </p>
              <AttentionBadges attention={h.after} />
            </li>
          ))}
        </ul>
        {!remote.data.history.length && (
          <p className="mt-2 text-sm text-muted-foreground">No tag changes yet.</p>
        )}
      </details>
    </section>
  );
}
export function AttentionButton({
  appointmentId,
  onChanged,
}: {
  appointmentId: string;
  onChanged?: (() => void) | undefined;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Btn type="button" variant="ghost">
          Manage tags
        </Btn>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogTitle>Appointment tags</DialogTitle>
        <DialogDescription>
          Update priority and attention tags for this appointment.
        </DialogDescription>
        <AttentionEditor appointmentId={appointmentId} onChanged={onChanged} />
      </DialogContent>
    </Dialog>
  );
}
