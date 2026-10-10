import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { atomic, one, many, type Database, type UserRow } from "../db/database.ts";
import { requireRole, ApiError } from "../middleware/auth.ts";
import { audit, idValue } from "../services/operations.ts";
import { listClinics, appointments } from "../services/clinics.ts";
import { clinicDayKey } from "../../src/domain/queue.js";
import type { Notify } from "./queue.ts";
const like = (s: string) => "%" + s.replace(/[!%_]/g, (x) => "!" + x) + "%";
const scope = (v: unknown) => (!v || v === "all" ? "all" : idValue.parse(v));
const patientScope =
  "(?='all' OR EXISTS(SELECT 1 FROM encounters e WHERE e.patient_id=u.id AND e.clinic_id=?) OR EXISTS(SELECT 1 FROM appointments a WHERE a.patient_id=u.id AND a.clinic_id=?) OR EXISTS(SELECT 1 FROM tokens t JOIN daily_queues q ON q.id=t.queue_id WHERE t.patient_id=u.id AND q.clinic_id=?))";
const patientOnly =
  "u.role='patient' AND NOT EXISTS(SELECT 1 FROM staff_profiles s WHERE s.user_id=u.id)";
export async function appointmentFlow(db: Database, clinic: string, date?: string) {
  const list = await appointments(db, clinic === "all" ? undefined : clinic, date),
    day = clinicDayKey();
  const visits = await many<{ id: string; appointment_id: string; status: string }>(
    db,
    "SELECT id,appointment_id,status FROM encounters WHERE appointment_id IS NOT NULL AND (?='all' OR clinic_id=?)",
    clinic,
    clinic,
  );
  const tokens = await many<{ id: string; patient_id: string; clinic_id: string; status: string }>(
    db,
    "SELECT t.id,t.patient_id,q.clinic_id,t.status FROM tokens t JOIN daily_queues q ON q.id=t.queue_id WHERE q.queue_date=? AND (?='all' OR q.clinic_id=?) AND t.status IN ('waiting','serving','skipped')",
    day,
    clinic,
    clinic,
  );
  return list.map((a) => {
    const visit = visits.find((v) => v.appointment_id === a.id),
      token = a.scheduledAt.startsWith(day)
        ? tokens.find((t) => t.patient_id === a.patientId && t.clinic_id === a.clinicId)
        : undefined;
    return {
      ...a,
      visitId: visit?.id,
      visitStatus: visit?.status,
      tokenId: token?.id,
      tokenStatus: token?.status,
    };
  });
}
export function workflowRoutes(db: Database, notify: Notify) {
  const r = Router(),
    admin = requireRole(db, "admin");
  r.get("/admin/appointment-flow", admin, async (req, res) =>
    res.json({ success: true, data: await appointmentFlow(db, scope(req.query["clinicId"])) }),
  );
  r.get("/admin/today", admin, async (req, res) => {
    const clinic = scope(req.query["clinicId"]),
      day = clinicDayKey(),
      clinics = await listClinics(db, true),
      active = clinics.filter((c) => c.active && (clinic === "all" || c.id === clinic));
    if (!active.length) {
      res.json({
        success: true,
        data: {
          date: day,
          clinics: [],
          setup: "clinic",
          unscheduled: [],
          appointments: [],
          queue: [],
          inProgress: [],
        },
      });
      return;
    }
    const schedules = await many<{ clinic_id: string }>(
      db,
      "SELECT DISTINCT clinic_id FROM doctor_availability",
    );
    const a = await appointmentFlow(db, clinic, day);
    const queue = await many<{
      id: string;
      patient_id: string;
      patient_name: string;
      clinic_id: string;
      clinic_name: string;
      token_code: string;
      status: string;
      reason_for_visit: string;
    }>(
      db,
      "SELECT t.id,t.patient_id,u.full_name patient_name,q.clinic_id,c.name clinic_name,t.token_code,t.status,t.reason_for_visit FROM tokens t JOIN daily_queues q ON q.id=t.queue_id JOIN users u ON u.id=t.patient_id JOIN clinics c ON c.id=q.clinic_id WHERE q.queue_date=? AND (?='all' OR q.clinic_id=?) ORDER BY t.queue_order",
      day,
      clinic,
      clinic,
    );
    const inProgress = await many<{
      id: string;
      patient_id: string;
      patient_name: string;
      clinic_id: string;
      clinic_name: string;
    }>(
      db,
      "SELECT e.id,e.patient_id,u.full_name patient_name,e.clinic_id,c.name clinic_name FROM encounters e JOIN users u ON u.id=e.patient_id JOIN clinics c ON c.id=e.clinic_id WHERE e.status='in_progress' AND (?='all' OR e.clinic_id=?) ORDER BY e.visit_at",
      clinic,
      clinic,
    );
    const start = new Date(day + "T00:00:00+05:00").toISOString(),
      end = new Date(Date.parse(start) + 86400000).toISOString();
    const completed = await one<{ n: number }>(
      db,
      "SELECT CAST(COUNT(*) AS INTEGER) n FROM encounters WHERE status='completed' AND completed_at>=? AND completed_at<? AND (?='all' OR clinic_id=?)",
      start,
      end,
      clinic,
      clinic,
    );
    const queueOnly = await one<{ n: number }>(
      db,
      "SELECT CAST(COUNT(*) AS INTEGER) n FROM tokens t JOIN daily_queues q ON q.id=t.queue_id WHERE q.queue_date=? AND t.status='completed' AND (?='all' OR q.clinic_id=?) AND NOT EXISTS(SELECT 1 FROM encounters e WHERE e.token_id=t.id)",
      day,
      clinic,
      clinic,
    );
    res.json({
      success: true,
      data: {
        completedToday: (completed?.n ?? 0) + (queueOnly?.n ?? 0),
        date: day,
        clinics: active,
        setup: !active.length
          ? "clinic"
          : active.every((c) => !schedules.some((s) => s.clinic_id === c.id))
            ? "schedule"
            : "ready",
        unscheduled: active.filter((c) => !schedules.some((s) => s.clinic_id === c.id)),
        appointments: a.sort((x, y) => x.scheduledAt.localeCompare(y.scheduledAt)),
        queue,
        inProgress,
      },
    });
  });
  r.get("/admin/conditions", admin, async (req, res) => {
    const clinic = scope(req.query["clinicId"]),
      q = z
        .string()
        .max(120)
        .parse(req.query["q"] ?? "");
    const data = await many(
      db,
      `SELECT c.id,c.name,CAST((SELECT COUNT(*) FROM patient_conditions pc JOIN users u ON u.id=pc.patient_id WHERE pc.condition_id=c.id AND ${patientOnly} AND ${patientScope}) AS INTEGER) count FROM conditions c WHERE c.active=1 AND LOWER(c.name) LIKE LOWER(?) ESCAPE '!' ORDER BY c.name`,
      clinic,
      clinic,
      clinic,
      clinic,
      like(q),
    );
    res.json({ success: true, data });
  });
  r.get("/admin/patients/search", admin, async (req, res) => {
    const clinic = scope(req.query["clinicId"]),
      q = z
        .string()
        .max(120)
        .parse(req.query["q"] ?? ""),
      condition = z
        .string()
        .max(100)
        .parse(req.query["conditionId"] ?? ""),
      clinical = z
        .string()
        .max(120)
        .parse(req.query["clinical"] ?? "");
    const rows = await many<{
      id: string;
      full_name: string;
      email: string;
      phone: string;
      last_visit: string | null;
      clinic_name: string | null;
    }>(
      db,
      `SELECT u.id,u.full_name,u.email,u.phone,(SELECT MAX(e.visit_at) FROM encounters e WHERE e.patient_id=u.id AND (?='all' OR e.clinic_id=?)) last_visit,(SELECT c.name FROM encounters e JOIN clinics c ON c.id=e.clinic_id WHERE e.patient_id=u.id AND (?='all' OR e.clinic_id=?) ORDER BY e.visit_at DESC LIMIT 1) clinic_name FROM users u LEFT JOIN patient_profiles p ON p.user_id=u.id WHERE ${patientOnly} AND ${patientScope} AND (LOWER(u.full_name) LIKE LOWER(?) ESCAPE '!' OR LOWER(u.email) LIKE LOWER(?) ESCAPE '!' OR u.phone LIKE ? ESCAPE '!') AND (?='' OR EXISTS(SELECT 1 FROM patient_conditions pc WHERE pc.patient_id=u.id AND pc.condition_id=?)) AND (?='' OR LOWER(p.chronic_conditions) LIKE LOWER(?) ESCAPE '!' OR EXISTS(SELECT 1 FROM encounters e WHERE e.patient_id=u.id AND e.status='completed' AND (?='all' OR e.clinic_id=?) AND LOWER(e.diagnosis) LIKE LOWER(?) ESCAPE '!') OR EXISTS(SELECT 1 FROM patient_conditions pc JOIN conditions c ON c.id=pc.condition_id WHERE pc.patient_id=u.id AND LOWER(c.name) LIKE LOWER(?) ESCAPE '!')) ORDER BY last_visit DESC NULLS LAST,u.full_name LIMIT 200`,
      clinic,
      clinic,
      clinic,
      clinic,
      clinic,
      clinic,
      clinic,
      clinic,
      like(q),
      like(q),
      like(q),
      condition,
      condition,
      clinical,
      like(clinical),
      clinic,
      clinic,
      like(clinical),
      like(clinical),
    );
    const tags = await many<{ patient_id: string; id: string; name: string }>(
      db,
      "SELECT pc.patient_id,c.id,c.name FROM patient_conditions pc JOIN conditions c ON c.id=pc.condition_id",
    );
    res.json({
      success: true,
      data: rows.map((p) => ({
        ...p,
        conditions: tags
          .filter((t) => t.patient_id === p.id)
          .map((t) => ({ id: t.id, name: t.name })),
      })),
    });
  });
  async function patient(id: string) {
    if (!(await one(db, "SELECT u.id FROM users u WHERE u.id=? AND " + patientOnly, id)))
      throw new ApiError(404, "NOT_FOUND", "Patient not found.");
  }
  r.get("/admin/patients/:id/conditions", admin, async (req, res) => {
    const id = idValue.parse(req.params["id"]);
    await patient(id);
    res.json({
      success: true,
      data: await many(
        db,
        "SELECT c.id,c.name FROM patient_conditions pc JOIN conditions c ON c.id=pc.condition_id WHERE pc.patient_id=? ORDER BY c.name",
        id,
      ),
    });
  });
  r.post("/admin/patients/:id/conditions", admin, async (req, res) => {
    const pid = idValue.parse(req.params["id"]),
      name = z
        .object({ name: z.string().trim().min(1).max(120) })
        .strict()
        .parse(req.body)
        .name.replace(/\s+/g, " ");
    const data = await atomic(db, async () => {
      await patient(pid);
      const normalized = name.normalize("NFKC").toLowerCase();
      let c = await one<{ id: string; name: string }>(
        db,
        "SELECT id,name FROM conditions WHERE normalized_name=?",
        normalized,
      );
      const stamp = new Date().toISOString();
      if (!c) {
        c = { id: randomUUID(), name };
        await db
          .prepare("INSERT INTO conditions VALUES (?,?,?,1,?,?)")
          .run(c.id, name, normalized, stamp, stamp);
      }
      if (
        !(await one(
          db,
          "SELECT id FROM patient_conditions WHERE patient_id=? AND condition_id=?",
          pid,
          c.id,
        ))
      ) {
        const id = randomUUID();
        await db
          .prepare("INSERT INTO patient_conditions VALUES (?,?,?,'manual',?,?,?)")
          .run(id, pid, c.id, (res.locals["user"] as UserRow).id, stamp, stamp);
        await audit(db, res.locals["user"].id, "condition.added", "patient_condition", id, null);
      }
      return c;
    });
    notify("clinical:updated");
    res.json({ success: true, data });
  });
  r.delete("/admin/patients/:id/conditions/:conditionId", admin, async (req, res) => {
    const pid = idValue.parse(req.params["id"]),
      cid = idValue.parse(req.params["conditionId"]);
    await atomic(db, async () => {
      await patient(pid);
      const row = await one<{ id: string }>(
        db,
        "SELECT id FROM patient_conditions WHERE patient_id=? AND condition_id=?",
        pid,
        cid,
      );
      if (row) {
        await db.prepare("DELETE FROM patient_conditions WHERE id=?").run(row.id);
        await audit(
          db,
          res.locals["user"].id,
          "condition.removed",
          "patient_condition",
          row.id,
          null,
        );
      }
    });
    notify("clinical:updated");
    res.json({ success: true, data: { removed: true } });
  });
  return r;
}
