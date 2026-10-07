import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import pg from "pg";
import { readFileSync } from "node:fs";
import { rootCertificates } from "node:tls";
import type { SQLInputValue } from "node:sqlite";
import { one, type Database } from "./database.ts";

export function postgresSql(sql: string) {
  let parameter = 0;
  return sql.replace(/'(?:''|[^'])*'|\?|\bt\.rowid\b/g, (part) =>
    part === "?" ? `$${++parameter}` : part === "t.rowid" ? "t.insertion_order" : part,
  );
}

export async function createPostgresDatabase(
  connectionString: string,
  bootstrap = true,
  schema = "queuecare",
  log: (message: string) => void = console.log,
): Promise<Database> {
  if (!/^queuecare(?:_test_[a-f0-9]+)?$/.test(schema)) throw new Error("Invalid QueueCare schema.");
  const url = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(url.protocol))
    throw new Error("DATABASE_URL must be a PostgreSQL connection string.");
  // Credentials stay in the Express process. Never disable certificate verification.
  for (const key of ["sslmode", "ssl", "sslcert", "sslkey", "sslrootcert"])
    url.searchParams.delete(key);
  const pool = new pg.Pool({
    connectionString: url.toString(),
    ssl: {
      rejectUnauthorized: true,
      ca: [
        ...rootCertificates,
        readFileSync(new URL("../certs/supabase-ca.crt", import.meta.url), "utf8"),
      ],
    },
    max: 10,
    connectionTimeoutMillis: 15000,
    idleTimeoutMillis: 30000,
    options: `-c search_path=${schema},pg_catalog -c statement_timeout=15000 -c idle_in_transaction_session_timeout=30000`,
  });
  pool.on("error", () => console.error("QueueCare database connection interrupted."));
  const context = new AsyncLocalStorage<pg.PoolClient>();
  async function query(sql: string, values: SQLInputValue[] = []) {
    const client = context.getStore() ?? pool;
    return client.query(postgresSql(sql), values);
  }
  const db: Database = {
    prepare(sql) {
      return {
        get: async (...values) => (await query(sql, values)).rows[0],
        all: async (...values) => (await query(sql, values)).rows,
        run: async (...values) => {
          const result = await query(sql, values);
          return { changes: result.rowCount ?? 0 };
        },
      };
    },
    exec: async (sql) => {
      await query(sql);
    },
    close: () => pool.end(),
    async transaction<T>(action: () => Promise<T>): Promise<T> {
      if (context.getStore()) throw new Error("Nested QueueCare transactions are not supported.");
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        // Serialize queue mutations across requests/processes, including opening a new daily queue.
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${schema}:queue`]);
        const value = await context.run(client, action);
        await client.query("COMMIT");
        return value;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
  try {
    await db.exec("SELECT 1 FROM clinics LIMIT 1");
    if (bootstrap) await bootstrapDatabase(db, log);
    return db;
  } catch (error) {
    await pool.end();
    // Do not leak a credential-bearing connection URL into logs.
    throw new Error(
      "Unable to initialize the Supabase database. Check DATABASE_URL, connectivity and applied migrations.",
      { cause: error },
    );
  }
}

async function bootstrapDatabase(db: Database, log: (message: string) => void) {
  await db.transaction!(async () => {
    const stamp = new Date().toISOString();
    await db
      .prepare(
        "INSERT INTO clinics VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT (id) DO NOTHING",
      )
      .run(
        "northstar",
        "Northstar Medical Clinic",
        "Northstar Medical Clinic",
        "14 Canal View Road, Lahore",
        "+92 42 3500 1200",
        "General OPD",
        "Dr. Ayesha Raza",
        "09:00",
        "17:00",
        5,
        "A",
        1,
        stamp,
        stamp,
      );
    if (await one(db, "SELECT id FROM users WHERE role='admin' LIMIT 1")) return;
    const email = (process.env["QUEUECARE_ADMIN_EMAIL"] ?? "admin@queuecare.local")
      .trim()
      .toLowerCase();
    const password = process.env["QUEUECARE_ADMIN_PASSWORD"] ?? "";
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      password.length < 12 ||
      Buffer.byteLength(password, "utf8") > 72
    )
      throw new Error(
        "Set valid QUEUECARE_ADMIN_EMAIL and QUEUECARE_ADMIN_PASSWORD (12–72 bytes) for first startup.",
      );
    if (await one(db, "SELECT id FROM users WHERE email=?", email))
      throw new Error(
        "The bootstrap admin email already belongs to a patient; no role will be changed.",
      );
    await db
      .prepare("INSERT INTO users VALUES (?,?,?,?,?,?,?,?)")
      .run(
        randomUUID(),
        "Clinic Staff",
        email,
        "+92 300 0000000",
        await hash(password, 12),
        "admin",
        stamp,
        stamp,
      );
    log(`Supabase admin created: ${email}`);
  });
}
