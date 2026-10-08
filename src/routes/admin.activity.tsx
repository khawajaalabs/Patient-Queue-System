import { SelectField } from "@/components/form-controls";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, Field } from "@/components/qc";
import { useClinicalData, ClinicalLoading } from "@/components/clinical";
import { useClinicContext } from "@/providers/clinic-provider";
import type { Activity, StaffAccount } from "@/types/operations";
export const Route = createFileRoute("/admin/activity")({ component: ActivityPage });
function ActivityPage() {
  const { selected } = useClinicContext();
  const [date, setDate] = useState(""),
    [staff, setStaff] = useState("all"),
    [action, setAction] = useState("");
  const people = useClinicalData<StaffAccount[]>("/admin/staff");
  const remote = useClinicalData<Activity[]>(
    "/admin/activity?clinicId=" +
      encodeURIComponent(selected) +
      (date ? "&date=" + date : "") +
      (staff !== "all" ? "&staffId=" + staff : "") +
      (action ? "&action=" + encodeURIComponent(action) : ""),
  );
  return (
    <>
      <PageHeader
        title="Activity"
        sub="A protected record of important clinical and operational actions."
      />
      <div className="mb-6 flex flex-wrap gap-4">
        <Field label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <label className="text-sm font-medium">
          Staff
          <SelectField
            value={staff}
            onChange={(e) => setStaff(e.target.value)}
            className="mt-2 block rounded-lg border bg-card p-3"
          >
            <option value="all">All staff and doctor</option>
            {people.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </SelectField>
        </label>
        <Field
          label="Action (e.g. payment.recorded)"
          value={action}
          onChange={(e) => setAction(e.target.value)}
        />
      </div>
      {!remote.data ? (
        <ClinicalLoading error={remote.error} retry={remote.reload} />
      ) : (
        <div className="surface divide-y divide-border">
          {remote.data.map((a) => (
            <article key={a.id} className="p-5">
              <p className="text-sm">
                <strong>{a.actor_name}</strong> ·{" "}
                {a.action.replaceAll(".", " ").replaceAll("_", " ")}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {a.clinic_name ?? "All clinics / account"} · {a.entity_type}{" "}
                {a.entity_id.slice(0, 8)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{a.detail}</p>
              <time className="mt-2 block text-xs text-muted-foreground">
                {new Date(a.created_at).toLocaleString()}
              </time>
            </article>
          ))}
          {!remote.data.length && (
            <p className="p-6 text-sm text-muted-foreground">No activity matches these filters.</p>
          )}
        </div>
      )}
    </>
  );
}
