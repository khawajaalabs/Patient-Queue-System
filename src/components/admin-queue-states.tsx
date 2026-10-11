import { runAction } from "@/services/queue";
import { actions, useQueue } from "@/lib/queue-store";
import { Btn } from "@/components/qc";
import { ConfirmAction } from "@/components/queue-feedback";
export function QueueToggle() {
  const { open } = useQueue();
  return open ? (
    <ConfirmAction
      title="Close today's queue?"
      description="Calling patients will pause. Booked appointment tokens are preserved."
      confirm="Close queue"
      onConfirm={() => {
        void runAction(() => actions.closeQueue(), "Queue calls paused.");
      }}
    >
      <Btn variant="secondary">Close queue</Btn>
    </ConfirmAction>
  ) : (
    <Btn
      variant="secondary"
      onClick={() => {
        void runAction(() => actions.openQueue(), "Today's queue opened.");
      }}
    >
      Open queue
    </Btn>
  );
}
export function NoQueue() {
  return (
    <section className="surface flex min-h-80 flex-col items-center justify-center p-7 text-center">
      <h2 className="text-xl font-semibold tracking-tight">No queue has been opened today.</h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        Appointment tokens appear automatically when patients book.
      </p>
      <Btn
        className="mt-6"
        onClick={() => {
          void runAction(() => actions.openQueue(), "Today's queue opened.");
        }}
      >
        Open today's queue
      </Btn>
    </section>
  );
}
export function EmptyQueue() {
  return (
    <div className="px-6 py-14 text-center">
      <h2 className="text-lg font-semibold">No patients waiting</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Booked appointments for this date will appear here automatically.
      </p>
    </div>
  );
}
