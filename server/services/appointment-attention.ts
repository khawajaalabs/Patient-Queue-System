import { z } from "zod";
import { many, one, atomic, type Database } from "../db/database.ts";
import { ApiError } from "../middleware/auth.ts";
import { audit } from "./operations.ts";
import {
  priorities,
  attentionTags,
  type AppointmentAttention,
} from "../../src/domain/appointment-attention.ts";
const inputSchema = z
  .object({
    priority: z.enum(priorities),
    tags: z
      .array(
        z.enum(
          Object.keys(attentionTags) as [
            keyof typeof attentionTags,
            ...(keyof typeof attentionTags)[],
          ],
        ),
      )
      .max(4)
      .refine((tags) => new Set(tags).size === tags.length, "Choose each tag only once."),
  })
  .strict();
export async function withAppointmentAttention<T>(
  db: Database,
  items: T[],
  key: (item: T) => string | null | undefined,
) {
  const ids = [...new Set(items.map(key).filter((id): id is string => Boolean(id)))];
  if (!ids.length)
    return items.map((item) => ({
      ...item,
      attention: { priority: "routine", tags: [] } as AppointmentAttention,
    }));
  const marks = ids.map(() => "?").join(",");
  const rows = await many<{ appointment_id: string; priority: AppointmentAttention["priority"] }>(
    db,
    `SELECT appointment_id,priority FROM appointment_attention WHERE appointment_id IN (${marks})`,
    ...ids,
  );
  const tags = await many<{ appointment_id: string; tag: keyof typeof attentionTags }>(
    db,
    `SELECT appointment_id,tag FROM appointment_attention_tags WHERE appointment_id IN (${marks}) ORDER BY tag`,
    ...ids,
  );
  return items.map((item) => ({
    ...item,
    attention: {
      priority: rows.find((r) => r.appointment_id === key(item))?.priority ?? "routine",
      tags: tags.filter((r) => r.appointment_id === key(item)).map((r) => r.tag),
    } as AppointmentAttention,
  }));
}
export async function appointmentAttention(db: Database, id: string) {
  if (!(await one(db, "SELECT id FROM appointments WHERE id=?", id)))
    throw new ApiError(404, "NOT_FOUND", "Appointment not found.");
  const current = (await withAppointmentAttention(db, [{ id }], (a) => a.id))[0]!.attention;
  const events = await many<{ detail: string; created_at: string; full_name: string }>(
    db,
    "SELECT l.detail,l.created_at,u.full_name FROM audit_logs l JOIN users u ON u.id=l.actor_user_id WHERE l.entity_type='appointment' AND l.entity_id=? AND l.action='appointment.attention.updated' ORDER BY l.created_at DESC,l.id DESC LIMIT 50",
    id,
  );
  return {
    current,
    history: events.map((e) => ({ ...JSON.parse(e.detail), at: e.created_at, actor: e.full_name })),
  };
}
export async function saveAppointmentAttention(
  db: Database,
  id: string,
  actor: string,
  input: unknown,
) {
  const next = inputSchema.parse(input);
  next.tags.sort();
  return atomic(db, async () => {
    const a = await one<{ clinic_id: string }>(
      db,
      "SELECT clinic_id FROM appointments WHERE id=?",
      id,
    );
    if (!a) throw new ApiError(404, "NOT_FOUND", "Appointment not found.");
    const before = (await appointmentAttention(db, id)).current;
    if (JSON.stringify(before) !== JSON.stringify(next)) {
      await db
        .prepare(
          "INSERT INTO appointment_attention (appointment_id,priority) VALUES (?,?) ON CONFLICT(appointment_id) DO UPDATE SET priority=excluded.priority",
        )
        .run(id, next.priority);
      await db.prepare("DELETE FROM appointment_attention_tags WHERE appointment_id=?").run(id);
      for (const tag of next.tags)
        await db
          .prepare("INSERT INTO appointment_attention_tags (appointment_id,tag) VALUES (?,?)")
          .run(id, tag);
      await audit(
        db,
        actor,
        "appointment.attention.updated",
        "appointment",
        id,
        a.clinic_id,
        JSON.stringify({ before, after: next }),
      );
    }
    return appointmentAttention(db, id);
  });
}
