import { PatientSummary } from "@/components/final-operations";
import { useAuth } from "@/providers/auth-provider";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Clock, MapPin, Phone, Ticket, Users, BellRing } from "lucide-react";
import { formatTime, useQueue } from "@/lib/queue-store";
import { PatientStatus } from "@/components/queue-feedback";
import { Btn, Label, LiveDot, StatusPill } from "@/components/qc";

export const Route = createFileRoute("/patient/dashboard")({
  head: () => ({
    meta: [
      { title: "Your queue status — QueueCare" },
      {
        name: "description",
        content: "See your token, people ahead, and estimated wait at a glance.",
      },
      { property: "og:title", content: "Your queue status — QueueCare" },
      {
        property: "og:description",
        content: "See your token, people ahead, and estimated wait at a glance.",
      },
    ],
  }),
  component: Dashboard,
});

export function QueueHero() {
  const { mine, serving, ahead, eta, waiting, avgMin, clinic, open } = useQueue();
  if (!mine) return null;
  if (!["waiting", "serving"].includes(mine.status))
    return (
      <section className="surface p-7">
        <Label>Your token</Label>
        <p className="tabular mt-3 text-6xl font-semibold tracking-tight">{mine.token}</p>
        <div className="mt-4">
          <StatusPill status={mine.status} />
        </div>
        {["done", "left"].includes(mine.status) && (
          <Link to="/patient/get-token" className="mt-5 inline-block">
            <Btn disabled={!open}>Get another token</Btn>
          </Link>
        )}
      </section>
    );
  const isServing = mine.status === "serving";
  const total = Math.max(waiting.length + (serving ? 1 : 0), 1);
  const progress = isServing ? 100 : Math.round(((total - ahead) / (total + 1)) * 100);
  return (
    <section className="surface overflow-hidden">
      <div className="grid md:grid-cols-[1.1fr_1fr]">
        <div className="border-b border-border p-7 md:border-b-0 md:border-r md:p-10">
          <div className="flex items-center justify-between">
            <Label>Your token</Label>
            <span className="inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-accent-foreground">
              <LiveDot className="text-primary" /> Live
            </span>
          </div>
          <div
            key={mine.token}
            className="token-in tabular mt-3 text-[72px] font-semibold leading-none tracking-[-0.04em] text-foreground md:text-[96px]"
          >
            {mine.token}
          </div>
          <p className="mt-4 text-[15px] text-muted-foreground">
            {isServing
              ? "It's your turn — please proceed to the consultation area."
              : ahead === 0
                ? "You're next. Please be near the consultation area."
                : `${clinic.department} · ${clinic.doctor}`}
          </p>
          <div className="mt-8">
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-700"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between text-xs text-muted-foreground">
              <span>Joined {mine.joinedAt}</span>
              <span>Your turn</span>
            </div>
          </div>
        </div>
        <dl className="grid grid-cols-1 divide-y divide-border sm:grid-cols-2 sm:divide-y-0 md:grid-cols-1 md:divide-y">
          {[
            {
              icon: Ticket,
              label: "Now serving",
              value: serving?.token ?? "—",
              hint: serving ? "Please proceed" : "Paused",
            },
            {
              icon: Users,
              label: "Ahead of you",
              value: isServing ? "0" : String(ahead),
              hint: ahead === 1 ? "patient" : "patients",
            },
            {
              icon: Clock,
              label: "Estimated wait",
              value: isServing ? "Now" : `~${eta} min`,
              hint: `≈ ${avgMin} min per patient`,
            },
          ].map((s, i) => (
            <div
              key={s.label}
              className={`flex items-center gap-4 p-5 sm:p-6 md:px-8 ${i === 2 ? "sm:col-span-2 sm:border-t sm:border-border md:col-span-1 md:border-t-0" : ""} ${i === 0 ? "sm:border-r sm:border-border md:border-r-0" : ""}`}
            >
              <div className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                <s.icon className="size-[18px]" />
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{s.label}</dt>
                <dd className="tabular mt-0.5 text-2xl font-semibold tracking-tight">
                  {s.value}{" "}
                  <span className="text-xs font-normal text-muted-foreground">{s.hint}</span>
                </dd>
              </div>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function Dashboard() {
  const { mine, serving, open, openedToday, clinic } = useQueue();
  const { profile } = useAuth();
  return (
    <>
      <div className="mb-8">
        <h1 className="text-[28px] font-semibold tracking-tight md:text-[34px]">
          Good morning, {profile?.fullName.split(" ")[0]}
        </h1>
        <p className="mt-1.5 text-[15px] text-muted-foreground">
          Here's your queue status for today.
        </p>
      </div>

      <PatientStatus />
      {mine ? (
        <QueueHero />
      ) : (
        <section className="surface flex flex-col items-center px-6 py-16 text-center">
          <div className="grid size-14 place-items-center rounded-full bg-primary-soft text-primary">
            <Ticket className="size-6" />
          </div>
          <h2 className="mt-5 text-xl font-semibold tracking-tight">
            You don't have an active token.
          </h2>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            {open
              ? `The clinic is open and currently serving ${serving?.token ?? "—"}. Get a token to save your place.`
              : openedToday
                ? "The queue is closed right now. Check back during clinic hours."
                : "No queue has been opened today."}
          </p>
          <Link to="/patient/get-token" className="mt-6">
            <Btn size="lg" disabled={!open}>
              Get a token <ArrowRight className="size-4" />
            </Btn>
          </Link>
        </section>
      )}

      <div className="mt-10 grid gap-10 md:grid-cols-3">
        <div className="md:col-span-2">
          <h2 className="text-lg font-semibold tracking-tight">Before you arrive</h2>
          <ul className="mt-4 divide-y divide-border border-y border-border">
            {(
              [
                [
                  BellRing,
                  "Arrive when 3 patients are ahead",
                  "We'll notify you when it's almost your turn.",
                ],
                [
                  Ticket,
                  "Show your token at reception",
                  "Keep this page open or note your token number.",
                ],
                [
                  MapPin,
                  "Wait near the consultation area",
                  "Tokens are called on the screen in the lobby.",
                ],
              ] as const
            ).map(([Icon, t, d]) => (
              <li key={t} className="flex gap-4 py-4">
                <Icon className="mt-0.5 size-[18px] shrink-0 text-primary" />
                <div>
                  <div className="text-sm font-medium">{t}</div>
                  <div className="text-sm text-muted-foreground">{d}</div>
                </div>
              </li>
            ))}
          </ul>
          {mine && (
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/patient/live-queue">
                <Btn>
                  View live queue <ArrowRight className="size-4" />
                </Btn>
              </Link>
              <Link to="/patient/get-token">
                <Btn variant="secondary">Get token</Btn>
              </Link>
              <Link to="/patient/history">
                <Btn variant="secondary">Visit history</Btn>
              </Link>
            </div>
          )}
        </div>
        <aside>
          <h2 className="text-lg font-semibold tracking-tight">Clinic</h2>
          <div className="mt-4 space-y-3 text-sm">
            <div className="font-medium">{clinic.name}</div>
            <div className="flex gap-2.5 text-muted-foreground">
              <MapPin className="size-4 shrink-0" /> {clinic.address}
            </div>
            <div className="flex gap-2.5 text-muted-foreground">
              <Clock className="size-4 shrink-0" /> Today · {formatTime(clinic.opening)} –{" "}
              {formatTime(clinic.closing)}
            </div>
            <div className="flex gap-2.5 text-muted-foreground">
              <Phone className="size-4 shrink-0" /> {clinic.phone}
            </div>
            <div className="inline-flex items-center gap-2 pt-1 text-xs font-medium text-success">
              <span className="size-1.5 rounded-full bg-current" />
              {open ? "Queue open" : "Queue closed"}
            </div>
          </div>
        </aside>
      </div>
      <PatientSummary />
    </>
  );
}
