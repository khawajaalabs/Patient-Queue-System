import { ClinicSwitcher } from "@/providers/clinic-provider";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { actions, formatTime, useQueue } from "@/lib/queue-store";
import { useAuth } from "@/providers/auth-provider";
import { friendlyError } from "@/services/errors";
import { Btn, Field, Label } from "@/components/qc";

export const Route = createFileRoute("/patient/join-queue")({
  head: () => ({ meta: [{ title: "Get a token — QueueCare" }] }),
  component: Join,
});
export function Join() {
  const q = useQueue();
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [issued, setIssued] = useState<string | null>(null);
  const [error, setError] = useState("");
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setLoading(true);
    setError("");
    try {
      const token = await actions.join(
        profile?.fullName ?? "",
        profile?.phone ?? "",
        String(data.get("reason") || ""),
      );
      setIssued(token);
      toast.success("You joined the queue.");
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  };
  if (issued)
    return (
      <div className="token-in mx-auto max-w-lg text-center">
        <CheckCircle2 className="mx-auto size-10 text-success" />
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">You're in the queue</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {q.clinic.name} · {q.clinic.department}
        </p>
        <div className="surface mt-8 px-6 py-10">
          <Label>Your token</Label>
          <div className="tabular mt-3 text-[76px] font-semibold leading-none tracking-[-0.04em] sm:text-[84px]">
            {issued}
          </div>
          <dl className="mt-7 grid grid-cols-3 gap-2 border-t border-border pt-5">
            {[
              ["Currently serving", q.serving?.token ?? "—"],
              ["Patients ahead", q.ahead],
              ["Estimated wait", `~${q.eta} min`],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="tabular mt-2 text-lg font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link to="/patient/live-queue">
            <Btn size="lg">
              Track my queue <ArrowRight className="size-4" />
            </Btn>
          </Link>
          <Link to="/patient/dashboard">
            <Btn size="lg" variant="secondary">
              Back to dashboard
            </Btn>
          </Link>
        </div>
      </div>
    );
  return (
    <div className="grid gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
      <div className="max-w-lg">
        <h1 className="text-[28px] font-semibold tracking-tight md:text-[32px]">
          Join today's queue
        </h1>
        <div className="mt-4">
          <ClinicSwitcher />
        </div>
        <p className="mt-2 text-[15px] text-muted-foreground">{q.clinic.name}</p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <span>{q.clinic.department}</span>
          <span className={q.open ? "text-success" : "text-muted-foreground"}>
            {q.open ? "Open today" : "Queue closed"}
          </span>
          <span className="text-muted-foreground">
            {formatTime(q.clinic.opening)} – {formatTime(q.clinic.closing)}
          </span>
        </div>
        {!q.open ? (
          <div className="surface mt-8 p-6">
            <p className="text-sm text-muted-foreground">
              {q.openedToday
                ? "The queue is closed right now. Please contact reception."
                : "No queue has been opened today."}
            </p>
            <Link to="/patient/dashboard" className="mt-4 inline-block">
              <Btn variant="secondary">Back</Btn>
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-8 space-y-5">
            <Field label="Patient" value={profile?.fullName ?? ""} readOnly />
            <Field label="Department" value={q.clinic.department} readOnly />
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">
                Reason for visit{" "}
                <span className="font-normal text-muted-foreground">(optional)</span>
              </span>
              <textarea
                name="reason"
                rows={3}
                maxLength={300}
                placeholder="e.g. fever, follow-up"
                className="w-full rounded-lg border border-input bg-card px-3.5 py-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
              />
            </label>
            {q.mine && ["waiting", "serving", "skipped"].includes(q.mine.status) && (
              <p className="text-sm text-muted-foreground">
                You already hold token {q.mine.token}. Confirm to view your token.
              </p>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              <Btn size="lg" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Issuing token…
                  </>
                ) : (
                  "Get my token"
                )}
              </Btn>
              <Link to="/patient/dashboard">
                <Btn type="button" size="lg" variant="secondary">
                  Back
                </Btn>
              </Link>
            </div>
          </form>
        )}
      </div>
      <aside className="h-fit rounded-2xl bg-primary-soft p-7">
        <Label>Right now</Label>
        <dl className="mt-5 space-y-5">
          {[
            ["Currently serving", q.serving?.token ?? "—"],
            ["Patients waiting", q.waiting.length],
            [
              "Estimated wait",
              `~${q.mine?.status === "waiting" ? q.eta : q.waiting.length * q.avgMin} min`,
            ],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="tabular mt-1 text-3xl font-semibold tracking-tight">{value}</dd>
            </div>
          ))}
        </dl>
      </aside>
    </div>
  );
}
