import { createFileRoute } from "@tanstack/react-router";
import { useQueue, formatDate } from "@/lib/queue-store";
import { PageHeader, StatusPill } from "@/components/qc";
export const Route = createFileRoute("/patient/history")({
  head: () => ({ meta: [{ title: "Visit history — QueueCare" }] }),
  component: History,
});
function History() {
  const { history, clinic } = useQueue();
  return (
    <>
      <PageHeader title="Visit history" sub="Your previous tokens across all clinics." />
      <div className="surface overflow-hidden">
        <div className="hidden grid-cols-[1.5fr_1fr_90px_120px_90px_110px] gap-3 border-b border-border px-6 py-3 text-xs text-muted-foreground lg:grid">
          {["Clinic", "Department", "Token", "Date", "Wait time", "Status"].map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
        {history.length ? (
          history.map((entry) => (
            <div
              key={entry.id ?? `${entry.clinicId}-${entry.date}-${entry.token}`}
              className="grid gap-3 border-b border-border px-5 py-5 last:border-0 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_90px_120px_90px_110px] lg:items-center lg:px-6"
            >
              <div>
                <p className="text-sm font-medium">{entry.clinicName ?? clinic.name}</p>
                <p className="mt-1 text-xs text-muted-foreground lg:hidden">{entry.reason}</p>
              </div>
              <p className="text-sm text-muted-foreground">
                {entry.department ?? clinic.department}
              </p>
              <p className="tabular text-lg font-semibold lg:text-sm">{entry.token}</p>
              <p className="text-sm text-muted-foreground">{formatDate(entry.date ?? "")}</p>
              <p className="tabular text-sm text-muted-foreground">
                <span className="lg:hidden">Waited </span>
                {entry.waitMin ?? 0} min
              </p>
              <div>
                <StatusPill status={entry.status} />
              </div>
            </div>
          ))
        ) : (
          <p className="p-10 text-center text-sm text-muted-foreground">No queue history yet.</p>
        )}
      </div>
    </>
  );
}
