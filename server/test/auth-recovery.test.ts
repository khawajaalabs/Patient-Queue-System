import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { createLocalApp } from "../app.ts";
import { createPostgresDatabase } from "../db/postgres.ts";
async function testApp(options: Parameters<typeof createLocalApp>[0]) {
 if(process.env["QUEUECARE_AUTH_TEST_SCHEMA"])options.database=await createPostgresDatabase(process.env["DATABASE_URL"]!,true,process.env["QUEUECARE_AUTH_TEST_SCHEMA"],()=>{});
 return createLocalApp(options);
}
import type { GoogleIdentity } from "../services/identity.ts";

test("password recovery updates QueueCare hash once, expires, revokes sessions and preserves records", async () => {
  const emails: { to: string; url: string }[] = [];
  const server = await testApp({
    log: () => {},
    auth: {
      verifyRecovery: async (code, verifier) => {
        assert.ok(verifier.length >= 43);
        if (code !== "valid-code") throw Error("Invalid proof");
        return "reset@example.com";
      },
      sendReset: async (to, url) => {
        emails.push({ to, url });
      },
    },
  });
  server.http.listen(0, "127.0.0.1");
  await once(server.http, "listening");
  const address = server.http.address();
  assert.ok(address && typeof address !== "string");
  const base = "http://127.0.0.1:" + address.port;
  async function req(path: string, body?: unknown, cookie = "") {
    const response = await fetch(base + "/api/auth" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", "X-QueueCare-Request": "1", Cookie: cookie },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return {
      status: response.status,
      data: await response.json(),
      cookie: response.headers.get("set-cookie")?.split(";")[0] ?? "",
    };
  }
  try {
    const registered = await req("/register", {
      fullName: "Retained Patient",
      email: "reset@example.com",
      phone: "123456789",
      password: "OldPassword123!",
    });
    const id = registered.data.data.id;
    const known = await req("/forgot-password", { email: "reset@example.com" });
    const unknown = await req("/forgot-password", { email: "unknown@example.com" });
    assert.deepEqual(known.data, unknown.data);
    assert.equal(emails.length, 1);
    const flow = new URL(emails[0]!.url).searchParams.get("flow");
    assert.ok(flow);
    assert.equal(
      (await req("/verify-reset", { flow: "x".repeat(64), code: "invalid" })).status,
      400,
    );
    const token = (await req("/verify-reset", { flow, code: "valid-code" })).data.data.token;
    assert.equal((await req("/verify-reset", { flow, code: "valid-code" })).status, 400);
    assert.match(token, /^[a-f0-9]{64}$/);
    const stored = (await server.db
      .prepare("SELECT * FROM auth_requests WHERE kind='password_reset'")
      .get()) as { token_hash: string; payload: string | null };
    assert.equal(stored.token_hash, createHash("sha256").update(token).digest("hex"));
    assert.equal(stored.payload, null);
    assert.equal(
      (
        await req("/reset-password", {
          token,
          password: "NewPassword123!",
          confirmPassword: "mismatch",
        })
      ).status,
      400,
    );
    const attempts = await Promise.all([
      req("/reset-password", {
        token,
        password: "NewPassword123!",
        confirmPassword: "NewPassword123!",
      }),
      req("/reset-password", {
        token,
        password: "NewPassword123!",
        confirmPassword: "NewPassword123!",
      }),
    ]);
    assert.deepEqual(attempts.map((x) => x.status).sort(), [200, 400]);
    assert.equal((await req("/me", undefined, registered.cookie)).data.data, null);
    assert.equal(
      (await req("/login", { email: "reset@example.com", password: "OldPassword123!" })).status,
      401,
    );
    const login = await req("/login", { email: "reset@example.com", password: "NewPassword123!" });
    assert.equal(login.data.data.id, id);
    assert.equal(login.data.data.phone, "123456789");
    const expired = "a".repeat(64);
    await server.db
      .prepare("INSERT INTO auth_requests VALUES (?,?,?,?,?,?)")
      .run(createHash("sha256").update(expired).digest("hex"), "password_reset", id, null, 0, 0);
    assert.equal(
      (
        await req("/reset-password", {
          token: expired,
          password: "NewPassword123!",
          confirmPassword: "NewPassword123!",
        })
      ).status,
      400,
    );
  } finally {
    await server.close();
  }
});

test("Google PKCE binds the browser, preserves patient ID/history, rejects admins and requires real phone", async () => {
  let identity: GoogleIdentity = {
    subject: "google-subject",
    email: "existing@example.com",
    fullName: "Verified Patient",
    phone: "",
  };
  const server = await testApp({
    log: () => {},
    auth: {
      google: {
        authorizationUrl: () => "https://accounts.example/authorize",
        verifyCode: async (code, verifier) => {
          assert.equal(code, "verified-code");
          assert.ok(verifier.length >= 43);
          return identity;
        },
      },
    },
  });
  server.http.listen(0, "127.0.0.1");
  await once(server.http, "listening");
  const address = server.http.address();
  assert.ok(address && typeof address !== "string");
  const base = "http://127.0.0.1:" + address.port;
  async function req(path: string, body?: unknown, cookie = "") {
    const r = await fetch(base + "/api/auth" + path, {
      redirect: "manual",
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", "X-QueueCare-Request": "1", Cookie: cookie },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return {
      status: r.status,
      location: r.headers.get("location"),
      cookie: r.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; "),
      data: r.headers.get("content-type")?.includes("application/json") ? await r.json() : null,
    };
  }
  async function google() {
    const start = await req("/google/start", {});
    return req("/google/callback?code=verified-code", undefined, start.cookie);
  }
  try {
    const existing = await req("/register", {
      fullName: "Original Patient",
      email: identity.email,
      phone: "123456789",
      password: "Existing123!",
    });
    const id = existing.data.data.id;
    const signed = await google();
    assert.equal(signed.status, 303);
    assert.ok(signed.location?.endsWith("/patient/dashboard"));
    assert.equal((await req("/me", undefined, signed.cookie)).data.data.id, id);
    assert.equal(
      (await req("/google/callback?code=verified-code")).location?.includes("error=google"),
      true,
    );
    identity = { ...identity, subject: "admin-subject", email: "admin@queuecare.local" };
    const denied = await google();
    assert.ok(denied.location?.includes("error=google"));
    assert.equal((await req("/me", undefined, denied.cookie)).data.data, null);
    identity = { ...identity, subject: "new-subject", email: "new-google@example.com" };
    const pending = await google();
    assert.ok(pending.location?.endsWith("/complete-profile"));
    assert.equal((await req("/me", undefined, pending.cookie)).data.data, null);
    assert.equal(
      (await req("/google/complete", { phone: "", fullName: "New Patient" }, pending.cookie))
        .status,
      400,
    );
    const complete = await req(
      "/google/complete",
      { phone: "+92 300 1234567", fullName: "New Patient" },
      pending.cookie,
    );
    assert.equal(complete.data.data.role, "patient");
    assert.equal(complete.data.data.phone, "+92 300 1234567");
    assert.equal(
      (await req("/google/complete", { phone: "123456789", fullName: "Replay" }, pending.cookie))
        .status,
      400,
    );
    assert.equal(
      (
        (await server.db
          .prepare("SELECT CAST(count(*) AS INTEGER) AS count FROM users WHERE role='admin'")
          .get()) as { count: number }
      ).count,
      1,
    );
  } finally {
    await server.close();
  }
});
