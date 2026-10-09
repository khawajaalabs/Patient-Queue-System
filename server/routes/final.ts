import { rememberSlot } from "../services/availability.ts";
import { deliverEmails } from "../services/email.ts";
import { Router } from "express";
import { z } from "zod";
import { randomUUID, createHash } from "node:crypto";
import { compare, hash } from "bcryptjs";
import { atomic, one, many, type Database, type UserRow } from "../db/database.ts";
import { ApiError, requireRole, sessionCookie, publicUser } from "../middleware/auth.ts";
import { audit, authorizeClinic, notification, idValue, stamp } from "../services/operations.ts";
import { createAppointment, appointments } from "../services/clinics.ts";
import { mutateQueue } from "../services/queueService.ts";
import {
  type DataRow,
  csv,
  dateRange,
  reportRows,
  validateSlot,
  wallTime,
} from "../services/final.ts";
import { clinicDayKey } from "../../src/domain/queue.js";
import type { Notify } from "./queue.ts";
const text = z.string().trim().max(250),
  image = z.union([
    z.literal(""),
    z
      .string()
      .url()
      .max(1000)
      .refine((s) => {
        const u = new URL(s);
        return u.protocol === "https:" && !u.username && !u.password;
      }, "Use a public HTTPS image URL."),
  ]);
export function finalRoutes(db: Database, notify: Notify) {
  const r = Router(),
    admin = requireRole(db, "admin"),
    auth = requireRole(db),
    user = (res: import("express").Response) => res.locals["user"] as UserRow;
  const send = (res: import("express").Response, data: unknown) => {
    notify("operations:updated");
    res.json({ success: true, data });
  };
  const scope = (q: Record<string, unknown>) =>
    q["clinicId"] && q["clinicId"] !== "all" ? idValue.parse(q["clinicId"]) : undefined;
  const reports = async (q: Record<string, unknown>) => {
    const range = dateRange(q);
    return reportRows(
      db,
      scope(q),
      range.from,
      range.to,
      z
        .string()
        .max(30)
        .parse(q["status"] ?? ""),
    );
  };
  r.get("/admin/analytics", admin, async (req, res) =>
    res.json({ success: true, data: await reports(req.query) }),
  );
  r.get("/admin/reports", admin, async (req, res) =>
    res.json({ success: true, data: await reports(req.query) }),
  );
  r.get("/admin/exports/:kind", admin, async (req, res) => {
    const kind = z
      .enum(["appointments", "billing", "payments", "patients", "visits"])
      .parse(req.params["kind"]);
    const data = await reports(req.query);
    let rows: Record<string, unknown>[] = [];
    if (kind === "patients")
      rows = await many(
        db,
        "SELECT u.full_name,u.email,u.phone,u.created_at FROM users u WHERE u.role='patient' AND NOT EXISTS(SELECT 1 FROM staff_profiles sp WHERE sp.user_id=u.id)" +
          (scope(req.query)
            ? " AND (EXISTS(SELECT 1 FROM appointments a WHERE a.patient_id=u.id AND a.clinic_id=?) OR EXISTS(SELECT 1 FROM encounters e WHERE e.patient_id=u.id AND e.clinic_id=?))"
            : ""),
        ...(scope(req.query) ? [scope(req.query)!, scope(req.query)!] : []),
      );
    else rows = kind === "billing" ? data.invoices : kind === "visits" ? data.visits : data[kind];
    await audit(
      db,
      user(res).id,
      "data.exported",
      kind,
      kind,
      scope(req.query) ?? null,
      "Operational metadata only",
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="queuecare-${kind}.csv"`);
    res.send("\uFEFF" + csv(rows));
  });
  r.get("/admin/search", admin, async (req, res) => {
    const term = z.string().trim().min(2).max(100).parse(req.query["q"]);
    const value = "%" + term.replace(/[!%_]/g, (x) => "!" + x) + "%";
    const results: Record<string, unknown>[] = [];
    const sets = await Promise.all([
      many<{ id: string; label: string; detail: string; clinic_id: string }>(
        db,
        "SELECT u.id,u.full_name label,u.email detail FROM users u WHERE u.role='patient' AND NOT EXISTS(SELECT 1 FROM staff_profiles s WHERE s.user_id=u.id) AND (LOWER(u.full_name) LIKE LOWER(?) ESCAPE '!' OR LOWER(u.email) LIKE LOWER(?) ESCAPE '!' OR u.phone LIKE ? ESCAPE '!') ORDER BY u.full_name LIMIT 10",
        value,
        value,
        value,
      ),
      many<{ id: string; label: string; detail: string; clinic_id: string }>(
        db,
        "SELECT id,name label,address detail FROM clinics WHERE LOWER(name) LIKE LOWER(?) ESCAPE '!' LIMIT 8",
        value,
      ),
      many<{ id: string; label: string; detail: string; clinic_id: string }>(
        db,
        "SELECT id,clinic_id,invoice_number label,status detail FROM invoices WHERE LOWER(invoice_number) LIKE LOWER(?) ESCAPE '!' LIMIT 8",
        value,
      ),
      many<{ id: string; label: string; detail: string; clinic_id: string }>(
        db,
        "SELECT a.id,a.clinic_id,a.id label,u.full_name detail FROM appointments a JOIN users u ON u.id=a.patient_id WHERE LOWER(a.id) LIKE LOWER(?) ESCAPE '!' LIMIT 8",
        value,
      ),
      many<{ id: string; label: string; detail: string; clinic_id: string }>(
        db,
        "SELECT t.id,t.token_code label,q.queue_date detail,q.clinic_id FROM tokens t JOIN daily_queues q ON q.id=t.queue_id WHERE LOWER(t.token_code) LIKE LOWER(?) ESCAPE '!' ORDER BY t.created_at DESC LIMIT 8",
        value,
      ),
    ]);
    const types = ["patient", "clinic", "invoice", "appointment", "token"];
    sets.forEach((set, index) =>
      set.forEach((x) =>
        results.push({
          ...x,
          type: types[index],
          href:
            index === 0
              ? "/admin/patient-record/" + encodeURIComponent(x.id)
              : index === 1
                ? "/admin/clinics?clinicId=" + encodeURIComponent(x.id)
                : index === 2
                  ? "/admin/billing?invoiceId=" +
                    encodeURIComponent(x.id) +
                    "&clinicId=" +
                    encodeURIComponent(x.clinic_id)
                  : index === 3
                    ? "/admin/appointments?appointmentId=" +
                      encodeURIComponent(x.id) +
                      "&clinicId=" +
                      encodeURIComponent(x.clinic_id)
                    : "/admin/history?tokenId=" +
                      encodeURIComponent(x.id) +
                      "&clinicId=" +
                      encodeURIComponent(x.clinic_id) +
                      "&date=" +
                      new Date(x.detail).toISOString().slice(0, 10),
        }),
      ),
    );
    res.json({ success: true, data: results });
  });
  r.put("/operations/appointments/:id", auth, async (req, res) => {
    const c = z
        .object({
          status: z.enum(["scheduled", "confirmed", "checked_in", "cancelled", "no_show"]),
          scheduledAt: wallTime,
        })
        .strict()
        .parse(req.body),
      id = idValue.parse(req.params["id"]),
      u = user(res);
    await atomic(db, async () => {
      const a = await one<{
        clinic_id: string;
        patient_id: string;
        status: string;
        scheduled_at: string;
      }>(db, "SELECT clinic_id,patient_id,status,scheduled_at FROM appointments WHERE id=?", id);
      if (!a) throw new ApiError(404, "NOT_FOUND", "Appointment not found.");
      await authorizeClinic(db, u, a.clinic_id, ["receptionist"]);
      if (a.status === "completed")
        throw new ApiError(409, "CLOSED", "Completed appointments cannot be changed.");
      if (
        c.scheduledAt !== a.scheduled_at ||
        (a.status === "cancelled" && !["cancelled", "no_show"].includes(c.status))
      ) {
        const slot = await validateSlot(db, a.clinic_id, c.scheduledAt, id);
        await rememberSlot(db, id, slot);
      }
      if (c.status === "checked_in") {
        if (c.scheduledAt.slice(0, 10) !== clinicDayKey())
          throw new ApiError(409, "WRONG_DAY", "Check in on the appointment date.");
        const p = await one<UserRow>(db, "SELECT * FROM users WHERE id=?", a.patient_id);
        if (!p) throw new ApiError(404, "NOT_FOUND", "Patient not found.");
        await mutateQueue(db, p, "join", {}, a.clinic_id);
      }
      await db
        .prepare("UPDATE appointments SET status=?,scheduled_at=?,updated_at=? WHERE id=?")
        .run(
          ["cancelled", "no_show"].includes(c.status) ? "cancelled" : "scheduled",
          c.scheduledAt,
          stamp(),
          id,
        );
      await db
        .prepare(
          "INSERT INTO appointment_workflow VALUES (?,?,?) ON CONFLICT(appointment_id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at",
        )
        .run(id, c.status, stamp());
      await audit(db, u.id, "appointment." + c.status, "appointment", id, a.clinic_id);
      await notification(
        db,
        a.patient_id,
        "appointment." + c.status + "." + stamp(),
        "Appointment updated",
        "Open QueueCare to view your appointment.",
        "appointment",
        id,
        a.clinic_id,
      );
    });
    send(res, { id });
  });
  r.get("/schedule", auth, async (req, res) => {
    const clinic = scope(req.query),
      u = user(res);
    if (u.role !== "admin") {
      if (!clinic) throw new ApiError(403, "FORBIDDEN", "Choose an assigned clinic.");
      await authorizeClinic(db, u, clinic, ["receptionist"]);
    }
    res.json({ success: true, data: await appointments(db, clinic) });
  });
  const follows = async (patientId?: string, clinic?: string) =>
    many<DataRow>(
      db,
      "SELECT e.id,e.patient_id,u.full_name patient_name,e.clinic_id,c.name clinic_name,e.visit_at,e.follow_up_instructions instructions,COALESCE(f.follow_up_date,CAST(e.follow_up_date AS TEXT)) follow_up_date,COALESCE(f.status,'pending') status,f.appointment_id FROM encounters e JOIN users u ON u.id=e.patient_id JOIN clinics c ON c.id=e.clinic_id LEFT JOIN follow_up_actions f ON f.encounter_id=e.id WHERE e.status='completed' AND e.follow_up_date IS NOT NULL" +
        (patientId ? " AND e.patient_id=?" : "") +
        (clinic ? " AND e.clinic_id=?" : "") +
        " ORDER BY COALESCE(f.follow_up_date,CAST(e.follow_up_date AS TEXT)) LIMIT 1000",
      ...(patientId ? [patientId] : []),
      ...(clinic ? [clinic] : []),
    );
  r.get("/admin/follow-ups", admin, async (req, res) =>
    res.json({ success: true, data: await follows(undefined, scope(req.query)) }),
  );
  r.put("/admin/follow-ups/:id", admin, async (req, res) => {
    const id = idValue.parse(req.params["id"]),
      c = z
        .object({
          action: z.enum(["contacted", "reschedule", "completed", "book"]),
          date: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional(),
          scheduledAt: wallTime.optional(),
        })
        .strict()
        .parse(req.body);
    if (
      c.date &&
      (!Number.isFinite(+new Date(c.date + "T12:00Z")) ||
        new Date(c.date + "T12:00Z").toISOString().slice(0, 10) !== c.date)
    )
      throw new ApiError(400, "INVALID_DATE", "Choose a valid follow-up date.");
    await atomic(db, async () => {
      const e = await one<{ patient_id: string; clinic_id: string; follow_up_date: unknown }>(
        db,
        "SELECT patient_id,clinic_id,follow_up_date FROM encounters WHERE id=? AND status='completed'",
        id,
      );
      if (!e || !e.follow_up_date) throw new ApiError(404, "NOT_FOUND", "Follow-up not found.");
      const previous = await one<{ follow_up_date: string | null; appointment_id: string | null }>(
        db,
        "SELECT follow_up_date,appointment_id FROM follow_up_actions WHERE encounter_id=?",
        id,
      );
      let appointment = previous?.appointment_id ?? null;
      if (c.action === "book") {
        if (!c.scheduledAt) throw new ApiError(400, "INVALID_INPUT", "Choose an appointment time.");
        appointment = (
          await createAppointment(db, e.clinic_id, user(res).id, {
            patientId: e.patient_id,
            scheduledAt: c.scheduledAt,
            reason: "Follow-up",
          })
        ).id;
      }
      if (c.action === "reschedule" && !c.date)
        throw new ApiError(400, "INVALID_INPUT", "Choose a follow-up date.");
      await db
        .prepare(
          "INSERT INTO follow_up_actions VALUES (?,?,?,?,?,?) ON CONFLICT(encounter_id) DO UPDATE SET follow_up_date=excluded.follow_up_date,status=excluded.status,appointment_id=excluded.appointment_id,updated_by=excluded.updated_by,updated_at=excluded.updated_at",
        )
        .run(
          id,
          c.date ?? previous?.follow_up_date ?? null,
          c.action === "reschedule" ? "pending" : c.action === "book" ? "booked" : c.action,
          appointment,
          user(res).id,
          stamp(),
        );
      await audit(db, user(res).id, "follow_up." + c.action, "visit", id, e.clinic_id);
      if (c.action === "reschedule")
        await notification(
          db,
          e.patient_id,
          "follow_up.updated." + stamp(),
          "Follow-up updated",
          "Your follow-up date is available in QueueCare.",
          "visit",
          id,
          e.clinic_id,
        );
    });
    send(res, { id });
  });
  r.get("/branding", async (req, res) => {
    const clinic = idValue.parse(req.query["clinicId"] ?? "northstar");
    const c = await one(
      db,
      "SELECT c.id,c.display_name,c.address,c.phone,c.doctor_name,c.opening_time,c.closing_time,c.consultation_fee,b.email,b.logo_url,b.footer,b.slot_minutes FROM clinics c LEFT JOIN clinic_branding b ON b.clinic_id=c.id WHERE c.id=?",
      clinic,
    );
    if (!c) throw new ApiError(404, "NOT_FOUND", "Clinic not found.");
    const doctor = await one(
      db,
      "SELECT d.full_name,d.title,d.specialty,d.license,d.phone,d.email,d.photo_url FROM doctor_profiles d JOIN users u ON u.id=d.user_id WHERE u.role='admin' LIMIT 1",
    );
    res.json({ success: true, data: { clinic: c, doctor: doctor ?? null } });
  });
  r.get("/admin/branding", admin, async (req, res) =>
    res.json({
      success: true,
      data: {
        doctor:
          (await one(db, "SELECT * FROM doctor_profiles WHERE user_id=?", user(res).id)) ?? {},
        clinic:
          (await one(
            db,
            "SELECT * FROM clinic_branding WHERE clinic_id=?",
            scope(req.query) ?? "northstar",
          )) ?? {},
      },
    }),
  );
  r.put("/admin/branding", admin, async (req, res) => {
    const c = z
        .object({
          doctor: z
            .object({
              full_name: text,
              title: text,
              specialty: text,
              license: text,
              phone: text,
              email: z.union([z.literal(""), z.string().email().max(254)]),
              photo_url: image,
              signature_url: image,
            })
            .strict(),
          clinic: z
            .object({
              email: z.union([z.literal(""), z.string().email().max(254)]),
              logo_url: image,
              footer: z.string().trim().max(500),
              slot_minutes: z.number().int().min(5).max(120),
            })
            .strict(),
        })
        .strict()
        .parse(req.body),
      clinic = scope(req.query);
    if (!clinic || !(await one(db, "SELECT id FROM clinics WHERE id=?", clinic)))
      throw new ApiError(400, "INVALID_CLINIC", "Choose a clinic.");
    await atomic(db, async () => {
      await db
        .prepare(
          "INSERT INTO doctor_profiles VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET full_name=excluded.full_name,title=excluded.title,specialty=excluded.specialty,license=excluded.license,phone=excluded.phone,email=excluded.email,photo_url=excluded.photo_url,signature_url=excluded.signature_url,updated_at=excluded.updated_at",
        )
        .run(
          user(res).id,
          c.doctor.full_name,
          c.doctor.title,
          c.doctor.specialty,
          c.doctor.license,
          c.doctor.phone,
          c.doctor.email,
          c.doctor.photo_url,
          c.doctor.signature_url,
          stamp(),
        );
      await db
        .prepare(
          "INSERT INTO clinic_branding VALUES (?,?,?,?,?,?) ON CONFLICT(clinic_id) DO UPDATE SET email=excluded.email,logo_url=excluded.logo_url,footer=excluded.footer,slot_minutes=excluded.slot_minutes,updated_at=excluded.updated_at",
        )
        .run(
          clinic,
          c.clinic.email,
          c.clinic.logo_url,
          c.clinic.footer,
          c.clinic.slot_minutes,
          stamp(),
        );
      await audit(db, user(res).id, "clinic.branding_updated", "clinic", clinic, clinic);
    });
    send(res, { saved: true });
  });
  r.get("/branding/signature", auth, async (_req, res) =>
    res.json({
      success: true,
      data:
        (await one(
          db,
          "SELECT signature_url FROM doctor_profiles d JOIN users u ON u.id=d.user_id WHERE u.role='admin' LIMIT 1",
        )) ?? {},
    }),
  );
  r.get("/patient/summary", requireRole(db, "patient"), async (_req, res) => {
    const id = user(res).id;
    const [appts, visits, rx, docs, bills, notes, followups] = await Promise.all([
      many(
        db,
        "SELECT a.id,a.scheduled_at,c.name clinic_name FROM appointments a JOIN clinics c ON c.id=a.clinic_id WHERE a.patient_id=? AND a.status='scheduled' AND substr(a.scheduled_at,1,10)>=? ORDER BY a.scheduled_at LIMIT 1",
        id,
        clinicDayKey(),
      ),
      many(
        db,
        "SELECT e.id,e.visit_at,c.name clinic_name FROM encounters e JOIN clinics c ON c.id=e.clinic_id WHERE e.patient_id=? AND e.status='completed' ORDER BY e.visit_at DESC LIMIT 1",
        id,
      ),
      many(
        db,
        "SELECT p.id,e.id visit_id,p.prescribed_at FROM prescriptions p JOIN encounters e ON e.id=p.encounter_id WHERE e.patient_id=? AND e.status='completed' ORDER BY p.prescribed_at DESC LIMIT 1",
        id,
      ),
      many(
        db,
        "SELECT id,title,created_at FROM patient_documents WHERE patient_id=? AND status='ready' AND patient_visible=1 ORDER BY created_at DESC LIMIT 1",
        id,
      ),
      one(
        db,
        "SELECT COALESCE(SUM(balance),0) balance FROM invoices WHERE patient_id=? AND status IN ('unpaid','partially_paid')",
        id,
      ),
      many(
        db,
        "SELECT id,title,message,read_at,created_at FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 4",
        id,
      ),
      follows(id),
    ]);
    res.json({
      success: true,
      data: {
        appointment: appts[0] ?? null,
        visit: visits[0] ?? null,
        prescription: rx[0] ?? null,
        document: docs[0] ?? null,
        bills,
        notifications: notes,
        followups: followups.filter((x) => x.status !== "completed"),
      },
    });
  });
  r.get("/account", auth, async (req, res) => {
    const u = user(res),
      current = createHash("sha256").update(sessionCookie(req)).digest("hex");
    const sessions = await many<{ token_hash: string; expires_at: number }>(
      db,
      "SELECT token_hash,expires_at FROM sessions WHERE user_id=? AND expires_at>? ORDER BY expires_at DESC",
      u.id,
      Date.now(),
    );
    res.json({
      success: true,
      data: {
        profile: publicUser(u),
        googleLinked: !!(await one(
          db,
          "SELECT provider_subject FROM google_identities WHERE user_id=?",
          u.id,
        )),
        sessions: sessions.map((s) => ({
          expiresAt: Number(s.expires_at),
          current: s.token_hash === current,
        })),
      },
    });
  });
  r.post("/account/revoke-sessions", auth, async (req, res) => {
    await atomic(db, async () => {
      await db
        .prepare("DELETE FROM sessions WHERE user_id=? AND token_hash<>?")
        .run(user(res).id, createHash("sha256").update(sessionCookie(req)).digest("hex"));
      await audit(db, user(res).id, "account.sessions_revoked", "user", user(res).id);
    });
    send(res, { revoked: true });
  });
  r.put("/account/password", auth, async (req, res) => {
    const p = z
        .string()
        .min(12)
        .max(72)
        .refine((x) => Buffer.byteLength(x, "utf8") <= 72),
      c = z
        .object({ currentPassword: z.string().max(72), newPassword: p })
        .strict()
        .parse(req.body),
      u = user(res);
    if (!(await compare(c.currentPassword, u.password_hash)))
      throw new ApiError(400, "INVALID_PASSWORD", "Current password is incorrect.");
    const encoded = await hash(c.newPassword, 12);
    await atomic(db, async () => {
      const changed = (await db
        .prepare("UPDATE users SET password_hash=?,updated_at=? WHERE id=? AND password_hash=?")
        .run(encoded, stamp(), u.id, u.password_hash)) as { changes: number };
      if (changed.changes !== 1)
        throw new ApiError(409, "ACCOUNT_CHANGED", "Your account changed. Please sign in again.");
      await db
        .prepare("DELETE FROM sessions WHERE user_id=? AND token_hash<>?")
        .run(u.id, createHash("sha256").update(sessionCookie(req)).digest("hex"));
      await audit(db, u.id, "account.password_changed", "user", u.id);
    });
    send(res, { changed: true });
  });
  r.get("/admin/email-status", admin, async (_req, res) =>
    res.json({
      success: true,
      data: {
        provider:
          process.env["EMAIL_PROVIDER"] === "resend" &&
          !!process.env["EMAIL_API_KEY"] &&
          !!process.env["EMAIL_FROM"]
            ? "resend"
            : "not_configured",
        pending: await one(
          db,
          "SELECT COUNT(*) count FROM email_delivery_log WHERE status='pending'",
        ),
        statuses: await many(
          db,
          "SELECT status,COUNT(*) count FROM email_delivery_log GROUP BY status",
        ),
      },
    }),
  );
  r.post("/admin/email-delivery", admin, async (_req, res) => {
    const result = await deliverEmails(db);
    await audit(db, user(res).id, "email.delivery_requested", "email", "batch");
    send(res, result);
  });
  return r;
}
