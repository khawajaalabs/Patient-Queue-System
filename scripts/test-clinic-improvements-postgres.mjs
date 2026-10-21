import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { setDefaultResultOrder } from "node:dns";
import { setTimeout as delay } from "node:timers/promises";

// Test-host transport only; production pg pooling, timeouts and SQL are unchanged.
setDefaultResultOrder("ipv4first");
assert.ok(
  process.env.DATABASE_URL && process.env.SUPABASE_ACCESS_TOKEN && process.env.SUPABASE_PROJECT_REF,
  "DATABASE_URL and the Supabase CLI session are required for isolated PostgreSQL tests.",
);
const schema = "queuecare_test_" + randomBytes(8).toString("hex");
async function query(sql) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(
        "https://api.supabase.com/v1/projects/" +
          process.env.SUPABASE_PROJECT_REF +
          "/database/query",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer " + process.env.SUPABASE_ACCESS_TOKEN,
            "Content-Type": "application/json",
            Connection: "close",
          },
          body: JSON.stringify({ query: sql }),
          signal: AbortSignal.timeout(60000),
        },
      );
      if (!response.ok)
        throw new Error("Isolated PostgreSQL schema operation failed: " + response.status);
      return await response.json();
    } catch (error) {
      // Only these guarded schema setup/cleanup commands are retried, never app SQL.
      if (attempt >= 3 || !(error instanceof TypeError || error.name === "TimeoutError"))
        throw error;
      console.log("Isolated schema transport retry " + attempt + "/2.");
      await delay(attempt * 1000);
    }
  }
}
try {
  const migrations = readdirSync("supabase/migrations")
    .filter((f) => /^\d+_.*\.sql$/.test(f))
    .sort()
    .map((file) =>
      readFileSync("supabase/migrations/" + file, "utf8")
        .replace(/^CREATE ROLE queuecare_backend[^;]+;\r?\n/m, "")
        .replace(/\bqueuecare\b/g, schema),
    )
    .join("\n");
  // Unique test schema, atomic setup and existence guard make a lost response safe to retry.
  await query(
    `DO $guard$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='${schema}') THEN EXECUTE $schema$${migrations}$schema$; END IF; END $guard$;`,
  );
  const result = spawnSync(
    process.execPath,
    ["--dns-result-order=ipv4first", "--test", "server/test/clinic-improvements.test.ts"],
    {
      stdio: "inherit",
      env: { ...process.env, QUEUECARE_NEURO_TEST_SCHEMA: schema, VERCEL: "1" },
    },
  );
  process.exitCode = result.status ?? 1;
} finally {
  await query("DROP SCHEMA IF EXISTS " + schema + " CASCADE");
  console.log("Disposable clinic improvements schema removed; production records unchanged.");
}
