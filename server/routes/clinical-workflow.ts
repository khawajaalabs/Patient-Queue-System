import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { atomic, one, many, type Database, type UserRow } from "../db/database.ts";
import { ApiError, requireRole } from "../middleware/auth.ts";
import { audit, authorizeClinic, idValue, stamp } from "../services/operations.ts";
import {
  actualMime,
  SupabaseDocumentStorage,
  type DocumentStorage,
} from "../services/document-storage.ts";
const fileSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    type: z.enum([
      "lab_report",
      "imaging_report",
      "old_prescription",
      "referral",
      "medical_document",
      "other",
    ]),
    filename: z.string().min(1).max(240),
    mime: z.enum(["application/pdf", "image/jpeg", "image/png"]),
    size: z.number().int().min(1).max(10485760),
  })
  .strict();
const medicineSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    strength: z.string().trim().max(120).default(""),
    dosageForm: z.string().trim().max(120).default(""),
    defaultDose: z.string().trim().max(120).default(""),
    defaultFrequency: z.string().trim().max(120).default(""),
    defaultDuration: z.string().trim().max(120).default(""),
    defaultInstructions: z.string().trim().max(300).default(""),
    active: z.boolean().default(true),
  })
  .strict();
type Row = Record<string, string | number>;
const fail = () => new ApiError(404, "NOT_FOUND", "Appointment or attachment not found.");
async function access(db: Database, u: UserRow, id: string, files = false) {
  const a = await one<Row>(
    db,
    "SELECT a.*,CASE WHEN a.status='completed' THEN 'completed' ELSE COALESCE(w.status,a.status) END status,c.name clinic_name,COALESCE(n.patient_notes,'') patient_notes FROM appointments a LEFT JOIN appointment_workflow w ON w.appointment_id=a.id JOIN clinics c ON c.id=a.clinic_id LEFT JOIN appointment_context n ON n.appointment_id=a.id WHERE a.id=?",
    id,
  );
  if (!a) throw fail();
  if (u.role === "patient") {
    if (a["patient_id"] !== u.id) throw fail();
  } else if (u.role !== "admin") {
    if (!files)
      throw new ApiError(403, "FORBIDDEN", "Clinical appointment details are restricted.");
    await authorizeClinic(db, u, String(a["clinic_id"]), ["nurse"]);
  }
  return a;
}
function dto(f: Row) {
  return {
    id: f["id"],
    title: f["title"],
    type: f["document_type"],
    filename: f["original_filename"],
    mime: f["mime_type"],
    size: f["file_size"],
    status: f["status"],
    createdAt: f["created_at"],
  };
}
function catalogDto(m: Row) {
  return {
    id: m["id"],
    clinicId: m["clinic_id"],
    name: m["name"],
    strength: m["strength"],
    dosageForm: m["dosage_form"],
    defaultDose: m["default_dose"],
    defaultFrequency: m["default_frequency"],
    defaultDuration: m["default_duration"],
    defaultInstructions: m["default_instructions"],
    active: m["active"] === 1,
  };
}
export function clinicalWorkflowRoutes(db: Database, provided?: DocumentStorage) {
  const r = Router(),
    auth = requireRole(db),
    admin = requireRole(db, "admin"),
    patient = requireRole(db, "patient"),
    storage = provided ?? new SupabaseDocumentStorage();
  r.use((req, _res, next) => {
    if (
      req.method !== "GET" &&
      (/^\/appointments\/[^/]+\/attachments$/.test(req.path) ||
        /^\/appointment-attachments\/[^/]+(?:\/complete)?$/.test(req.path))
    )
      return next(
        new ApiError(
          403,
          "UPLOAD_DISABLED",
          "Patient appointment uploads are no longer available.",
        ),
      );
    next();
  });
  r.get("/appointments/:id/context", auth, async (req, res) => {
    const a = await access(db, res.locals["user"], idValue.parse(req.params["id"]));
    const files = await many<Row>(
      db,
      "SELECT * FROM appointment_attachments WHERE appointment_id=? AND status<>'discarded' ORDER BY created_at",
      String(a["id"]),
    );
    res.json({
      success: true,
      data: {
        id: a["id"],
        clinicId: a["clinic_id"],
        clinicName: a["clinic_name"],
        patientId: a["patient_id"],
        scheduledAt: a["scheduled_at"],
        status: a["status"],
        reason: a["reason"],
        patientNotes: a["patient_notes"],
        attachments: files.map(dto),
      },
    });
  });
  r.get("/appointments/:id/attachments", auth, async (req, res) => {
    const a = await access(db, res.locals["user"], idValue.parse(req.params["id"]), true);
    const files = await many<Row>(
      db,
      "SELECT * FROM appointment_attachments WHERE appointment_id=? AND status='ready' ORDER BY created_at",
      String(a["id"]),
    );
    res.json({ success: true, data: files.map(dto) });
  });
  r.post("/appointments/:id/attachments", patient, async (req, res) => {
    const c = fileSchema.parse(req.body),
      u = res.locals["user"] as UserRow,
      id = randomUUID(),
      path = "appointments/" + randomUUID() + "/" + id;
    await atomic(db, async () => {
      const a = await access(db, u, idValue.parse(req.params["id"]));
      if (!["scheduled", "confirmed", "checked_in"].includes(String(a["status"])))
        throw new ApiError(
          409,
          "APPOINTMENT_CLOSED",
          "Attachments can only be added to an upcoming appointment.",
        );
      const count = await one<{ n: number }>(
        db,
        "SELECT CAST(COUNT(*) AS INTEGER) n FROM appointment_attachments WHERE appointment_id=? AND status IN ('ready','pending')",
        String(a["id"]),
      );
      if (count!.n >= 10)
        throw new ApiError(400, "ATTACHMENT_LIMIT", "An appointment can contain up to 10 files.");
      await db
        .prepare("INSERT INTO appointment_attachments VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(
          id,
          String(a["id"]),
          u.id,
          String(a["clinic_id"]),
          u.id,
          c.title,
          c.type,
          c.filename,
          c.mime,
          c.size,
          path,
          "pending",
          Date.now() + 2 * 60 * 60 * 1000,
          stamp(),
          stamp(),
        );
    });
    try {
      res
        .status(201)
        .json({ success: true, data: { id, uploadUrl: await storage.uploadUrl(path) } });
    } catch (e) {
      await db
        .prepare("UPDATE appointment_attachments SET status='failed',updated_at=? WHERE id=?")
        .run(stamp(), id);
      throw e;
    }
  });
  async function attachment(u: UserRow, id: string) {
    const f = await one<Row>(db, "SELECT * FROM appointment_attachments WHERE id=?", id);
    if (!f) throw fail();
    await access(db, u, String(f["appointment_id"]), true);
    return f;
  }
  r.post("/appointment-attachments/:id/complete", patient, async (req, res) => {
    const u = res.locals["user"] as UserRow,
      f = await attachment(u, idValue.parse(req.params["id"]));
    if (f["status"] === "ready") {
      res.json({ success: true, data: dto(f) });
      return;
    }
    if (f["status"] !== "pending" || Number(f["expires_at"]) < Date.now())
      throw new ApiError(409, "UPLOAD_EXPIRED", "Prepare a new upload and try again.");
    try {
      const bytes = await storage.read(String(f["storage_path"]));
      if (
        bytes.length !== f["file_size"] ||
        bytes.length > 10485760 ||
        actualMime(bytes) !== f["mime_type"]
      )
        throw new ApiError(
          400,
          "INVALID_FILE",
          "File contents do not match the declared PDF, JPEG or PNG.",
        );
      await atomic(db, async () => {
        const current = await attachment(u, String(f["id"]));
        if (current["status"] === "ready") return;
        if (current["status"] !== "pending" || Number(current["expires_at"]) < Date.now())
          throw new ApiError(409, "UPLOAD_EXPIRED", "This upload is no longer pending.");
        await db
          .prepare("UPDATE appointment_attachments SET status='ready',updated_at=? WHERE id=?")
          .run(stamp(), String(f["id"]));
        await audit(
          db,
          u.id,
          "appointment.file_uploaded",
          "appointment_attachment",
          String(f["id"]),
          String(f["clinic_id"]),
        );
      });
      res.json({ success: true, data: dto({ ...f, status: "ready" }) });
    } catch (e) {
      await db
        .prepare(
          "UPDATE appointment_attachments SET status='failed',updated_at=? WHERE id=? AND status='pending'",
        )
        .run(stamp(), String(f["id"]));
      try {
        const current = await one<Row>(
          db,
          "SELECT status FROM appointment_attachments WHERE id=?",
          String(f["id"]),
        );
        if (current?.["status"] !== "ready") await storage.remove(String(f["storage_path"]));
      } catch {
        /* Keep the tracked path for cleanup retry. */
      }
      throw e;
    }
  });
  r.delete("/appointment-attachments/:id", patient, async (req, res) => {
    const f = await attachment(res.locals["user"], idValue.parse(req.params["id"]));
    await atomic(db, async () => {
      const current = await attachment(res.locals["user"], String(f["id"]));
      if (current["status"] === "ready")
        throw new ApiError(
          409,
          "READ_ONLY",
          "Uploaded clinical files are retained with the appointment.",
        );
      await db
        .prepare("UPDATE appointment_attachments SET status='discarded',updated_at=? WHERE id=?")
        .run(stamp(), String(f["id"]));
    });
    await storage.remove(String(f["storage_path"]));
    res.json({ success: true, data: { discarded: true } });
  });
  r.get("/appointment-attachments/:id/download", auth, async (req, res) => {
    const f = await attachment(res.locals["user"], idValue.parse(req.params["id"]));
    if (f["status"] !== "ready") throw fail();
    const url = await storage.signedUrl(String(f["storage_path"]));
    await audit(
      db,
      res.locals["user"].id,
      "appointment.file_accessed",
      "appointment_attachment",
      String(f["id"]),
      String(f["clinic_id"]),
    );
    res.json({ success: true, data: { url } });
  });
  r.post("/admin/appointment-attachments/cleanup", admin, async (_req, res) => {
    const files = await many<Row>(
      db,
      "SELECT * FROM appointment_attachments WHERE status<>'ready' AND expires_at>0 AND expires_at<? ORDER BY expires_at LIMIT 25",
      Date.now(),
    );
    let removed = 0;
    for (const f of files) {
      try {
        await storage.remove(String(f["storage_path"]));
        await db
          .prepare(
            "UPDATE appointment_attachments SET status='discarded',expires_at=0,updated_at=? WHERE id=? AND status<>'ready'",
          )
          .run(stamp(), String(f["id"]));
        removed++;
      } catch {
        /* Retry on the next explicitly requested cleanup. */
      }
    }
    res.json({ success: true, data: { removed, failed: files.length - removed } });
  });
  r.get("/admin/medicine-library", admin, async (req, res) => {
    const clinic = idValue.parse(req.query["clinicId"]);
    const q = z
      .string()
      .max(160)
      .parse(req.query["q"] ?? "")
      .toLowerCase();
    const rows = await many<Row>(
      db,
      "SELECT * FROM medicine_catalog WHERE clinic_id=? ORDER BY name LIMIT 500",
      clinic,
    );
    res.json({
      success: true,
      data: rows.filter((m) => String(m["name"]).toLowerCase().includes(q)).map(catalogDto),
    });
  });
  r.post("/admin/medicine-library", admin, async (req, res) => {
    const clinic = idValue.parse(req.query["clinicId"]),
      c = medicineSchema.parse(req.body),
      id = randomUUID();
    await atomic(db, async () => {
      if (!(await one(db, "SELECT id FROM clinics WHERE id=?", clinic))) throw fail();
      await db
        .prepare("INSERT INTO medicine_catalog VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(
          id,
          clinic,
          c.name,
          c.strength,
          c.dosageForm,
          c.defaultDose,
          c.defaultFrequency,
          c.defaultDuration,
          c.defaultInstructions,
          c.active ? 1 : 0,
          stamp(),
          stamp(),
        );
      await audit(db, res.locals["user"].id, "medicine.created", "medicine", id, clinic);
    });
    res.status(201).json({
      success: true,
      data: catalogDto((await one<Row>(db, "SELECT * FROM medicine_catalog WHERE id=?", id))!),
    });
  });
  r.put("/admin/medicine-library/:id", admin, async (req, res) => {
    const id = idValue.parse(req.params["id"]),
      c = medicineSchema.parse(req.body);
    await atomic(db, async () => {
      const m = await one<Row>(db, "SELECT * FROM medicine_catalog WHERE id=?", id);
      if (!m) throw fail();
      await db
        .prepare(
          "UPDATE medicine_catalog SET name=?,strength=?,dosage_form=?,default_dose=?,default_frequency=?,default_duration=?,default_instructions=?,active=?,updated_at=? WHERE id=?",
        )
        .run(
          c.name,
          c.strength,
          c.dosageForm,
          c.defaultDose,
          c.defaultFrequency,
          c.defaultDuration,
          c.defaultInstructions,
          c.active ? 1 : 0,
          stamp(),
          id,
        );
      await audit(
        db,
        res.locals["user"].id,
        c.active ? "medicine.updated" : "medicine.deactivated",
        "medicine",
        id,
        String(m["clinic_id"]),
      );
    });
    res.json({
      success: true,
      data: catalogDto((await one<Row>(db, "SELECT * FROM medicine_catalog WHERE id=?", id))!),
    });
  });
  return r;
}
