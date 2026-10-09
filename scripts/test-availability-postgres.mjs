import { readFileSync, readdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";

if (
  !process.env.DATABASE_URL ||
  !process.env.SUPABASE_ACCESS_TOKEN ||
  !process.env.SUPABASE_PROJECT_REF
)
  throw new Error(
    "DATABASE_URL and the Supabase CLI session are required for isolated PostgreSQL tests.",
  );
const schema = "queuecare_test_" + randomBytes(8).toString("hex");
async function query(sql) {
  const response = await fetch(
    "https://api.supabase.com/v1/projects/" + process.env.SUPABASE_PROJECT_REF + "/database/query",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + process.env.SUPABASE_ACCESS_TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    },
  );
  if (!response.ok)
    throw new Error("Isolated PostgreSQL schema operation failed: " + response.status);
  return response.json();
}
try {
  for (const file of readdirSync("supabase/migrations")
    .filter((f) => /^\d+_.*\.sql$/.test(f))
    .sort())
    await query(
      readFileSync("supabase/migrations/" + file, "utf8")
        .replace(/^CREATE ROLE queuecare_backend[^;]+;\r?\n/m, "")
        .replace(/\bqueuecare\b/g, schema),
    );
  const result = spawnSync(process.execPath, ["--test", "server/test/availability.test.ts"], {
    stdio: "inherit",
    env: { ...process.env, QUEUECARE_AVAILABILITY_TEST_SCHEMA: schema, VERCEL: "1" },
  });
  process.exitCode = result.status ?? 1;
} finally {
  await query("DROP SCHEMA " + schema + " CASCADE");
  console.log("Disposable availability schema removed; production records unchanged.");
}
