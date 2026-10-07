import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createLocalApp } from "../app.ts";
test("production proxy uses secure cookies and rejects foreign origins", async () => {
  const server = createLocalApp({
    appUrl: "https://queuecare.example",
    additionalOrigins: ["https://preview.example"],
    trustProxy: true,
    log: () => {},
  });
  server.http.listen(0, "127.0.0.1");
  await once(server.http, "listening");
  const address = server.http.address();
  assert.ok(address && typeof address !== "string");
  const base = "http://127.0.0.1:" + address.port;
  const headers = {
    Origin: "https://preview.example",
    "Content-Type": "application/json",
    "X-QueueCare-Request": "1",
    "X-Forwarded-Proto": "https",
  };
  try {
    const denied = await fetch(base + "/api/health", {
      headers: { Origin: "https://foreign.example" },
    });
    assert.equal(denied.status, 403);
    const registered = await fetch(base + "/api/auth/register", {
      method: "POST",
      headers,
      body: JSON.stringify({
        fullName: "Deployment Test",
        email: "deployment@example.com",
        phone: "123456789",
        password: "Deployment123!",
      }),
    });
    assert.equal(registered.status, 201);
    const cookie = registered.headers.get("set-cookie")!;
    assert.match(cookie, /; Secure/i);
    assert.match(cookie, /; HttpOnly/i);
    const restored = await fetch(base + "/api/auth/me", {
      headers: { ...headers, Cookie: cookie.split(";")[0]! },
    });
    assert.equal((await restored.json()).data.email, "deployment@example.com");
  } finally {
    await server.close();
  }
});
