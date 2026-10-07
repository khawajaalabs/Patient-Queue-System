import { test } from "node:test";
import assert from "node:assert/strict";
import { postgresSql } from "../db/postgres.ts";
test("PostgreSQL parameters preserve literals and history has a deterministic insertion order", () => {
  assert.equal(
    postgresSql("SELECT '?' AS literal FROM tokens t WHERE t.id=? ORDER BY t.rowid DESC"),
    "SELECT '?' AS literal FROM tokens t WHERE t.id=$1 ORDER BY t.insertion_order DESC",
  );
});
