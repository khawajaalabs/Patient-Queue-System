import { TokenActions } from "@/components/appointment-tokens";
import { runAction } from "@/services/queue";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Info } from "lucide-react";
import { actions, useQueue } from "@/lib/queue-store";
import { Btn, PageHeader, StatusPill } from "@/components/qc";
import { ConfirmAction, PatientStatus } from "@/components/queue-feedback";
import { QueueHero } from "./patient.dashboard";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/patient/queue")({
  head: () => ({ meta: [{ title: "Live queue — Neuro Spine Care Center" }] }),
  component: QueuePage,
});
export function QueuePage() {
  const q = useQueue();
  if (!q.mine)
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">No active token</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your live position appears on the date of your booked appointment.
        </p>
        <Link to="/patient/appointments" className="mt-6 inline-block">
          <Btn>View appointments</Btn>
        </Link>
      </div>
    );
  const active = ["waiting", "serving"].includes(q.mine.status);
  const line = [q.serving, ...q.waiting].filter(
    (entry): entry is NonNullable<typeof entry> => !!entry,
  );
  return (
    <>
      <PageHeader title="Live queue" sub="Updates automatically as the clinic calls patients." />
      <PatientStatus />
      {active ? (
        <QueueHero />
      ) : (
        <section className="surface p-7">
          <p className="text-xs text-muted-foreground">Your token</p>
          <p className="tabular mt-2 text-5xl font-semibold">{q.mine.token}</p>
          <div className="mt-4">
            <StatusPill status={q.mine.status} />
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/patient/history">
              <Btn>Visit history</Btn>
            </Link>
            <Link to="/patient/dashboard">
              <Btn variant="secondary">Back to dashboard</Btn>
            </Link>
          </div>
        </section>
      )}
      {active && (
        <div className="mt-10 grid gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,300px)]">
          <section>
            <h2 className="text-lg font-semibold tracking-tight">Queue line</h2>
            <ol className="mt-4">
              {line.map((entry) => {
                const me = entry.token === q.mine!.token;
                const position = q.waiting.findIndex((e) => e.token === entry.token);
                return (
                  <li
                    key={entry.token}
                    className={cn(
                      "flex flex-wrap items-center gap-3 rounded-xl px-3 py-3.5 sm:px-4",
                      me && "bg-primary-soft",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold",
                        entry.status === "serving"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {entry.status === "serving" ? "▶" : position + 1}
                    </span>
                    <span className="tabular text-[17px] font-semibold tracking-tight">
                      {entry.token}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {me ? "You" : entry.status === "serving" ? "Serving" : "Waiting"}
                    </span>
                    <span className="tabular ml-auto text-sm text-muted-foreground">
                      {entry.status === "serving" ? "Now" : `~${position * q.avgMin} min`}
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>
          <aside className="space-y-6">
            <div className="flex gap-3 text-sm text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0" />
              <p>
                Wait time is estimated from the average consultation length today (~{q.avgMin} min).
                It may change if a consultation runs longer.
              </p>
            </div>
            <div className="border-t border-border pt-6">
              <p className="text-sm font-medium">Can't make it?</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Leaving frees your spot for the next patient.
              </p>
              {q.mine.id && (
                <TokenActions
                  token={{ id: q.mine.id, tokenCode: q.mine.token, status: q.mine.status }}
                />
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
