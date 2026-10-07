import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "node:process";
try {
  loadEnvFile(".env.local");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const port = Number(process.env.PORT || 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PORT must be a valid port number.");
const children = [];
let stopped = false;
let frontendPort = 5174;
function stop(code = 0) {
  if (stopped) return;
  stopped = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stop());
async function available(value) {
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", () =>
      reject(
        new Error(
          `Port ${value} is occupied. Stop the process using that port, then run npm.cmd run demo again.`,
        ),
      ),
    );
    probe.listen(value, "127.0.0.1", () => probe.close(resolve));
  });
}
function launch(args) {
  const child = spawn(process.execPath, args, { stdio: "inherit", windowsHide: true });
  children.push(child);
  child.on("error", (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on("exit", (code) => {
    if (!stopped) {
      console.error(`QueueCare process stopped (${code ?? "signal"}).`);
      stop(code || 1);
    }
  });
  return child;
}
async function ready(url, health = false) {
  const end = Date.now() + 60000;
  while (!stopped && Date.now() < end) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(health ? 2000 : 30000) });
      if (response.ok && (!health || (await response.json()).status === "ok")) return;
    } catch {
      /* Retry while the server starts. */
    }
    await delay(300);
  }
  throw new Error(`Unable to start ${url}. See the server output above.`);
}
try {
  await available(port);
  while (frontendPort <= 5184) {
    try {
      await available(frontendPort);
      break;
    } catch {
      console.log(`Port ${frontendPort} is occupied; trying ${frontendPort + 1}.`);
      frontendPort++;
    }
  }
  if (frontendPort > 5184)
    throw new Error(
      "No free frontend port between 5174 and 5184. Stop another local server and retry.",
    );
  process.env.APP_URL = `http://localhost:${frontendPort}`;
  launch(["--env-file-if-exists=.env.local", "server/index.ts"]);
  await ready(`http://127.0.0.1:${port}/api/health`, true);
  launch([
    fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url)),
    "dev",
    "--port",
    String(frontendPort),
    "--strictPort",
    "--host",
    "127.0.0.1",
  ]);
  await ready(`http://127.0.0.1:${frontendPort}/login`);
  console.log(
    `\nApp: http://localhost:${frontendPort}\nPublic display: http://localhost:${frontendPort}/public-display`,
  );
} catch (error) {
  console.error(error.message);
  stop(1);
}
