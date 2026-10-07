import { test } from "node:test";
import assert from "node:assert/strict";
import { configuredAuth } from "../services/identity.ts";
test("Supabase verification trusts provider proof and accepts recovery PKCE sessions only", async () => {
  const original = {
    url: process.env["SUPABASE_URL"],
    key: process.env["SUPABASE_PUBLISHABLE_KEY"],
    secret: process.env["SUPABASE_SECRET_KEY"],
  };
  process.env["SUPABASE_URL"] = "https://auth.example";
  process.env["SUPABASE_PUBLISHABLE_KEY"] = "public-test";
  process.env["SUPABASE_SECRET_KEY"] = "server-test";
  const nativeFetch = globalThis.fetch;
  let verified = true,
    method = "oauth";
  globalThis.fetch = async (input, init) => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith("/token")) {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.code_verifier, "verifier");
      return Response.json({
        access_token:
          "head." +
          Buffer.from(JSON.stringify({ amr: [{ method }] })).toString("base64url") +
          ".signature",
      });
    }
    if (path.endsWith("/user"))
      return Response.json({
        email: "patient@example.com",
        email_confirmed_at: "2026-10-07",
        app_metadata: { provider: "google" },
        user_metadata: { email_verified: true, email: "admin@example.com" },
        identities: [
          {
            provider: "google",
            identity_data: {
              sub: "verified-sub",
              email: "patient@example.com",
              email_verified: verified,
              full_name: "Patient",
            },
          },
        ],
      });
    return Response.json({});
  };
  try {
    const services = configuredAuth("https://queuecare.example");
    assert.equal(
      (await services.google!.verifyCode("code", "verifier")).email,
      "patient@example.com",
    );
    verified = false;
    await assert.rejects(services.google!.verifyCode("code", "verifier"));
    method = "recovery";
    assert.equal(await services.verifyRecovery!("code", "verifier"), "patient@example.com");
    method = "oauth";
    await assert.rejects(services.verifyRecovery!("code", "verifier"));
    method = "password";
    await assert.rejects(services.verifyRecovery!("code", "verifier"));
  } finally {
    globalThis.fetch = nativeFetch;
    for (const [name, value] of Object.entries({
      SUPABASE_URL: original.url,
      SUPABASE_PUBLISHABLE_KEY: original.key,
      SUPABASE_SECRET_KEY: original.secret,
    })) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
