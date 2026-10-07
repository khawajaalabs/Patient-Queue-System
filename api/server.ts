import { createLocalApp } from "../server/app.ts";
import { createPostgresDatabase } from "../server/db/postgres.ts";
const connectionString = process.env["DATABASE_URL"];
if (!connectionString) throw new Error("DATABASE_URL is required.");
const hostname = process.env["VERCEL_URL"];
if (!hostname) throw new Error("VERCEL_URL is required.");
const origins = [process.env["VERCEL_PROJECT_PRODUCTION_URL"], process.env["APP_URL"]]
  .filter((value): value is string => Boolean(value))
  .map((value) => (value.startsWith("https://") ? value : "https://" + value));
const database = await createPostgresDatabase(connectionString, false);
const server = createLocalApp({
  database,
  appUrl: "https://" + hostname,
  additionalOrigins: origins,
  trustProxy: true,
});
// Vercel upgrades connect at the exact function URL. Restore the internal Socket.IO path.
server.http.prependListener("upgrade", (request) => {
  const query = request.url?.indexOf("?") ?? -1;
  request.url = "/socket.io/" + (query >= 0 ? request.url!.slice(query) : "");
});
await database.subscribe?.(() => server.io.emit("queue:updated"));
export default server.http;
