import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { z } from "zod";
import { atomic, one, many, type Database, type UserRow } from "../db/database.ts";
import { ApiError } from "../middleware/auth.ts";
export const stamp = () => new Date().toISOString();
export const idValue = z.string().min(1).max(100);
export async function audit(
  db: Database,
  actor: string,
  action: string,
  entityType: string,
  entityId: string,
  clinicId: string | null = null,
  detail = "",
) {
  await db
    .prepare("INSERT INTO audit_logs VALUES (?,?,?,?,?,?,?,?)")
    .run(
      randomUUID(),
      actor,
      action,
      entityType,
      entityId,
      clinicId,
      detail.slice(0, 300),
      stamp(),
    );
}
export async function notification(
  db: Database,
  userId: string,
  type: string,
  title: string,
  message: string,
  entityType: string,
  entityId: string,
  clinicId: string | null = null,
) {
  await db
    .prepare(
      "INSERT INTO notifications(id,user_id,type,title,message,entity_type,entity_id,clinic_id,created_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,type,entity_id) DO NOTHING",
    )
    .run(randomUUID(), userId, type, title, message, entityType, entityId, clinicId, stamp());
}
export async function operationalNotification(
  db: Database,
  clinicId: string,
  type: string,
  title: string,
  entityId: string,
) {
  const users = await many<{ id: string }>(
    db,
    "SELECT id FROM users WHERE role='admin' UNION SELECT s.user_id id FROM staff_profiles s JOIN staff_clinics c ON c.staff_id=s.user_id WHERE s.active=1 AND c.clinic_id=?",
    clinicId,
  );
  for (const u of users)
    await notification(
      db,
      u.id,
      type,
      title,
      "Open the clinic workspace for details.",
      "queue",
      entityId,
      clinicId,
    );
}
export async function authorizeClinic(
  db: Database,
  user: UserRow,
  clinicId: string,
  roles: UserRow["role"][] = ["receptionist", "nurse"],
) {
  if (user.role === "admin") return;
  if (
    !roles.includes(user.role) ||
    !(await one(
      db,
      "SELECT s.user_id FROM staff_profiles s JOIN staff_clinics c ON c.staff_id=s.user_id WHERE s.user_id=? AND s.active=1 AND c.clinic_id=?",
      user.id,
      clinicId,
    ))
  )
    throw new ApiError(403, "CLINIC_FORBIDDEN", "This clinic is not assigned to your account.");
}
export async function patientInClinic(
  db: Database,
  user: UserRow,
  patientId: string,
  clinicId: string,
) {
  await authorizeClinic(db, user, clinicId);
  if (
    !(await one(
      db,
      "SELECT id FROM users u WHERE u.id=? AND u.role='patient' AND NOT EXISTS(SELECT 1 FROM staff_profiles s WHERE s.user_id=u.id)",
      patientId,
    ))
  )
    throw new ApiError(404, "PATIENT_NOT_FOUND", "Patient not found.");
  if (user.role === "admin") return;
  const related = await one(
    db,
    "SELECT id FROM appointments WHERE patient_id=? AND clinic_id=? UNION SELECT t.id FROM tokens t JOIN daily_queues q ON q.id=t.queue_id WHERE t.patient_id=? AND q.clinic_id=? UNION SELECT id FROM encounters WHERE patient_id=? AND clinic_id=? LIMIT 1",
    patientId,
    clinicId,
    patientId,
    clinicId,
    patientId,
    clinicId,
  );
  if (!related)
    throw new ApiError(
      403,
      "PATIENT_FORBIDDEN",
      "This patient has no record in the assigned clinic.",
    );
}
const staffInput = z
  .object({
    fullName: z.string().trim().min(2).max(120),
    email: z
      .string()
      .trim()
      .email()
      .max(254)
      .transform((s) => s.toLowerCase()),
    phone: z.string().trim().min(7).max(30),
    role: z.enum(["receptionist", "nurse"]),
    active: z.boolean(),
    clinicIds: z.array(idValue).min(1).max(100),
    password: z
      .string()
      .min(12)
      .max(72)
      .refine((s) => Buffer.byteLength(s) <= 72)
      .optional(),
  })
  .strict();
export async function staffList(db: Database): Promise<Record<string, unknown>[]> {
  const staff = await many<Record<string, unknown>>(
    db,
    "SELECT u.id,u.full_name AS name,u.email,u.phone,s.role,s.active,s.last_activity_at FROM staff_profiles s JOIN users u ON u.id=s.user_id ORDER BY u.full_name",
  );
  return Promise.all(
    staff.map(async (s) => ({
      ...s,
      active: Number(s["active"]) === 1,
      clinics: await many(
        db,
        "SELECT c.id,c.name FROM clinics c JOIN staff_clinics sc ON sc.clinic_id=c.id WHERE sc.staff_id=? ORDER BY c.name",
        String(s["id"]),
      ),
    })),
  );
}
export async function saveStaff(db: Database, actor: UserRow, input: unknown, id?: string) {
  if (actor.role !== "admin")
    throw new ApiError(403, "FORBIDDEN", "Only the main administrator can manage staff.");
  const c = staffInput.parse(input);
  if (!id && !c.password)
    throw new ApiError(400, "PASSWORD_REQUIRED", "Provide an initial password.");
  const password = c.password ? await hash(c.password, 12) : null;
  return atomic(db, async () => {
    const uid = id ?? randomUUID(),
      now = stamp();
    if (id && !(await one(db, "SELECT user_id FROM staff_profiles WHERE user_id=?", id)))
      throw new ApiError(404, "NOT_FOUND", "Staff account not found.");
    if (await one(db, "SELECT id FROM users WHERE email=? AND id<>?", c.email, uid))
      throw new ApiError(409, "EMAIL_EXISTS", "This email already has an account.");
    for (const clinicId of new Set(c.clinicIds))
      if (!(await one(db, "SELECT id FROM clinics WHERE id=?", clinicId)))
        throw new ApiError(400, "INVALID_CLINIC", "Choose valid clinics.");
    if (id) {
      await db
        .prepare(
          "UPDATE users SET full_name=?,email=?,phone=?,password_hash=COALESCE(?,password_hash),updated_at=? WHERE id=?",
        )
        .run(c.fullName, c.email, c.phone, password, now, uid);
      await db
        .prepare("UPDATE staff_profiles SET role=?,active=?,updated_at=? WHERE user_id=?")
        .run(c.role, c.active ? 1 : 0, now, uid);
      await db.prepare("DELETE FROM staff_clinics WHERE staff_id=?").run(uid);
      await db.prepare("DELETE FROM sessions WHERE user_id=?").run(uid);
    } else {
      await db
        .prepare("INSERT INTO users VALUES (?,?,?,?,?,?,?,?)")
        .run(uid, c.fullName, c.email, c.phone, password, "patient", now, now);
      await db
        .prepare(
          "INSERT INTO staff_profiles(user_id,role,active,created_at,updated_at) VALUES (?,?,?,?,?)",
        )
        .run(uid, c.role, c.active ? 1 : 0, now, now);
    }
    for (const clinicId of new Set(c.clinicIds))
      await db.prepare("INSERT INTO staff_clinics VALUES (?,?)").run(uid, clinicId);
    await audit(
      db,
      actor.id,
      id ? "staff.updated" : "staff.created",
      "staff",
      uid,
      null,
      c.active ? "Active; clinic assignments saved." : "Deactivated; sessions revoked.",
    );
    return (await staffList(db)).find((s) => s["id"] === uid);
  });
}
export const invoiceInput = z
  .object({
    patientId: idValue,
    clinicId: idValue,
    visitId: idValue.nullable().optional(),
    appointmentId: idValue.nullable().optional(),
    discount: z.number().int().min(0).max(100000000),
    dueAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine((s) => {
        const d = new Date(s + "T00:00:00Z");
        return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
      })
      .nullable(),
    draft: z.boolean(),
    items: z
      .array(
        z
          .object({
            description: z.string().trim().min(1).max(200),
            quantity: z.number().int().min(1).max(1000),
            unitPrice: z.number().int().min(0).max(100000000),
          })
          .strict(),
      )
      .min(1)
      .max(30),
  })
  .strict();
export async function invoiceDetail(
  db: Database,
  user: UserRow,
  id: string,
): Promise<Record<string, unknown> & { items: unknown[]; payments: unknown[] }> {
  const row = await one<Record<string, unknown>>(
    db,
    "SELECT i.*,u.full_name patient_name,c.name clinic_name,c.address clinic_address,c.phone clinic_phone FROM invoices i JOIN users u ON u.id=i.patient_id JOIN clinics c ON c.id=i.clinic_id WHERE i.id=?",
    id,
  );
  if (!row) throw new ApiError(404, "NOT_FOUND", "Invoice not found.");
  if (user.role === "patient") {
    if (row["patient_id"] !== user.id || row["status"] === "draft")
      throw new ApiError(404, "NOT_FOUND", "Invoice not found.");
  } else await authorizeClinic(db, user, String(row["clinic_id"]), ["receptionist"]);
  return {
    ...row,
    items: await many(
      db,
      "SELECT description,quantity,unit_price,total FROM invoice_items WHERE invoice_id=? ORDER BY position",
      id,
    ),
    payments: await many(
      db,
      "SELECT id,amount,method,reference,paid_at FROM payments WHERE invoice_id=? ORDER BY paid_at,id",
      id,
    ),
  };
}
export async function createInvoice(db: Database, user: UserRow, input: unknown, id?: string) {
  const c = invoiceInput.parse(input);
  await patientInClinic(db, user, c.patientId, c.clinicId);
  await authorizeClinic(db, user, c.clinicId, ["receptionist"]);
  const subtotal = c.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
  if (!Number.isSafeInteger(subtotal) || subtotal > 100000000 || c.discount > subtotal)
    throw new ApiError(400, "INVALID_TOTAL", "Check invoice prices and discount.");
  return atomic(db, async () => {
    for (const [table, linked] of [
      ["encounters", c.visitId],
      ["appointments", c.appointmentId],
    ] as const)
      if (
        linked &&
        !(await one(
          db,
          `SELECT id FROM ${table} WHERE id=? AND patient_id=? AND clinic_id=?`,
          linked,
          c.patientId,
          c.clinicId,
        ))
      )
        throw new ApiError(
          400,
          "INVALID_CONTEXT",
          "The linked visit or appointment does not match this patient and clinic.",
        );
    const uid = id ?? randomUUID(),
      now = stamp(),
      total = subtotal - c.discount,
      status = c.draft ? "draft" : total === 0 ? "paid" : "unpaid";
    if (id) {
      const prior = await invoiceDetail(db, user, id);
      if (
        prior["status"] !== "draft" ||
        prior["patient_id"] !== c.patientId ||
        prior["clinic_id"] !== c.clinicId
      )
        throw new ApiError(409, "LOCKED", "Only a matching draft invoice can be edited.");
      await db
        .prepare(
          "UPDATE invoices SET visit_id=?,appointment_id=?,status=?,subtotal=?,discount=?,total=?,balance=?,issued_at=?,due_at=?,updated_at=? WHERE id=?",
        )
        .run(
          c.visitId ?? null,
          c.appointmentId ?? null,
          status,
          subtotal,
          c.discount,
          total,
          total,
          c.draft ? null : now,
          c.dueAt,
          now,
          uid,
        );
      await db.prepare("DELETE FROM invoice_items WHERE invoice_id=?").run(uid);
    } else
      await db
        .prepare("INSERT INTO invoices VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(
          uid,
          "QC-" + now.slice(0, 10).replaceAll("-", "") + "-" + uid.slice(0, 8).toUpperCase(),
          c.patientId,
          c.clinicId,
          c.visitId ?? null,
          c.appointmentId ?? null,
          status,
          subtotal,
          c.discount,
          total,
          0,
          total,
          c.draft ? null : now,
          c.dueAt,
          user.id,
          now,
          now,
        ); // 17 columns
    for (const [position, item] of c.items.entries())
      await db
        .prepare("INSERT INTO invoice_items VALUES (?,?,?,?,?,?,?)")
        .run(
          randomUUID(),
          uid,
          position,
          item.description,
          item.quantity,
          item.unitPrice,
          item.quantity * item.unitPrice,
        );
    await audit(
      db,
      user.id,
      id ? "invoice.updated" : "invoice.created",
      "invoice",
      uid,
      c.clinicId,
    );
    if (!c.draft)
      await notification(
        db,
        c.patientId,
        "invoice.issued",
        "Invoice available",
        "An invoice is available in your billing portal.",
        "invoice",
        uid,
        c.clinicId,
      );
    return invoiceDetail(db, user, uid);
  });
}
export async function recordPayment(db: Database, user: UserRow, id: string, input: unknown) {
  const c = z
    .object({
      amount: z.number().int().min(1).max(100000000),
      method: z.enum(["cash", "card", "bank_transfer", "other"]),
      reference: z.string().trim().max(300),
      paidAt: z.string().datetime(),
      requestId: z.string().uuid(),
    })
    .strict()
    .parse(input);
  return atomic(db, async () => {
    const invoice = await invoiceDetail(db, user, id);
    if (user.role === "patient")
      throw new ApiError(403, "FORBIDDEN", "Payments are recorded by clinic staff.");
    const duplicate = await one<{
      invoice_id: string;
      amount: number;
      method: string;
      reference: string;
    }>(
      db,
      "SELECT invoice_id,amount,method,reference FROM payments WHERE request_id=?",
      c.requestId,
    );
    if (duplicate) {
      if (
        duplicate.invoice_id !== id ||
        Number(duplicate.amount) !== c.amount ||
        duplicate.method !== c.method ||
        duplicate.reference !== c.reference
      )
        throw new ApiError(
          409,
          "REQUEST_REUSED",
          "This payment request belongs to another invoice.",
        );
      return invoice;
    }
    if (
      !["unpaid", "partially_paid"].includes(String(invoice["status"])) ||
      c.amount > Number(invoice["balance"])
    )
      throw new ApiError(
        409,
        "INVALID_PAYMENT",
        "Payment exceeds the balance or invoice is closed.",
      );
    const paid = Number(invoice["amount_paid"]) + c.amount,
      balance = Number(invoice["total"]) - paid,
      pid = randomUUID();
    await db
      .prepare("INSERT INTO payments VALUES (?,?,?,?,?,?,?,?,?)")
      .run(pid, id, c.amount, c.method, c.reference, c.paidAt, user.id, c.requestId, stamp());
    await db
      .prepare("UPDATE invoices SET amount_paid=?,balance=?,status=?,updated_at=? WHERE id=?")
      .run(paid, balance, balance === 0 ? "paid" : "partially_paid", stamp(), id);
    await audit(
      db,
      user.id,
      "payment.recorded",
      "invoice",
      id,
      String(invoice["clinic_id"]),
      "Payment recorded; balance updated.",
    );
    await notification(
      db,
      String(invoice["patient_id"]),
      "payment.recorded:" + pid,
      "Payment recorded",
      "Your invoice payment has been recorded.",
      "invoice",
      id,
      String(invoice["clinic_id"]),
    );
    return invoiceDetail(db, user, id);
  });
}
