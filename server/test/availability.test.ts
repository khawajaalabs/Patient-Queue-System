import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createLocalApp } from "../app.ts";
import { createPostgresDatabase } from "../db/postgres.ts";
import { one, many } from "../db/database.ts";

test(
  "doctor availability: split shifts, clinic conflicts, slots, patient security, concurrency, rescheduling and historical preservation",
  { timeout: 180000 },
  async (t) => {
    const database = process.env["QUEUECARE_AVAILABILITY_TEST_SCHEMA"]
      ? await createPostgresDatabase(
          process.env["DATABASE_URL"]!,
          true,
          process.env["QUEUECARE_AVAILABILITY_TEST_SCHEMA"],
          () => {},
        )
      : undefined;
    const app = createLocalApp({ ...(database ? { database } : {}), log: () => {} });
    app.http.listen(0, "127.0.0.1");
    await once(app.http, "listening");
    const address = app.http.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}/api`;
    // Deterministic Karachi clock, independently exercising past-day and past-time rejection.
    t.mock.method(Date, "now", () => +new Date("2030-01-07T10:15:00+05:00"));
    async function req(
      path: string,
      cookie = "",
      body?: unknown,
      method = body === undefined ? "GET" : "POST",
    ) {
      const res = await fetch(base + path, {
        method,
        headers: { Cookie: cookie, "Content-Type": "application/json", "X-QueueCare-Request": "1" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const envelope = await res.json();
      return {
        status: res.status,
        data: envelope.data,
        error: envelope.error,
        cookie: res.headers.get("set-cookie")?.split(";")[0] ?? "",
      };
    }
    try {
      const admin = await req("/auth/login", "", {
        email: process.env["QUEUECARE_ADMIN_EMAIL"] ?? "admin@queuecare.local",
        password: process.env["QUEUECARE_ADMIN_PASSWORD"] ?? "QueueCareAdmin123!",
      });
      assert.equal(admin.status, 200);
      const patient = await req("/auth/register", "", {
        fullName: "Availability Patient",
        email: "slots@queuecare.test",
        phone: "03001234567",
        password: "PatientPassword123!",
      });
      assert.equal(patient.status, 201);
      const other = await req("/auth/register", "", {
        fullName: "Other Booking",
        email: "slots-other@queuecare.test",
        phone: "03001234568",
        password: "PatientPassword123!",
      });
      const body = {
        name: "Evening Clinic",
        publicName: "Evening Clinic",
        address: "Clinic",
        phone: "03001234567",
        department: "General",
        doctor: "Doctor",
        opening: "09:00",
        closing: "21:00",
        prefix: "E",
        showNext: true,
        avgMin: 5,
        active: true,
        consultationFee: null,
      };
      const branch = await req("/admin/clinics", admin.cookie, body);
      assert.equal(branch.status, 201);
      const url = "/admin/doctor-availability?clinicId=northstar";
      const windows = [
        { weekday: 1, startTime: "10:00", endTime: "12:00" },
        { weekday: 1, startTime: "14:00", endTime: "16:00" },
      ];
      const save = (input: unknown, path = url) => req(path, admin.cookie, input, "PUT");
      assert.equal(
        (await req(url, patient.cookie, { slotMinutes: 30, windows }, "PUT")).status,
        403,
      );
      assert.equal((await req(url)).status, 401);
      assert.equal((await save({ slotMinutes: 30, windows })).status, 200);
      assert.deepEqual((await req(url, admin.cookie)).data.windows, windows);
      for (const bad of [
        { weekday: 1, startTime: "08:00", endTime: "12:00" },
        { weekday: 1, startTime: "12:00", endTime: "10:00" },
        { weekday: 1, startTime: "16:00", endTime: "18:00" },
      ])
        assert.equal((await save({ slotMinutes: 30, windows: [bad] })).status, 409);
      assert.equal(
        (
          await save({
            slotMinutes: 30,
            windows: [...windows, { weekday: 1, startTime: "11:00", endTime: "13:00" }],
          })
        ).status,
        409,
      );
      const branchUrl = "/admin/doctor-availability?clinicId=" + branch.data.id;
      const conflict = await save(
        { slotMinutes: 30, windows: [{ weekday: 1, startTime: "11:00", endTime: "13:00" }] },
        branchUrl,
      );
      assert.equal(conflict.status, 409);
      assert.ok(conflict.error.message.includes("Northstar"));
      assert.equal(
        (
          await save(
            { slotMinutes: 30, windows: [{ weekday: 1, startTime: "17:00", endTime: "19:00" }] },
            branchUrl,
          )
        ).status,
        200,
      );
      assert.deepEqual((await req(url, admin.cookie)).data.windows, windows);
      const slotsUrl = "/appointments/available-slots?clinicId=northstar&date=2030-01-07";
      const readSlots = async () =>
        (await req(slotsUrl, patient.cookie)).data.slots.map((s: { value: string }) => s.value);
      assert.deepEqual(
        await readSlots(),
        ["10:30", "11:00", "11:30", "14:00", "14:30", "15:00", "15:30"].map(
          (s) => "2030-01-07T" + s,
        ),
      );
      assert.ok(!JSON.stringify((await req(slotsUrl, patient.cookie)).data).includes("doctorId"));
      assert.deepEqual(
        (await req(slotsUrl.replace("2030-01-07", "2030-01-08"), patient.cookie)).data.slots,
        [],
      );
      assert.deepEqual(
        (await req(slotsUrl.replace("2030-01-07", "2029-12-31"), patient.cookie)).data.slots,
        [],
      );
      assert.equal(
        (await req(slotsUrl.replace("2030-01-07", "2030-02-31"), patient.cookie)).status,
        400,
      );
      const booking = (time: string, cookie = patient.cookie) =>
        req("/patient/appointments", cookie, {
          clinicId: "northstar",
          scheduledAt: "2030-01-07T" + time,
          reason: "Review",
        });
      for (const time of ["10:00", "10:35", "12:00", "13:00", "16:00"])
        assert.equal((await booking(time)).status, 409);
      const simultaneous = await Promise.all([booking("10:30"), booking("10:30", other.cookie)]);
      assert.deepEqual(simultaneous.map((r) => r.status).sort(), [201, 409]);
      const booked = simultaneous.find((r) => r.status === 201)!;
      assert.ok(!(await readSlots()).includes("2030-01-07T10:30"));
      assert.equal(
        (
          await one<{ count: number }>(
            app.db,
            "SELECT CAST(COUNT(*) AS INTEGER) count FROM appointments WHERE scheduled_at=?",
            "2030-01-07T10:30",
          )
        )?.count,
        1,
      );
      assert.equal(
        (
          await one<{ duration_minutes: number }>(
            app.db,
            "SELECT duration_minutes FROM appointment_slots WHERE appointment_id=?",
            booked.data.id,
          )
        )?.duration_minutes,
        30,
      );
      assert.equal(
        (
          await req(
            "/appointments/available-slots?clinicId=" +
              branch.data.id +
              "&date=2030-01-07&exclude=" +
              booked.data.id,
            patient.cookie,
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await req("/admin/appointments?clinicId=northstar", admin.cookie, {
            patientId: patient.data.id,
            scheduledAt: "2030-01-07T13:00",
            reason: "",
          })
        ).status,
        409,
      );
      const update = (time: string, status = "scheduled") =>
        req(
          "/operations/appointments/" + booked.data.id,
          admin.cookie,
          { scheduledAt: "2030-01-07T" + time, status },
          "PUT",
        );
      assert.equal((await update("13:00")).status, 409);
      assert.equal((await update("11:00")).status, 200);
      assert.ok((await readSlots()).includes("2030-01-07T10:30"));
      assert.equal(
        (await req(slotsUrl + "&exclude=" + booked.data.id, admin.cookie)).data.slots.some(
          (s: { value: string }) => s.value.endsWith("11:00"),
        ),
        true,
      );
      assert.equal((await update("11:00", "cancelled")).status, 200);
      assert.ok((await readSlots()).includes("2030-01-07T11:00"));
      assert.equal((await update("11:00", "scheduled")).status, 200);
      assert.equal((await update("11:00", "no_show")).status, 200);
      assert.ok((await readSlots()).includes("2030-01-07T11:00"));
      assert.equal((await booking("11:00")).status, 201);
      // Duration changes cannot shrink already reserved appointments.
      assert.equal((await save({ slotMinutes: 15, windows })).status, 200);
      assert.ok(!(await readSlots()).includes("2030-01-07T11:15"));
      const history = await many(app.db, "SELECT * FROM appointments ORDER BY id");
      assert.equal((await save({ slotMinutes: 30, windows: [] })).status, 200);
      assert.deepEqual(await many(app.db, "SELECT * FROM appointments ORDER BY id"), history);
      assert.deepEqual(await readSlots(), []);
      // Legacy status updates do not force rescheduling into new hours.
      const current = await one<{ id: string; scheduled_at: string }>(
        app.db,
        "SELECT id,scheduled_at FROM appointments WHERE status='scheduled' LIMIT 1",
      );
      assert.ok(current);
      assert.equal(
        (
          await req(
            "/operations/appointments/" + current.id,
            admin.cookie,
            { scheduledAt: current.scheduled_at, status: "confirmed" },
            "PUT",
          )
        ).status,
        200,
      );
      await app.db.prepare("UPDATE appointments SET status='completed' WHERE id=?").run(current.id);
      assert.equal(
        (
          await req(
            "/operations/appointments/" + current.id,
            admin.cookie,
            { scheduledAt: current.scheduled_at, status: "scheduled" },
            "PUT",
          )
        ).status,
        409,
      );
      await app.db.prepare("UPDATE clinics SET active=0 WHERE id=?").run(branch.data.id);
      assert.equal((await save({ slotMinutes: 30, windows: [] }, branchUrl)).status, 409);
      assert.equal(
        (
          await req("/patient/appointments", patient.cookie, {
            clinicId: branch.data.id,
            scheduledAt: "2030-01-07T17:00",
            reason: "",
          })
        ).status,
        409,
      );
      assert.ok(
        (await many(app.db, "SELECT * FROM notifications WHERE type='appointment.booked'")).length >
          0,
      );
      assert.ok((await many(app.db, "SELECT * FROM email_delivery_log")).length > 0);
    } finally {
      await app.close();
    }
  },
);
