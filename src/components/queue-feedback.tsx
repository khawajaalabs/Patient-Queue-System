import { useState, type ReactNode } from "react";
import { Bell, CheckCircle2, Clock, AlertCircle, Ticket } from "lucide-react";
import { useQueue } from "@/lib/queue-store";
import { Btn } from "@/components/qc";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

export function ConfirmAction({
  children,
  title,
  description,
  cancel = "Cancel",
  confirm,
  onConfirm,
}: {
  children: ReactNode;
  title: string;
  description: string;
  cancel?: string;
  confirm: string;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent className="max-w-[calc(100vw-2rem)] rounded-2xl sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancel}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{confirm}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function Notifications({ role }: { role: "patient" | "admin" }) {
  const [read, setRead] = useState(false);
  const q = useQueue();
  const messages =
    q.loadState !== "ready"
      ? ["Queue updates are unavailable."]
      : role === "patient"
        ? [
            q.mine?.status === "serving"
              ? "Your token is being called."
              : q.mine?.status === "waiting" && q.ahead <= 2
                ? "You're almost up."
                : q.mine
                  ? "Token " + q.mine.token + ": " + q.mine.status
                  : "You have no active token.",
            ...(q.mine?.status === "waiting"
              ? [q.ahead + " patients ahead · ~" + q.eta + " min wait"]
              : []),
          ]
        : [
            ...q.notifications,
            q.waiting.length + " patients waiting",
            q.serving ? "Now serving " + q.serving.token : "No patient in consultation",
          ];
  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) setRead(true);
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Notifications"
          className="relative grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Bell className="size-[18px]" />
          {!read && <span className="absolute right-3 top-2.5 size-1.5 rounded-full bg-primary" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-w-[calc(100vw-2rem)] rounded-xl p-2">
        <DropdownMenuLabel>
          Notifications{" "}
          <span className="ml-2 text-xs font-normal text-muted-foreground">Current queue</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {messages.map((message, index) => (
          <DropdownMenuItem
            key={`${index}:${message}`}
            className="items-start gap-3 whitespace-normal rounded-lg py-3"
          >
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
            <span>{message}</span>
          </DropdownMenuItem>
        ))}
        <p className="px-2 py-2 text-xs text-muted-foreground">Current queue updates.</p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function QueueSkeleton({ kind = "hero" }: { kind?: "hero" | "list" }) {
  return (
    <div role="status" aria-label="Loading queue" className="space-y-6">
      <span className="sr-only">Loading queue…</span>
      <Skeleton className="h-9 w-52" />
      {kind === "hero" ? (
        <section className="surface grid gap-8 p-7 md:grid-cols-2 md:p-10">
          <div className="space-y-5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-24 w-60 max-w-full" />
            <Skeleton className="h-4 w-64 max-w-full" />
          </div>
          <div className="space-y-5">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </section>
      ) : (
        <div className="surface space-y-5 p-6">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      )}
    </div>
  );
}
export function QueueError() {
  const { error, retry } = useQueue();
  return (
    <section
      role="alert"
      className="surface flex min-h-72 flex-col items-center justify-center gap-4 p-6 text-center"
    >
      <AlertCircle className="size-8 text-warning" />
      <h2 className="text-lg font-semibold">Unable to load queue status.</h2>
      <p className="text-sm text-muted-foreground">{error || "Try loading the queue again."}</p>
      <Btn variant="secondary" onClick={retry}>
        Try again
      </Btn>
    </section>
  );
}
export function QueueBoundary({
  children,
  kind = "hero",
}: {
  children: ReactNode;
  kind?: "hero" | "list";
}) {
  const { loadState } = useQueue();
  return loadState === "loading" ? (
    <QueueSkeleton kind={kind} />
  ) : loadState === "error" ? (
    <QueueError />
  ) : (
    <>{children}</>
  );
}
export function PatientStatus() {
  const { mine, ahead } = useQueue();
  if (!mine) return null;
  const status = mine.status;
  const almost = status === "waiting" && ahead <= 2;
  const title =
    status === "serving"
      ? "Your token is being called."
      : status === "skipped"
        ? "Your token was skipped."
        : status === "done"
          ? "Visit completed."
          : status === "left"
            ? "You left the queue."
            : almost
              ? "You're almost up."
              : "You're in the queue.";
  const detail =
    status === "serving"
      ? "Please proceed to the consultation area."
      : status === "skipped"
        ? "Please contact the clinic reception."
        : status === "done"
          ? "Thanks for visiting. We hope you feel better soon."
          : status === "left"
            ? "Your current token has been released."
            : almost
              ? `${ahead} ${ahead === 1 ? "patient is" : "patients are"} ahead. Please prepare to arrive.`
              : "Track your place here and arrive closer to your turn.";
  const Icon =
    status === "done" ? CheckCircle2 : status === "skipped" ? AlertCircle : almost ? Clock : Ticket;
  return (
    <div
      role="status"
      aria-live="polite"
      className={`mb-6 flex gap-3 rounded-xl p-4 ${status === "skipped" ? "bg-warning-soft text-warning" : "bg-primary-soft text-accent-foreground"}`}
    >
      <Icon className="mt-0.5 size-5 shrink-0" />
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-1 text-sm">{detail}</p>
      </div>
    </div>
  );
}
