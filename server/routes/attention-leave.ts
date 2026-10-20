import { Router } from "express";
import { requireRole } from "../middleware/auth.ts";
import type { Database } from "../db/database.ts";
import { idValue } from "../services/operations.ts";
import {
  appointmentAttention,
  saveAppointmentAttention,
} from "../services/appointment-attention.ts";
import {
  doctorLeave,
  leaveConflicts,
  createDoctorLeave,
  removeDoctorLeave,
} from "../services/doctor-leave.ts";
import type { Notify } from "./queue.ts";
export function attentionLeaveRoutes(db: Database, notify: Notify) {
  const r = Router(),
    admin = requireRole(db, "admin");
  r.get("/admin/appointments/:id/attention", admin, async (req, res) =>
    res.json({
      success: true,
      data: await appointmentAttention(db, idValue.parse(req.params["id"])),
    }),
  );
  r.put("/admin/appointments/:id/attention", admin, async (req, res) => {
    const data = await saveAppointmentAttention(
      db,
      idValue.parse(req.params["id"]),
      res.locals["user"].id,
      req.body,
    );
    notify("appointment:updated");
    res.json({ success: true, data });
  });
  r.get("/admin/doctor-leave", admin, async (_req, res) =>
    res.json({ success: true, data: await doctorLeave(db) }),
  );
  r.get("/admin/doctor-leave/conflicts", admin, async (req, res) =>
    res.json({
      success: true,
      data: await leaveConflicts(db, {
        startDate: req.query["startDate"],
        endDate: req.query["endDate"],
      }),
    }),
  );
  r.post("/admin/doctor-leave", admin, async (req, res) => {
    const data = await createDoctorLeave(db, res.locals["user"].id, req.body);
    notify("appointment:updated");
    res.status(201).json({ success: true, data });
  });
  r.delete("/admin/doctor-leave/:id", admin, async (req, res) => {
    const data = await removeDoctorLeave(
      db,
      res.locals["user"].id,
      idValue.parse(req.params["id"]),
    );
    notify("appointment:updated");
    res.json({ success: true, data });
  });
  return r;
}
