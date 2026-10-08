import { z } from "zod";
import { Router } from "express";
import { requireRole, ApiError } from "../middleware/auth.ts";
import type { Database, UserRow } from "../db/database.ts";
import {
  profile,
  saveProfile,
  patientRecord,
  startVisit,
  visitDetail,
  visits,
  saveVisit,
} from "../services/clinical.ts";
import type { Notify } from "./queue.ts";
export function clinicalRoutes(db: Database, notify: Notify) {
  const r = Router();
  r.get("/patient/profile", requireRole(db, "patient"), async (_req, res) =>
    res.json({ success: true, data: await profile(db, (res.locals["user"] as UserRow).id) }),
  );
  r.put("/patient/profile", requireRole(db, "patient"), async (req, res) => {
    const data = await saveProfile(db, (res.locals["user"] as UserRow).id, req.body);
    notify("clinical:updated");
    res.json({ success: true, data });
  });
  r.get("/patient/visits", requireRole(db, "patient"), async (_req, res) =>
    res.json({ success: true, data: await visits(db, (res.locals["user"] as UserRow).id, true) }),
  );
  r.get("/patient/prescriptions", requireRole(db, "patient"), async (_req, res) =>
    res.json({
      success: true,
      data: (await visits(db, (res.locals["user"] as UserRow).id, true)).filter(
        (v) => v.prescription.items.length,
      ),
    }),
  );
  r.get("/patient/visits/:id", requireRole(db, "patient"), async (req, res) =>
    res.json({
      success: true,
      data: await visitDetail(
        db,
        z.string().min(1).max(100).parse(req.params["id"]),
        (res.locals["user"] as UserRow).id,
      ),
    }),
  );
  for (const path of ["/patient/visits/:id", "/patient/prescriptions/:id"])
    r.all(path, requireRole(db, "patient"), (_req, _res, next) =>
      next(new ApiError(403, "READ_ONLY", "Clinical records are read-only in the patient portal.")),
    );
  r.get("/admin/patients/:id/record", requireRole(db, "admin"), async (req, res) =>
    res.json({
      success: true,
      data: await patientRecord(db, z.string().min(1).max(100).parse(req.params["id"])),
    }),
  );
  r.put("/admin/patients/:id/profile", requireRole(db, "admin"), async (req, res) => {
    const data = await saveProfile(
      db,
      z.string().min(1).max(100).parse(req.params["id"]),
      req.body,
      false,
      (res.locals["user"] as UserRow).id,
    );
    notify("clinical:updated");
    res.json({ success: true, data });
  });
  r.put("/admin/patients/:id/clinical-profile", requireRole(db, "admin"), async (req, res) => {
    const data = await saveProfile(
      db,
      z.string().min(1).max(100).parse(req.params["id"]),
      req.body,
      true,
      (res.locals["user"] as UserRow).id,
    );
    notify("clinical:updated");
    res.json({ success: true, data });
  });
  r.post("/admin/patients/:id/visits", requireRole(db, "admin"), async (req, res) => {
    const data = await startVisit(
      db,
      z.string().min(1).max(100).parse(req.params["id"]),
      (res.locals["user"] as UserRow).id,
      req.body,
    );
    notify("clinical:updated");
    res.json({ success: true, data });
  });
  r.get("/admin/visits/:id", requireRole(db, "admin"), async (req, res) =>
    res.json({
      success: true,
      data: await visitDetail(db, z.string().min(1).max(100).parse(req.params["id"])),
    }),
  );
  r.put("/admin/visits/:id", requireRole(db, "admin"), async (req, res) => {
    const data = await saveVisit(db, z.string().min(1).max(100).parse(req.params["id"]), req.body);
    notify("clinical:updated");
    res.json({ success: true, data });
  });
  r.post("/admin/visits/:id/complete", requireRole(db, "admin"), async (req, res) => {
    const data = await saveVisit(
      db,
      z.string().min(1).max(100).parse(req.params["id"]),
      req.body,
      true,
    );
    notify("token:completed");
    res.json({ success: true, data });
  });
  return r;
}
