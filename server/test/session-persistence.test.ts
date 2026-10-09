import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { createLocalApp } from "../app.ts";
import { createPostgresDatabase } from "../db/postgres.ts";

test(
  "persistent password/Google sessions, browser reload, rotation, expiry and logout",
  { timeout: 180000 },
  async () => {
    const schema = process.env["QUEUECARE_SESSION_TEST_SCHEMA"];
    const database = schema
      ? await createPostgresDatabase(process.env["DATABASE_URL"]!, true, schema, () => {})
      : undefined;
    const app = createLocalApp({
      ...(database ? { database } : {}),
      trustProxy: true,
      appUrl: "https://queuecare.example",
      log: () => {},
      auth: {
        google: {
          authorizationUrl: () => "https://accounts.example/authorize",
          verifyCode: async () => ({
            subject: "session-patient",
            email: "session@example.invalid",
            fullName: "Session Patient",
            phone: "123456789",
          }),
        },
      },
    });
    app.http.listen(0, "127.0.0.1");
    await once(app.http, "listening");
    const address = app.http.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}/api/auth`;
    async function request(path: string, cookie = "", body?: unknown, expected = 200) {
      const response = await fetch(base + path, {
        method: body === undefined ? "GET" : "POST",
        redirect: "manual",
        headers: {
          "Content-Type": "application/json",
          "X-QueueCare-Request": "1",
          "X-Forwarded-Proto": "https",
          ...(cookie ? { Cookie: cookie } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      assert.ok(
        expected === 200 ? response.status < 400 : response.status === expected,
        "Auth request failed: " + path,
      );
      const header = response.headers.get("set-cookie") ?? "";
      return {
        response,
        header,
        cookie: header.split(";")[0]!,
        data: response.status === 303 ? null : (await response.json()).data,
      };
    }
    const credentials = { email: "session@example.invalid", password: "SessionTestPassword123!" };
    const count = async () =>
      Number(
        (
          (await app.db
            .prepare("SELECT count(*) count FROM sessions WHERE user_id=?")
            .get(userId)) as { count: number }
        ).count,
      );
    const digest = (cookie: string) =>
      createHash("sha256").update(cookie.split("=")[1]!).digest("hex");
    let userId = "";
    try {
      const registered = await request("/register", "", {
        ...credentials,
        fullName: "Session Patient",
        phone: "123456789",
      });
      userId = registered.data.id;
      const login = await request("/login", registered.cookie, credentials);
      assert.equal(await count(), 1);
      assert.ok(/HttpOnly/.test(login.header), "Session cookie must be HttpOnly");
      assert.ok(/; Secure/.test(login.header), "Production session cookie must be Secure");
      assert.ok(/SameSite=Lax/.test(login.header), "OAuth-compatible Lax session cookie required");
      assert.ok(/Max-Age=604800/.test(login.header), "Session cookie must persist seven days");
      assert.ok(
        /Path=\//.test(login.header) && !/Domain=/i.test(login.header),
        "Session cookie must be host-only at root",
      );
      const row = (await app.db
        .prepare("SELECT expires_at FROM sessions WHERE token_hash=?")
        .get(digest(login.cookie))) as { expires_at: number };
      assert.ok(
        Number(row.expires_at) > Date.now() + 6.99 * 86400000 &&
          Number(row.expires_at) <= Date.now() + 7 * 86400000,
        "Database expiry uses epoch milliseconds",
      );
      for (let i = 0; i < 4; i++)
        assert.equal((await request("/me", login.cookie)).data.id, userId);
      const other = await request("/login", "", credentials);
      assert.equal(await count(), 2, "Other browser sessions survive login");
      const rotated = await request("/login", login.cookie, credentials);
      assert.equal(await count(), 2, "Only current browser session is replaced");
      assert.equal((await request("/me", login.cookie)).data, null);
      assert.equal((await request("/me", other.cookie)).data.id, userId);
      const prepare = app.db.prepare.bind(app.db);
      app.db.prepare = (sql) => {
        const statement = prepare(sql);
        return sql.startsWith("INSERT INTO sessions")
          ? {
              ...statement,
              run: async () => {
                throw Error("Simulated session insert failure");
              },
            }
          : statement;
      };
      try {
        await request("/login", rotated.cookie, credentials, 500);
      } finally {
        app.db.prepare = prepare;
      }
      assert.equal(
        (await request("/me", rotated.cookie)).data.id,
        userId,
        "Failed session rotation preserves the previous session",
      );
      const start = await request("/google/start", "", {});
      const google = await request("/google/callback?code=verified", start.cookie);
      const googleCookie = google.header.match(/queuecare_session=[a-f0-9]+/)?.[0] ?? "";
      assert.equal(google.response.status, 303);
      assert.ok(
        /SameSite=Lax/.test(google.header) && /Max-Age=604800/.test(google.header),
        "Google session must persist",
      );
      assert.equal((await request("/me", googleCookie)).data.id, userId);
      await app.db
        .prepare("UPDATE sessions SET expires_at=? WHERE token_hash=?")
        .run(Date.now() - 1, digest(other.cookie));
      assert.equal((await request("/me", other.cookie)).data, null);
      const logout = await request("/logout", rotated.cookie, {});
      assert.ok(
        /SameSite=Lax/.test(logout.header) && /; Secure/.test(logout.header),
        "Logout must match session cookie attributes",
      );
      assert.equal((await request("/me", rotated.cookie)).data, null);
      assert.equal((await request("/me", googleCookie)).data.id, userId);
    } finally {
      await app.close();
    }
  },
);
