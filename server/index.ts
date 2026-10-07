import { createPostgresDatabase } from "./db/postgres.ts";
import { createLocalApp } from "./app.ts";
const port = Number(process.env["PORT"] ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PORT must be a valid local port.");
const databaseUrl = process.env["DATABASE_URL"];
if (!databaseUrl)
  throw new Error(
    "DATABASE_URL is required. Configure the Supabase PostgreSQL connection in .env.local.",
  );
const database = await createPostgresDatabase(databaseUrl);
const instance = createLocalApp({
  database,
  appUrl: process.env["APP_URL"] ?? "http://localhost:5174",
});
instance.http.on("error", (error: NodeJS.ErrnoException) => {
  console.error(
    error.code === "EADDRINUSE"
      ? `Port ${port} is occupied. Stop the process using it, then run npm.cmd run demo again.`
      : error.message,
  );
  void instance.db.close();
  process.exit(1);
});
instance.http.listen(port, "127.0.0.1", () => {
  console.log("QueueCare Supabase PostgreSQL database ready.");
  console.log(`API server: http://localhost:${port}`);
});
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    void instance.close().then(() => process.exit(0));
  });
