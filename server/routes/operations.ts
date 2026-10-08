import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { atomic, one, many, type Database, type UserRow } from "../db/database.ts";
import { ApiError, requireRole } from "../middleware/auth.ts";
import {
  authorizeClinic,
  patientInClinic,
  staffList,
  saveStaff,
  createInvoice,
  invoiceDetail,
  recordPayment,
  audit,
  notification,
  idValue,
  stamp,
} from "../services/operations.ts";
import {
  SupabaseDocumentStorage,
  actualMime,
  type DocumentStorage,
} from "../services/document-storage.ts";
import { adminState, mutateQueue, type QueueAction } from "../services/queueService.ts";
import { appointments, createAppointment } from "../services/clinics.ts";
import { profile, saveProfile, startVisit, recordSchema } from "../services/clinical.ts";
import { clinicDayKey } from "../../src/domain/queue.js";
import type { Notify } from "./queue.ts";
export function operationsRoutes(
  db: Database,
  notify: Notify,
  storage: DocumentStorage = new SupabaseDocumentStorage(),
) {
  const r = Router(),
    user = (res: import("express").Response) => res.locals["user"] as UserRow,
    scope = (req: import("express").Request) => idValue.parse(req.query["clinicId"] ?? "northstar"),
    id = (req: import("express").Request) => idValue.parse(req.params["id"]);
  const send = (res: import("express").Response, data: unknown, status = 200) => {
    notify("operations:updated");
    res.status(status).json({ success: true, data });
  };
  r.get("/admin/staff", requireRole(db, "admin"), async (_req, res) =>
    res.json({ success: true, data: await staffList(db) }),
  );
  r.post("/admin/staff", requireRole(db, "admin"), async (req, res) =>
    send(res, await saveStaff(db, user(res), req.body), 201),
  );
  r.put("/admin/staff/:id", requireRole(db, "admin"), async (req, res) =>
    send(res, await saveStaff(db, user(res), req.body, id(req))),
  );
  r.get("/patient/appointments", requireRole(db, "patient"), async (_req, res) => {
    const rows = await many<Record<string, unknown>>(
      db,
      "SELECT a.*,CASE WHEN a.status='completed' THEN 'completed' ELSE COALESCE(w.status,a.status) END status,c.name clinic_name FROM appointments a JOIN clinics c ON c.id=a.clinic_id LEFT JOIN appointment_workflow w ON w.appointment_id=a.id WHERE a.patient_id=? ORDER BY a.scheduled_at DESC LIMIT 200",
      user(res).id,
    );
    res.json({
      success: true,
      data: rows.map((a) => ({
        id: a["id"],
        clinicId: a["clinic_id"],
        clinicName: a["clinic_name"],
        patientId: a["patient_id"],
        patientName: user(res).full_name,
        scheduledAt: a["scheduled_at"],
        status: a["status"],
        reason: a["reason"],
      })),
    });
  });
  r.get("/staff/patient-lookup", requireRole(db), async (req, res) => {
    await authorizeClinic(db, user(res), scope(req));
    const email = z
      .string()
      .trim()
      .email()
      .transform((s) => s.toLowerCase())
      .parse(req.query["email"]);
    const p = await one<{ id: string; name: string }>(
      db,
      "SELECT id,full_name name FROM users u WHERE email=? AND role='patient' AND NOT EXISTS(SELECT 1 FROM staff_profiles sp WHERE sp.user_id=u.id)",
      email,
    );
    if (!p) throw new ApiError(404, "NOT_FOUND", "No registered patient matches this email.");
    await audit(db, user(res).id, "patient.lookup", "patient", p.id, scope(req));
    res.json({ success: true, data: p });
  });
  r.get("/staff/clinics", requireRole(db), async (_req, res) => {
    const u = user(res);
    if (!["receptionist", "nurse"].includes(u.role))
      throw new ApiError(403, "FORBIDDEN", "Staff account required.");
    res.json({
      success: true,
      data: await many(
        db,
        "SELECT c.id,c.name,c.active,c.consultation_fee FROM clinics c JOIN staff_clinics s ON s.clinic_id=c.id WHERE s.staff_id=? ORDER BY c.name",
        u.id,
      ),
    });
  });
  r.get("/staff/state", requireRole(db), async (req, res) => {
    const u = user(res),
      clinic = scope(req);
    await authorizeClinic(db, u, clinic);
    const state = await adminState(db, clinicDayKey(), clinic);
    res.json({
      success: true,
      data: {
        clinic: state.clinic,
        queue: state.queue.map((t) => ({
          id: t.id,
          patientId: t.patientId,
          patientName: t.patientName,
          phone: t.phone,
          tokenCode: t.tokenCode,
          status: t.status,
        })),
        patients: await many(
          db,
          "SELECT u.id,u.full_name name,u.phone FROM users u WHERE u.role='patient' AND NOT EXISTS(SELECT 1 FROM staff_profiles sp WHERE sp.user_id=u.id) AND (EXISTS(SELECT 1 FROM tokens t JOIN daily_queues q ON q.id=t.queue_id WHERE t.patient_id=u.id AND q.clinic_id=?) OR EXISTS(SELECT 1 FROM appointments a WHERE a.patient_id=u.id AND a.clinic_id=?) OR EXISTS(SELECT 1 FROM encounters e WHERE e.patient_id=u.id AND e.clinic_id=?)) ORDER BY u.full_name LIMIT 500",
          clinic,
          clinic,
          clinic,
        ),
        appointments: await appointments(db, clinic),
      },
    });
  });
  r.get("/staff/patients/:id", requireRole(db), async (req, res) => {
    await patientInClinic(db, user(res), id(req), scope(req));
    const p = await profile(db, id(req));
    const {
      allergies: _,
      chronicConditions: __,
      currentMedications: ___,
      generalNotes: ____,
      ...demographics
    } = p;
    res.json({ success: true, data: demographics });
  });
  r.put("/staff/patients/:id", requireRole(db), async (req, res) => {
    await patientInClinic(db, user(res), id(req), scope(req));
    const data = await saveProfile(db, id(req), req.body, false, user(res).id);
    const {
      allergies: _,
      chronicConditions: __,
      currentMedications: ___,
      generalNotes: ____,
      ...demographics
    } = data;
    send(res, demographics);
  });
  r.post("/staff/appointments", requireRole(db), async (req, res) => {
    const u = user(res);
    await authorizeClinic(db, u, scope(req), ["receptionist"]);
    await patientInClinic(db, u, idValue.parse(req.body.patientId), scope(req));
    send(res, await createAppointment(db, scope(req), u.id, req.body), 201);
  });
  r.put("/operations/appointments/:id", requireRole(db), async (req, res) => {
    const u = user(res),
      c = z
        .object({
          status: z.enum(["scheduled", "cancelled"]),
          scheduledAt: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
            .refine((s) => {
              const d = new Date(s + ":00Z");
              return !isNaN(d.getTime()) && d.toISOString().slice(0, 16) === s;
            }),
        })
        .strict()
        .parse(req.body);
    const a = await one<{ clinic_id: string; patient_id: string; status: string }>(
      db,
      "SELECT clinic_id,patient_id,status FROM appointments WHERE id=?",
      id(req),
    );
    if (!a) throw new ApiError(404, "NOT_FOUND", "Appointment not found.");
    await authorizeClinic(db, u, a.clinic_id, ["receptionist"]);
    if (a.status === "completed")
      throw new ApiError(409, "CLOSED", "Completed appointments cannot be changed.");
    await atomic(db, async () => {
      await db
        .prepare("UPDATE appointments SET status=?,scheduled_at=?,updated_at=? WHERE id=?")
        .run(c.status, c.scheduledAt, stamp(), id(req));
      await audit(db, u.id, "appointment." + c.status, "appointment", id(req), a.clinic_id);
      await notification(
        db,
        a.patient_id,
        "appointment." + c.status + "." + c.scheduledAt,
        "Appointment updated",
        "Your appointment schedule has changed.",
        "appointment",
        id(req),
        a.clinic_id,
      );
    });
    send(res, { id: id(req) });
  });
  r.post("/staff/check-in", requireRole(db), async (req, res) => {
    const c = z
        .object({ patientId: idValue, reason: z.string().trim().max(300) })
        .strict()
        .parse(req.body),
      u = user(res),
      clinic = scope(req);
    await authorizeClinic(db, u, clinic);
    const patient = await one<UserRow>(
      db,
      "SELECT * FROM users u WHERE id=? AND role='patient' AND NOT EXISTS(SELECT 1 FROM staff_profiles s WHERE s.user_id=u.id)",
      c.patientId,
    );
    if (!patient) throw new ApiError(404, "NOT_FOUND", "Patient not found.");
    const result = await mutateQueue(db, patient!, "join", { reason: c.reason }, clinic);
    await audit(db, u.id, "patient.checked_in", "token", result.id, clinic);
    send(res, result);
  });
  r.post("/staff/queue/:id", requireRole(db), async (req, res) => {
    const u = user(res),
      clinic = scope(req);
    await authorizeClinic(db, u, clinic);
    const action = z
      .enum(["open", "close", "callNext", "callAgain", "skip", "requeue"])
      .parse(id(req));
    const input = z
      .object({
        token: z
          .string()
          .regex(/^[A-Z]{1,5}-[0-9]{3}$/)
          .optional(),
      })
      .strict()
      .parse(req.body);
    send(res, await mutateQueue(db, u, action as QueueAction, input, clinic));
  });
  r.post("/staff/prepare", requireRole(db), async (req, res) => {
    const u = user(res),
      c = z
        .object({
          patientId: idValue,
          tokenId: idValue.optional(),
          appointmentId: idValue.optional(),
        })
        .strict()
        .parse(req.body),
      clinic = scope(req);
    await authorizeClinic(db, u, clinic, ["nurse"]);
    await patientInClinic(db, u, c.patientId, clinic);
    const doctor = await one<{ id: string }>(
      db,
      "SELECT id FROM users WHERE role='admin' ORDER BY created_at LIMIT 1",
    );
    if (!doctor) throw new ApiError(409, "NO_DOCTOR", "The main doctor account is unavailable.");
    const v = await startVisit(
      db,
      c.patientId,
      doctor.id,
      {
        clinicId: clinic,
        ...(c.tokenId ? { tokenId: c.tokenId } : {}),
        ...(c.appointmentId ? { appointmentId: c.appointmentId } : {}),
      },
      u.id,
    );
    send(res, { id: v.id });
  });
  r.get("/staff/preparations/:id", requireRole(db), async (req, res) => {
    const e = await one<{ id: string; patient_id: string; clinic_id: string; status: string }>(
      db,
      "SELECT id,patient_id,clinic_id,status,reason_for_visit,chief_complaint FROM encounters WHERE id=?",
      id(req),
    );
    if (!e) throw new ApiError(404, "NOT_FOUND", "Consultation not found.");
    await authorizeClinic(db, user(res), e.clinic_id, ["nurse"]);
    res.json({
      success: true,
      data: {
        ...e,
        vitals:
          (await one(
            db,
            "SELECT systolic,diastolic,pulse,temperature,respiratory_rate,oxygen_saturation,weight,height FROM visit_vitals WHERE encounter_id=?",
            e.id,
          )) ?? null,
      },
    });
  });
  r.put("/staff/preparations/:id", requireRole(db), async (req, res) => {
    const u = user(res),
      c = z
        .object({
          reasonForVisit: z.string().trim().max(2000),
          chiefComplaint: z.string().trim().max(2000),
          vitals: recordSchema.shape.vitals,
        })
        .strict()
        .parse(req.body);
    await atomic(db, async () => {
      const e = await one<{ clinic_id: string; status: string }>(
        db,
        "SELECT clinic_id,status FROM encounters WHERE id=?",
        id(req),
      );
      if (!e) throw new ApiError(404, "NOT_FOUND", "Consultation not found.");
      await authorizeClinic(db, u, e.clinic_id, ["nurse"]);
      if (e.status !== "in_progress")
        throw new ApiError(409, "CLOSED", "Completed visits are read-only.");
      await db
        .prepare(
          "UPDATE encounters SET reason_for_visit=?,chief_complaint=?,updated_at=? WHERE id=?",
        )
        .run(c.reasonForVisit, c.chiefComplaint, stamp(), id(req));
      const v = c.vitals;
      await db
        .prepare(
          "INSERT INTO visit_vitals VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(encounter_id) DO UPDATE SET systolic=excluded.systolic,diastolic=excluded.diastolic,pulse=excluded.pulse,temperature=excluded.temperature,respiratory_rate=excluded.respiratory_rate,oxygen_saturation=excluded.oxygen_saturation,weight=excluded.weight,height=excluded.height",
        )
        .run(
          id(req),
          v.systolic,
          v.diastolic,
          v.pulse,
          v.temperature,
          v.respiratoryRate,
          v.oxygenSaturation,
          v.weight,
          v.height,
        );
      await audit(
        db,
        u.id,
        "vitals.updated",
        "visit",
        id(req),
        e.clinic_id,
        "Consultation preparation saved.",
      );
    });
    send(res, { id: id(req) });
  });
  r.get("/billing/invoices", requireRole(db), async (req, res) => {
    const u = user(res),
      clinic = scope(req);
    let where = "",
      args: string[] = [];
    if (u.role === "patient") {
      where = "WHERE i.patient_id=? AND i.status<>'draft'";
      args = [u.id];
    } else {
      if (clinic !== "all" || u.role !== "admin") {
        await authorizeClinic(db, u, clinic, ["receptionist"]);
        where = "WHERE i.clinic_id=?";
        args = [clinic];
      }
    }
    res.json({
      success: true,
      data: await many(
        db,
        "SELECT i.*,u.full_name patient_name,c.name clinic_name FROM invoices i JOIN users u ON u.id=i.patient_id JOIN clinics c ON c.id=i.clinic_id " +
          where +
          " ORDER BY i.created_at DESC LIMIT 200",
        ...args,
      ),
    });
  });
  r.get("/billing/invoices/:id", requireRole(db), async (req, res) =>
    res.json({ success: true, data: await invoiceDetail(db, user(res), id(req)) }),
  );
  r.post("/billing/invoices", requireRole(db), async (req, res) =>
    send(res, await createInvoice(db, user(res), req.body), 201),
  );
  r.put("/billing/invoices/:id", requireRole(db), async (req, res) =>
    send(res, await createInvoice(db, user(res), req.body, id(req))),
  );
  r.post("/billing/invoices/:id/payments", requireRole(db), async (req, res) =>
    send(res, await recordPayment(db, user(res), id(req), req.body), 201),
  );
  r.post("/billing/invoices/:id/void", requireRole(db), async (req, res) => {
    z.object({}).strict().parse(req.body);
    await atomic(db, async () => {
      const i = await invoiceDetail(db, user(res), id(req));
      if (user(res).role === "patient")
        throw new ApiError(403, "FORBIDDEN", "Only billing staff can void invoices.");
      if (Number(i["amount_paid"]) > 0)
        throw new ApiError(409, "PAYMENTS_EXIST", "An invoice with payments cannot be voided.");
      await db
        .prepare("UPDATE invoices SET status='void',updated_at=? WHERE id=?")
        .run(stamp(), id(req));
      await audit(db, user(res).id, "invoice.voided", "invoice", id(req), String(i["clinic_id"]));
    });
    send(res, await invoiceDetail(db, user(res), id(req)));
  });
  const docColumns =
    "d.id,d.patient_id,d.clinic_id,d.visit_id,d.document_type,d.title,d.description,d.original_filename,d.mime_type,d.file_size,d.patient_visible,d.created_at,c.name clinic_name";
  async function document(u: UserRow, docId: string, write = false) {
    const d = await one<Record<string, unknown>>(
      db,
      "SELECT * FROM patient_documents WHERE id=?",
      docId,
    );
    if (!d) throw new ApiError(404, "NOT_FOUND", "Document not found.");
    if (u.role === "patient") {
      if (
        write ||
        d["patient_id"] !== u.id ||
        d["status"] !== "ready" ||
        Number(d["patient_visible"]) !== 1
      )
        throw new ApiError(404, "NOT_FOUND", "Document not found.");
    } else await authorizeClinic(db, u, String(d["clinic_id"]), ["nurse"]);
    return d;
  }
  r.get("/documents", requireRole(db), async (req, res) => {
    const u = user(res),
      clinic = scope(req),
      patient = req.query["patientId"] ? idValue.parse(req.query["patientId"]) : null,
      visit = req.query["visitId"] ? idValue.parse(req.query["visitId"]) : null;
    let where = "d.status='ready'",
      args: string[] = [];
    if (u.role === "patient") {
      where += " AND d.patient_id=? AND d.patient_visible=1";
      args.push(u.id);
    } else if (clinic !== "all" || u.role !== "admin") {
      await authorizeClinic(db, u, clinic, ["nurse"]);
      where += " AND d.clinic_id=?";
      args.push(clinic);
    }
    if (patient) {
      where += " AND d.patient_id=?";
      args.push(patient);
    }
    if (visit) {
      where += " AND d.visit_id=?";
      args.push(visit);
    }
    res.json({
      success: true,
      data: await many(
        db,
        "SELECT " +
          docColumns +
          " FROM patient_documents d JOIN clinics c ON c.id=d.clinic_id WHERE " +
          where +
          " ORDER BY d.created_at DESC LIMIT 200",
        ...args,
      ),
    });
  });
  r.post("/documents/upload", requireRole(db), async (req, res) => {
    const u = user(res),
      c = z
        .object({
          patientId: idValue,
          clinicId: idValue,
          visitId: idValue.nullable(),
          documentType: z.enum([
            "lab_report",
            "imaging_report",
            "referral",
            "medical_document",
            "other",
          ]),
          title: z.string().trim().min(1).max(160),
          description: z.string().trim().max(1000),
          filename: z.string().trim().min(1).max(200),
          mimeType: z.enum(["application/pdf", "image/jpeg", "image/png"]),
          fileSize: z.number().int().min(1).max(10485760),
        })
        .strict()
        .parse(req.body);
    await authorizeClinic(db, u, c.clinicId, ["nurse"]);
    await patientInClinic(db, u, c.patientId, c.clinicId);
    if (
      c.visitId &&
      !(await one(
        db,
        "SELECT id FROM encounters WHERE id=? AND clinic_id=? AND patient_id=?",
        c.visitId,
        c.clinicId,
        c.patientId,
      ))
    )
      throw new ApiError(400, "INVALID_VISIT", "Choose a matching visit.");
    const uid = randomUUID(),
      path = c.clinicId + "/" + c.patientId + "/" + uid + "/" + randomUUID();
    await db
      .prepare(
        "INSERT INTO patient_documents(id,patient_id,clinic_id,visit_id,uploaded_by,document_type,title,description,storage_path,original_filename,mime_type,file_size,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      )
      .run(
        uid,
        c.patientId,
        c.clinicId,
        c.visitId,
        u.id,
        c.documentType,
        c.title,
        c.description,
        path,
        c.filename.replace(/[\\/\r\n]/g, "_"),
        c.mimeType,
        c.fileSize,
        stamp(),
        stamp(),
      );
    try {
      send(res, { id: uid, url: await storage.uploadUrl(path) }, 201);
    } catch (e) {
      await db.prepare("DELETE FROM patient_documents WHERE id=?").run(uid);
      throw e;
    }
  });
  r.post("/documents/:id/complete", requireRole(db), async (req, res) => {
    z.object({}).strict().parse(req.body);
    const u = user(res),
      d = await document(u, id(req), true);
    if (d["status"] === "ready") return send(res, { id: id(req) });
    if (d["uploaded_by"] !== u.id && u.role !== "admin")
      throw new ApiError(403, "FORBIDDEN", "Only the uploader can finish this upload.");
    try {
      const data = await storage.read(String(d["storage_path"]));
      if (
        data.length !== Number(d["file_size"]) ||
        data.length > 10485760 ||
        actualMime(data) !== d["mime_type"]
      )
        throw new ApiError(400, "INVALID_FILE", "File content or size does not match the upload.");
    } catch (e) {
      await storage.remove(String(d["storage_path"]));
      await db
        .prepare("DELETE FROM patient_documents WHERE id=? AND status='pending'")
        .run(id(req));
      throw e;
    }
    await atomic(db, async () => {
      await db
        .prepare("UPDATE patient_documents SET status='ready',updated_at=? WHERE id=?")
        .run(stamp(), id(req));
      await audit(db, u.id, "document.uploaded", "document", id(req), String(d["clinic_id"]));
    });
    send(res, { id: id(req) });
  });
  r.put("/documents/:id/release", requireRole(db, "admin"), async (req, res) => {
    const c = z.object({ patientVisible: z.boolean() }).strict().parse(req.body),
      d = await document(user(res), id(req), true);
    if (d["status"] !== "ready") throw new ApiError(409, "PENDING", "Finish the upload first.");
    await atomic(db, async () => {
      await db
        .prepare("UPDATE patient_documents SET patient_visible=?,updated_at=? WHERE id=?")
        .run(c.patientVisible ? 1 : 0, stamp(), id(req));
      await audit(
        db,
        user(res).id,
        "document.released",
        "document",
        id(req),
        String(d["clinic_id"]),
        c.patientVisible ? "Released to patient." : "Release withdrawn.",
      );
      if (c.patientVisible)
        await notification(
          db,
          String(d["patient_id"]),
          "document.released",
          "Document available",
          "A document has been released to your patient portal.",
          "document",
          id(req),
          String(d["clinic_id"]),
        );
    });
    send(res, { id: id(req) });
  });
  r.get("/documents/:id/download", requireRole(db), async (req, res) => {
    const d = await document(user(res), id(req));
    if (d["status"] !== "ready") throw new ApiError(404, "NOT_FOUND", "Document not found.");
    const url = await storage.signedUrl(String(d["storage_path"]));
    await audit(db, user(res).id, "document.accessed", "document", id(req), String(d["clinic_id"]));
    res.json({ success: true, data: { url, expiresIn: 60 } });
  });
  r.delete("/documents/:id/pending", requireRole(db), async (req, res) => {
    const d = await document(user(res), id(req), true);
    if (
      d["status"] !== "pending" ||
      (d["uploaded_by"] !== user(res).id && user(res).role !== "admin")
    )
      throw new ApiError(403, "FORBIDDEN", "Only pending uploads can be discarded.");
    await storage.remove(String(d["storage_path"]));
    await db.prepare("DELETE FROM patient_documents WHERE id=? AND status='pending'").run(id(req));
    send(res, null);
  });
  r.get("/notifications", requireRole(db), async (_req, res) =>
    res.json({
      success: true,
      data: await many(
        db,
        "SELECT id,type,title,message,entity_type,entity_id,clinic_id,read_at,created_at FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100",
        user(res).id,
      ),
    }),
  );
  r.post("/notifications/read-all", requireRole(db), async (req, res) => {
    z.object({}).strict().parse(req.body);
    await db
      .prepare("UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL")
      .run(stamp(), user(res).id);
    send(res, null);
  });
  r.post("/notifications/:id/read", requireRole(db), async (req, res) => {
    z.object({}).strict().parse(req.body);
    if (
      !(await one(
        db,
        "SELECT id FROM notifications WHERE id=? AND user_id=?",
        id(req),
        user(res).id,
      ))
    )
      throw new ApiError(404, "NOT_FOUND", "Notification not found.");
    await db
      .prepare("UPDATE notifications SET read_at=COALESCE(read_at,?) WHERE id=? AND user_id=?")
      .run(stamp(), id(req), user(res).id);
    send(res, null);
  });
  r.get("/admin/activity", requireRole(db, "admin"), async (req, res) => {
    const where: string[] = [],
      args: string[] = [];
    for (const [query, column] of [
      ["clinicId", "a.clinic_id"],
      ["staffId", "a.actor_user_id"],
      ["action", "a.action"],
    ] as const)
      if (req.query[query] && req.query[query] !== "all") {
        where.push(column + "=?");
        args.push(idValue.parse(req.query[query]));
      }
    if (req.query["date"]) {
      where.push("a.created_at LIKE ?");
      args.push(
        z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .parse(req.query["date"]) + "%",
      );
    }
    res.json({
      success: true,
      data: await many(
        db,
        "SELECT a.*,u.full_name actor_name,c.name clinic_name FROM audit_logs a JOIN users u ON u.id=a.actor_user_id LEFT JOIN clinics c ON c.id=a.clinic_id " +
          (where.length ? "WHERE " + where.join(" AND ") : "") +
          " ORDER BY a.created_at DESC,a.id DESC LIMIT 200",
        ...args,
      ),
    });
  });
  return r;
}
