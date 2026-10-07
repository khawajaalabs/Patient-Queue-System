import { Router } from "express";
import type { Database } from "../db/database.ts";
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
  router.get("/public/queue", async (_req, res) =>
    res.json({ success: true, data: await publicQueue(db) }),
  );
  router.get("/clinic", requireRole(db), async (_req, res) =>
    res.json({ success: true, data: await clinicValue(db) }),
  );
  router.get("/patient/state", requireRole(db, "patient"), async (_req, res) =>
    res.json({ success: true, data: await patientState(db, (res.locals["user"] as UserRow).id) }),
  );
  router.get("/patient/history", requireRole(db, "patient"), async (_req, res) =>
    res.json({
      success: true,
      data: (await patientState(db, (res.locals["user"] as UserRow).id)).history,
    }),
  );
  router.get("/admin/state", requireRole(db, "admin"), async (req, res) =>
    res.json({ success: true, data: await adminState(db, dateValue(req.query["historyDate"])) }),
  );
  router.get("/admin/history", requireRole(db, "admin"), async (req, res) =>
    res.json({ success: true, data: (await adminState(db, dateValue(req.query["date"]))).history }),
  );
  router.get("/admin/patients", requireRole(db, "admin"), async (_req, res) =>
    res.json({ success: true, data: (await adminState(db, clinicDayKey())).patients }),
  );
  router.post("/patient/token", requireRole(db, "patient"), async (req, res) => {
    const input = z
      .object({ reason: z.string().trim().max(300).optional() })
      .strict()
      .parse(req.body);
    const result = await mutateQueue(db, res.locals["user"] as UserRow, "join", input);
    notify("token:joined");
    res.json({ success: true, data: result });
  });
  router.post("/patient/token/cancel", requireRole(db, "patient"), async (req, res) => {
    z.object({}).strict().parse(req.body);
    const result = await mutateQueue(db, res.locals["user"] as UserRow, "leave");
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
      const result = await mutateQueue(db, res.locals["user"] as UserRow, action, input);
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
    const result = await saveSettings(db, req.body);
    notify("settings:updated");
    res.json({ success: true, data: result });
  });
  return router;
}
