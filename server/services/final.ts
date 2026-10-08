import { z } from "zod";
import { many, one, type Database } from "../db/database.ts";
import { ApiError } from "../middleware/auth.ts";
import { clinicDayKey } from "../../src/domain/queue.js";
export type DataRow = Record<
  | "id"
  | "clinic_id"
  | "patient_id"
  | "scheduled_at"
  | "status"
  | "visit_at"
  | "paid_at"
  | "created_at"
  | "called_at"
  | "joined_at"
  | "amount"
  | "balance"
  | "follow_up_date",
  any
> &
  Record<string, any>;
export const wallTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  .refine((s) => {
    const d = new Date(s + ":00Z");
    return !isNaN(+d) && d.toISOString().slice(0, 16) === s;
  }, "Choose a valid date and time.");
export async function validateSlot(db: Database, clinicId: string, time: string, exclude = "") {
  wallTime.parse(time);
  const c = await one<{ opening_time: string; closing_time: string; active: number }>(
    db,
    "SELECT opening_time,closing_time,active FROM clinics WHERE id=?",
    clinicId,
  );
  if (!c || !c.active) throw new ApiError(409, "CLINIC_INACTIVE", "Choose an active clinic.");
  const slot = await one<{ slot_minutes: number }>(
      db,
      "SELECT slot_minutes FROM clinic_branding WHERE clinic_id=?",
      clinicId,
    ),
    minutes = slot?.slot_minutes ?? 15;
  const clock = time.slice(11),
    end = new Date(new Date(time + ":00Z").getTime() + minutes * 60000).toISOString().slice(11, 16);
  if (clock < c.opening_time || end > c.closing_time || end <= clock)
    throw new ApiError(409, "OUTSIDE_HOURS", "Choose a slot within clinic opening hours.");
  const rows = await many<{ scheduled_at: string }>(
    db,
    "SELECT scheduled_at FROM appointments WHERE clinic_id=? AND id<>? AND status NOT IN ('completed','cancelled') AND substr(scheduled_at,1,10)=?",
    clinicId,
    exclude,
    time.slice(0, 10),
  );
  if (
    rows.some(
      (a) =>
        Math.abs(+new Date(a.scheduled_at + ":00Z") - +new Date(time + ":00Z")) < minutes * 60000,
    )
  )
    throw new ApiError(
      409,
      "SLOT_TAKEN",
      "This slot overlaps an existing appointment. Choose another time.",
    );
}
export function dateRange(input: Record<string, unknown>) {
  const day = clinicDayKey(),
    date = z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine((s) => {
        const d = new Date(s + "T12:00:00Z");
        return !isNaN(+d) && d.toISOString().slice(0, 10) === s;
      });
  const from = date.parse(input["from"] ?? day),
    to = date.parse(input["to"] ?? day);
  if (from > to || +new Date(to) - +new Date(from) > 366 * 86400000)
    throw new ApiError(400, "DATE_RANGE", "Choose a date range up to one year.");
  return { from, to };
}
export async function reportRows(
  db: Database,
  clinicId: string | undefined,
  from: string,
  to: string,
  status = "",
) {
  const args = clinicId ? [clinicId] : [],
    filter = clinicId ? " WHERE clinic_id=?" : "";
  const [clinics, appointments, visits, tokens, invoices, payments, documents, followups] =
    await Promise.all([
      many<DataRow>(db, "SELECT id,name FROM clinics" + (clinicId ? " WHERE id=?" : ""), ...args),
      many<DataRow>(
        db,
        `SELECT a.id,a.clinic_id,a.patient_id,u.full_name patient_name,a.scheduled_at,CASE WHEN a.status='completed' THEN 'completed' ELSE COALESCE(w.status,a.status) END status,a.reason FROM appointments a JOIN users u ON u.id=a.patient_id LEFT JOIN appointment_workflow w ON w.appointment_id=a.id${clinicId ? " WHERE a.clinic_id=?" : ""}`,
        ...args,
      ),
      many<DataRow>(
        db,
        "SELECT id,patient_id,clinic_id,visit_at,status FROM encounters" + filter,
        ...args,
      ),
      many<DataRow>(
        db,
        "SELECT t.id,t.patient_id,q.clinic_id,t.status,t.joined_at,t.called_at FROM tokens t JOIN daily_queues q ON q.id=t.queue_id" +
          (clinicId ? " WHERE q.clinic_id=?" : ""),
        ...args,
      ),
      many<DataRow>(
        db,
        "SELECT id,invoice_number,patient_id,clinic_id,status,total,amount_paid,balance,created_at FROM invoices" +
          filter,
        ...args,
      ),
      many<DataRow>(
        db,
        "SELECT p.id,p.invoice_id,i.invoice_number,i.clinic_id,p.amount,p.method,p.reference,p.paid_at FROM payments p JOIN invoices i ON i.id=p.invoice_id" +
          (clinicId ? " WHERE i.clinic_id=?" : ""),
        ...args,
      ),
      many<DataRow>(
        db,
        "SELECT id,clinic_id,created_at FROM patient_documents WHERE status='ready'" +
          (clinicId ? " AND clinic_id=?" : ""),
        ...args,
      ),
      many<DataRow>(
        db,
        "SELECT e.id,e.clinic_id,COALESCE(f.follow_up_date,CAST(e.follow_up_date AS TEXT)) follow_up_date,COALESCE(f.status,'pending') status FROM encounters e LEFT JOIN follow_up_actions f ON f.encounter_id=e.id WHERE e.status='completed' AND e.follow_up_date IS NOT NULL" +
          (clinicId ? " AND e.clinic_id=?" : ""),
        ...args,
      ),
    ]);
  const day = (x: unknown) =>
    x instanceof Date || (/[TZ]/.test(String(x)) && String(x).includes("Z"))
      ? new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Karachi",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date(String(x)))
      : String(x).slice(0, 10);
  const inRange = (x: unknown) => day(x) >= from && day(x) <= to;
  const a = appointments.filter((x) => inRange(x.scheduled_at) && (!status || x.status === status));
  const v = visits.filter((x) => inRange(x.visit_at) && (!status || x.status === status));
  const p = payments.filter((x) => inRange(x.paid_at));
  const i = invoices.filter((x) => inRange(x.created_at) && (!status || x.status === status));
  const summary = (id?: string) => {
    const scoped = (rows: DataRow[]) => (id ? rows.filter((x) => x.clinic_id === id) : rows);
    const t = scoped(tokens),
      vs = scoped(v),
      ps = scoped(p),
      aps = scoped(a),
      is = scoped(invoices);
    const waited = t.filter((x) => x.called_at && inRange(x.called_at));
    return {
      patients: new Set([
        ...vs.map((x) => x.patient_id),
        ...t.filter((x) => inRange(x.joined_at)).map((x) => x.patient_id),
      ]).size,
      appointments: aps.length,
      waiting: t.filter((x) => x.status === "waiting" && day(x.joined_at) === clinicDayKey())
        .length,
      completed: vs.filter((x) => x.status === "completed").length,
      cancelled: aps.filter((x) => ["cancelled", "no_show"].includes(x.status)).length,
      revenue: ps.reduce((s, x) => s + Number(x.amount), 0),
      outstanding: is
        .filter((x) => !["draft", "void"].includes(x.status))
        .reduce((s, x) => s + Number(x.balance), 0),
      documents: scoped(documents).filter((x) => inRange(x.created_at)).length,
      followups: scoped(followups).filter(
        (x) => x.status !== "completed" && day(x.follow_up_date) <= to,
      ).length,
      averageWait: waited.length
        ? Math.round(
            waited.reduce(
              (s, x) => s + Math.max(0, (+new Date(x.called_at) - +new Date(x.joined_at)) / 60000),
              0,
            ) / waited.length,
          )
        : 0,
    };
  };
  const trend = new Map<
    string,
    { date: string; visits: number; revenue: number; wait: number; count: number }
  >();
  function point(d: string) {
    if (!trend.has(d)) trend.set(d, { date: d, visits: 0, revenue: 0, wait: 0, count: 0 });
    return trend.get(d)!;
  }
  v.forEach((x) => point(day(x.visit_at)).visits++);
  p.forEach((x) => (point(day(x.paid_at)).revenue += Number(x.amount)));
  tokens
    .filter((x) => x.called_at && inRange(x.called_at))
    .forEach((x) => {
      const t = point(day(x.called_at));
      t.wait += Math.max(0, (+new Date(x.called_at) - +new Date(x.joined_at)) / 60000);
      t.count++;
    });
  return {
    from,
    to,
    totals: summary(),
    clinics: clinics.map((c) => ({ ...c, ...summary(c.id) })),
    trend: [...trend.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((x) => ({ ...x, averageWait: x.count ? Math.round(x.wait / x.count) : 0 })),
    statuses: Object.entries(
      a.reduce(
        (s, x) => {
          s[x.status] = (s[x.status] ?? 0) + 1;
          return s;
        },
        {} as Record<string, number>,
      ),
    ).map(([status, count]) => ({ status, count })),
    appointments: a,
    visits: v,
    payments: p,
    invoices: i,
  };
}
export function csv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "No records\r\n";
  const keys = Object.keys(rows[0]!);
  const cell = (v: unknown) => {
    let s = v instanceof Date ? v.toISOString() : String(v ?? "");
    if (/^[\s]*[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  return [keys.map(cell).join(","), ...rows.map((r) => keys.map((k) => cell(r[k])).join(","))].join(
    "\r\n",
  );
}
