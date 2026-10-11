import { useState, useEffect } from "react";
import { Btn } from "@/components/qc";
import { ConfirmAction } from "@/components/queue-feedback";
import { useClinicalData } from "@/components/clinical";
import { api } from "@/api/client";
import { friendlyError } from "@/services/errors";
import { useClinicContext } from "@/providers/clinic-provider";
import { clinicDayKey } from "@/utils/clinic-date";
import { appointmentTimeLabel } from "@/lib/appointment-time";
import type { Appointment } from "@/types/local";
export function TokenActions({
  token,
  onChanged,
}: {
  token: { id: string; tokenCode: string; status: string };
  onChanged?: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function giveUp() {
    setBusy(true);
    setError("");
    try {
      await api("/patient/tokens/" + encodeURIComponent(token.id) + "/give-up", {
        method: "POST",
        body: {},
      });
      onChanged?.();
      window.dispatchEvent(new Event("queuecare:refresh"));
      window.dispatchEvent(new Event("queuecare:updated"));
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-3">
        <a
          className="inline-flex min-h-10 items-center rounded-lg border border-border px-4 text-sm hover:bg-muted"
          download
          href={"/api/patient/tokens/" + encodeURIComponent(token.id) + "/pdf"}
        >
          Download token PDF
        </a>
        {["waiting", "reserved", "skipped"].includes(token.status) && (
          <ConfirmAction
            title="Give up this token?"
            description="Your place in this appointment queue will be released."
            cancel="Keep token"
            confirm="Give up token"
            onConfirm={() => void giveUp()}
          >
            <Btn variant="ghost" disabled={busy}>
              Give up token
            </Btn>
          </ConfirmAction>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
export function AppointmentTokens() {
  const remote = useClinicalData<Appointment[]>("/patient/appointments");
  const { clinics } = useClinicContext();
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") remote.reload();
    };
    const timer = setInterval(refresh, 30000);
    window.addEventListener("queuecare:updated", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("queuecare:updated", refresh);
    };
  }, [remote.reload]);
  const appointments =
    remote.data?.filter(
      (a) =>
        a.token &&
        !["cancelled", "completed", "no_show"].includes(a.status) &&
        a.scheduledAt.slice(0, 10) >= clinicDayKey(),
    ) ?? [];
  if (!remote.data) return remote.error ? <p role="alert">{remote.error}</p> : null;
  return (
    <section className="mb-6 space-y-4" aria-label="Appointment tokens">
      {appointments.length ? (
        appointments.map((a) => {
          const c = clinics.find((c) => c.id === a.clinicId);
          return (
            <article key={a.id} className="surface p-6">
              <p className="text-xs text-muted-foreground">Your appointment</p>
              <h2 className="mt-2 text-lg font-semibold">{a.clinicName}</h2>
              {c?.area && c.city && (
                <p className="text-sm text-muted-foreground">
                  {c.area} · {c.city}
                </p>
              )}
              <p className="mt-3 text-sm">
                {a.scheduledAt.slice(0, 10)} · {appointmentTimeLabel(a.scheduledAt.slice(11))}
              </p>
              <p className="tabular mt-3 break-all text-4xl font-semibold text-primary">
                {a.token!.tokenCode}
              </p>
              {a.scheduledAt.slice(0, 10) > clinicDayKey() && (
                <p className="mt-3 text-sm text-muted-foreground">
                  Your token becomes active in the clinic queue on{" "}
                  {new Date(a.scheduledAt.slice(0, 10) + "T12:00:00Z").toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                  })}
                  .
                </p>
              )}
              <a
                className="mt-4 inline-block text-sm text-primary hover:underline"
                href={"/patient/appointment/" + a.id}
              >
                View appointment →
              </a>
              <TokenActions token={a.token!} onChanged={remote.reload} />
            </article>
          );
        })
      ) : (
        <article className="surface p-6">
          <h2 className="font-semibold">Book your next appointment</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Your appointment includes a token automatically.
          </p>
          <a
            className="mt-4 inline-block text-sm text-primary hover:underline"
            href="/patient/appointments?book=1"
          >
            Book appointment →
          </a>
        </article>
      )}
    </section>
  );
}
