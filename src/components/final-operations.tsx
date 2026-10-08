import { useQueue } from "@/lib/queue-store";
import { useEffect, useState } from "react";
import { api } from "@/api/client";
import { useClinicContext } from "@/providers/clinic-provider";
import { useAuth } from "@/providers/auth-provider";
import { Btn, Field, PageHeader } from "@/components/qc";
import { useClinicalData, ClinicalLoading } from "@/components/clinical";
import { friendlyError } from "@/services/errors";
import { money } from "@/types/operations";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { logout } from "@/services/auth";
import { NotificationCenter } from "@/components/notification-center";

type Metrics = {
  patients: number;
  appointments: number;
  waiting: number;
  completed: number;
  cancelled: number;
  revenue: number;
  outstanding: number;
  documents: number;
  followups: number;
  averageWait: number;
};
type Report = {
  from: string;
  to: string;
  totals: Metrics;
  clinics: (Metrics & { id: string; name: string })[];
  trend: { date: string; visits: number; revenue: number; averageWait: number }[];
  statuses: { status: string; count: number }[];
  appointments: unknown[];
  visits: unknown[];
  payments: unknown[];
  invoices: unknown[];
};
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const inputClass = "mt-1 block w-full rounded-lg border border-input bg-card p-2.5 text-sm";
export function OperationalReports({ reports = false }: { reports?: boolean }) {
  const { selected } = useClinicContext(),
    [from, setFrom] = useState(today),
    [to, setTo] = useState(today),
    [status, setStatus] = useState(""),
    [error, setError] = useState("");
  const params = new URLSearchParams({ clinicId: selected, from, to, status }),
    remote = useClinicalData<Report>(
      "/admin/" + (reports ? "reports" : "analytics") + "?" + params,
    );
  useEffect(() => {
    const refresh = () => remote.reload();
    window.addEventListener("queuecare:updated", refresh);
    return () => window.removeEventListener("queuecare:updated", refresh);
  }, [selected, from, to, status]);
  function period(value: string) {
    const d = new Date(today() + "T12:00:00");
    if (value === "week") d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    if (value === "month") d.setDate(1);
    setFrom(d.toISOString().slice(0, 10));
    setTo(today());
  }
  async function download(kind: string) {
    try {
      const r = await fetch("/api/admin/exports/" + kind + "?" + params, {
        credentials: "same-origin",
      });
      if (!r.ok) throw Error("Export unavailable. Please try again.");
      const url = URL.createObjectURL(await r.blob()),
        a = document.createElement("a");
      a.href = url;
      a.download = "queuecare-" + kind + ".csv";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(friendlyError(e));
    }
  }
  const labels: Record<keyof Metrics, string> = {
    patients: "Patients",
    appointments: "Appointments",
    waiting: "Waiting now",
    completed: "Completed consultations",
    cancelled: "Cancelled / no-show",
    revenue: "Revenue received",
    outstanding: "Outstanding balance",
    documents: "Documents uploaded",
    followups: "Follow-ups due",
    averageWait: "Average wait (min)",
  };
  const data = remote.data;
  return (
    <>
      <PageHeader
        title={reports ? "Reports & data management" : "Operational overview"}
        sub="Real clinic activity. Dates use clinic local time; revenue reflects payments received."
      />
      <div className="surface mb-6 flex flex-wrap items-end gap-3 p-4 print:hidden">
        <label className="text-sm">
          Period
          <select
            aria-label="Report period"
            className={inputClass}
            defaultValue="today"
            onChange={(e) => period(e.target.value)}
          >
            <option value="today">Today</option>
            <option value="week">This week</option>
            <option value="month">This month</option>
            <option value="custom">Custom range</option>
          </select>
        </label>
        <Field label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Field label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        {reports && (
          <label className="text-sm">
            Status
            <select
              className={inputClass}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">All statuses</option>
              {[
                "scheduled",
                "confirmed",
                "checked_in",
                "completed",
                "cancelled",
                "no_show",
                "unpaid",
                "partially_paid",
                "paid",
                "void",
              ].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
        )}
        <Btn variant="secondary" onClick={remote.reload}>
          Refresh
        </Btn>
      </div>
      {error && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {error}
        </p>
      )}
      {!data ? (
        <ClinicalLoading error={remote.error} retry={remote.reload} />
      ) : (
        <>
          <dl className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
            {(Object.keys(labels) as (keyof Metrics)[]).map((k) => (
              <div className="surface p-4" key={k}>
                <dt className="text-xs text-muted-foreground">{labels[k]}</dt>
                <dd className="mt-2 break-words text-xl font-semibold tabular-nums">
                  {k === "revenue" || k === "outstanding" ? money(data.totals[k]) : data.totals[k]}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mb-4 text-xs text-muted-foreground">
            Waiting is current today. Outstanding includes all issued unpaid balances. Follow-ups
            include overdue recommendations.
          </p>
          <section className="surface mb-6 overflow-x-auto p-5">
            <h2 className="mb-4 font-semibold">Clinic comparison</h2>
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  {["Clinic", "Appointments", "Waiting", "Completed", "Revenue", "Outstanding"].map(
                    (x) => (
                      <th className="p-2" key={x}>
                        {x}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {data.clinics.map((c) => (
                  <tr key={c.id} className="border-t border-border">
                    <th className="p-2 font-medium">{c.name}</th>
                    {[
                      c.appointments,
                      c.waiting,
                      c.completed,
                      money(c.revenue),
                      money(c.outstanding),
                    ].map((x, i) => (
                      <td className="p-2" key={i}>
                        {x}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.clinics.length && <p>No clinics found.</p>}
          </section>
          <div className="grid gap-4 md:grid-cols-2">
            {(["visits", "revenue", "averageWait"] as const).map((metric) => (
              <section className="surface p-5" key={metric}>
                <h2 className="mb-4 font-semibold">
                  {metric === "visits"
                    ? "Patient visits"
                    : metric === "revenue"
                      ? "Revenue trend"
                      : "Average queue wait (minutes)"}
                </h2>
                {data.trend.length ? (
                  data.trend.map((t) => (
                    <div className="mb-3 text-xs" key={t.date}>
                      <div className="mb-1 flex justify-between gap-2">
                        <span>{t.date}</span>
                        <span>{metric === "revenue" ? money(t[metric]) : t[metric]}</span>
                      </div>
                      <meter
                        aria-label={t.date + " " + metric}
                        className="h-3 w-full accent-primary"
                        min={0}
                        max={Math.max(1, ...data.trend.map((x) => x[metric]))}
                        value={t[metric]}
                      />
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No activity in this period.</p>
                )}
              </section>
            ))}
            <section className="surface p-5">
              <h2 className="mb-4 font-semibold">Appointment status</h2>
              {data.statuses.length ? (
                data.statuses.map((s) => (
                  <div className="mb-3 text-sm" key={s.status}>
                    <div className="flex justify-between">
                      <span>{s.status.replaceAll("_", " ")}</span>
                      <span>{s.count}</span>
                    </div>
                    <meter
                      aria-label={s.status}
                      className="h-3 w-full"
                      min={0}
                      max={Math.max(1, data.totals.appointments)}
                      value={s.count}
                    />
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No appointments in this period.</p>
              )}
            </section>
          </div>
          {reports && (
            <section className="surface mt-6 space-y-4 p-6">
              <h2 className="font-semibold">Operational CSV exports</h2>
              <div className="flex flex-wrap gap-2">
                {["patients", "appointments", "visits", "billing", "payments"].map((k) => (
                  <Btn key={k} variant="secondary" onClick={() => void download(k)}>
                    Export {k}
                  </Btn>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">
                Authorized exports exclude private clinical notes and file URLs. Exports are
                audited. For a full encrypted backup, use Supabase database backup tools and back up
                private Storage separately; credentials stay outside this application.
              </p>
              <a href="/admin/data-management" className="text-sm text-primary underline">
                Data management and email delivery
              </a>
            </section>
          )}
        </>
      )}
    </>
  );
}
export function GlobalSearch() {
  const [open, setOpen] = useState(false),
    [term, setTerm] = useState(""),
    [results, setResults] = useState<
      { id: string; label: string; detail: string; type: string; href: string }[]
    >([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((x) => !x);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    if (!open || term.trim().length < 2) {
      setResults([]);
      return;
    }
    const c = new AbortController();
    setLoading(true);
    const t = setTimeout(() => {
      api<typeof results>("/admin/search?q=" + encodeURIComponent(term.trim()), {
        signal: c.signal,
      })
        .then((r) => {
          setResults(r);
          setError("");
        })
        .catch((e) => {
          if (!c.signal.aborted) setError(friendlyError(e));
        })
        .finally(() => {
          if (!c.signal.aborted) setLoading(false);
        });
    }, 250);
    return () => {
      clearTimeout(t);
      c.abort();
    };
  }, [term, open]);
  return (
    <>
      <Btn
        variant="secondary"
        onClick={() => setOpen(true)}
        aria-label="Search QueueCare (Control K)"
      >
        Search
      </Btn>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>Search QueueCare</DialogTitle>
          <DialogDescription>
            Patients, phone, email, appointments, invoices, tokens and clinics.
          </DialogDescription>
          <Field
            label="Search"
            autoFocus
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Name, phone, invoice or token"
          />
          {error && <p role="alert">{error}</p>}
          <div aria-live="polite" className="max-h-80 overflow-y-auto">
            {loading && term.length >= 2 ? (
              <p className="p-3 text-sm">Searching…</p>
            ) : (
              results.map((x) => (
                <a
                  className="block rounded-lg p-3 hover:bg-muted focus:bg-muted"
                  href={x.href}
                  key={x.type + x.id}
                >
                  <span className="block text-sm font-medium break-all">{x.label}</span>
                  <span className="text-xs text-muted-foreground break-all">
                    {x.type} · {x.detail}
                  </span>
                </a>
              ))
            )}
            {!loading && term.length >= 2 && !results.length && !error && (
              <p className="p-3 text-sm">No matches found.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
interface FollowUp {
  id: string;
  patient_id: string;
  patient_name: string;
  clinic_name: string;
  visit_at: string;
  follow_up_date: string;
  instructions: string;
  status: string;
}
export function FollowUps() {
  const { selected } = useClinicContext(),
    remote = useClinicalData<FollowUp[]>(
      "/admin/follow-ups?clinicId=" + encodeURIComponent(selected),
    ),
    [bucket, setBucket] = useState("today"),
    [editing, setEditing] = useState<FollowUp | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const rows = remote.data?.filter((f) => {
    const d = String(f.follow_up_date).slice(0, 10);
    return bucket === "completed"
      ? f.status === "completed"
      : f.status !== "completed" &&
          (bucket === "overdue" ? d < today() : bucket === "today" ? d === today() : d > today());
  });
  async function action(id: string, body: unknown) {
    setBusy(true);
    setError("");
    try {
      await api("/admin/follow-ups/" + id, { method: "PUT", body });
      remote.reload();
      setEditing(null);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        title="Follow-ups"
        sub="Doctor-written follow-up recommendations across clinics."
      />
      <div className="mb-5 flex flex-wrap gap-2">
        {["overdue", "today", "upcoming", "completed"].map((x) => (
          <Btn
            variant={bucket === x ? "primary" : "secondary"}
            key={x}
            onClick={() => setBucket(x)}
          >
            {x}
          </Btn>
        ))}
      </div>
      {error && (
        <p role="alert" className="mb-3 text-destructive">
          {error}
        </p>
      )}
      {!remote.data ? (
        <ClinicalLoading error={remote.error} retry={remote.reload} />
      ) : (
        <div className="surface divide-y divide-border">
          {rows?.map((f) => (
            <article key={f.id} className="space-y-3 p-5">
              <a
                className="font-medium text-primary"
                href={"/admin/patient-record/" + encodeURIComponent(f.patient_id)}
              >
                {f.patient_name}
              </a>
              <p className="text-sm text-muted-foreground">
                {f.clinic_name} · Follow-up {String(f.follow_up_date).slice(0, 10)} · Last visit{" "}
                {new Date(f.visit_at).toLocaleDateString()} · {f.status}
              </p>
              <p className="whitespace-pre-wrap break-words text-sm">
                {f.instructions || "Follow-up visit recommended."}
              </p>
              {f.status !== "completed" && (
                <div className="flex flex-wrap gap-2">
                  <Btn
                    disabled={busy}
                    variant="secondary"
                    onClick={() => void action(f.id, { action: "contacted" })}
                  >
                    Mark contacted
                  </Btn>
                  <Btn disabled={busy} variant="secondary" onClick={() => setEditing(f)}>
                    Book / reschedule
                  </Btn>
                  <Btn disabled={busy} onClick={() => void action(f.id, { action: "completed" })}>
                    Mark completed
                  </Btn>
                </div>
              )}
            </article>
          ))}
          {!rows?.length && (
            <p className="p-8 text-sm text-muted-foreground">No {bucket} follow-ups.</p>
          )}
        </div>
      )}
      <Dialog
        open={!!editing}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
      >
        <DialogContent>
          <DialogTitle>Follow-up scheduling</DialogTitle>
          <DialogDescription>{editing?.patient_name} — clinic local time</DialogDescription>
          {error && <p role="alert">{error}</p>}
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              if (editing)
                void action(editing.id, { action: "book", scheduledAt: d.get("scheduledAt") });
            }}
          >
            <Field required label="Book appointment" type="datetime-local" name="scheduledAt" />
            <Btn disabled={busy}>Book appointment</Btn>
          </form>
          <form
            className="space-y-4 border-t pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              if (editing) void action(editing.id, { action: "reschedule", date: d.get("date") });
            }}
          >
            <Field required label="Recommended follow-up date" type="date" name="date" />
            <Btn disabled={busy} variant="secondary">
              Reschedule recommendation
            </Btn>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
interface Branding {
  doctor: {
    full_name?: string;
    title?: string;
    specialty?: string;
    license?: string;
    phone?: string;
    email?: string;
    photo_url?: string;
    signature_url?: string;
  };
  clinic: { email?: string; logo_url?: string; footer?: string; slot_minutes?: number };
}
export function BrandingSettings() {
  const { selected } = useClinicContext(),
    remote = useClinicalData<Branding>(
      selected === "all" ? null : "/admin/branding?clinicId=" + encodeURIComponent(selected),
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false);
  if (selected === "all")
    return <p className="surface p-6">Choose a clinic to configure branding.</p>;
  if (!remote.data) return <ClinicalLoading error={remote.error} retry={remote.reload} />;
  const d = remote.data,
    doctorFields = [
      "full_name",
      "title",
      "specialty",
      "license",
      "phone",
      "email",
      "photo_url",
      "signature_url",
    ] as const,
    clinicFields = ["email", "logo_url", "footer"] as const;
  return (
    <>
      <PageHeader
        title="Doctor & clinic branding"
        sub="These contact details appear on patient documents and public clinic information."
      />
      <form
        key={selected}
        className="surface space-y-5 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          setSaved(false);
          setError("");
          void api("/admin/branding?clinicId=" + encodeURIComponent(selected), {
            method: "PUT",
            body: {
              doctor: Object.fromEntries(
                doctorFields.map((k) => [k, String(f.get("doctor." + k) ?? "")]),
              ),
              clinic: {
                ...Object.fromEntries(
                  clinicFields.map((k) => [k, String(f.get("clinic." + k) ?? "")]),
                ),
                slot_minutes: Number(f.get("slot_minutes")),
              },
            },
          })
            .then(() => {
              setSaved(true);
              remote.reload();
            })
            .catch((e) => setError(friendlyError(e)))
            .finally(() => setBusy(false));
        }}
      >
        <h2 className="font-semibold">Main doctor profile</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {doctorFields.map((k) => (
            <Field
              key={k}
              label={k.replaceAll("_", " ")}
              name={"doctor." + k}
              defaultValue={d.doctor[k] ?? ""}
              type={k === "email" ? "email" : k.endsWith("_url") ? "url" : "text"}
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Optional images use public HTTPS image URLs. Use only images intended for patient-facing
          branding; never link private medical files.
        </p>
        <h2 className="font-semibold">Selected clinic</h2>
        <p className="text-sm text-muted-foreground">
          Name, address, hours, fee and queue preferences remain in Clinic management / Settings.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {clinicFields.map((k) => (
            <Field
              key={k}
              label={k.replaceAll("_", " ")}
              name={"clinic." + k}
              defaultValue={d.clinic[k] ?? ""}
              type={k === "email" ? "email" : k === "logo_url" ? "url" : "text"}
            />
          ))}
          <Field
            required
            label="Appointment slot duration (minutes)"
            name="slot_minutes"
            type="number"
            min={5}
            max={120}
            defaultValue={d.clinic.slot_minutes ?? 15}
          />
        </div>
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        {saved && <p role="status">Branding saved.</p>}
        <Btn disabled={busy}>{busy ? "Saving…" : "Save branding"}</Btn>
      </form>
    </>
  );
}
export function AccountSettings() {
  const remote = useClinicalData<{
      profile: { fullName: string; email: string; role: string };
      googleLinked: boolean;
      sessions: { expiresAt: number; current: boolean }[];
    }>("/account"),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function action(path: string, body: unknown, method: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api(path, { body, method });
      setMessage("Account security updated. Other sessions have been signed out.");
      remote.reload();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  if (!remote.data) return <ClinicalLoading error={remote.error} retry={remote.reload} />;
  const d = remote.data;
  return (
    <>
      <PageHeader
        title="Account & security"
        sub="Manage your password and active QueueCare sessions."
      />
      <div className="surface space-y-5 p-6">
        <p>
          {d.profile.fullName} · {d.profile.email} · {d.profile.role}
        </p>
        <p className="text-sm">Google account: {d.googleLinked ? "Linked" : "Not linked"}</p>
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        {message && <p role="status">{message}</p>}
        <form
          className="max-w-md space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            if (f.get("newPassword") !== f.get("confirm")) {
              setError("New passwords must match.");
              return;
            }
            void action(
              "/account/password",
              { currentPassword: f.get("currentPassword"), newPassword: f.get("newPassword") },
              "PUT",
            );
            e.currentTarget.reset();
          }}
        >
          <Field
            required
            label="Current password"
            type="password"
            name="currentPassword"
            autoComplete="current-password"
          />
          <Field
            required
            minLength={12}
            maxLength={72}
            label="New password"
            type="password"
            name="newPassword"
            autoComplete="new-password"
          />
          <Field
            required
            label="Confirm new password"
            type="password"
            name="confirm"
            autoComplete="new-password"
          />
          <Btn disabled={busy}>Change password</Btn>
        </form>
        <h2 className="font-semibold">Active sessions ({d.sessions.length})</h2>
        <ul className="space-y-2 text-sm">
          {d.sessions.map((s, i) => (
            <li key={i}>
              {s.current ? "This session" : "Other session"} · Expires{" "}
              {new Date(s.expiresAt).toLocaleString()}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-3">
          <Btn
            variant="secondary"
            disabled={busy}
            onClick={() => void action("/account/revoke-sessions", {}, "POST")}
          >
            Sign out other sessions
          </Btn>
          <Btn variant="secondary" onClick={() => void logout()}>
            Sign out
          </Btn>
        </div>
      </div>
    </>
  );
}
export function PatientSummary() {
  const { clinic } = useQueue();
  const remote = useClinicalData<{
    appointment: { scheduled_at: string; clinic_name: string } | null;
    visit: { visit_at: string; clinic_name: string } | null;
    prescription: { prescribed_at: string } | null;
    document: { title: string } | null;
    bills: { balance: number };
    followups: FollowUp[];
    notifications: { id: string; title: string; message: string }[];
  }>("/patient/summary");
  if (!remote.data)
    return (
      <div className="mt-6">
        <ClinicalLoading error={remote.error} retry={remote.reload} />
      </div>
    );
  const d = remote.data;
  const cards: { title: string; value: string; href: string }[] = [];
  if (d.visit)
    cards.push({
      title: "Latest visit",
      value: new Date(d.visit.visit_at).toLocaleDateString() + " · " + d.visit.clinic_name,
      href: "/patient/visits",
    });
  if (d.prescription)
    cards.push({
      title: "Latest prescription",
      value: new Date(d.prescription.prescribed_at).toLocaleDateString(),
      href: "/patient/prescriptions",
    });
  if (d.document)
    cards.push({
      title: "Latest released document",
      value: d.document.title,
      href: "/patient/documents",
    });
  if (Number(d.bills.balance) > 0)
    cards.push({
      title: "Outstanding bills",
      value: money(d.bills.balance),
      href: "/patient/billing",
    });
  const hasCareData = cards.length > 0 || d.followups.length > 0 || d.notifications.length > 0;
  return (
    <section className="mt-8">
      <h2 className="mb-4 text-lg font-semibold">Your care summary</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {d.appointment ? (
          <a
            href="/patient/appointments"
            className="surface block p-5 focus:ring-2 focus:ring-primary"
          >
            <h3 className="text-sm font-medium">Upcoming appointment</h3>
            <p className="mt-2 break-words text-sm text-muted-foreground">
              {d.appointment.scheduled_at.replace("T", " ") + " · " + d.appointment.clinic_name}
            </p>
          </a>
        ) : (
          <div className="surface p-5">
            <h3 className="text-sm font-medium">Upcoming appointment</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              No upcoming appointment. Contact {clinic.name} to book a time.
            </p>
            <a
              href={"tel:" + clinic.phone.replace(/[^+0-9]/g, "")}
              className="mt-4 inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-soft transition-all hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Book Appointment
            </a>
          </div>
        )}
        {cards.map(({ title, value, href }) => (
          <a href={href} key={title} className="surface block p-5 focus:ring-2 focus:ring-primary">
            <h3 className="text-sm font-medium">{title}</h3>
            <p className="mt-2 break-words text-sm text-muted-foreground">{value}</p>
          </a>
        ))}
      </div>
      {!hasCareData && (
        <p className="surface mt-4 p-5 text-sm text-muted-foreground">
          Your care summary will appear here after your first appointment or clinic visit.
        </p>
      )}
      {d.followups.length > 0 && (
        <div className="surface mt-4 p-5">
          <h3 className="font-medium">Follow-up recommendations</h3>
          {d.followups.map((f) => (
            <div key={f.id} className="mt-3 text-sm">
              <p>
                {String(f.follow_up_date).slice(0, 10)} · {f.clinic_name} · {f.status}
              </p>
              <p className="whitespace-pre-wrap break-words text-muted-foreground">
                {f.instructions || "Follow-up visit recommended."}
              </p>
            </div>
          ))}
        </div>
      )}
      {d.notifications.length > 0 && (
        <div className="surface mt-4 p-5">
          <h3 className="font-medium">Recent notifications</h3>
          {d.notifications.map((n) => (
            <div key={n.id} className="mt-3 text-sm">
              <p>{n.title}</p>
              <p className="text-muted-foreground">{n.message}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
export function PrintBranding({ clinicId }: { clinicId: string }) {
  const remote = useClinicalData<{
    clinic: { display_name: string; logo_url: string; footer: string; email: string };
    doctor: {
      full_name: string;
      title: string;
      specialty: string;
      license: string;
      phone: string;
      email: string;
      photo_url: string;
    } | null;
  }>("/branding?clinicId=" + encodeURIComponent(clinicId));
  const d = remote.data;
  if (!d?.clinic?.display_name) return null;
  return (
    <div className="mb-4 border-b border-border pb-3 text-sm">
      {d.clinic.logo_url && (
        <img
          className="mb-2 h-14 max-w-48 object-contain"
          src={d.clinic.logo_url}
          alt={d.clinic.display_name + " logo"}
          referrerPolicy="no-referrer"
        />
      )}
      {d.doctor?.photo_url && (
        <img
          className="mb-2 size-12 rounded-full object-cover"
          src={d.doctor.photo_url}
          alt="Doctor profile"
          referrerPolicy="no-referrer"
        />
      )}
      {d.doctor && (
        <p>
          {[d.doctor.title, d.doctor.full_name, d.doctor.specialty, d.doctor.license]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
      <p>{[d.clinic.email, d.clinic.footer].filter(Boolean).join(" · ")}</p>
    </div>
  );
}
export function DataManagement() {
  const remote = useClinicalData<{
      provider: string;
      pending: { count: number };
      statuses: { status: string; count: number }[];
    }>("/admin/email-status"),
    [result, setResult] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <>
      <PageHeader
        title="Data management & delivery"
        sub="Admin-only operational exports and application email status."
      />
      <div className="surface space-y-4 p-6">
        <a className="text-primary underline" href="/admin/reports">
          Open reports and CSV exports
        </a>
        <p className="text-sm">
          Full backups: use Supabase database backups or an authenticated CLI pg_dump on a trusted
          machine. Back up the private queuecare-medical Storage bucket separately. Encrypt backups,
          restrict access, and test restores in a separate project. Database backups do not include
          Storage file contents.
        </p>
        <h2 className="font-semibold">Application email delivery</h2>
        {!remote.data ? (
          <ClinicalLoading error={remote.error} retry={remote.reload} />
        ) : (
          <>
            <p className="text-sm">
              Provider: {remote.data.provider} · Pending: {remote.data.pending.count}
            </p>
            <p className="text-sm text-muted-foreground">
              In-app notifications remain active. Supabase Auth handles sign-in and password
              recovery emails only. Application delivery requires a verified email provider
              configured on the server. No delivery is claimed when unconfigured. New appointment,
              released-document, invoice and follow-up notices queue automatically.
            </p>
            {remote.data.statuses.map((x) => (
              <p className="text-sm" key={x.status}>
                {x.status}: {x.count}
              </p>
            ))}
            <Btn
              disabled={busy || remote.data.provider === "not_configured"}
              onClick={() => {
                setBusy(true);
                void api<{ configured: boolean; sent: number; failed: number }>(
                  "/admin/email-delivery",
                  { method: "POST", body: {} },
                )
                  .then((x) => {
                    setResult(
                      x.configured
                        ? `${x.sent} sent; ${x.failed} failed.`
                        : "Provider not configured.",
                    );
                    remote.reload();
                  })
                  .catch((e) => setResult(friendlyError(e)))
                  .finally(() => setBusy(false));
              }}
            >
              Deliver pending notices
            </Btn>
            {result && <p role="status">{result}</p>}
          </>
        )}
      </div>
    </>
  );
}

export function DoctorSignature() {
  const remote = useClinicalData<{ signature_url?: string }>("/branding/signature");
  return remote.data?.signature_url ? (
    <img
      className="mt-6 h-12 max-w-48 object-contain"
      src={remote.data.signature_url}
      alt="Doctor signature"
      referrerPolicy="no-referrer"
    />
  ) : null;
}
