import { StartConsultation } from "@/components/clinical";
import { useClinicContext } from "@/providers/clinic-provider";
import { runAction } from "@/services/queue";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, RotateCcw, SkipForward, Check } from "lucide-react";
import { NoQueue, QueueToggle } from "@/components/admin-queue-states";
import { actions, useQueue } from "@/lib/queue-store";
import { Btn, Label, LiveDot, PageHeader } from "@/components/qc";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "Queue overview — QueueCare Admin" },
      { name: "description", content: "Manage today's patient flow at Northstar Medical Clinic." },
      { property: "og:title", content: "Queue overview — QueueCare Admin" },
      {
        property: "og:description",
        content: "Manage today's patient flow at Northstar Medical Clinic.",
      },
    ],
  }),
  component: Overview,
});

function Overview() {
  const q = useQueue();
  const { selected } = useClinicContext();
  if (!q.openedToday)
    return (
      <>
        <PageHeader title="Queue overview" sub="Manage today's patient flow." />
        <NoQueue />
      </>
    );
  const next = q.waiting[0];
  const s = q.serving;
  return (
    <>
      <PageHeader
        title="Queue overview"
        sub="Manage today's patient flow."
        right={<QueueToggle />}
      />

      <section className="surface grid overflow-hidden lg:grid-cols-[1.4fr_1fr]">
        <div className="p-7 md:p-9">
          <div className="flex items-center gap-2 text-primary">
            <LiveDot />
            <Label>Now serving</Label>
          </div>
          {s ? (
            <>
              <div
                key={s.token}
                className="token-in tabular mt-3 text-[80px] font-semibold leading-none tracking-[-0.04em] md:text-[104px]"
              >
                {s.token}
              </div>
              <dl className="mt-6 grid grid-cols-3 gap-6 text-sm">
                <div>
                  <dt className="text-muted-foreground">Patient</dt>
                  <dd className="mt-1 font-medium">{s.name}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Waited</dt>
                  <dd className="tabular mt-1 font-medium">{s.waitMin ?? 0} min</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Started</dt>
                  <dd className="tabular mt-1 font-medium">{s.servedAt}</dd>
                </div>
              </dl>
              <div className="mt-8 flex flex-wrap items-center gap-2">
                {s.patientId && (
                  <StartConsultation
                    patientId={s.patientId}
                    clinicId={s.clinicId ?? selected}
                    tokenId={s.id}
                  />
                )}
                <Btn
                  size="lg"
                  onClick={() => {
                    void runAction(() => actions.markDone(), `${s.token} marked as done`);
                  }}
                >
                  <Check className="size-4" /> Mark as done
                </Btn>
                <Btn
                  size="lg"
                  variant="secondary"
                  onClick={() =>
                    void runAction(() => actions.callAgain(s.token), `Calling ${s.token} again`)
                  }
                >
                  <RotateCcw className="size-4" /> Call again
                </Btn>
                <Btn
                  size="lg"
                  variant="ghost"
                  className="sm:ml-auto"
                  onClick={() => {
                    void runAction(() => actions.skip(), `${s.token} skipped`);
                  }}
                >
                  <SkipForward className="size-4" /> Skip
                </Btn>
              </div>
            </>
          ) : (
            <div className="py-8">
              <div className="text-2xl font-semibold tracking-tight">
                No patient in consultation
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {next ? "Call the next patient when the room is ready." : "No patients waiting"}
              </p>
            </div>
          )}
        </div>
        <div className="flex flex-col border-t border-border bg-muted/60 p-7 md:p-9 lg:border-l lg:border-t-0">
          <Label>Up next</Label>
          {next ? (
            <>
              <div className="tabular mt-3 text-4xl font-semibold tracking-tight">{next.token}</div>
              <div className="mt-1 text-sm text-muted-foreground">
                {next.name} · joined {next.joinedAt}
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                Waiting {next.waitMin ?? 0} min
              </div>
              <ul className="mt-6 space-y-2 text-sm">
                {q.waiting.slice(1, 4).map((e) => (
                  <li key={e.token} className="flex justify-between">
                    <span className="tabular font-medium">{e.token}</span>
                    <span className="text-muted-foreground">{e.name}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="mt-3">
              <p className="text-sm font-medium">No patients waiting</p>
              <p className="mt-2 text-sm text-muted-foreground">
                New tokens will appear here when patients join the queue.
              </p>
            </div>
          )}
          <Btn
            size="lg"
            className="mt-auto w-full"
            disabled={!next || Boolean(q.serving)}
            title={q.serving ? "Mark done or skip the current patient first." : undefined}
            onClick={() => {
              void runAction(() => actions.callNext(), `Now serving ${next!.token}`);
            }}
          >
            Call next patient <ArrowRight className="size-4" />
          </Btn>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight">Today at a glance</h2>
        <dl className="mt-4 grid grid-cols-2 divide-border border-y border-border md:grid-cols-4 md:divide-x">
          {[
            ["Waiting", q.waiting.length, "patients"],
            ["Completed", q.completed, "today"],
            ["Skipped", q.skipped, "today"],
            ["Avg. consult", `${q.avgMin}m`, "per patient"],
          ].map(([l, v, h]) => (
            <div key={l as string} className="px-1 py-6 md:px-6">
              <dt className="text-sm text-muted-foreground">{l}</dt>
              <dd className="tabular mt-1 text-3xl font-semibold tracking-tight">
                {v} <span className="text-xs font-normal text-muted-foreground">{h}</span>
              </dd>
            </div>
          ))}
        </dl>
        <Link
          to="/admin/live-queue"
          className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          Manage full queue <ArrowRight className="size-4" />
        </Link>
      </section>
    </>
  );
}
