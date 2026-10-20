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
    assert.equal(
      releases[2],
      true,
      "serverless transactions close the last idle connection before suspension",
    );
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

test("Vercel retries only rejected session-pool acquisitions and never replays SQL", async () => {
  const previous = process.env["VERCEL"];
  process.env["VERCEL"] = "1";
  let rejected = 2,
    connections = 0,
    releases = 0,
    statements: string[] = [],
    queryFailure = false;
  const full = () =>
    Object.assign(new Error("(EMAXCONNSESSION) max clients reached in session mode"), {
      code: "XX000",
      severity: "FATAL",
    });
  const connectionMock = mock.method(pg.Pool.prototype, "connect", async () => {
    connections++;
    if (rejected-- > 0) throw full();
    return {
      query: async (sql: string) => {
        statements.push(sql);
        if (queryFailure && sql === "WRITE ONCE") throw full();
        return { rows: [{ ok: true }], rowCount: 1 };
      },
      release: () => {
        releases++;
      },
    };
  });
  const endMock = mock.method(pg.Pool.prototype, "end", async () => {});
  let db;
  try {
    db = await createPostgresDatabase("postgres://test:test@example.invalid:5432/test", false);
    assert.equal(connections, 3);
    assert.equal(statements.length, 1);
    rejected = 1;
    const before = connections;
    await db.transaction!(async () => {
      await db!.exec("WRITE TRANSACTION");
    });
    assert.equal(connections - before, 2);
    assert.equal(statements.filter((s) => s === "WRITE TRANSACTION").length, 1);
    queryFailure = true;
    const prior = connections;
    await assert.rejects(async () => { await db!.exec("WRITE ONCE"); }, /EMAXCONNSESSION/);
    assert.equal(connections, prior + 1);
    assert.equal(statements.filter((s) => s === "WRITE ONCE").length, 1);
    assert.equal(releases, 3);
  } finally {
    await db?.close();
    connectionMock.mock.restore();
    endMock.mock.restore();
    if (previous === undefined) delete process.env["VERCEL"];
    else process.env["VERCEL"] = previous;
  }
});

test("queued SQL reuses one connection while localhost retains normal pooling", async () => {
  const previous = process.env["VERCEL"];
  let pool: pg.Pool | undefined;
  let waiting = 1;
  const releases: boolean[] = [];
  const connectMock = mock.method(pg.Pool.prototype, "connect", async function (this: pg.Pool) {
    pool = this;
    Object.defineProperty(this, "waitingCount", { configurable: true, get: () => waiting });
    return {
      query: async () => ({ rows: [{ ok: true }], rowCount: 1 }),
      release: (destroy: boolean) => releases.push(destroy),
    };
  });
  const endMock = mock.method(pg.Pool.prototype, "end", async () => {});
  let db, local;
  try {
    process.env["VERCEL"] = "1";
    db = await createPostgresDatabase("postgres://test:test@example.invalid:5432/test", false);
    assert.equal(releases.at(-1), false, "waiting queries keep short-lived reuse");
    waiting = 0;
    await db.exec("SELECT 1");
    assert.equal(releases.at(-1), true, "last queued operation closes before freezing");
    delete process.env["VERCEL"];
    local = await createPostgresDatabase("postgres://test:test@example.invalid:5432/test", false);
    assert.equal(releases.at(-1), false, "localhost retains idle reuse");
    assert.equal((pool as unknown as { options: pg.PoolConfig }).options.max, 10);
  } finally {
    await db?.close();
    await local?.close();
    connectMock.mock.restore();
    endMock.mock.restore();
    if (previous === undefined) delete process.env["VERCEL"];
    else process.env["VERCEL"] = previous;
  }
});
