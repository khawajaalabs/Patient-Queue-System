import { createDatabase } from "../server/db/database.ts";
import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { createServer } from "node:net";
const filename = path.resolve(process.env.DB_PATH || "data/queuecare.db");
const command = process.argv[2];
if (!["setup", "reset"].includes(command)) throw new Error("Use local:setup or local:reset.");
if (command === "reset") {
  const dataRoot = path.resolve("data");
  if (!filename.startsWith(dataRoot + path.sep))
    throw new Error("Reset only supports database files inside this project’s data folder.");
  const port = process.env.PORT || "3001";
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", () =>
      reject(new Error("Stop QueueCare before resetting its database; the API port is occupied.")),
    );
    probe.listen(Number(port), "127.0.0.1", () => probe.close(resolve));
  });
  for (const target of [filename, filename + "-wal", filename + "-shm"])
    if (existsSync(target)) unlinkSync(target);
  console.log("Local data reset.");
}
const db = createDatabase(filename);
db.close();
console.log(`QueueCare local database ready: ${filename}`);
