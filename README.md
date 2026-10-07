# QueueCare — Supabase-backed clinic queue

The existing React/TypeScript UI, Tailwind styles, components and routes are preserved. Express handles authentication and queue operations, Supabase PostgreSQL stores persistent data, and Socket.IO signals tell Patient, Admin and Public Display to refetch committed state.

## Run

Requires Node.js 24.16 or newer, npm and a linked Supabase project with the migrations applied.

```powershell
cd "C:\Users\Zain\OneDrive\Desktop\project 1"
npm.cmd install
npm.cmd run supabase:setup
npm.cmd run demo
```

`supabase:setup` initializes only the clinic and the initial admin. Normal startup also performs this idempotent initialization; it never seeds patients or queue activity. The default frontend is http://localhost:5174 and the default API is http://localhost:3001/api. This workspace uses API port 3002 because 3001 is occupied; use the URLs printed by the demo for the actual frontend and public display. The demo chooses another frontend port up to 5184 if needed and prints the actual URL. Stop an older API process if port 3001 is occupied. Ctrl+C stops the stack.

## Server environment

`.env.example` documents the server-only configuration. Keep the PostgreSQL session-pooler connection in `DATABASE_URL` inside ignored `.env.local`. Its password must be URL-encoded. Do not use a transaction-pooler connection with startup options. TLS certificate verification remains enabled. Never put database passwords, service-role keys or CLI tokens in `VITE_` variables or frontend files.

The configured initial admin is `admin@queuecare.local`; its generated password is stored only as `QUEUECARE_ADMIN_PASSWORD` in ignored `.env.local`. Set a strong unique value before first initialization if configuring another environment. Choose **Clinic staff** on Login. Existing users and passwords are never reset or promoted by bootstrap. Patients register through the existing Register screen. No old SQLite patients, visits or sessions are copied automatically.

## Migrations and access

Schema migrations live in `supabase/migrations`. Use the Supabase CLI to authenticate, link and push migrations; table creation does not require dashboard SQL:

```powershell
supabase login
supabase projects list
supabase link --project-ref YOUR_PROJECT_REF
supabase db push --dry-run
supabase db push
```

The CLI used for this workspace can also be invoked at `.\.npm-cache\_npx\e5622bd4fa3a6cea\node_modules\supabase\bin\supabase.exe`. A standard CLI installation can use the commands above directly.

Application tables (`users`, `clinics`, `daily_queues`, `tokens`, `sessions`) are in the private `queuecare` schema. Browser roles have no schema/table privileges, RLS is enabled, and the schema is not exposed through the browser Data API. Express uses a dedicated database login with access only to QueueCare tables and sequences; it has no superuser, role-creation, database-creation or RLS-bypass privileges. Backend-only RLS policies allow this trusted server role. Existing Supabase public schemas are not replaced.

Queue mutations run on a dedicated PostgreSQL transaction connection with a transaction-scoped advisory lock, including queue creation and settings changes. Constraints preserve daily-queue uniqueness, token numbering/order, one active visit per patient, and one serving token. The current-token foreign key also checks that the token belongs to that queue. Clinic dates use Asia/Karachi.

## Authentication, privacy and realtime

The existing Express authentication is retained; Supabase Auth is not used. Passwords use bcrypt cost 12. Random opaque sessions are stored as SHA-256 hashes with seven-day expiry. The browser receives an HttpOnly, SameSite=Strict cookie, with Secure enabled over HTTPS. Logout revokes the stored session. Registration always creates patients, and staff operations verify the database role. No password-reset email service is configured.

Public-display responses and Socket.IO invalidation signals contain no patient names, IDs, phone numbers, email addresses or visit reasons. Private APIs retain session, role, input and origin checks. All SQL values are parameterized. Socket.IO stays on the local Express server; do not expose private tables through Supabase Realtime.

## Checks

```powershell
npm.cmd test
npm.cmd run test:backend
npm.cmd run test:supabase
npm.cmd run typecheck
npm.cmd run build
```

The existing backend regression tests use disposable SQLite fixtures only. `test:supabase` uses `DATABASE_URL` and an isolated `queuecare_test_<random>` schema, exercises the real PostgreSQL API flow and removes that schema afterward. It never seeds or resets the app's `queuecare` schema. This test also requires the authenticated CLI access token in server-side `SUPABASE_ACCESS_TOKEN` and the linked `SUPABASE_PROJECT_REF`. Without the required credentials it is explicitly skipped, not counted as a verified remote test.

`local:setup` / `local:reset` are legacy SQLite fixture tools and do not configure or reset Supabase. The running app requires PostgreSQL and never falls back to SQLite.

After building, `npm.cmd run start` serves the API and SPA on the `PORT` configured in `.env.local` (3002 in this workspace). Separate development terminals can use `npm.cmd run dev:server` and `npm.cmd run dev:client`.
