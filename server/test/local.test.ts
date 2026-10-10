import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { once } from "node:events";
import { io as connect, type Socket } from "socket.io-client";
import { compareSync } from "bcryptjs";
import { createLocalApp } from "../app.ts";
import { one, type UserRow } from "../db/database.ts";
import type {
  UserProfile,
  QueueToken,
  QueueResponse,
  PublicQueue,
  DailyQueue,
  ClinicConfig,
} from "../../src/types/local.ts";
type Result<T> = {
  response: Response;
  data: T;
  error: { code: string; message: string } | undefined;
  cookie: string;
};
const password = "PatientPass123!";
function socketEvent(socket: Socket, event: string): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, received);
      reject(new Error(`Socket event timed out: ${event}`));
    }, 5000);
    function received(...args: unknown[]) {
      clearTimeout(timer);
      resolve(args);
    }
    socket.once(event, received);
  });
}

test("local authentication, queue lifecycle, privacy, realtime and persistence", async (t) => {
  mkdirSync("work", { recursive: true });
  const directory = mkdtempSync(path.resolve("work", "backend-test-"));
  const dbPath = path.join(directory, "queuecare.db");
  const logs: string[] = [];
  let server = createLocalApp({ dbPath, log: (value) => logs.push(value) });
  let base = "";
  let admin = "",
    patient = "",
    second = "";
  let user: UserProfile, token: QueueToken, nextToken: QueueToken;
  const sockets: Socket[] = [];
  async function listen() {
    server.http.listen(0, "127.0.0.1");
    await once(server.http, "listening");
    const address = server.http.address();
    assert.ok(address && typeof address !== "string");
    base = `http://127.0.0.1:${address.port}`;
  }
  async function request<T>(
    url: string,
    cookie = "",
    body?: unknown,
    method = body === undefined ? "GET" : "POST",
  ): Promise<Result<T>> {
    const response = await fetch(base + "/api" + url, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-QueueCare-Request": "1",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const envelope = (await response.json()) as {
      data: T;
      error?: { code: string; message: string };
    };
    return {
      response,
      data: envelope.data,
      error: envelope.error,
      cookie: response.headers.get("set-cookie")?.split(";")[0] ?? "",
    };
  }
  async function register(email: string, fullName = "Local Patient") {
    return request<UserProfile>("/auth/register", "", {
      fullName,
      email,
      phone: "+92 300 1234567",
      password,
    });
  }
  async function action<T = QueueToken>(name: string, body: unknown = {}) {
    return request<T>(`/admin/queue/${name}`, admin, body);
  }
  await listen();
  try {
    await t.test(
      "fresh startup creates only clinic and hashed admin, no queue activity",
      async () => {
        assert.equal(logs.length, 1);
        assert.match(logs[0]!, /Local admin created/);
        const row = (await one<UserRow>(server.db, "SELECT * FROM users WHERE role='admin'"))!;
        assert.ok(compareSync("QueueCareAdmin123!", row.password_hash));
        assert.notEqual(row.password_hash, "QueueCareAdmin123!");
        for (const table of ["tokens", "daily_queues"])
          assert.equal(
            (await one<{ n: number }>(server.db, `SELECT COUNT(*) AS n FROM ${table}`))!.n,
            0,
          );
        assert.equal(
          (await one<{ n: number }>(
            server.db,
            "SELECT COUNT(*) AS n FROM users WHERE role='patient'",
          ))!.n,
          0,
        );
      },
    );
    await t.test("health and anonymous public empty state work", async () => {
      const health = await fetch(base + "/api/health");
      assert.deepEqual(await health.json(), { status: "ok" });
      const pub = await request<PublicQueue>("/public/queue");
      assert.equal(pub.data.status, "unavailable");
      assert.equal(pub.data.currentToken, null);
      assert.deepEqual(pub.data.waitingTokens, []);
    });
    await t.test("registration validates input and refuses supplied admin role", async () => {
      assert.equal(
        (
          await request("/auth/register", "", {
            fullName: "Escalation",
            email: "bad@example.com",
            phone: "+923001234567",
            password,
            role: "admin",
          })
        ).response.status,
        400,
      );
      assert.equal(
        (
          await request("/auth/register", "", {
            fullName: "",
            email: "invalid",
            phone: "abc",
            password: "short",
          })
        ).response.status,
        400,
      );
    });
    await t.test("patient registration creates a patient session and a bcrypt hash", async () => {
      const result = await register("patient@example.com", "Private Patient");
      assert.equal(result.response.status, 201);
      user = result.data;
      patient = result.cookie;
      assert.equal(user.role, "patient");
      assert.equal("password_hash" in user, false);
      assert.equal("password" in user, false);
      const row = (await one<UserRow>(server.db, "SELECT * FROM users WHERE id=?", user.id))!;
      assert.ok(compareSync(password, row.password_hash));
      assert.match(row.password_hash, /^\$2[ab]\$12\$/);
      assert.match(result.response.headers.get("set-cookie")!, /HttpOnly/);
      assert.match(result.response.headers.get("set-cookie")!, /SameSite=Lax/);
      const stored = (await one<{ token_hash: string }>(
        server.db,
        "SELECT token_hash FROM sessions WHERE user_id=?",
        user.id,
      ))!;
      assert.notEqual(stored.token_hash, patient.split("=")[1]);
    });
    await t.test("duplicate email is rejected case-insensitively", async () => {
      assert.equal((await register("PATIENT@example.com")).response.status, 409);
    });
    await t.test("me restores identity and logout revokes the server session", async () => {
      assert.equal((await request<UserProfile>("/auth/me", patient)).data.id, user.id);
      assert.equal((await request("/auth/logout", patient, {})).response.status, 200);
      assert.equal((await request<UserProfile | null>("/auth/me", patient)).data, null);
      assert.equal((await request("/patient/state", patient)).response.status, 401);
    });
    await t.test("patient login verifies password and rotates session", async () => {
      assert.equal(
        (await request("/auth/login", "", { email: user.email, password: "wrongPassword!" }))
          .response.status,
        401,
      );
      const result = await request<UserProfile>("/auth/login", "", { email: user.email, password });
      assert.equal(result.response.status, 200);
      patient = result.cookie;
      const old = patient;
      patient = (
        await request<UserProfile>("/auth/login", patient, { email: user.email, password })
      ).cookie;
      assert.notEqual(patient, old);
      assert.equal((await request("/auth/me", old)).data, null);
    });
    await t.test("admin logs in and patient cannot access any admin operation", async () => {
      const result = await request<UserProfile>("/auth/login", "", {
        email: "admin@queuecare.local",
        password: "QueueCareAdmin123!",
      });
      assert.equal(result.data.role, "admin");
      admin = result.cookie;
      for (const name of [
        "open",
        "close",
        "call-next",
        "call",
        "complete",
        "skip",
        "requeue",
        "call-again",
      ])
        assert.equal((await request(`/admin/queue/${name}`, patient, {})).response.status, 403);
      assert.equal((await request("/admin/settings", patient, {}, "PUT")).response.status, 403);
      for (const endpoint of ["/admin/state", "/admin/history", "/admin/patients"])
        assert.equal((await request(endpoint, patient)).response.status, 403);
      assert.equal((await request("/patient/token", admin, {})).response.status, 403);
      assert.equal((await request("/admin/state")).response.status, 401);
    });
    await t.test("foreign origins and requests without CSRF marker are rejected", async () => {
      const foreign = await fetch(base + "/api/admin/queue/open", {
        method: "POST",
        headers: {
          Origin: "https://other.example",
          Cookie: admin,
          "X-QueueCare-Request": "1",
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      assert.equal(foreign.status, 403);
      const unmarked = await fetch(base + "/api/admin/queue/open", {
        method: "POST",
        headers: { Cookie: admin, "Content-Type": "application/json" },
        body: "{}",
      });
      assert.equal(unmarked.status, 403);
    });
    await t.test("patient cannot join before a queue is opened", async () => {
      assert.equal((await request("/patient/token", patient, {})).error?.code, "NO_QUEUE");
    });
    await t.test("open creates exactly one daily queue and is idempotent", async () => {
      const first = await action<DailyQueue>("open"),
        again = await action<DailyQueue>("open");
      assert.equal(first.response.status, 200);
      assert.equal(first.data.id, again.data.id);
      assert.equal(first.data.nextTokenNumber, 1);
      assert.equal(
        (await one<{ n: number }>(server.db, "SELECT COUNT(*) AS n FROM daily_queues"))!.n,
        1,
      );
    });
    await t.test("first token is A-001 and duplicate requests reuse it", async () => {
      const result = await request<QueueToken>("/patient/token", patient, {
        reason: "Private reason",
      });
      token = result.data;
      assert.equal(token.tokenCode, "A-001");
      assert.equal(token.patientId, user.id);
      const results = await Promise.all([
        request<QueueToken>("/patient/token", patient, {}),
        request<QueueToken>("/patient/token", patient, {}),
      ]);
      assert.ok(results.every((result) => result.data.id === token.id));
      assert.equal(
        (await one<{ n: number }>(
          server.db,
          "SELECT COUNT(*) AS n FROM tokens WHERE patient_id=?",
          user.id,
        ))!.n,
        1,
      );
    });
    await t.test(
      "second patient gets sequential token and cannot cancel another patient",
      async () => {
        second = (await register("second@example.com", "Second Patient")).cookie;
        nextToken = (await request<QueueToken>("/patient/token", second, {})).data;
        assert.equal(nextToken.tokenCode, "A-002");
        const tampered = await request("/patient/token/cancel", second, {
          token: token.tokenCode,
          patientId: user.id,
        });
        assert.equal(tampered.response.status, 400);
        assert.equal(
          (await request<QueueResponse>("/patient/state", patient)).data.mine?.status,
          "waiting",
        );
      },
    );
    await t.test("position and wait estimate count real waiting rows", async () => {
      const state = (
        await request<QueueResponse & { ahead: number; eta: number }>("/patient/state", second)
      ).data;
      assert.equal(state.ahead, 1);
      assert.equal(state.eta, state.clinic.averageConsultationMinutes);
    });
    await t.test("concurrent issuance produces unique consecutive numbers", async () => {
      const registrations = await Promise.all(
        Array.from({ length: 4 }, (_, index) => register(`concurrent${index}@example.com`)),
      );
      const tokens = await Promise.all(
        registrations.map((result) => request<QueueToken>("/patient/token", result.cookie, {})),
      );
      assert.deepEqual(
        tokens.map((result) => result.data.tokenNumber).sort((a, b) => a - b),
        [3, 4, 5, 6],
      );
      assert.equal(new Set(tokens.map((result) => result.data.id)).size, 4);
    });
    await t.test(
      "specific calls preserve order and call-next starts earliest waiting token",
      async () => {
        assert.equal(
          (await action("call", { token: nextToken.tokenCode })).error?.code,
          "QUEUE_ORDER",
        );
        const result = await action("call-next");
        assert.equal(result.data.id, token.id);
        assert.equal(result.data.status, "serving");
        assert.ok(result.data.calledAt);
      },
    );
    await t.test(
      "multiple serving patients and cancelling a serving token are prevented",
      async () => {
        assert.equal((await action("call-next")).error?.code, "ALREADY_SERVING");
        assert.equal((await request("/patient/token/cancel", patient, {})).response.status, 409);
        assert.equal(
          (await one<{ n: number }>(
            server.db,
            "SELECT COUNT(*) AS n FROM tokens WHERE status='serving'",
          ))!.n,
          1,
        );
      },
    );
    await t.test("call-again increments the current token's call count", async () => {
      const result = await action("call-again");
      assert.equal(result.data.status, "serving");
      assert.equal(result.data.callCount, 2);
      assert.ok(result.data.lastCalledAt);
    });
    await t.test(
      "public response and anonymous socket payloads contain no patient data",
      async () => {
        const result = (await request<PublicQueue>("/public/queue")).data;
        assert.equal(result.currentToken, token.tokenCode);
        assert.deepEqual(
          Object.keys(result).sort(),
          [
            "name",
            "displayName",
            "department",
            "tokenPrefix",
            "averageConsultationMinutes",
            "publicDisplayShowNext",
            "queueDate",
            "status",
            "currentToken",
            "nextTokens",
            "waitingTokens",
            "updatedAt",
          ].sort(),
        );
        const json = JSON.stringify(result);
        for (const privateValue of [
          user.id,
          user.fullName,
          user.email,
          user.phone,
          "Private reason",
          "password_hash",
        ])
          assert.equal(json.includes(privateValue), false);
        for (const entry of result.waitingTokens)
          assert.deepEqual(Object.keys(entry).sort(), ["queueOrder", "tokenCode"]);
      },
    );
    await t.test(
      "three realtime clients receive invalidation and refetch committed state",
      async () => {
        for (let index = 0; index < 3; index++) {
          const socket = connect(base, { transports: ["websocket"], reconnection: false });
          sockets.push(socket);
          await socketEvent(socket, "connect");
        }
        const events = sockets.map((socket) => socketEvent(socket, "queue:updated"));
        const completed = await action("complete");
        assert.equal(completed.data.status, "completed");
        const payloads = await Promise.all(events);
        assert.ok(payloads.every((payload) => payload.length === 0));
        const [staff, own, pub] = await Promise.all([
          request<QueueResponse>("/admin/state", admin),
          request<QueueResponse>("/patient/state", patient),
          request<PublicQueue>("/public/queue"),
        ]);
        assert.equal(staff.data.queue.find((entry) => entry.id === token.id)?.status, "completed");
        assert.equal(own.data.mine?.status, "completed");
        assert.equal(pub.data.currentToken, null);
        assert.ok(completed.data.completedAt);
      },
    );
    await t.test("patient history is private and admin history shows real visits", async () => {
      const own = (
        await request<QueueToken[]>("/patient/history?patientId=" + nextToken.patientId, patient)
      ).data;
      assert.ok(own.every((entry) => entry.patientId === user.id));
      assert.equal(own[0]?.status, "completed");
      const all = (await request<QueueToken[]>("/admin/history", admin)).data;
      assert.equal(all.length, 6);
      assert.ok(all.some((entry) => entry.completedAt));
      const patients = (await request<QueueResponse["patients"]>("/admin/patients", admin)).data;
      assert.equal(patients.length, 6);
    });
    await t.test("skip removes from position and move-back preserves number at end", async () => {
      const skipped = await action("skip", { token: nextToken.tokenCode });
      assert.equal(skipped.data.status, "skipped");
      assert.ok(skipped.data.skippedAt);
      assert.equal((await request<QueueToken>("/patient/token", second, {})).data.id, nextToken.id);
      const moved = await action("requeue", { token: nextToken.tokenCode });
      assert.equal(moved.data.tokenNumber, 2);
      assert.equal(moved.data.status, "waiting");
      assert.ok(moved.data.queueOrder > 6);
      const own = (
        await request<QueueResponse & { ahead: number; eta: number }>("/patient/state", second)
      ).data;
      assert.equal(own.ahead, 4);
      assert.equal(own.eta, 20);
    });
    await t.test("patient cancellation retains history and permits a new visit", async () => {
      const cancelled = await request<QueueToken>("/patient/token/cancel", second, {});
      assert.equal(cancelled.data.status, "cancelled");
      assert.ok(cancelled.data.cancelledAt);
      assert.equal(
        (await request<QueueToken[]>("/patient/history", second)).data[0]?.status,
        "cancelled",
      );
      assert.equal((await request<QueueToken>("/patient/token", second, {})).data.tokenNumber, 7);
    });
    await t.test(
      "closing prevents new issuance and reopening preserves counter/history",
      async () => {
        await action("close");
        assert.equal((await action("call-next")).error?.code, "QUEUE_CLOSED");
        assert.equal((await request("/patient/token", patient, {})).error?.code, "QUEUE_CLOSED");
        assert.equal((await request<PublicQueue>("/public/queue")).data.status, "closed");
        const opened = await action<DailyQueue>("open");
        assert.equal(opened.data.nextTokenNumber, 8);
        assert.equal((await request<QueueToken[]>("/admin/history", admin)).data.length, 7);
      },
    );
    await t.test(
      "settings validate and update private/public data and preserve internal token prefix",
      async () => {
        const current = (await request<ClinicConfig>("/clinic", admin)).data;
        const clinic = {
          name: "Updated Local Clinic",
          publicName: "Updated Reception",
          address: current.address,
          phone: current.phone,
          department: "Local OPD",
          doctor: "Local Doctor",
          opening: "08:00",
          closing: "18:00",
          prefix: "QC",
          showNext: false,
        };
        assert.equal(
          (await request("/admin/settings", admin, { clinic, avgMin: 0 }, "PUT")).response.status,
          400,
        );
        assert.equal(
          (await request("/admin/settings", admin, { clinic, avgMin: 8 }, "PUT")).response.status,
          200,
        );
        const pub = (await request<PublicQueue>("/public/queue")).data;
        assert.equal(pub.displayName, "Updated Reception");
        assert.deepEqual(pub.nextTokens, []);
        const issued = (await request<QueueToken>("/patient/token", patient, {})).data;
        assert.equal(issued.tokenCode, "A-008");
        assert.equal(issued.department, "Local OPD");
      },
    );
    await t.test("invalid transitions and selectors never partially mutate records", async () => {
      assert.equal((await action("complete", { token: "A-003" })).response.status, 409);
      assert.equal((await action("requeue", { token: "A-003" })).response.status, 409);
      assert.equal((await action("skip", { token: "';DROP TABLE users;--" })).response.status, 400);
      assert.equal(
        (await request<QueueResponse>("/admin/state", admin)).data.queue.find(
          (entry) => entry.tokenCode === "A-003",
        )?.status,
        "waiting",
      );
    });
    await t.test(
      "SQLite survives backend restart with sessions/settings/history and no re-bootstrap",
      async () => {
        sockets.forEach((socket) => socket.disconnect());
        const initialHash = (await one<UserRow>(
          server.db,
          "SELECT * FROM users WHERE role='admin'",
        ))!.password_hash;
        await server.close();
        server = createLocalApp({ dbPath, log: (value) => logs.push(value) });
        await listen();
        assert.equal(logs.length, 1);
        assert.equal(
          (await one<UserRow>(server.db, "SELECT * FROM users WHERE role='admin'"))!.password_hash,
          initialHash,
        );
        const state = (await request<QueueResponse>("/admin/state", admin)).data;
        assert.equal(state.queue.length, 8);
        assert.equal(state.clinic.name, "Updated Local Clinic");
        assert.equal(state.clinic.averageConsultationMinutes, 5);
        assert.equal((await request<UserProfile>("/auth/me", patient)).data.id, user.id);
      },
    );
  } finally {
    sockets.forEach((socket) => socket.disconnect());
    await server.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
