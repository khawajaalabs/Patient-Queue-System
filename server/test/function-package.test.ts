import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readFileSync,
  writeFileSync,
  globSync,
  statSync,
  mkdirSync,
  copyFileSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { resolve, dirname, join, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

test("Vercel explicit function package boots with shared domain runtime imports", () => {
  const root = resolve("."),
    parent = resolve("work");
  mkdirSync(parent, { recursive: true });
  const fixture = mkdtempSync(join(parent, "function-package-"));
  assert.ok(fixture.startsWith(parent + sep));
  try {
    const config = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8"));
    for (const relative of globSync(config.functions["api/server.ts"].includeFiles, {
      cwd: root,
    })) {
      const source = join(root, relative);
      if (!statSync(source).isFile()) continue;
      const target = join(fixture, relative);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(source, target);
    }
    writeFileSync(join(fixture, "package.json"), JSON.stringify({ type: "module" }));
    const url = pathToFileURL(join(fixture, "server/app.ts")).href;
    const result = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `const {createLocalApp}=await import(${JSON.stringify(url)});const app=createLocalApp({log:()=>{}});await app.close();`,
      ],
      { encoding: "utf8", cwd: fixture, timeout: 30000 },
    );
    assert.equal(result.status, 0, result.stderr || "Packaged API failed to boot");
  } finally {
    assert.ok(resolve(fixture).startsWith(parent + sep));
    rmSync(fixture, { recursive: true, force: true });
  }
});
