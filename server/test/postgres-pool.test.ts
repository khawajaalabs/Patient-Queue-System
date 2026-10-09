import { test, mock } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { createPostgresDatabase } from "../db/postgres.ts";

test("Vercel uses one request connection, no LISTEN client and drains idle connections and releases on success/errors", async () => {
  const previous = process.env["VERCEL"];
  process.env["VERCEL"] = "1";
  const releases: boolean[] = [];
  const queries: string[] = [];
  let options: pg.PoolConfig | undefined;
  let listeners = 0;
  let failing = false;
  const connectMock = mock.method(pg.Pool.prototype, "connect", async function (this: pg.Pool) {
    options = (this as unknown as { options: pg.PoolConfig }).options;
    return {
      async query(sql: string) {
        queries.push(sql);
        if (failing && (sql === "FAIL" || sql === "ROLLBACK")) throw Error(sql);
        return { rows: [{ ok: true }], rowCount: 1 };
      },
      release(destroy: boolean) {
        releases.push(destroy);
      },
    };
  });
  const queryMock = mock.method(
    pg.Pool.prototype,
    "query",
    async function (this: pg.Pool, sql: string) {
      const client = await this.connect();
      try {
        return await client.query(sql);
      } finally {
        client.release();
      }
    },
  );
  const endMock = mock.method(pg.Pool.prototype, "end", async () => {});
  const clientMock = mock.method(pg.Client.prototype, "connect", async () => {
    listeners++;
  });
  const clientQueryMock = mock.method(pg.Client.prototype, "query", async () => ({ rows: [] }));
  const clientEndMock = mock.method(pg.Client.prototype, "end", async () => {});
  let db;
  try {
    db = await createPostgresDatabase("postgres://test:test@example.invalid:5432/test", false);
    assert.equal(options?.max, 1);
    assert.equal(options?.idleTimeoutMillis, 1000);
    await db.subscribe?.(() => {});
    assert.equal(listeners, 0);
    await db.prepare("SELECT ?").get(1);
    await db.transaction!(async () => {
      await db!.exec("SELECT 1");
    });
    assert.ok(queries.includes("BEGIN"));
    assert.ok(queries.includes("SELECT pg_advisory_xact_lock(hashtext($1))"));
    assert.ok(queries.includes("COMMIT"));
    failing = true;
    await assert.rejects(async () => {
      await db!.exec("FAIL");
    }, /FAIL/);
    await assert.rejects(
      db.transaction!(async () => {
        await db!.exec("FAIL");
      }),
      /FAIL/,
    );
    assert.equal(releases.length, 5);
    assert.equal(releases.at(-1), true, "broken rollback connections are discarded");
    assert.equal(releases[2], false, "successful transactions release for short-lived reuse");
  } finally {
    await db?.close();
    connectMock.mock.restore();
    queryMock.mock.restore();
    endMock.mock.restore();
    clientQueryMock.mock.restore();
    clientEndMock.mock.restore();
    clientMock.mock.restore();
    if (previous === undefined) delete process.env["VERCEL"];
    else process.env["VERCEL"] = previous;
  }
});
