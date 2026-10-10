import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createLocalApp } from "../app.ts";
import { createPostgresDatabase } from "../db/postgres.ts";
import { one, type UserRow } from "../db/database.ts";
import { testDoctorHours } from "./availability-fixture.ts";
import { consultationEstimate, mutateQueue } from "../services/queueService.ts";
test(
  "Simplification: structured locations, stable unique prefixes, explicit conditions, privacy, upload denial and today onboarding",
  { timeout: 240000 },
  async () => {
    const database = process.env["QUEUECARE_SIMPLIFICATION_TEST_SCHEMA"]
      ? await createPostgresDatabase(
          process.env["DATABASE_URL"]!,
          true,
          process.env["QUEUECARE_SIMPLIFICATION_TEST_SCHEMA"],
          () => {},
        )
      : undefined;
    const app = createLocalApp({ ...(database ? { database } : {}), log: () => {} });
    app.http.listen(0, "127.0.0.1");
    await once(app.http, "listening");
    const address = app.http.address();
    assert.ok(address && typeof address !== "string");
    const port = address.port;
    async function req(
      path: string,
      cookie = "",
      body?: unknown,
      method = body === undefined ? "GET" : "POST",
    ) {
      const r = await fetch("http://127.0.0.1:" + port + "/api" + path, {
        method,
        headers: { Cookie: cookie, "Content-Type": "application/json", "X-QueueCare-Request": "1" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const j = await r.json();
      return {
        status: r.status,
        data: j.data,
        cookie: r.headers.get("set-cookie")?.split(";")[0] ?? "",
      };
    }
    try {
      const admin = await req("/auth/login", "", {
        email: process.env["QUEUECARE_ADMIN_EMAIL"] ?? "admin@queuecare.local",
        password: process.env["QUEUECARE_ADMIN_PASSWORD"] ?? "QueueCareAdmin123!",
      });
      assert.equal(admin.status, 200);
      assert.equal(
        (await req("/admin/today?clinicId=northstar", admin.cookie)).data.setup,
        "schedule",
      );
      const body = {
        name: "Health Point Clinic",
        publicName: "Health Point Clinic",
        address: "Full street address",
        phone: "123456789",
        department: "General",
        doctor: "Doctor",
        opening: "18:00",
        closing: "20:00",
        showNext: true,
        active: true,
        consultationFee: null,
      };
      assert.equal((await req("/admin/clinics", admin.cookie, body)).status, 400);
      const results = await Promise.all(
        [1, 2].map(() =>
          req("/admin/clinics", admin.cookie, {
            ...body,
            city: "Karachi",
            area: "Clifton",
            prefix: "FAKE",
            avgMin: 99,
          }),
        ),
      );
      assert.ok(results.every((r) => r.status === 201));
      assert.equal(new Set(results.map((r) => r.data.tokenPrefix)).size, 2);
      assert.ok(results.every((r) => r.data.tokenPrefix !== "FAKE"));
      assert.ok(results.every((r) => r.data.averageConsultationMinutes === 5));
      const branch = results[0]!.data;
      const edited = await req(
        "/admin/clinics/" + branch.id,
        admin.cookie,
        {
          ...body,
          city: "Karachi",
          area: "DHA",
          name: "Renamed clinic",
          prefix: "NEW",
          avgMin: 60,
        },
        "PUT",
      );
      assert.equal(edited.data.tokenPrefix, branch.tokenPrefix);
      const publicClinics = await req("/clinics");
      assert.equal(publicClinics.data.find((c: { id: string }) => c.id === branch.id).area, "DHA");
      assert.ok(
        publicClinics.data.some(
          (c: { id: string; city?: string }) => c.id === "northstar" && !c.city,
        ),
      );
      const p = await req("/auth/register", "", {
          fullName: "Explicit Tag Patient",
          email: "tag@workflow.test",
          phone: "123456789",
          password: "PatientPassword123!",
        }),
        other = await req("/auth/register", "", {
          fullName: "Other Patient",
          email: "other@workflow.test",
          phone: "987654321",
          password: "PatientPassword123!",
        });
      const pid = p.data.id;
      await req(
        "/admin/patients/" + pid + "/clinical-profile",
        admin.cookie,
        {
          allergies: "",
          chronicConditions: "Diabetes mentioned as existing free text",
          currentMedications: "",
          generalNotes: "",
        },
        "PUT",
      );
      assert.equal((await req("/admin/conditions", admin.cookie)).data.length, 0);
      assert.equal(
        (await req("/admin/patients/search?clinical=diabetes", admin.cookie)).data.length,
        1,
      );
      const c1 = await req("/admin/patients/" + pid + "/conditions", admin.cookie, {
          name: "Diabetes",
        }),
        c2 = await req("/admin/patients/" + pid + "/conditions", admin.cookie, {
          name: " diabetes ",
        });
      assert.equal(c1.data.id, c2.data.id);
      assert.equal((await req("/admin/conditions", admin.cookie)).data[0].count, 1);
      assert.equal(
        (await req("/admin/patients/search?conditionId=" + c1.data.id, admin.cookie)).data[0].id,
        pid,
      );
      for (const q of ["Tag", "tag@workflow.test", "123456789"])
        assert.equal(
          (await req("/admin/patients/search?q=" + encodeURIComponent(q), admin.cookie)).data[0].id,
          pid,
        );
      for (const role of ["receptionist", "nurse"]) {
        const email = role + "@workflow.test";
        await req("/admin/staff", admin.cookie, {
          fullName: "Staff " + role,
          email,
          phone: "123456789",
          password: "StaffPassword123!",
          role,
          clinicIds: ["northstar"],
          active: true,
        });
        const staff = await req("/auth/login", "", { email, password: "StaffPassword123!" });
        for (const cookie of [staff.cookie, p.cookie, other.cookie]) {
          assert.equal((await req("/admin/conditions", cookie)).status, 403);
          assert.equal((await req("/admin/patients/search", cookie)).status, 403);
          assert.equal(
            (await req("/admin/patients/" + pid + "/conditions", cookie, { name: "Asthma" }))
              .status,
            403,
          );
          assert.equal(
            (
              await req(
                "/admin/patients/" + pid + "/conditions/" + c1.data.id,
                cookie,
                {},
                "DELETE",
              )
            ).status,
            403,
          );
        }
      }
      await testDoctorHours(app.db, "northstar");
      assert.equal(
        (await req("/admin/today?clinicId=northstar", admin.cookie)).data.setup,
        "ready",
      );
      const date = new Date(Date.now() + 86400000).toISOString().slice(0, 10),
        slots = await req(
          "/appointments/available-slots?clinicId=northstar&date=" + date,
          p.cookie,
        );
      const booking = await req("/patient/appointments", p.cookie, {
        clinicId: "northstar",
        scheduledAt: slots.data.slots[0].value,
        reason: "Visit",
        patientNotes: "Optional note",
      });
      assert.equal(booking.status, 201);
      assert.equal(
        (
          await req("/patient/appointments", p.cookie, {
            clinicId: "northstar",
            scheduledAt: slots.data.slots[1].value,
            attachments: [],
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await req("/appointments/" + booking.data.id + "/attachments", p.cookie, {
            title: "Blocked",
            filename: "file.pdf",
            mime: "application/pdf",
            size: 8,
            type: "lab_report",
          })
        ).status,
        403,
      );
      assert.equal(
        (await req("/appointment-attachments/nonexistent/complete", p.cookie, {})).status,
        403,
      );
      assert.equal(
        (
          await req(
            "/admin/patients/search?clinicId=northstar&conditionId=" + c1.data.id,
            admin.cookie,
          )
        ).data.length,
        1,
      );
      assert.equal(
        (await req("/admin/patients/search?clinicId=" + branch.id, admin.cookie)).data.length,
        0,
      );
      assert.equal(
        (await req("/admin/conditions?clinicId=" + branch.id, admin.cookie)).data[0].count,
        0,
      );
      await req("/admin/patients/" + pid + "/conditions/" + c1.data.id, admin.cookie, {}, "DELETE");
      assert.equal((await req("/admin/conditions", admin.cookie)).data[0].count, 0);
      const audit = await one<{ detail: string }>(
        app.db,
        "SELECT detail FROM audit_logs WHERE action='condition.added'",
      );
      assert.ok(audit && !audit.detail.includes("Diabetes"));
      const u = (await one<UserRow>(app.db, "SELECT * FROM users WHERE id=?", pid))!,
        a = (await one<UserRow>(app.db, "SELECT * FROM users WHERE role='admin'"))!;
      assert.equal(await consultationEstimate(app.db, "northstar"), 5);
      await mutateQueue(app.db, a, "open", {}, "northstar");
      for (let i = 0; i < 5; i++) {
        const token = await mutateQueue(app.db, u, "join", {}, "northstar");
        await mutateQueue(app.db, a, "callNext", {}, "northstar");
        await mutateQueue(app.db, a, "done", {}, "northstar");
        if ("id" in token)
          await app.db
            .prepare("UPDATE tokens SET called_at=?,completed_at=? WHERE id=?")
            .run(new Date(Date.now() - 600000).toISOString(), new Date().toISOString(), token.id);
      }
      assert.equal(
        (await req("/admin/today?clinicId=northstar", admin.cookie)).data.completedToday,
        5,
      );
      assert.equal(await consultationEstimate(app.db, "northstar"), 10);
      assert.equal(await consultationEstimate(app.db, branch.id), 5);
      for (const [minutes, expected] of [
        [60, 30],
        [1, 2],
      ] as const) {
        await app.db
          .prepare(
            "UPDATE tokens SET called_at=?,completed_at=? WHERE queue_id IN (SELECT id FROM daily_queues WHERE clinic_id='northstar') AND status='completed'",
          )
          .run(new Date(Date.now() - minutes * 60000).toISOString(), new Date().toISOString());
        assert.equal(await consultationEstimate(app.db, "northstar"), expected);
      }
      await app.db
        .prepare(
          "UPDATE tokens SET completed_at='invalid' WHERE id=(SELECT id FROM tokens WHERE status='completed' LIMIT 1)",
        )
        .run();
      assert.equal(await consultationEstimate(app.db, "northstar"), 5);
      await app.db.prepare("UPDATE clinics SET active=0").run();
      assert.equal((await req("/admin/today?clinicId=all", admin.cookie)).data.setup, "clinic");
    } finally {
      await app.close();
    }
  },
);
