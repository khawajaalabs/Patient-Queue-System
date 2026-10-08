import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { createLocalApp } from "../app.ts";
import { createPostgresDatabase } from "../db/postgres.ts";
import { csv, dateRange } from "../services/final.ts";
import { deliverEmails } from "../services/email.ts";
import { clinicDayKey } from "../../src/domain/queue.js";
test("CSV escapes spreadsheet formulas, multiline and quotes without exposing hidden columns", () => {
  const result = csv([{ name: "=SUM(A1)", phone: "+92300", address: 'a,"b"\nnext' }]);
  assert.ok(result.includes("'=SUM(A1)"));
  assert.ok(result.includes("'+92300"));
  assert.ok(result.includes('a,""b""\nnext'));
  assert.ok(!result.includes("password"));
  assert.equal(csv([]), "No records\r\n");
});
test("report dates reject impossible, reversed and oversized ranges", () => {
  for (const range of [
    { from: "2026-02-31", to: "2026-03-01" },
    { from: "2026-10-09", to: "2026-10-08" },
    { from: "2024-01-01", to: "2026-01-01" },
  ])
    assert.throws(() => dateRange(range));
  assert.deepEqual(dateRange({ from: "2026-10-01", to: "2026-10-08" }), {
    from: "2026-10-01",
    to: "2026-10-08",
  });
});
test(
  "final phase: analytics, search, exports, appointment states, follow-ups, branding, account security and email privacy",
  { timeout: 180000 },
  async () => {
    const database = process.env["QUEUECARE_FINAL_TEST_SCHEMA"]
      ? await createPostgresDatabase(
          process.env["DATABASE_URL"]!,
          true,
          process.env["QUEUECARE_FINAL_TEST_SCHEMA"],
          () => {},
        )
      : undefined;
    const app = createLocalApp({ ...(database ? { database } : {}), log: () => {} });
    app.http.listen(0, "127.0.0.1");
    await once(app.http, "listening");
    const address = app.http.address();
    assert.ok(address && typeof address !== "string");
    const base = "http://127.0.0.1:" + address.port + "/api";
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
        data: (await r.json()).data,
        cookie: r.headers.get("set-cookie")?.split(";")[0] ?? "",
      };
    }
    try {
      const credentials = {
          email: process.env["QUEUECARE_ADMIN_EMAIL"] ?? "admin@queuecare.local",
          password: process.env["QUEUECARE_ADMIN_PASSWORD"] ?? "QueueCareAdmin123!",
        },
        admin = await req("/auth/login", "", credentials);
      assert.equal(admin.status, 200);
      const patient = await req("/auth/register", "", {
          fullName: "=Export Patient",
          email: "final@queuecare.test",
          password: "PatientPassword123!",
          phone: "+923001234567",
        }),
        other = await req("/auth/register", "", {
          fullName: "Other Patient",
          email: "other-final@queuecare.test",
          password: "PatientPassword123!",
          phone: "03001234567",
        });
      assert.equal(patient.status, 201);
      for (const path of [
        "/admin/analytics",
        "/admin/reports",
        "/admin/search?q=Export",
        "/admin/follow-ups",
        "/admin/branding",
        "/admin/exports/patients",
        "/admin/email-status",
      ]) {
        assert.equal((await fetch(base + path)).status, 401, path);
        assert.equal(
          (await fetch(base + path, { headers: { Cookie: patient.cookie } })).status,
          403,
          path,
        );
      }
      const day = clinicDayKey(),
        appointmentBody = {
          patientId: patient.data.id,
          scheduledAt: day + "T10:00",
          reason: "Review",
        };
      assert.equal(
        (
          await req("/admin/appointments", admin.cookie, {
            ...appointmentBody,
            scheduledAt: day + "T08:00",
          })
        ).status,
        409,
      );
      const a = await req("/admin/appointments", admin.cookie, appointmentBody);
      assert.equal(a.status, 201);
      assert.equal(
        (
          await req("/admin/appointments", admin.cookie, {
            ...appointmentBody,
            scheduledAt: day + "T10:05",
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await req(
            "/operations/appointments/" + a.data.id,
            patient.cookie,
            { status: "confirmed", scheduledAt: appointmentBody.scheduledAt },
            "PUT",
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await req(
            "/operations/appointments/" + a.data.id,
            admin.cookie,
            { status: "confirmed", scheduledAt: appointmentBody.scheduledAt },
            "PUT",
          )
        ).status,
        200,
      );
      assert.equal(
        (await req("/patient/appointments", patient.cookie)).data[0].status,
        "confirmed",
      );
      assert.equal((await req("/patient/appointments", other.cookie)).data.length, 0);
      await req("/admin/queue/open", admin.cookie, {});
      assert.equal(
        (
          await req(
            "/operations/appointments/" + a.data.id,
            admin.cookie,
            { status: "checked_in", scheduledAt: appointmentBody.scheduledAt },
            "PUT",
          )
        ).status,
        200,
      );
      assert.equal((await req("/patient/state", patient.cookie)).data.mine.status, "waiting");
      assert.equal((await req("/schedule", admin.cookie)).data[0].status, "checked_in");
      const b = await req("/admin/appointments", admin.cookie, {
        ...appointmentBody,
        scheduledAt: day + "T11:00",
      });
      assert.equal(
        (
          await req(
            "/operations/appointments/" + b.data.id,
            admin.cookie,
            { status: "scheduled", scheduledAt: day + "T11:30" },
            "PUT",
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await req(
            "/operations/appointments/" + b.data.id,
            admin.cookie,
            { status: "no_show", scheduledAt: day + "T11:30" },
            "PUT",
          )
        ).status,
        200,
      );
      const c = await req("/admin/appointments", admin.cookie, {
        ...appointmentBody,
        scheduledAt: day + "T12:00",
      });
      assert.equal(
        (
          await req(
            "/operations/appointments/" + c.data.id,
            admin.cookie,
            { status: "cancelled", scheduledAt: day + "T12:00" },
            "PUT",
          )
        ).status,
        200,
      );
      const staffBody = {
        fullName: "Final Reception",
        email: "final-staff@queuecare.test",
        phone: "03001234567",
        password: "StaffPassword123!",
        role: "receptionist",
        active: true,
        clinicIds: ["northstar"],
      };
      await req("/admin/staff", admin.cookie, staffBody);
      const staff = await req("/auth/login", "", {
        email: staffBody.email,
        password: staffBody.password,
      });
      assert.equal((await req("/schedule?clinicId=unknown", staff.cookie)).status, 403);
      assert.equal((await req("/schedule?clinicId=all", staff.cookie)).status, 403);
      assert.equal((await req("/schedule?clinicId=northstar", staff.cookie)).status, 200);
      assert.equal((await req("/admin/search?q=Export", staff.cookie)).status, 403);
      const d = await req("/admin/appointments", admin.cookie, {
        ...appointmentBody,
        scheduledAt: day + "T13:00",
      });
      assert.equal(
        (
          await req(
            "/operations/appointments/" + d.data.id,
            staff.cookie,
            { status: "confirmed", scheduledAt: day + "T13:00" },
            "PUT",
          )
        ).status,
        200,
      );
      const encounter = randomUUID(),
        now = new Date().toISOString();
      await app.db
        .prepare(
          "INSERT INTO encounters(id,patient_id,clinic_id,doctor_id,visit_at,status,follow_up_date,follow_up_instructions,private_notes,created_at,updated_at,completed_at) VALUES (?,?,?,?,?,'completed',?,?,?,?,?,?)",
        )
        .run(
          encounter,
          patient.data.id,
          "northstar",
          admin.data.id,
          now,
          day,
          "Return for doctor review",
          "PRIVATE_FINAL_NOTE",
          now,
          now,
          now,
        );
      assert.equal(
        (await req("/admin/follow-ups", admin.cookie)).data[0].instructions,
        "Return for doctor review",
      );
      assert.equal(
        (await req("/admin/follow-ups/" + encounter, admin.cookie, { action: "contacted" }, "PUT"))
          .status,
        200,
      );
      assert.equal(
        (
          await req(
            "/admin/follow-ups/" + encounter,
            admin.cookie,
            { action: "reschedule", date: "2026-02-31" },
            "PUT",
          )
        ).status,
        400,
      );
      assert.equal(
        (
          await req(
            "/admin/follow-ups/" + encounter,
            admin.cookie,
            { action: "book", scheduledAt: day + "T14:00" },
            "PUT",
          )
        ).status,
        200,
      );
      assert.equal((await req("/admin/follow-ups", admin.cookie)).data[0].status, "booked");
      let summary = await req("/patient/summary", patient.cookie);
      assert.equal(summary.data.followups.length, 1);
      assert.ok(!JSON.stringify(summary.data).includes("PRIVATE_FINAL_NOTE"));
      assert.equal((await req("/patient/summary", other.cookie)).data.followups.length, 0);
      assert.equal(
        (await req("/admin/follow-ups/" + encounter, admin.cookie, { action: "completed" }, "PUT"))
          .status,
        200,
      );
      const branding = {
        doctor: {
          full_name: "Doctor One",
          title: "Dr.",
          specialty: "Medicine",
          license: "Registration",
          phone: "03001234567",
          email: "doctor@queuecare.test",
          photo_url: "",
          signature_url: "https://images.example/signature.png",
        },
        clinic: {
          email: "clinic@queuecare.test",
          logo_url: "https://images.example/logo.png",
          footer: "Clinic contact",
          slot_minutes: 20,
        },
      };
      assert.equal(
        (await req("/admin/branding?clinicId=northstar", admin.cookie, branding, "PUT")).status,
        200,
      );
      const pub = await req("/branding");
      assert.equal(pub.data.doctor.full_name, "Doctor One");
      assert.ok(!JSON.stringify(pub.data).includes("signature"));
      assert.ok(!JSON.stringify(pub.data).includes("password"));
      assert.equal(
        (
          await req(
            "/admin/branding?clinicId=northstar",
            admin.cookie,
            { ...branding, clinic: { ...branding.clinic, logo_url: "javascript:alert(1)" } },
            "PUT",
          )
        ).status,
        400,
      );
      const analytics = await req("/admin/analytics?from=" + day + "&to=" + day, admin.cookie);
      assert.ok(analytics.data.totals.appointments >= 4);
      assert.equal(analytics.data.totals.cancelled, 2);
      assert.equal(analytics.data.totals.completed, 1);
      const search = await req("/admin/search?q=Export", admin.cookie);
      assert.equal(search.data[0].type, "patient");
      assert.ok(!JSON.stringify(search.data).includes("PRIVATE_FINAL_NOTE"));
      for (const kind of ["appointments", "billing", "payments", "patients", "visits"]) {
        const result = await fetch(base + "/admin/exports/" + kind, {
          headers: { Cookie: admin.cookie },
        });
        assert.equal(result.status, 200);
        const body = await result.text();
        assert.ok(!body.includes("PRIVATE_FINAL_NOTE"));
        assert.ok(!body.includes("password_hash"));
        if (kind === "patients") assert.ok(body.includes("'=Export Patient"));
      }
      const delivery = await deliverEmails(app.db, null);
      assert.deepEqual(delivery, { configured: false, sent: 0, failed: 0 });
      let emailBodies: string[] = [];
      const delivered = await deliverEmails(app.db, {
        async send(_to, _subject, text) {
          emailBodies.push(text);
        },
      });
      assert.ok(delivered.sent > 0);
      assert.ok(
        emailBodies.every(
          (t) =>
            !t.includes("PRIVATE_FINAL_NOTE") && !t.includes("Review") && !t.includes("signature"),
        ),
      );
      assert.equal((await req("/account", admin.cookie)).data.googleLinked, false);
      const second = await req("/auth/login", "", credentials);
      assert.ok((await req("/account", admin.cookie)).data.sessions.length >= 2);
      assert.equal((await req("/account/revoke-sessions", admin.cookie, {})).status, 200);
      assert.equal((await req("/account", second.cookie)).status, 401);
      assert.equal(
        (
          await req(
            "/account/password",
            admin.cookie,
            { currentPassword: "wrong", newPassword: "NewPassword123!" },
            "PUT",
          )
        ).status,
        400,
      );
      assert.equal(
        (
          await req(
            "/account/password",
            admin.cookie,
            { currentPassword: credentials.password, newPassword: "NewPassword123!" },
            "PUT",
          )
        ).status,
        200,
      );
      assert.equal(
        (await req("/auth/login", "", { ...credentials, password: "NewPassword123!" })).status,
        200,
      );
      const audit = await req("/admin/activity", admin.cookie);
      assert.ok(audit.data.some((x: { action: string }) => x.action === "data.exported"));
      assert.ok(!JSON.stringify(audit.data).includes("NewPassword123!"));
    } finally {
      await app.close();
    }
  },
);
