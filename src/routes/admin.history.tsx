import { SelectField } from "@/components/form-controls";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueue, formatDate, type Status } from "@/lib/queue-store";
import { PageHeader, StatusPill } from "@/components/qc";
export const Route = createFileRoute("/admin/history")({
  head: () => ({ meta: [{ title: "Queue history — QueueCare Admin" }] }),
  component: AdminHistory,
});
function AdminHistory() {
  const q = useQueue();
  const params = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
  const tokenId = params.get("tokenId");
  useEffect(() => {
    const requested = params.get("date");
    if (requested && /^\d{4}-\d{2}-\d{2}$/.test(requested)) q.setHistoryDate(requested);
  }, []);
  const date = q.historyDate;
  const setDate = q.setHistoryDate;
  const [filter, setFilter] = useState<"all" | Status>("all");
  const entries = [
    ...q.queue,
    ...q.history.filter(
      (h) =>
        !q.queue.some((e) =>
          e.id && h.id
            ? e.id === h.id
            : e.token === h.token && e.date === h.date && e.clinicId === h.clinicId,
        ),
    ),
  ].filter((e) => (e.date ?? q.queueDate) === date);
  const rows = entries.filter(
    (e) => (!tokenId || e.id === tokenId) && (filter === "all" || e.status === filter),
  );
  const average = entries.length
    ? Math.round(entries.reduce((sum, e) => sum + (e.waitMin ?? 0), 0) / entries.length)
    : 0;
  return (
    <>
      <PageHeader title="Queue history" sub="Queue activity for your selected clinic context." />
      <div className="mb-6 flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Date
          <input
            aria-label="History date"
            type="date"
            max={q.queueDate}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-11 min-w-0 rounded-lg border border-input bg-card px-3 text-foreground"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Status
          <SelectField
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
            className="h-11 rounded-lg border border-input bg-card px-3 text-foreground"
          >
            <option value="all">All statuses</option>
            <option value="waiting">Waiting</option>
            <option value="serving">Serving</option>
            <option value="done">Completed</option>
            <option value="skipped">Skipped</option>
            <option value="left">Cancelled</option>
          </SelectField>
        </label>
      </div>
      <dl className="mb-7 grid grid-cols-2 gap-5 border-y border-border py-5 sm:grid-cols-4">
        {[
          ["Total patients", entries.length],
          ["Completed", entries.filter((e) => e.status === "done").length],
          ["Skipped", entries.filter((e) => e.status === "skipped").length],
          ["Average wait", `${average} min`],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="tabular mt-1 text-3xl font-semibold tracking-tight">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="surface overflow-hidden">
        <div className="hidden grid-cols-[80px_minmax(120px,1fr)_110px_85px_85px_90px_65px_105px] gap-3 border-b border-border px-5 py-3 text-xs text-muted-foreground xl:grid">
          {["Token", "Patient", "Date", "Joined", "Called", "Completed", "Wait time", "Status"].map(
            (label) => (
              <span key={label}>{label}</span>
            ),
          )}
        </div>
        {rows.map((entry) => (
          <div
            key={entry.id ?? `${entry.clinicId}-${entry.token}`}
            className="grid gap-3 border-b border-border px-5 py-5 last:border-0 sm:grid-cols-2 xl:grid-cols-[80px_minmax(120px,1fr)_110px_85px_85px_90px_65px_105px] xl:items-center"
          >
            <p className="tabular font-semibold">{entry.token}</p>
            <div>
              <p className="text-sm font-medium">{entry.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">{entry.clinicName}</p>
            </div>
            <p className="text-sm text-muted-foreground">{formatDate(entry.date ?? q.queueDate)}</p>
            <p className="text-sm text-muted-foreground">
              <span className="xl:hidden">Joined </span>
              {entry.joinedAt}
            </p>
            <p className="text-sm text-muted-foreground">
              <span className="xl:hidden">Called </span>
              {entry.servedAt ?? "—"}
            </p>
            <p className="text-sm text-muted-foreground">
              <span className="xl:hidden">Completed </span>
              {entry.completedAt ?? "—"}
            </p>
            <p className="text-sm text-muted-foreground">
              <span className="xl:hidden">Waited </span>
              {entry.waitMin ?? 0} min
            </p>
            <div>
              <StatusPill status={entry.status} />
            </div>
          </div>
        ))}
        {!rows.length && (
          <p className="px-6 py-14 text-center text-sm text-muted-foreground">
            {entries.length ? "No visits match this date and status." : "No queue history yet."}
          </p>
        )}
      </div>
    </>
  );
}
