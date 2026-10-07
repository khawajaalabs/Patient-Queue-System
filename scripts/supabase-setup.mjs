import { createPostgresDatabase } from "../server/db/postgres.ts";
const connection = process.env.DATABASE_URL;
if (!connection) throw new Error("Set the server-only DATABASE_URL in .env.local first.");
const db = await createPostgresDatabase(connection);
await db.close();
console.log("Supabase clinic/admin initialization complete. No queue or patient data was seeded.");
