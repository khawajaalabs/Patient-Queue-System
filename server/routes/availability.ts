import { Router } from "express";
import { z } from "zod";
import { one, type Database, type UserRow } from "../db/database.ts";
import { ApiError, requireRole } from "../middleware/auth.ts";
import { authorizeClinic, idValue } from "../services/operations.ts";
import { availableSlots, doctorSchedule, saveDoctorSchedule } from "../services/availability.ts";
import { createAppointment } from "../services/clinics.ts";
import type { Notify } from "./queue.ts";
export function availabilityRoutes(db: Database, notify: Notify) {
  const r = Router(),
    admin = requireRole(db, "admin"),
    auth = requireRole(db);
  r.get("/admin/doctor-availability", admin, async (req, res) =>
    res.json({
      success: true,
      data: await doctorSchedule(db, idValue.parse(req.query["clinicId"])),
    }),
  );
  r.put("/admin/doctor-availability", admin, async (req, res) => {
    const data = await saveDoctorSchedule(
      db,
      idValue.parse(req.query["clinicId"]),
      res.locals["user"].id,
      req.body,
    );
    notify("appointment:updated");
    res.json({ success: true, data });
  });
  r.get("/appointments/available-slots", auth, async (req, res) => {
    const clinic = idValue.parse(req.query["clinicId"]),
      u = res.locals["user"] as UserRow;
    if (u.role !== "patient") await authorizeClinic(db, u, clinic, ["receptionist"]);
    const exclude = req.query["exclude"] ? idValue.parse(req.query["exclude"]) : "";
    if (exclude) {
      const a = await one<{ clinic_id: string; patient_id: string }>(
        db,
        "SELECT clinic_id,patient_id FROM appointments WHERE id=?",
        exclude,
      );
      if (!a || a.clinic_id !== clinic || (u.role === "patient" && a.patient_id !== u.id))
        throw new ApiError(403, "FORBIDDEN", "This appointment cannot be edited.");
    }
    const { doctorId: _private, ...data } = await availableSlots(
      db,
      clinic,
      z.string().parse(req.query["date"]),
      exclude,
    );
    res.json({ success: true, data });
  });
  r.post("/patient/appointments", requireRole(db, "patient"), async (req, res) => {
    const c = z
      .object({
        clinicId: idValue,
        scheduledAt: z.string(),
        patientNotes: z.string().trim().max(2000).optional(),
        reason: z.string().trim().max(300).default(""),
      })
      .strict()
      .parse(req.body);
    const data = await createAppointment(db, c.clinicId, res.locals["user"].id, {
      patientId: res.locals["user"].id,
      scheduledAt: c.scheduledAt,
      reason: c.reason,
      patientNotes: c.patientNotes,
    });
    notify("appointment:updated");
    res.status(201).json({ success: true, data });
  });
  return r;
}
