import type { Database } from "../db/database.ts";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { atomic, one, many, type UserRow } from "../db/database.ts";
import { ApiError } from "../middleware/auth.ts";
import { clinicDayKey } from "../../src/domain/queue.js";
import type {
  ClinicConfig,
  DailyQueue,
  QueueToken,
  PublicQueue,
  PatientRow,
} from "../../src/types/local.ts";
interface ClinicRow {
  id: string;
  active: number;
  consultation_fee: number | null;
  name: string;
  display_name: string;
  address: string;
  phone: string;
  department: string;
  doctor_name: string;
  opening_time: string;
  closing_time: string;
  average_consultation_minutes: number;
  token_prefix: string;
  public_display_show_next: number;
  updated_at: string;
}
interface QueueRow {
  id: string;
  clinic_id: string;
  queue_date: string;
  status: "open" | "closed";
  next_token_number: number;
  current_token_id: string | null;
  updated_at: string;
}
interface TokenRow {
  id: string;
  queue_id: string;
  patient_id: string;
  token_number: number;
  token_code: string;
  queue_order: number;
  department: string;
  reason_for_visit: string;
  status: QueueToken["status"];
  joined_at: string;
  called_at: string | null;
  last_called_at: string | null;
  call_count: number;
  completed_at: string | null;
  skipped_at: string | null;
  cancelled_at: string | null;
  updated_at: string;
  full_name: string;
  phone: string;
  queue_date: string;
  clinic_id: string;
  clinic_name: string;
}
const tokenSelect =
  "SELECT t.*,u.full_name,u.phone,q.queue_date,q.clinic_id,c.name clinic_name FROM tokens t JOIN users u ON u.id=t.patient_id JOIN daily_queues q ON q.id=t.queue_id JOIN clinics c ON c.id=q.clinic_id";
export function tokenValue(t: TokenRow): QueueToken {
  return {
    id: t.id,
    clinicId: t.clinic_id,
    clinicName: t.clinic_name,
    patientId: t.patient_id,
    patientName: t.full_name,
    phone: t.phone,
    tokenNumber: t.token_number,
    tokenCode: t.token_code,
    queueOrder: t.queue_order,
    department: t.department,
    reasonForVisit: t.reason_for_visit,
    status: t.status,
    queueDate: t.queue_date,
    joinedAt: t.joined_at,
    calledAt: t.called_at,
    lastCalledAt: t.last_called_at,
    callCount: t.call_count,
    completedAt: t.completed_at,
    skippedAt: t.skipped_at,
    cancelledAt: t.cancelled_at,
  };
}
export async function clinicValue(db: Database, clinicId = "northstar"): Promise<ClinicConfig> {
  const c = await one<ClinicRow>(db, "SELECT * FROM clinics WHERE id=?", clinicId);
  if (!c) throw new ApiError(404, "CLINIC_NOT_FOUND", "This clinic is unavailable.");
  return {
    id: c.id,
    active: Boolean(c.active),
    consultationFee: c.consultation_fee,
    name: c.name,
    publicDisplayName: c.display_name,
    address: c.address,
    phone: c.phone,
    department: c.department,
    doctorName: c.doctor_name,
    openingTime: c.opening_time,
    closingTime: c.closing_time,
    averageConsultationMinutes: c.average_consultation_minutes,
    tokenPrefix: c.token_prefix,
    publicDisplayShowNext: Boolean(c.public_display_show_next),
  };
}
export async function currentQueue(db: Database, clinicId = "northstar") {
  return await one<QueueRow>(
    db,
    "SELECT * FROM daily_queues WHERE clinic_id=? AND queue_date=?",
    clinicId,
    clinicDayKey(),
  );
}
export function dailyQueueValue(q: QueueRow): DailyQueue {
  return {
    id: q.id,
    clinicId: q.clinic_id,
    queueDate: q.queue_date,
    status: q.status,
    nextTokenNumber: q.next_token_number,
    currentTokenId: q.current_token_id,
  };
}
export async function queueTokens(db: Database, qid: string) {
  return (
    await many<TokenRow>(
      db,
      tokenSelect + " WHERE t.queue_id=? ORDER BY t.queue_order LIMIT 200",
      qid,
    )
  ).map(tokenValue);
}
export async function publicQueue(db: Database, clinicId = "northstar"): Promise<PublicQueue> {
  const c = await clinicValue(db, clinicId),
    q = await currentQueue(db, clinicId);
  const waiting = q
    ? await many<{ token_code: string; queue_order: number }>(
        db,
        "SELECT token_code,queue_order FROM tokens WHERE queue_id=? AND status='waiting' ORDER BY queue_order LIMIT 200",
        q.id,
      )
    : [];
  const serving = q
    ? await one<{ token_code: string }>(
        db,
        "SELECT token_code FROM tokens WHERE queue_id=? AND status='serving'",
        q.id,
      )
    : undefined;
  const updated =
    (
      await one<{ stamp: string }>(
        db,
        "SELECT MAX(stamp) AS stamp FROM (SELECT updated_at AS stamp FROM clinics WHERE id=? UNION ALL SELECT updated_at AS stamp FROM daily_queues WHERE clinic_id=? UNION ALL SELECT t.updated_at AS stamp FROM tokens t JOIN daily_queues q ON q.id=t.queue_id WHERE q.clinic_id=?) AS updates",
        clinicId,
        clinicId,
        clinicId,
      )
    )?.stamp ?? new Date().toISOString();
  return {
    name: c.name,
    displayName: c.publicDisplayName,
    department: c.department,
    tokenPrefix: c.tokenPrefix,
    averageConsultationMinutes: c.averageConsultationMinutes,
    publicDisplayShowNext: c.publicDisplayShowNext,
    queueDate: clinicDayKey(),
    status: q?.status ?? "unavailable",
    currentToken: serving?.token_code ?? null,
    nextTokens: c.publicDisplayShowNext ? waiting.slice(0, 3).map((t) => t.token_code) : [],
    waitingTokens: waiting.map((t) => ({ tokenCode: t.token_code, queueOrder: t.queue_order })),
    updatedAt: updated,
  };
}
export async function patientState(db: Database, uid: string, clinicId = "northstar") {
  const q = await currentQueue(db, clinicId);
  const last = q
    ? await one<TokenRow>(
        db,
        tokenSelect + " WHERE t.queue_id=? AND t.patient_id=? ORDER BY t.token_number DESC LIMIT 1",
        q.id,
        uid,
      )
    : undefined;
  const history = (
    await many<TokenRow>(
      db,
      tokenSelect + " WHERE t.patient_id=? ORDER BY t.joined_at DESC,t.rowid DESC LIMIT 100",
      uid,
    )
  ).map(tokenValue);
  const pub = await publicQueue(db, clinicId),
    mine = last ? tokenValue(last) : null;
  const ahead =
    mine?.status === "waiting"
      ? pub.waitingTokens.filter((t) => t.queueOrder < mine.queueOrder).length
      : 0;
  return {
    clinic: await clinicValue(db, clinicId),
    public: pub,
    mine,
    queue: [],
    history,
    patients: [],
    ahead,
    eta: ahead * pub.averageConsultationMinutes,
  };
}
export async function adminState(db: Database, date: string, clinicId = "northstar") {
  const all = clinicId === "all";
  const q = all ? undefined : await currentQueue(db, clinicId);
  const history = (
    await many<TokenRow>(
      db,
      tokenSelect +
        " WHERE (?='all' OR q.clinic_id=?) AND q.queue_date=? ORDER BY t.joined_at DESC,t.queue_order LIMIT 200",
      clinicId,
      clinicId,
      date,
    )
  ).map(tokenValue);
  const patients: PatientRow[] = await Promise.all(
    (
      await many<UserRow>(
        db,
        "SELECT u.* FROM users u WHERE u.role='patient' AND (?='all' OR EXISTS (SELECT 1 FROM tokens t JOIN daily_queues q ON q.id=t.queue_id WHERE t.patient_id=u.id AND q.clinic_id=?)) ORDER BY full_name LIMIT 200",
        clinicId,
        clinicId,
      )
    ).map(async (u) => {
      const visit = await one<TokenRow>(
        db,
        tokenSelect +
          " WHERE t.patient_id=? AND (?='all' OR q.clinic_id=?) ORDER BY t.joined_at DESC,t.rowid DESC LIMIT 1",
        u.id,
        clinicId,
        clinicId,
      );
      return {
        user: { id: u.id, fullName: u.full_name, phone: u.phone },
        visit: visit ? tokenValue(visit) : null,
      };
    }),
  );
  return {
    clinic: await clinicValue(db, all ? "northstar" : clinicId),
    public: {
      ...(await publicQueue(db, all ? "northstar" : clinicId)),
      ...(all ? { status: "unavailable" as const } : {}),
    },
    mine: null,
    queue: q ? await queueTokens(db, q.id) : [],
    history,
    patients,
  };
}
export type QueueAction =
  | "open"
  | "close"
  | "join"
  | "leave"
  | "callNext"
  | "call"
  | "done"
  | "skip"
  | "requeue"
  | "callAgain";
export async function mutateQueue(
  db: Database,
  user: UserRow,
  action: QueueAction,
  input: { token?: string | undefined; reason?: string | undefined } = {},
  clinicId = "northstar",
) {
  if (user.role !== (action === "join" || action === "leave" ? "patient" : "admin"))
    throw new ApiError(403, "FORBIDDEN", "Your account cannot perform this action.");
  return atomic(db, async () => {
    const stamp = new Date().toISOString(),
      day = clinicDayKey(),
      clinic = await clinicValue(db, clinicId);
    if ((action === "open" || action === "join") && !clinic.active)
      throw new ApiError(409, "CLINIC_INACTIVE", "This clinic is inactive.");
    let q = await currentQueue(db, clinicId);
    if (action === "open") {
      if (!q) {
        const id = randomUUID();
        await db
          .prepare("INSERT INTO daily_queues VALUES (?,?,?,?,?,?,?,?,?,?,?)")
          .run(id, clinicId, day, "open", 1, null, stamp, null, user.id, stamp, stamp);
        q = (await currentQueue(db, clinicId))!;
      } else if (q.status === "closed")
        await db
          .prepare(
            "UPDATE daily_queues SET status='open',opened_at=?,closed_at=NULL,updated_at=? WHERE id=?",
          )
          .run(stamp, stamp, q.id);
      return dailyQueueValue((await currentQueue(db, clinicId))!);
    }
    if (!q) throw new ApiError(409, "NO_QUEUE", "No queue has been opened today.");
    if (action === "close") {
      await db
        .prepare("UPDATE daily_queues SET status='closed',closed_at=?,updated_at=? WHERE id=?")
        .run(stamp, stamp, q.id);
      return dailyQueueValue((await currentQueue(db, clinicId))!);
    }
    if (action === "join") {
      const existing = await one<TokenRow>(
        db,
        tokenSelect +
          " WHERE t.queue_id=? AND t.patient_id=? AND t.status IN ('waiting','serving','skipped')",
        q.id,
        user.id,
      );
      if (existing) return tokenValue(existing);
      if (q.status !== "open") throw new ApiError(409, "QUEUE_CLOSED", "Today's queue is closed.");
      if (q.next_token_number > 200)
        throw new ApiError(409, "QUEUE_FULL", "Today's queue is full. Please contact reception.");
      const number = q.next_token_number,
        id = randomUUID(),
        code = `${clinic.tokenPrefix}-${String(number).padStart(3, "0")}`;
      const order = (await one<{ n: number }>(
        db,
        "SELECT COALESCE(MAX(queue_order),0)+1 AS n FROM tokens WHERE queue_id=?",
        q.id,
      ))!.n;
      await db
        .prepare(
          "INSERT INTO tokens (id,queue_id,patient_id,token_number,token_code,queue_order,department,reason_for_visit,status,joined_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        )
        .run(
          id,
          q.id,
          user.id,
          number,
          code,
          order,
          clinic.department,
          input.reason ?? "",
          "waiting",
          stamp,
          stamp,
          stamp,
        );
      await db
        .prepare(
          "UPDATE daily_queues SET next_token_number=next_token_number+1,updated_at=? WHERE id=?",
        )
        .run(stamp, q.id);
      return tokenValue((await one<TokenRow>(db, tokenSelect + " WHERE t.id=?", id))!);
    }
    let t: TokenRow | undefined;
    if (action === "leave")
      t = await one<TokenRow>(
        db,
        tokenSelect + " WHERE t.queue_id=? AND t.patient_id=? ORDER BY t.token_number DESC LIMIT 1",
        q.id,
        user.id,
      );
    else if (action === "callNext" || action === "call") {
      if (q.status !== "open") throw new ApiError(409, "QUEUE_CLOSED", "Today's queue is closed.");
      if (
        q.current_token_id ||
        (await one(db, "SELECT id FROM tokens WHERE queue_id=? AND status='serving'", q.id))
      )
        throw new ApiError(409, "ALREADY_SERVING", "Complete or skip the current patient first.");
      t = await one<TokenRow>(
        db,
        tokenSelect + " WHERE t.queue_id=? AND t.status='waiting' ORDER BY t.queue_order LIMIT 1",
        q.id,
      );
      if (!t) throw new ApiError(409, "NO_WAITING", "No patients waiting.");
      if (action === "call" && input.token !== t.token_code)
        throw new ApiError(
          409,
          "QUEUE_ORDER",
          "Call the first waiting patient to preserve queue order.",
        );
    } else
      t = input.token
        ? await one<TokenRow>(
            db,
            tokenSelect + " WHERE t.queue_id=? AND t.token_code=?",
            q.id,
            input.token,
          )
        : await one<TokenRow>(db, tokenSelect + " WHERE t.id=?", q.current_token_id ?? "");
    if (!t) throw new ApiError(404, "TOKEN_NOT_FOUND", "This token is no longer available.");
    if (action === "callNext" || action === "call") {
      await db
        .prepare(
          "UPDATE tokens SET status='serving',called_at=?,last_called_at=?,call_count=call_count+1,updated_at=? WHERE id=?",
        )
        .run(stamp, stamp, stamp, t.id);
      await db.prepare("UPDATE daily_queues SET current_token_id=? WHERE id=?").run(t.id, q.id);
    } else if (action === "leave") {
      if (t.status === "cancelled") return tokenValue(t);
      if (t.status !== "waiting")
        throw new ApiError(409, "INVALID_STATUS", "Only your own waiting token can be cancelled.");
      await db
        .prepare("UPDATE tokens SET status='cancelled',cancelled_at=?,updated_at=? WHERE id=?")
        .run(stamp, stamp, t.id);
    } else if (action === "done") {
      if (t.status !== "serving" || q.current_token_id !== t.id)
        throw new ApiError(
          409,
          "INVALID_STATUS",
          "Only the currently serving patient can be completed.",
        );
      await db
        .prepare("UPDATE tokens SET status='completed',completed_at=?,updated_at=? WHERE id=?")
        .run(stamp, stamp, t.id);
      await db.prepare("UPDATE daily_queues SET current_token_id=NULL WHERE id=?").run(q.id);
      await db
        .prepare(
          "INSERT INTO visits (id,clinic_id,patient_id,doctor_id,queue_id,token_id,completed_at) VALUES (?,?,?,?,?,?,?)",
        )
        .run(randomUUID(), clinicId, t.patient_id, user.id, q.id, t.id, stamp);
    } else if (action === "skip") {
      if (!["waiting", "serving"].includes(t.status))
        throw new ApiError(
          409,
          "INVALID_STATUS",
          "Only waiting or serving patients can be skipped.",
        );
      await db
        .prepare("UPDATE tokens SET status='skipped',skipped_at=?,updated_at=? WHERE id=?")
        .run(stamp, stamp, t.id);
      if (q.current_token_id === t.id)
        await db.prepare("UPDATE daily_queues SET current_token_id=NULL WHERE id=?").run(q.id);
    } else if (action === "requeue") {
      if (t.status !== "skipped")
        throw new ApiError(
          409,
          "INVALID_STATUS",
          "Only skipped tokens can be moved back to the queue.",
        );
      const order = (await one<{ n: number }>(
        db,
        "SELECT MAX(queue_order)+1 AS n FROM tokens WHERE queue_id=?",
        q.id,
      ))!.n;
      await db
        .prepare("UPDATE tokens SET status='waiting',queue_order=?,updated_at=? WHERE id=?")
        .run(order, stamp, t.id);
    } else if (action === "callAgain") {
      if (t.status !== "serving" || q.current_token_id !== t.id)
        throw new ApiError(409, "INVALID_STATUS", "Only the current patient can be called again.");
      await db
        .prepare(
          "UPDATE tokens SET last_called_at=?,call_count=call_count+1,updated_at=? WHERE id=?",
        )
        .run(stamp, stamp, t.id);
    }
    await db.prepare("UPDATE daily_queues SET updated_at=? WHERE id=?").run(stamp, q.id);
    return tokenValue((await one<TokenRow>(db, tokenSelect + " WHERE t.id=?", t.id))!);
  });
}
const settingsSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    publicName: z.string().trim().min(1).max(120),
    address: z.string().trim().min(1).max(250),
    phone: z.string().trim().min(1).max(30),
    department: z.string().trim().min(1).max(120),
    doctor: z.string().trim().min(1).max(120),
    opening: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    closing: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    prefix: z.string().regex(/^[A-Z]{1,5}$/),
    showNext: z.boolean(),
  })
  .strict()
  .refine((c) => c.opening < c.closing, { message: "Closing time must be after opening time." });
export async function saveSettings(db: Database, input: unknown, clinicId = "northstar") {
  const data = z
      .object({ clinic: settingsSchema, avgMin: z.number().int().min(1).max(120) })
      .strict()
      .parse(input),
    c = data.clinic;
  return atomic(db, async () => {
    await db
      .prepare(
        "UPDATE clinics SET name=?,display_name=?,address=?,phone=?,department=?,doctor_name=?,opening_time=?,closing_time=?,average_consultation_minutes=?,token_prefix=?,public_display_show_next=?,updated_at=? WHERE id=?",
      )
      .run(
        c.name,
        c.publicName,
        c.address,
        c.phone,
        c.department,
        c.doctor,
        c.opening,
        c.closing,
        data.avgMin,
        c.prefix,
        c.showNext ? 1 : 0,
        new Date().toISOString(),
        clinicId,
      );
    return await clinicValue(db, clinicId);
  });
}
