import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createLocalApp } from "../app.ts";
import { createPostgresDatabase } from "../db/postgres.ts";
import { one, many } from "../db/database.ts";

test(
  "appointment attention and doctor-wide leave preserve scheduling, privacy and tokens",
  { timeout: 300000 },
  async (t) => {
    const schema = process.env["QUEUECARE_ATTENTION_TEST_SCHEMA"];
    const database = schema
      ? await createPostgresDatabase(process.env["DATABASE_URL"]!, true, schema, () => {})
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
      const r = await fetch(`http://127.0.0.1:${port}/api` + path, {
        method,
        headers: { Cookie: cookie, "Content-Type": "application/json", "X-QueueCare-Request": "1" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const j = await r.json();
      return {
        status: r.status,
        data: j.data,
        error: j.error,
        cookie: r.headers.get("set-cookie")?.split(";")[0] ?? "",
      };
    }
    try {
      const admin = await req("/auth/login", "", {
        email: process.env["QUEUECARE_ADMIN_EMAIL"] ?? "admin@queuecare.local",
        password: process.env["QUEUECARE_ADMIN_PASSWORD"] ?? "QueueCareAdmin123!",
      });
      assert.equal(admin.status, 200);
      const patient = await req("/auth/register", "", {
        fullName: "Attention Patient",
        email: "attention@queuecare.test",
        phone: "03001234567",
        password: "PatientPassword123!",
      });
      assert.equal(patient.status, 201);
      const second = await req("/auth/register", "", {
        fullName: "Second Patient",
        email: "attention-second@queuecare.test",
        phone: "03001234568",
        password: "PatientPassword123!",
      });
      const windows = Array.from({ length: 7 }, (_, weekday) => ({
        weekday,
        startTime: "09:00",
        endTime: "17:00",
      }));
      assert.equal(
        (
          await req(
            "/admin/doctor-availability?clinicId=northstar",
            admin.cookie,
            { slotMinutes: 15, windows },
            "PUT",
          )
        ).status,
        200,
      );
      const branch = (
        await req("/admin/clinics", admin.cookie, {
          name: "Leave Clinic",
          publicName: "Leave Clinic",
          city: "Karachi",
          area: "Test",
          address: "Test",
          phone: "03001234567",
          department: "General",
          doctor: "Doctor",
          opening: "17:00",
          closing: "21:00",
          showNext: true,
          active: true,
          consultationFee: null,
        })
      ).data;
      assert.equal(
        (
          await req(
            "/admin/doctor-availability?clinicId=" + branch.id,
            admin.cookie,
            {
              slotMinutes: 15,
              windows: windows.map((w) => ({ ...w, startTime: "17:00", endTime: "21:00" })),
            },
            "PUT",
          )
        ).status,
        200,
      );
      const book = async (
        day: string,
        time = "09:00",
        cookie = patient.cookie,
        clinic = "northstar",
      ) =>
        req("/patient/appointments", cookie, {
          clinicId: clinic,
          scheduledAt: day + "T" + time,
          reason: "",
        });
      const a = (await book("2031-10-01")).data,
        b = (await book("2031-10-01", "09:15", second.cookie)).data;
      await t.test(
        "routine default, persisted changes, removal, audit history and appointment isolation",
        async () => {
          const path = "/admin/appointments/" + a.id + "/attention";
          assert.deepEqual((await req(path, admin.cookie)).data.current, {
            priority: "routine",
            tags: [],
          });
          assert.equal(
            (await req(path, patient.cookie, { priority: "critical", tags: [] }, "PUT")).status,
            403,
          );
          assert.equal(
            (await req(path, "", { priority: "critical", tags: [] }, "PUT")).status,
            401,
          );
          assert.equal(
            (await req(path, admin.cookie, { priority: "extreme", tags: [] }, "PUT")).status,
            400,
          );
          assert.equal(
            (await req(path, admin.cookie, { priority: "critical", tags: ["invented"] }, "PUT"))
              .status,
            400,
          );
          assert.equal(
            (
              await req(
                path,
                admin.cookie,
                { priority: "critical", tags: ["follow_up", "needs_assistance"] },
                "PUT",
              )
            ).status,
            200,
          );
          assert.deepEqual((await req(path, admin.cookie)).data.current, {
            priority: "critical",
            tags: ["follow_up", "needs_assistance"],
          });
          await req(path, admin.cookie, { priority: "urgent", tags: ["review_required"] }, "PUT");
          const saved = (await req(path, admin.cookie)).data;
          assert.deepEqual(saved.current, { priority: "urgent", tags: ["review_required"] });
          assert.equal(saved.history.length, 2);
          assert.equal(saved.history[0].after.priority, "urgent");
          assert.equal(saved.history[1].after.priority, "critical");
          assert.equal(
            (await req("/admin/appointments/" + b.id + "/attention", admin.cookie)).data.current
              .priority,
            "routine",
          );
          const flow = (await req("/admin/appointment-flow", admin.cookie)).data;
          assert.equal(flow.find((x: any) => x.id === a.id).attention.priority, "urgent");
          const queue = (await req("/admin/state?queueDate=2031-10-01", admin.cookie)).data.queue;
          assert.deepEqual(
            queue.map((x: any) => x.id),
            [a.token.id, b.token.id],
          );
          assert.equal(queue[0].attention.priority, "urgent");
          assert.ok(
            !JSON.stringify((await req("/patient/appointments", patient.cookie)).data).includes(
              "review_required",
            ),
          );
          assert.ok(
            !JSON.stringify((await req("/public/queue", patient.cookie)).data).includes("urgent"),
          );
          assert.ok(
            !JSON.stringify((await req("/patient/state", patient.cookie)).data).includes(
              "review_required",
            ),
          );
          const condition = await req(
            "/admin/patients/" + patient.data.id + "/conditions",
            admin.cookie,
            { name: "Existing condition" },
          );
          assert.equal(condition.status, 200);
          assert.equal(
            (await req("/admin/patients/" + patient.data.id + "/conditions", admin.cookie)).data
              .length,
            1,
          );
        },
      );
      await t.test(
        "complete tag transitions fit the existing audit field and remain readable",
        async () => {
          const path = "/admin/appointments/" + a.id + "/attention";
          const tags = ["follow_up", "needs_assistance", "special_attention", "review_required"];
          assert.equal(
            (await req(path, admin.cookie, { priority: "critical", tags }, "PUT")).status,
            200,
          );
          assert.equal(
            (await req(path, admin.cookie, { priority: "urgent", tags }, "PUT")).status,
            200,
          );
          const data = (await req(path, admin.cookie)).data;
          assert.equal(data.history[0].before.tags.length, 4);
          assert.equal(data.history[0].after.tags.length, 4);
        },
      );
      await t.test(
        "leave blocks conflicting appointments without changing their tokens",
        async () => {
          const before = await one<any>(app.db, "SELECT * FROM tokens WHERE id=?", a.token.id);
          const conflict = await req("/admin/doctor-leave", admin.cookie, {
            startDate: "2031-10-01",
            endDate: "2031-10-02",
            reason: "Leave",
          });
          assert.equal(conflict.status, 409);
          assert.equal(conflict.error.code, "LEAVE_APPOINTMENTS");
          const preview = (
            await req(
              "/admin/doctor-leave/conflicts?startDate=2031-10-01&endDate=2031-10-02",
              admin.cookie,
            )
          ).data;
          assert.equal(preview.length, 2);
          assert.equal(preview[0].id, a.id);
          assert.deepEqual(
            await one<any>(app.db, "SELECT * FROM tokens WHERE id=?", a.token.id),
            before,
          );
          assert.equal(
            (
              await req(
                "/admin/doctor-leave",
                patient.cookie,
                { startDate: "2031-10-03", endDate: "2031-10-03" },
                "POST",
              )
            ).status,
            403,
          );
        },
      );
      await t.test(
        "single and ranged leave, duplicates, overlap, timezone dates and removal",
        async () => {
          assert.equal(
            (
              await req("/admin/doctor-leave", admin.cookie, {
                startDate: "2020-01-01",
                endDate: "2020-01-01",
              })
            ).status,
            400,
          );
          assert.equal(
            (
              await req("/admin/doctor-leave", admin.cookie, {
                startDate: "2031-02-30",
                endDate: "2031-03-01",
              })
            ).status,
            400,
          );
          assert.equal(
            (
              await req("/admin/doctor-leave", admin.cookie, {
                startDate: "2031-10-05",
                endDate: "2031-10-04",
              })
            ).status,
            400,
          );
          const single = await req("/admin/doctor-leave", admin.cookie, {
            startDate: "2031-10-03",
            endDate: "2031-10-03",
            reason: "Day off",
          });
          assert.equal(single.status, 201);
          const leave = await req("/admin/doctor-leave", admin.cookie, {
            startDate: "2031-10-04",
            endDate: "2031-10-06",
            reason: "Annual leave",
          });
          assert.equal(leave.status, 201);
          assert.equal(
            (
              await req("/admin/doctor-leave", admin.cookie, {
                startDate: "2031-10-04",
                endDate: "2031-10-06",
              })
            ).status,
            409,
          );
          assert.equal(
            (
              await req("/admin/doctor-leave", admin.cookie, {
                startDate: "2031-10-06",
                endDate: "2031-10-07",
              })
            ).status,
            409,
          );
          for (const day of ["2031-10-03", "2031-10-04", "2031-10-05", "2031-10-06"]) {
            for (const c of ["northstar", branch.id])
              assert.equal(
                (
                  await req(
                    "/appointments/available-slots?clinicId=" + c + "&date=" + day,
                    patient.cookie,
                  )
                ).data.slots.length,
                0,
              );
            assert.equal((await book(day)).status, 409);
            assert.equal(
              (
                await req("/admin/appointments?clinicId=northstar", admin.cookie, {
                  patientId: patient.data.id,
                  scheduledAt: day + "T09:00",
                  reason: "",
                })
              ).status,
              409,
            );
          }
          assert.equal(
            (
              await req(
                "/operations/appointments/" + a.id,
                admin.cookie,
                { status: "scheduled", scheduledAt: "2031-10-04T09:00" },
                "PUT",
              )
            ).status,
            409,
          );
          assert.ok(
            (
              await req(
                "/appointments/available-slots?clinicId=northstar&date=2031-10-02",
                patient.cookie,
              )
            ).data.slots.length,
          );
          assert.ok(
            (
              await req(
                "/appointments/available-slots?clinicId=northstar&date=2031-10-07",
                patient.cookie,
              )
            ).data.slots.length,
          );
          assert.equal(
            (await req("/admin/doctor-leave/" + leave.data.id, admin.cookie, undefined, "DELETE"))
              .status,
            200,
          );
          assert.equal(
            (await req("/admin/doctor-leave/" + leave.data.id, admin.cookie, undefined, "DELETE"))
              .status,
            404,
          );
          assert.equal(
            (await req("/admin/doctor-leave/" + single.data.id, admin.cookie, undefined, "DELETE"))
              .status,
            200,
          );
          assert.ok(
            (
              await req(
                "/appointments/available-slots?clinicId=northstar&date=2031-10-04",
                patient.cookie,
              )
            ).data.slots.length,
          );
          assert.deepEqual(
            (await req("/admin/doctor-availability?clinicId=northstar", admin.cookie)).data.windows,
            windows,
          );
          assert.equal(
            (await req("/patient/appointments", patient.cookie)).data.find(
              (x: any) => x.id === a.id,
            ).token.id,
            a.token.id,
          );
        },
      );
      await t.test("concurrent leave and booking cannot both activate", async () => {
        const results = await Promise.all([
          req("/admin/doctor-leave", admin.cookie, {
            startDate: "2031-10-09",
            endDate: "2031-10-09",
          }),
          book("2031-10-09"),
        ]);
        assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
        const rows = await many(
          app.db,
          "SELECT id FROM appointments WHERE substr(scheduled_at,1,10)='2031-10-09' AND status<>'cancelled'",
        );
        const leaves = (await req("/admin/doctor-leave", admin.cookie)).data.filter(
          (x: any) => x.startDate === "2031-10-09",
        );
        assert.equal(rows.length + leaves.length, 1);
      });
    } finally {
      await app.close();
    }
  },
);
