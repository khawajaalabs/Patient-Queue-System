import { testDoctorHours } from "./availability-fixture.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, one, type UserRow } from "../db/database.ts";
import { createPostgresDatabase } from "../db/postgres.ts";
import { saveClinic, listClinics, allClinicsState } from "../services/clinics.ts";
import { adminState, patientState, mutateQueue, publicQueue } from "../services/queueService.ts";

test("clinics isolate queues, retain global patients/history, and deactivate without deleting records", async () => {
  const db = process.env["QUEUECARE_AUTH_TEST_SCHEMA"]
    ? await createPostgresDatabase(
        process.env["DATABASE_URL"]!,
        true,
        process.env["QUEUECARE_AUTH_TEST_SCHEMA"],
        () => {},
      )
    : createDatabase(":memory:", () => {});
  try {
    const admin = (await one<UserRow>(db, "SELECT * FROM users WHERE role='admin'"))!;
    const stamp = new Date().toISOString();
    await db
      .prepare("INSERT INTO users VALUES (?,?,?,?,?,?,?,?)")
      .run(
        "global-patient",
        "Global Patient",
        "global@multi.test",
        "123456789",
        "unused",
        "patient",
        stamp,
        stamp,
      );
    const patient = (await one<UserRow>(db, "SELECT * FROM users WHERE id=?", "global-patient"))!;
    const branch = await saveClinic(db, {
      name: "Clifton Clinic",
      publicName: "Clifton Reception",
      address: "Clifton",
      phone: "123456789",
      department: "OPD",
      doctor: "Main Doctor",
      opening: "09:00",
      closing: "17:00",
      prefix: "A",
      showNext: true,
      avgMin: 10,
      active: true,
      consultationFee: 1500,
    });
    assert.equal((await listClinics(db, true)).length, 2);
    await mutateQueue(db, admin, "open", {}, "northstar");
    await mutateQueue(db, admin, "open", {}, branch.id);
    const first = await mutateQueue(db, patient, "join", { reason: "First" }, "northstar");
    const second = await mutateQueue(db, patient, "join", { reason: "Second" }, branch.id);
    assert.equal("tokenCode" in first && first.tokenCode, "A-001");
    assert.equal("tokenCode" in second && second.tokenCode, "A-001");
    await mutateQueue(db, admin, "callNext", {}, branch.id);
    assert.equal((await publicQueue(db, "northstar")).currentToken, null);
    assert.equal((await publicQueue(db, branch.id)).currentToken, "A-001");
    await mutateQueue(db, admin, "done", {}, branch.id);
    const history = (await patientState(db, patient.id, branch.id)).history;
    assert.equal(history.length, 2);
    assert.equal(new Set(history.map((t) => t.clinicId)).size, 2);
    assert.equal((await adminState(db, stamp.slice(0, 10), branch.id)).patients.length, 1);
    assert.equal(
      (await one<{ n: number }>(
        db,
        "SELECT CAST(COUNT(*) AS INTEGER) n FROM users WHERE role='patient'",
      ))!.n,
      1,
    );
    assert.equal(
      (await one<{ n: number }>(db, "SELECT CAST(COUNT(*) AS INTEGER) n FROM visits"))!.n,
      1,
    );
    const summary = await allClinicsState(db);
    assert.equal(summary.totals.patients, 1);
    assert.equal(summary.totals.waiting, 1);
    assert.equal(summary.totals.completed, 1);
    await saveClinic(
      db,
      {
        address: "Clifton",
        phone: "123456789",
        department: "OPD",
        name: "Clifton Updated",
        publicName: "Clifton Reception",
        doctor: "Main Doctor",
        opening: "09:00",
        closing: "17:00",
        prefix: "A",
        showNext: true,
        avgMin: 10,
        active: false,
        consultationFee: 1500,
      },
      branch.id,
    );
    assert.equal((await listClinics(db, false)).length, 1);
    await assert.rejects(() => mutateQueue(db, admin, "open", {}, branch.id));
    assert.equal((await patientState(db, patient.id, "northstar")).history.length, 2);
    assert.equal(
      (await one<{ n: number }>(db, "SELECT CAST(COUNT(*) AS INTEGER) n FROM tokens"))!.n,
      2,
    );
  } finally {
    await db.close();
  }
});
import { createLocalApp } from "../app.ts";
import { once } from "node:events";

test("clinic API enforces admin access and selected-clinic writes; public and patient responses stay private", async () => {
  const server = createLocalApp({ log: () => {} });
  server.http.listen(0, "127.0.0.1");
  await once(server.http, "listening");
  const address = server.http.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/api`;
  async function request(
    path: string,
    cookie = "",
    body?: unknown,
    method = body === undefined ? "GET" : "POST",
  ) {
    const r = await fetch(base + path, {
      method,
      headers: { "Content-Type": "application/json", "X-QueueCare-Request": "1", Cookie: cookie },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return {
      status: r.status,
      data: (await r.json()).data,
      cookie: r.headers.get("set-cookie")?.split(";")[0] ?? "",
    };
  }
  try {
    const admin = await request("/auth/login", "", {
      email: process.env["QUEUECARE_ADMIN_EMAIL"] ?? "admin@queuecare.local",
      password: process.env["QUEUECARE_ADMIN_PASSWORD"] ?? "QueueCareAdmin123!",
    });
    assert.equal(admin.status, 200);
    const patient = await request("/auth/register", "", {
      fullName: "Global API Patient",
      email: "globalapi@multi.test",
      phone: "123456789",
      password: "PatientPassword123!",
    });
    assert.equal(patient.status, 201);
    const input = {
      name: "DHA Clinic",
      publicName: "DHA Reception",
      address: "DHA",
      phone: "123456789",
      department: "OPD",
      doctor: "Main Doctor",
      opening: "09:00",
      closing: "17:00",
      prefix: "D",
      showNext: true,
      avgMin: 7,
      active: true,
      consultationFee: null,
    };
    assert.equal((await request("/admin/clinics", patient.cookie, input)).status, 403);
    assert.equal((await request("/admin/clinics/summary", patient.cookie)).status, 403);
    assert.equal((await request("/admin/clinics")).status, 401);
    const branch = await request("/admin/clinics", admin.cookie, input);
    assert.equal(branch.status, 201);
    const scope = `?clinicId=${branch.data.id}`;
    assert.equal((await request("/admin/queue/open" + scope, admin.cookie, {})).status, 200);
    assert.equal((await request("/admin/queue/open?clinicId=all", admin.cookie, {})).status, 404);
    assert.equal(
      (await request("/patient/token?clinicId=northstar", patient.cookie, {})).status,
      409,
    );
    assert.equal(
      (await request("/patient/token" + scope, patient.cookie, { reason: "Private reason" })).data
        .tokenCode,
      "D-001",
    );
    assert.equal(
      (await request("/admin/queue/call-next?clinicId=northstar", admin.cookie, {})).status,
      409,
    );
    assert.equal((await request("/admin/queue/call-next" + scope, admin.cookie, {})).status, 200);
    const publicState = await request("/public/queue" + scope);
    assert.equal(publicState.data.currentToken, "D-001");
    assert.equal((await request("/public/queue?clinicId=northstar")).data.currentToken, null);
    assert.equal((await request("/public/queue?clinicId=unknown")).status, 404);
    assert.ok(!JSON.stringify(publicState.data).includes("Global API Patient"));
    assert.ok(!JSON.stringify(publicState.data).includes("Private reason"));
    await testDoctorHours(server.db, branch.data.id);
    const second = await request("/auth/register", "", {
      fullName: "Other Patient",
      email: "otherapi@multi.test",
      phone: "123456789",
      password: "PatientPassword123!",
    });
    assert.equal((await request("/patient/state" + scope, second.cookie)).data.mine, null);
    assert.equal((await request("/patient/history", second.cookie)).data.length, 0);
    assert.equal(
      (
        await request("/admin/appointments" + scope, patient.cookie, {
          patientId: patient.data.id,
          scheduledAt: "2026-10-12T10:00",
          reason: "",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await request("/admin/appointments" + scope, admin.cookie, {
          patientId: patient.data.id,
          scheduledAt: "2026-10-12T10:00",
          reason: "",
        })
      ).status,
      201,
    );
    assert.equal(
      (await request("/admin/appointments?clinicId=northstar", admin.cookie)).data.length,
      0,
    );
    assert.equal((await request("/admin/appointments" + scope, admin.cookie)).data.length, 1);
    assert.equal((await request("/admin/appointments?clinicId=all", admin.cookie)).data.length, 1);
    assert.equal(
      (
        await request(
          "/admin/clinics/" + branch.data.id,
          admin.cookie,
          { ...input, active: false },
          "PUT",
        )
      ).status,
      200,
    );
    assert.equal((await request("/patient/token" + scope, second.cookie, {})).status, 409);
    assert.equal((await request("/admin/queue/complete" + scope, admin.cookie, {})).status, 200);
    assert.equal((await request("/patient/history", patient.cookie)).data.length, 1);
    assert.equal(
      (
        await request("/auth/login", "", {
          email: "globalapi@multi.test",
          password: "PatientPassword123!",
        })
      ).data.id,
      patient.data.id,
    );
  } finally {
    await server.close();
  }
});
