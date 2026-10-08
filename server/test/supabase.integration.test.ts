import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { once } from "node:events";

import { io as connect } from "socket.io-client";
import { createLocalApp } from "../app.ts";
import { createPostgresDatabase } from "../db/postgres.ts";

const connection = process.env["DATABASE_URL"];
test(
  "Supabase PostgreSQL: auth, queue lifecycle, concurrency, privacy, realtime and restart",
  { skip: !connection || !process.env["SUPABASE_ACCESS_TOKEN"], timeout: 180000 },
  async () => {
    const schema = `queuecare_test_${randomBytes(8).toString("hex")}`;
    async function adminQuery(query: string) {
      const response = await fetch(
        `https://api.supabase.com/v1/projects/${process.env["SUPABASE_PROJECT_REF"]}/database/query`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env["SUPABASE_ACCESS_TOKEN"]}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query }),
        },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          `Supabase test schema operation failed (${response.status}): ${JSON.stringify(body)}`,
        );
      return body;
    }
    let instance: ReturnType<typeof createLocalApp> | undefined;
    let socket: ReturnType<typeof connect> | undefined;
    let base = "";
    const password = "IntegrationPatient123!";
    async function start() {
      instance = createLocalApp({
        database: await createPostgresDatabase(connection!, true, schema, () => {}),
      });
      instance.http.listen(0, "127.0.0.1");
      await once(instance.http, "listening");
      const address = instance.http.address();
      assert.ok(address && typeof address !== "string");
      base = `http://127.0.0.1:${address.port}`;
    }
    async function request(
      path: string,
      cookie = "",
      body?: unknown,
      method = body === undefined ? "GET" : "POST",
    ) {
      const response = await fetch(base + "/api" + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-QueueCare-Request": "1",
          ...(cookie ? { Cookie: cookie } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const envelope = await response.json();
      return {
        status: response.status,
        data: envelope.data,
        error: envelope.error,
        cookie: response.headers.get("set-cookie")?.split(";")[0] ?? "",
      };
    }
    try {
      // Isolated disposable schema: never inserts test patients or visits into queuecare.
      const migration = readFileSync(
        "supabase/migrations/20261007000100_queuecare_postgresql.sql",
        "utf8",
      )
        .replace(/^CREATE ROLE queuecare_backend[^;]+;\r?\n/m, "")
        .replace(/\bqueuecare\b/g, schema);
      await adminQuery(migration);
      for (const file of [
        "20261007000200_google_and_password_recovery.sql",
        "20261008000100_multi_clinic_foundation.sql",
        "20261008000200_clinical_records.sql",
        "20261008000300_staff_documents_billing.sql",
      ])
        await adminQuery(
          readFileSync("supabase/migrations/" + file, "utf8").replace(/\bqueuecare\b/g, schema),
        );
      await start();
      assert.equal((await request("/public/queue")).data.currentToken, null);
      const admin = await request("/auth/login", "", {
        email: process.env["QUEUECARE_ADMIN_EMAIL"] ?? "admin@queuecare.local",
        password: process.env["QUEUECARE_ADMIN_PASSWORD"],
      });
      assert.equal(admin.status, 200);
      const action = (name: string, body = {}) =>
        request(`/admin/queue/${name}`, admin.cookie, body);
      const register = (i: number) =>
        request("/auth/register", "", {
          fullName: `Private Patient ${i}`,
          email: `patient${i}@queuecare-test.invalid`,
          phone: "+92 300 1234567",
          password,
        });
      const first = await register(1),
        second = await register(2);
      assert.equal(first.status, 201);
      assert.equal(second.status, 201);
      assert.equal(
        (
          await request("/auth/register", "", {
            fullName: "Intruder",
            email: "intruder@test.invalid",
            phone: "+923001234567",
            password,
            role: "admin",
          })
        ).status,
        400,
      );
      assert.equal((await request("/admin/state", first.cookie)).status, 403);
      assert.equal(
        (
          await request("/auth/login", "", {
            email: "patient1@queuecare-test.invalid",
            password: "WrongPassword123!",
          })
        ).status,
        401,
      );
      assert.equal((await request("/patient/token", first.cookie, {})).status, 409);
      assert.equal((await action("open")).status, 200);
      assert.equal((await action("open")).status, 200);
      socket = connect(base, { transports: ["websocket"], reconnection: false });
      await new Promise<void>((resolve, reject) => {
        socket!.once("connect", resolve);
        socket!.once("connect_error", reject);
      });
      const event = new Promise<unknown[]>((resolve) =>
        socket!.once("queue:updated", (...args: unknown[]) => resolve(args)),
      );
      const duplicates = await Promise.all([
        request("/patient/token", first.cookie, {}),
        request("/patient/token", first.cookie, {}),
      ]);
      assert.equal(duplicates[0]!.status, 200);
      assert.equal(duplicates[0]!.data.id, duplicates[1]!.data.id);
      assert.deepEqual(await event, []);
      const token1 = duplicates[0]!.data;
      const token2 = (await request("/patient/token", second.cookie, {})).data;
      assert.equal(token1.tokenNumber, 1);
      assert.equal(token2.tokenNumber, 2);
      const patientState = (await request("/patient/state", second.cookie)).data;
      assert.equal(patientState.ahead, 1);
      assert.equal(patientState.eta, patientState.clinic.averageConsultationMinutes);
      const calls = await Promise.all([action("call-next"), action("call-next")]);
      assert.deepEqual(calls.map((r) => r.status).sort(), [200, 409]);
      assert.equal((await action("call-again")).data.callCount, 2);
      const pub = (await request("/public/queue")).data;
      assert.equal(pub.currentToken, token1.tokenCode);
      assert.doesNotMatch(
        JSON.stringify(pub),
        /Private Patient|patient1@|1234567|reasonForVisit|patientId|password|token_hash/,
      );
      assert.equal((await action("skip", { token: token1.tokenCode })).status, 200);
      assert.equal((await action("requeue", { token: token1.tokenCode })).status, 200);
      assert.equal((await action("call", { token: token1.tokenCode })).status, 409);
      assert.equal((await action("call", { token: token2.tokenCode })).status, 200);
      assert.equal((await action("complete")).status, 200);
      assert.equal(
        (await request("/patient/token/cancel", first.cookie, {})).data.status,
        "cancelled",
      );
      assert.equal((await action("close")).status, 200);
      assert.equal((await request("/patient/token", first.cookie, {})).status, 409);
      assert.equal((await action("open")).status, 200);
      const third = (await request("/patient/token", first.cookie, {})).data;
      assert.equal(third.tokenNumber, 3);
      assert.equal((await action("call-next")).data.id, third.id);
      assert.equal((await action("complete")).status, 200);
      const adminState = (await request("/admin/state", admin.cookie)).data;
      const c = adminState.clinic;
      assert.equal(
        (
          await request(
            "/admin/settings",
            admin.cookie,
            {
              clinic: {
                name: c.name,
                publicName: "Supabase integration display",
                address: c.address,
                phone: c.phone,
                department: c.department,
                doctor: c.doctorName,
                opening: c.openingTime,
                closing: c.closingTime,
                prefix: c.tokenPrefix,
                showNext: false,
              },
              avgMin: 8,
            },
            "PUT",
          )
        ).status,
        200,
      );
      assert.equal(
        (await request("/public/queue")).data.displayName,
        "Supabase integration display",
      );
      assert.equal((await request("/admin/patients", admin.cookie)).data.length, 2);
      const ownHistory = (await request("/patient/history", first.cookie)).data;
      assert.equal(ownHistory.length, 2);
      assert.ok(ownHistory.every((row: { patientId: string }) => row.patientId === first.data.id));
      assert.equal((await request("/admin/history", admin.cookie)).data.length, 3);
      // Verify direct browser-role reads cannot bypass Express privacy controls.
      const permissions = await adminQuery(
        `SELECT has_schema_privilege('anon','${schema}','USAGE') AS anon_access, has_schema_privilege('authenticated','${schema}','USAGE') AS authenticated_access, has_table_privilege('anon','${schema}.users','SELECT') AS patient_read`,
      );
      assert.equal(permissions[0].anon_access, false);
      assert.equal(permissions[0].authenticated_access, false);
      assert.equal(permissions[0].patient_read, false);
      socket.disconnect();
      await instance!.close();
      instance = undefined;
      await start();
      assert.equal((await request("/auth/me", first.cookie)).data.id, first.data.id);
      assert.equal((await request("/admin/history", admin.cookie)).data.length, 3);
      assert.equal((await request("/public/queue")).data.averageConsultationMinutes, 8);
      assert.equal((await request("/auth/logout", first.cookie, {})).status, 200);
      assert.equal((await request("/auth/me", first.cookie)).data, null);
      const relogin = await request("/auth/login", "", {
        email: "patient1@queuecare-test.invalid",
        password,
      });
      assert.equal(relogin.status, 200);
      assert.notEqual(relogin.cookie, first.cookie);
    } finally {
      socket?.disconnect();
      if (instance) await instance.close();
      // The generated identifier is validated and is exclusively this test's schema.
      if (!/^queuecare_test_[a-f0-9]{16}$/.test(schema)) throw new Error("Invalid cleanup schema.");
      await adminQuery(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    }
  },
);
