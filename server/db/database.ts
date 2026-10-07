import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { hashSync } from "bcryptjs";
import { migrate } from "./migrations.ts";
export interface UserRow {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  password_hash: string;
  role: "admin" | "patient";
}
export interface Database {
  prepare(sql: string): {
    get(...values: SQLInputValue[]): unknown | Promise<unknown>;
    all(...values: SQLInputValue[]): unknown[] | Promise<unknown[]>;
    run(...values: SQLInputValue[]): unknown | Promise<unknown>;
  };
  exec(sql: string): void | Promise<void>;
  close(): void | Promise<void>;
  transaction?<T>(action: () => Promise<T>): Promise<T>;
}
export async function one<T>(
  db: Database,
  sql: string,
  ...values: SQLInputValue[]
): Promise<T | undefined> {
  return (await db.prepare(sql).get(...values)) as T | undefined;
}
export async function many<T>(db: Database, sql: string, ...values: SQLInputValue[]): Promise<T[]> {
  return (await db.prepare(sql).all(...values)) as T[];
}
const transactions = new WeakMap<Database, Promise<unknown>>();
export async function atomic<T>(db: Database, action: () => Promise<T>): Promise<T> {
  if (db.transaction) return db.transaction(action);
  const prior = transactions.get(db) ?? Promise.resolve();
  const pending = prior
    .catch(() => {})
    .then(async () => {
      await db.exec("BEGIN IMMEDIATE");
      try {
        const value = await action();
        await db.exec("COMMIT");
        return value;
      } catch (error) {
        await db.exec("ROLLBACK");
        throw error;
      }
    });
  transactions.set(db, pending);
  return pending;
}
export function createDatabase(filename: string, log: (message: string) => void = console.log) {
  if (filename !== ":memory:") mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
  migrate(db);
  const stamp = new Date().toISOString();
  db.prepare("INSERT OR IGNORE INTO clinics VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(
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
  if (!db.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").get()) {
    const email = (process.env["QUEUECARE_ADMIN_EMAIL"] || "admin@queuecare.local")
      .trim()
      .toLowerCase();
    const password = process.env["QUEUECARE_ADMIN_PASSWORD"] || "QueueCareAdmin123!";
    if (
      password.length < 12 ||
      Buffer.byteLength(password, "utf8") > 72 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    )
      throw new Error(
        "Initial admin credentials are invalid; use a valid email and at least 12 password characters.",
      );
    if (db.prepare("SELECT id FROM users WHERE email=?").get(email))
      throw new Error(
        "The admin email belongs to an existing patient. Choose QUEUECARE_ADMIN_EMAIL; existing roles will not be changed.",
      );
    db.prepare("INSERT INTO users VALUES (?,?,?,?,?,?,?,?)").run(
      randomUUID(),
      "Clinic Staff",
      email,
      "+92 300 0000000",
      hashSync(password, 12),
      "admin",
      stamp,
      stamp,
    );
    log(`Local admin created: ${email}`);
  }
  return db;
}
