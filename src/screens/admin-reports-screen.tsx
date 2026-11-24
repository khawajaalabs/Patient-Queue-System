import { useClinicalData, ClinicalLoading } from "@/data/use-clinical-data";
import { useClinicContext } from "@/providers/clinic-provider";
import { Btn, LiveDot, PageHeader } from "@/components/qc";
import { money } from "@/types/operations";
import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity, CalendarCheck2, CheckCircle2, Clock3, Users, Wallet } from "lucide-react";
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
const localToday = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const daysAgo = (days: number) => {
  const d = new Date(localToday() + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
};
const PERIODS = [
  { id: "today", label: "Today", days: 0 },
  { id: "week", label: "7 days", days: 7 },
  { id: "month", label: "30 days", days: 30 },
  { id: "overall", label: "Overall", days: 365 },
] as const;
const PIE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--color-primary-hover)",
  "var(--muted-foreground)",
];
export function AdminReports() {
  const { selected } = useClinicContext();
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["id"]>("overall");
  const [updated, setUpdated] = useState<Date | null>(null);
  const range = PERIODS.find((p) => p.id === period) ?? PERIODS[3];
  const from = daysAgo(range.days),
    to = localToday();
  const remote = useClinicalData<Report>(
    `/admin/reports?clinicId=${encodeURIComponent(selected)}&from=${from}&to=${to}`,
  );
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void remote.reload();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [remote.reload]);
  useEffect(() => {
    if (remote.data) setUpdated(new Date());
  }, [remote.data]);
  const data = remote.data;
  const trend = useMemo(() => {
    if (!data) return [];
    const rows = new Map<string, { date: string; visits: number; revenue: number }>();
    for (const t of data.trend) {
      const key = range.days > 31 ? t.date.slice(0, 7) : t.date;
      const row = rows.get(key) ?? { date: key, visits: 0, revenue: 0 };
      row.visits += t.visits;
      row.revenue += t.revenue / 100;
      rows.set(key, row);
    }
    return [...rows.values()];
  }, [data, range.days]);
  const statuses = useMemo(
    () =>
      (data?.statuses ?? []).map((s) => ({
        ...s,
        status: s.status.replaceAll("_", " "),
      })),
    [data],
  );
  const clinicBars = useMemo(
    () =>
      (data?.clinics ?? []).map((c) => ({
        name: c.name,
        appointments: c.appointments,
        completed: c.completed,
        revenue: c.revenue / 100,
      })),
    [data],
  );
  const totals = data?.totals;
  const cards = totals
    ? [
        {
          label: "Patients seen",
          value: String(totals.completed),
          hint: `${totals.cancelled} cancelled / no-show`,
          icon: CheckCircle2,
          tone: "bg-success-soft text-success",
        },
        {
          label: "Appointments booked",
          value: String(totals.appointments),
          hint: `${totals.waiting} waiting now`,
          icon: CalendarCheck2,
          tone: "bg-primary-soft text-primary",
        },
        {
          label: "Revenue received",
          value: money(totals.revenue),
          hint: `${money(totals.outstanding)} outstanding`,
          icon: Wallet,
          tone: "bg-warning-soft text-warning",
        },
        {
          label: "Registered patients",
          value: String(totals.patients),
          hint: `${totals.documents} documents uploaded`,
          icon: Users,
          tone: "bg-info-soft text-info",
        },
        {
          label: "Average wait",
          value: `${totals.averageWait} min`,
          hint: "Across completed consultations",
          icon: Clock3,
          tone: "bg-primary-soft text-primary",
        },
        {
          label: "Follow-ups due",
          value: String(totals.followups),
          hint: "Including overdue recommendations",
          icon: Activity,
          tone: "bg-warning-soft text-warning",
        },
      ]
    : [];
  return (
    <>
      <PageHeader
        title="Analytics dashboard"
        sub="Overall clinic performance · figures use clinic local time"
        right={
          <Btn variant="secondary" onClick={remote.reload}>
            Refresh
          </Btn>
        }
      />
      <div className="surface mb-6 flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex flex-wrap gap-2">
          {PERIODS.map((p) => (
            <Btn
              key={p.id}
              variant={period === p.id ? "primary" : "ghost"}
              onClick={() => setPeriod(p.id)}
            >
              {p.label}
            </Btn>
          ))}
        </div>
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <LiveDot className="text-success" />
          Auto-updates every 30s
          {updated ? ` · Last updated ${updated.toLocaleTimeString()}` : ""}
        </p>
      </div>
      {!data ? (
        <ClinicalLoading error={remote.error} retry={remote.reload} />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-3">
            {cards.map(({ label, value, hint, icon: Icon, tone }) => (
              <section className="surface p-5" key={label}>
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    {label}
                  </h2>
                  <span className={`rounded-lg p-2 ${tone}`}>
                    <Icon className="size-4" />
                  </span>
                </div>
                <p className="mt-3 break-words text-2xl font-semibold tabular-nums">{value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
              </section>
            ))}
          </div>
          <div className="mb-6 grid gap-4 lg:grid-cols-2">
            <section className="surface p-5">
              <h2 className="mb-1 font-semibold">Patient visits</h2>
              <p className="mb-4 text-xs text-muted-foreground">
                Consultations completed over time
              </p>
              {trend.length ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="visitsFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Area
                        type="monotone"
                        dataKey="visits"
                        stroke="var(--chart-1)"
                        fill="url(#visitsFill)"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No visits in this period.</p>
              )}
            </section>
            <section className="surface p-5">
              <h2 className="mb-1 font-semibold">Revenue trend</h2>
              <p className="mb-4 text-xs text-muted-foreground">
                Payments received over time (PKR)
              </p>
              {trend.length ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={trend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip
                        formatter={(value) => `Rs ${Number(value).toLocaleString("en-PK")}`}
                      />
                      <Bar dataKey="revenue" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No payments in this period.</p>
              )}
            </section>
            <section className="surface p-5">
              <h2 className="mb-1 font-semibold">Appointment status</h2>
              <p className="mb-4 text-xs text-muted-foreground">Where booked appointments stand</p>
              {statuses.length ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statuses}
                        dataKey="count"
                        nameKey="status"
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={85}
                        paddingAngle={2}
                      >
                        {statuses.map((s, i) => (
                          <Cell key={s.status} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No appointments in this period.</p>
              )}
            </section>
            <section className="surface p-5">
              <h2 className="mb-1 font-semibold">Clinic performance</h2>
              <p className="mb-4 text-xs text-muted-foreground">
                Appointments and completed visits by clinic
              </p>
              {clinicBars.length ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={clinicBars}
                      layout="vertical"
                      margin={{ top: 4, right: 12, left: 8, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="appointments" fill="var(--chart-1)" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="completed" fill="var(--chart-2)" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No clinics found.</p>
              )}
            </section>
          </div>
          <section className="surface overflow-x-auto p-5">
            <h2 className="mb-4 font-semibold">Clinic summary</h2>
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  {["Clinic", "Appointments", "Patients seen", "Revenue", "Outstanding"].map(
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
                  <tr className="border-t border-border" key={c.id}>
                    <th className="p-2 font-medium">{c.name}</th>
                    <td className="p-2">{c.appointments}</td>
                    <td className="p-2">{c.completed}</td>
                    <td className="p-2">{money(c.revenue)}</td>
                    <td className="p-2">{money(c.outstanding)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.clinics.length && (
              <p className="text-sm text-muted-foreground">No clinics found.</p>
            )}
          </section>
          <p className="mt-4 text-xs text-muted-foreground">
            Showing {data.from} to {data.to}. Figures refresh automatically while this page is open;
            revenue reflects payments received.
          </p>
        </>
      )}
    </>
  );
}
