import { audit, authorizeClinic } from "../services/operations.ts";
import {
  listClinics,
  saveClinic,
  allClinicsState,
  appointments,
  createAppointment,
} from "../services/clinics.ts";
import { Router } from "express";
import { many, type Database } from "../db/database.ts";
import { z } from "zod";
import { requireRole } from "../middleware/auth.ts";
import { clinicDayKey } from "../../src/domain/queue.js";
import {
  adminState,
  patientState,
  publicQueue,
  clinicValue,
  mutateQueue,
  saveSettings,
  type QueueAction,
} from "../services/queueService.ts";
import type { UserRow } from "../db/database.ts";
const tokenBody = z
  .object({
    token: z
      .string()
      .regex(/^[A-Z]{1,5}-[0-9]{3}$/)
      .optional(),
  })
  .strict();
const dateValue = (v: unknown) =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .parse(v ?? clinicDayKey());
export type Notify = (event: string) => void;
export function queueRoutes(db: Database, notify: Notify) {
  const router = Router();
  const scope = (req: import("express").Request) =>
    z
      .string()
      .min(1)
      .max(100)
      .regex(/^[a-zA-Z0-9-]+$/)
      .parse(req.query["clinicId"] ?? "northstar");
  router.get("/clinics", async (_req, res) =>
    res.json({
      success: true,
      data: (await listClinics(db)).map((c) => ({
        id: c.id,
        name: c.name,
        department: c.department,
      })),
    }),
  );
  router.get("/admin/clinics", requireRole(db, "admin"), async (_req, res) =>
    res.json({ success: true, data: await listClinics(db, true) }),
  );
  router.get("/admin/clinics/summary", requireRole(db, "admin"), async (_req, res) =>
    res.json({ success: true, data: await allClinicsState(db) }),
  );
  router.post("/admin/clinics", requireRole(db, "admin"), async (req, res) => {
    const data = await saveClinic(db, req.body);
    await audit(db, (res.locals["user"] as UserRow).id, "clinic.saved", "clinic", data.id, data.id);
    notify("clinics:updated");
    res.status(201).json({ success: true, data });
  });
  router.put("/admin/clinics/:id", requireRole(db, "admin"), async (req, res) => {
    const data = await saveClinic(db, req.body, z.string().min(1).max(100).parse(req.params["id"]));
    notify("clinics:updated");
    res.json({ success: true, data });
  });
  router.get("/admin/appointments", requireRole(db, "admin"), async (req, res) =>
    res.json({
      success: true,
      data: await appointments(db, scope(req) === "all" ? undefined : scope(req)),
    }),
  );
  router.post("/admin/appointments", requireRole(db, "admin"), async (req, res) => {
    const data = await createAppointment(
      db,
      scope(req),
      (res.locals["user"] as UserRow).id,
      req.body,
    );
    notify("appointments:updated");
    res.status(201).json({ success: true, data });
  });
  router.get("/admin/patient-options", requireRole(db, "admin"), async (_req, res) =>
    res.json({
      success: true,
      data: await many(
        db,
        "SELECT id,full_name AS name FROM users WHERE role='patient' AND NOT EXISTS (SELECT 1 FROM staff_profiles sp WHERE sp.user_id=users.id) ORDER BY full_name LIMIT 500",
      ),
    }),
  );
  router.get("/public/queue", async (req, res) =>
    res.json({ success: true, data: await publicQueue(db, scope(req)) }),
  );
  router.get("/clinic", requireRole(db), async (req, res) => {
    const user = res.locals["user"] as UserRow;
    if (user.role === "receptionist" || user.role === "nurse")
      await authorizeClinic(db, user, scope(req));
    res.json({ success: true, data: await clinicValue(db, scope(req)) });
  });
  router.get("/patient/state", requireRole(db, "patient"), async (req, res) =>
    res.json({
      success: true,
      data: await patientState(db, (res.locals["user"] as UserRow).id, scope(req)),
    }),
  );
  router.get("/patient/history", requireRole(db, "patient"), async (req, res) =>
    res.json({
      success: true,
      data: (await patientState(db, (res.locals["user"] as UserRow).id, scope(req))).history,
    }),
  );
  router.get("/admin/state", requireRole(db, "admin"), async (req, res) =>
    res.json({
      success: true,
      data: await adminState(db, dateValue(req.query["historyDate"]), scope(req)),
    }),
  );
  router.get("/admin/history", requireRole(db, "admin"), async (req, res) =>
    res.json({
      success: true,
      data: (await adminState(db, dateValue(req.query["date"]), scope(req))).history,
    }),
  );
  router.get("/admin/patients", requireRole(db, "admin"), async (req, res) =>
    res.json({ success: true, data: (await adminState(db, clinicDayKey(), scope(req))).patients }),
  );
  router.post("/patient/token", requireRole(db, "patient"), async (req, res) => {
    const input = z
      .object({ reason: z.string().trim().max(300).optional() })
      .strict()
      .parse(req.body);
    const result = await mutateQueue(db, res.locals["user"] as UserRow, "join", input, scope(req));
    notify("token:joined");
    res.json({ success: true, data: result });
  });
  router.post("/patient/token/cancel", requireRole(db, "patient"), async (req, res) => {
    z.object({}).strict().parse(req.body);
    const result = await mutateQueue(db, res.locals["user"] as UserRow, "leave", {}, scope(req));
    notify("token:cancelled");
    res.json({ success: true, data: result });
  });
  const actions: Record<string, QueueAction> = {
    open: "open",
    close: "close",
    "call-next": "callNext",
    call: "call",
    complete: "done",
    skip: "skip",
    requeue: "requeue",
    "call-again": "callAgain",
  };
  for (const [path, action] of Object.entries(actions))
    router.post(`/admin/queue/${path}`, requireRole(db, "admin"), async (req, res) => {
      const input = tokenBody.parse(req.body);
      const result = await mutateQueue(
        db,
        res.locals["user"] as UserRow,
        action,
        input,
        scope(req),
      );
      const event =
        action === "done"
          ? "token:completed"
          : action === "skip"
            ? "token:skipped"
            : action === "call" || action === "callNext" || action === "callAgain"
              ? "token:called"
              : "queue:changed";
      notify(event);
      res.json({ success: true, data: result });
    });
  router.put("/admin/settings", requireRole(db, "admin"), async (req, res) => {
    const result = await saveSettings(db, req.body, scope(req), (res.locals["user"] as UserRow).id);
    notify("settings:updated");
    res.json({ success: true, data: result });
  });
  return router;
}
