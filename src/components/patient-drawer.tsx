import { runAction } from "@/services/queue";
import { actions, type Entry, useQueue } from "@/lib/queue-store";
import { Btn, Label, StatusPill } from "@/components/qc";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

export function PatientDrawer({ entry, onClose }: { entry: Entry | null; onClose: () => void }) {
  const { queue, clinic, queueDate } = useQueue();
  const current = entry
    ? (queue.find((e) => e.token === entry.token && e.date === entry.date) ?? entry)
    : null;
  return (
    <Sheet
      open={!!current}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {current && (
          <>
            <SheetHeader>
              <SheetTitle>Patient details</SheetTitle>
              <SheetDescription>Queue information for {current.name}.</SheetDescription>
            </SheetHeader>
            <div className="mt-8 space-y-7">
              <div>
                <Label>Token</Label>
                <div className="tabular mt-2 text-5xl font-semibold tracking-tight">
                  {current.token}
                </div>
                <p className="mt-2 text-lg font-medium">{current.name}</p>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-5 text-sm">
                {[
                  ["Phone", current.phone || "—"],
                  ["Department", clinic.department],
                  ["Joined", current.joinedAt],
                  ["Waiting duration", current.token === "—" ? "—" : `${current.waitMin ?? 0} min`],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="mt-1 break-words font-medium">{value}</dd>
                  </div>
                ))}
                <div>
                  <dt className="text-muted-foreground">Status</dt>
                  <dd className="mt-2">
                    {current.token === "—" ? (
                      "No visits yet"
                    ) : (
                      <StatusPill status={current.status} />
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Reason</dt>
                  <dd className="mt-1">{current.reason}</dd>
                </div>
              </dl>
              <section className="border-t border-border pt-6">
                <h3 className="text-sm font-semibold">Timeline</h3>
                <ol className="mt-4 space-y-5 border-l border-border pl-5 text-sm">
                  {[
                    ["Joined queue", current.joinedAt],
                    ["Called", current.servedAt ?? "—"],
                    ["Completed", current.completedAt ?? "—"],
                    ["Skipped", current.skippedAt ?? "—"],
                    ["Cancelled", current.cancelledAt ?? "—"],
                  ].map(([label, time]) => (
                    <li key={label}>
                      <p className="font-medium">{label}</p>
                      <p className="tabular mt-1 text-muted-foreground">{time}</p>
                    </li>
                  ))}
                </ol>
              </section>
              <div className="flex flex-wrap gap-2 border-t border-border pt-6">
                {current.date === queueDate && current.status === "waiting" && (
                  <Btn
                    onClick={() => {
                      void runAction(
                        () => actions.call(current.token),
                        `Token ${current.token} is now being served.`,
                      );
                    }}
                  >
                    Call patient
                  </Btn>
                )}
                {current.date === queueDate && current.status === "serving" && (
                  <Btn
                    onClick={() => {
                      void runAction(
                        () => actions.markDone(current.token),
                        "Patient marked as completed.",
                      );
                    }}
                  >
                    Mark as done
                  </Btn>
                )}
                {current.date === queueDate && ["waiting", "serving"].includes(current.status) && (
                  <Btn
                    variant="secondary"
                    onClick={() => {
                      void runAction(() => actions.skip(current.token), "Token skipped.");
                    }}
                  >
                    Skip
                  </Btn>
                )}
                {current.date === queueDate && current.status === "skipped" && (
                  <Btn
                    variant="secondary"
                    onClick={() => {
                      void runAction(
                        () => actions.requeue(current.token),
                        "Patient moved back to queue.",
                      );
                    }}
                  >
                    Move back to queue
                  </Btn>
                )}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
