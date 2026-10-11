import { test } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, one, many } from "../db/database.ts";
import { createAppointment } from "../services/clinics.ts";
import { saveDoctorSchedule } from "../services/availability.ts";
import { mutateQueue, adminState } from "../services/queueService.ts";
import { randomUUID } from "node:crypto";
test("appointment booking creates one date-linked token and blocks walk-ins", async () => {
  const db = createDatabase(":memory:", () => {});
  try {
    const admin = await one<any>(db, "SELECT * FROM users WHERE role='admin'");
    const patient = {
      ...admin,
      id: randomUUID(),
      role: "patient",
      email: "appointment@test.invalid",
    };
    const stamp = new Date().toISOString();
    await db
      .prepare("INSERT INTO users VALUES (?,?,?,?,?,?,?,?)")
      .run(
        patient.id,
        "Patient",
        patient.email,
        "03001234567",
        admin.password_hash,
        "patient",
        stamp,
        stamp,
      );
    await saveDoctorSchedule(db, "northstar", admin.id, {
      slotMinutes: 15,
      windows: [{ weekday: 1, startTime: "09:00", endTime: "17:00" }],
    });
    const a = await createAppointment(db, "northstar", patient.id, {
      patientId: patient.id,
      scheduledAt: "2030-01-07T10:00",
      reason: "",
    });
    const tokens = await many<any>(db, "SELECT * FROM tokens");
    assert.equal(tokens.length, 1);
    assert.equal(tokens[0].appointment_id, a.id);
    assert.equal(
      (await one<any>(db, "SELECT * FROM daily_queues WHERE id=?", tokens[0].queue_id)).queue_date,
      "2030-01-07",
    );
    const retry = await createAppointment(db, "northstar", patient.id, {
      patientId: patient.id,
      scheduledAt: "2030-01-07T10:00",
      reason: "",
    });
    assert.equal(retry.id, a.id);
    await assert.rejects(() => mutateQueue(db, patient, "join"), /appointment/i);
    assert.equal((await adminState(db, "2030-01-07")).queue.length, 1);
  } finally {
    await db.close();
  }
});
