import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createLocalApp } from "../app.ts";
import { createPostgresDatabase } from "../db/postgres.ts";
import { one, many } from "../db/database.ts";
import { bookedToken } from "./appointment-token-fixture.ts";
import { clinicDayKey } from "../../src/domain/queue.js";
test(
  "appointment tokens: real booking, retries, future dates, PDF ownership, cancellation, rescheduling, order and clinic removal",
  { timeout: 180000 },
  async () => {
    const schema = process.env["QUEUECARE_TOKEN_TEST_SCHEMA"];
    const database = schema
      ? await createPostgresDatabase(process.env["DATABASE_URL"]!, true, schema, () => {})
      : undefined;
    const app = createLocalApp({ ...(database ? { database } : {}), log: () => {} });
    app.http.listen(0, "127.0.0.1");
    await once(app.http, "listening");
    const addr = app.http.address();
    assert.ok(addr && typeof addr !== "string");
    const base = "http://127.0.0.1:" + addr.port + "/api";
    async function req(
      path: string,
      cookie = "",
      body?: unknown,
      method = body === undefined ? "GET" : "POST",
    ) {
      const r = await fetch(base + path, {
        method,
        headers: { Cookie: cookie, "Content-Type": "application/json", "X-QueueCare-Request": "1" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return {
        status: r.status,
        ...(await r.json()),
        cookie: r.headers.get("set-cookie")?.split(";")[0] ?? "",
      };
    }
    try {
      const admin = await req("/auth/login", "", {
        email: process.env["QUEUECARE_ADMIN_EMAIL"] ?? "admin@queuecare.local",
        password: process.env["QUEUECARE_ADMIN_PASSWORD"] ?? "QueueCareAdmin123!",
      });
      assert.equal(admin.status, 200);
      const p = await req("/auth/register", "", {
          fullName: "Booked Patient",
          email: "linked@tokens.test",
          phone: "03001234567",
          password: "PatientPassword123!",
        }),
        other = await req("/auth/register", "", {
          fullName: "Other Patient",
          email: "other@tokens.test",
          phone: "03001234568",
          password: "PatientPassword123!",
        });
      const today = clinicDayKey(),
        future = new Date(today + "T12:00:00Z");
      future.setUTCDate(future.getUTCDate() + 1);
      const day = future.toISOString().slice(0, 10);
      assert.equal(
        (
          await req(
            "/admin/doctor-availability?clinicId=northstar",
            admin.cookie,
            {
              slotMinutes: 15,
              windows: [{ weekday: future.getUTCDay(), startTime: "09:00", endTime: "17:00" }],
            },
            "PUT",
          )
        ).status,
        200,
      );
      const input = { clinicId: "northstar", scheduledAt: day + "T10:00", reason: "Review" };
      const simultaneous = await Promise.all([
        req("/patient/appointments", p.cookie, input),
        req("/patient/appointments", p.cookie, input),
      ]);
      assert.ok(simultaneous.every((r) => r.status === 201));
      assert.equal(simultaneous[0].data.id, simultaneous[1].data.id);
      const a = simultaneous[0].data,
        t = a.token;
      assert.ok(t.id);
      assert.equal((await req("/patient/token", p.cookie, {})).status, 409);
      assert.equal((await req("/admin/state", admin.cookie)).data.queue.length, 0);
      assert.equal((await req("/patient/tokens/" + t.id, p.cookie)).data.status, "reserved");
      assert.equal((await req("/patient/tokens/" + t.id, other.cookie)).status, 404);
      const pdf = await fetch(base + "/patient/tokens/" + t.id + "/pdf", {
        headers: { Cookie: p.cookie },
      });
      assert.equal(pdf.status, 200);
      assert.equal(pdf.headers.get("content-type"), "application/pdf");
      assert.match(Buffer.from(await pdf.arrayBuffer()).toString("latin1"), /^%PDF/);
      assert.match(pdf.headers.get("content-disposition")!, new RegExp("QueueCare-A-001-" + day));
      assert.equal(
        (
          await fetch(base + "/patient/tokens/" + t.id + "/pdf", {
            headers: { Cookie: other.cookie },
          })
        ).status,
        404,
      );
      const later = new Date(future);
      later.setUTCDate(later.getUTCDate() + 7);
      const nextDay = later.toISOString().slice(0, 10);
      assert.equal(
        (
          await req(
            "/operations/appointments/" + a.id,
            admin.cookie,
            { status: "scheduled", scheduledAt: nextDay + "T11:00" },
            "PUT",
          )
        ).status,
        200,
      );
      const moved = await one<any>(
        app.db,
        "SELECT t.*,q.queue_date FROM tokens t JOIN daily_queues q ON q.id=t.queue_id WHERE appointment_id=?",
        a.id,
      );
      assert.equal(moved.id, t.id);
      assert.equal(moved.queue_date, nextDay);
      assert.equal(
        (await req("/admin/state?historyDate=" + day + "&queueDate=" + day, admin.cookie)).data
          .queue.length,
        0,
      );
      assert.equal(
        (await req("/patient/tokens/" + t.id + "/give-up", other.cookie, {})).status,
        404,
      );
      assert.equal((await req("/patient/tokens/" + t.id + "/give-up", p.cookie, {})).status, 200);
      assert.equal(
        (await one<any>(app.db, "SELECT status FROM appointments WHERE id=?", a.id)).status,
        "cancelled",
      );
      assert.ok(
        (
          await req("/appointments/available-slots?clinicId=northstar&date=" + nextDay, p.cookie)
        ).data.slots.some((s: any) => s.value === nextDay + "T11:00"),
      );
      assert.equal(
        (
          await req(
            "/operations/appointments/" + a.id,
            admin.cookie,
            { status: "scheduled", scheduledAt: nextDay + "T11:00" },
            "PUT",
          )
        ).status,
        409,
      );
      const row = (await one<any>(app.db, "SELECT * FROM users WHERE id=?", p.data.id))!,
        otherRow = (await one<any>(app.db, "SELECT * FROM users WHERE id=?", other.data.id))!;
      const first = await bookedToken(app.db, row),
        second = await bookedToken(app.db, otherRow);
      await app.db
        .prepare("UPDATE appointments SET scheduled_at=? WHERE id=?")
        .run(today + "T08:00", second.appointmentId!);
      const calls = await Promise.all([
        req("/admin/queue/call-next", admin.cookie, {}),
        req("/admin/queue/call-next", admin.cookie, {}),
      ]);
      assert.deepEqual(calls.map((r) => r.status).sort(), [200, 409]);
      assert.equal(calls.find((r) => r.status === 200)!.data.id, second.id);
      assert.equal(
        (await req("/patient/tokens/" + second.id + "/give-up", other.cookie, {})).status,
        409,
      );
      await assert.rejects(
        async () =>
          await app.db.prepare("UPDATE tokens SET patient_id=? WHERE id=?").run(row.id, second.id),
        /mismatch/i,
      );
      await assert.rejects(
        async () =>
          await app.db
            .prepare("UPDATE appointments SET scheduled_at=? WHERE id=?")
            .run(nextDay + "T12:00", second.appointmentId!),
      );
      assert.equal(
        (await req("/patient/tokens/" + first.id + "/give-up", p.cookie, {})).status,
        200,
      );
      assert.equal((await req("/admin/clinics/northstar", admin.cookie, {}, "DELETE")).status, 409);
      const c = await req("/admin/clinics", admin.cookie, {
        city: "Karachi",
        area: "Clifton",
        name: "Empty Clinic",
        publicName: "Empty Clinic",
        address: "Test road",
        phone: "03001234567",
        department: "General",
        doctor: "Doctor",
        opening: "09:00",
        closing: "17:00",
        showNext: true,
        active: true,
        consultationFee: null,
      });
      assert.equal(c.status, 201);
      assert.equal((await req("/admin/clinics/" + c.data.id, p.cookie, {}, "DELETE")).status, 403);
      assert.equal(
        (await req("/admin/clinics/" + c.data.id, admin.cookie, {}, "DELETE")).status,
        200,
      );
      assert.equal(
        (await req("/admin/clinics/northstar?archive=1", admin.cookie, {}, "DELETE")).status,
        200,
      );
      assert.equal((await req("/clinics")).data.length, 0);
      assert.equal((await req("/admin/queue/call-next", admin.cookie, {})).status, 409);
      assert.equal(
        (await many<any>(app.db, "SELECT * FROM tokens WHERE appointment_id=?", a.id)).length,
        1,
      );
      for (let i = 0; i < 5; i++)
        assert.equal((await req("/auth/me", p.cookie)).data.id, p.data.id);
    } finally {
      await app.close();
    }
  },
);
