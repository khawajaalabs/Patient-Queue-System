# QueueCare

QueueCare is a clinic management application for one doctor/administrator managing multiple clinics. The existing React/TypeScript interface is served by Vercel; Express APIs use Supabase PostgreSQL through a restricted server-only database role. Local development uses the same Express application. SQLite remains available for isolated local tests; production uses PostgreSQL.

## Run locally

Install Node.js 24, run `npm install`, and configure the ignored `.env.local` using the names in `.env.example`. Keep `APP_URL` set to the local frontend origin for development. Then run:

```sh
npm run dev
```

The frontend starts at http://localhost:5174. `npm run start` starts Express separately. Use an isolated development database for experiments; never reset production.

## Features

- Patient email/password sessions, patient-only verified Google OAuth, and Supabase Auth recovery proof that updates the actual QueueCare password.
- Multiple clinics, clinic-scoped realtime queues, sanitized public displays, appointments and day/week/month/list schedules.
- Clinic hours and configurable slot spacing; confirmation, check-in, cancellation and no-show workflows.
- Demographics, consultations, structured vitals, prescriptions, doctor-authored follow-ups and patient-visible visit summaries.
- Receptionist/nurse accounts with active clinic assignments and server-enforced permissions.
- Private medical documents, explicit patient release and short-lived authorized downloads.
- Integer minor-unit invoices, partial/full payments, immutable payment records, patient billing and printable documents.
- Persistent in-app notifications and append-only audit records.
- Operational dashboard, clinic comparisons, date-filtered reports, authorized command search and audited CSV exports with spreadsheet-formula protection.
- Doctor/clinic branding, optional public HTTPS image URLs, clinic slot duration, account password changes and revocation of other sessions.

Appointment workflow states are stored additively in `appointment_workflow`; completed appointments retain the original authoritative completion state. Follow-up actions do not rewrite completed clinical records. Waiting counts are live today, outstanding balances include all issued unpaid invoices, and revenue reflects payments received. Report activity dates use Asia/Karachi. Optional status filters apply to the corresponding appointment/visit/invoice datasets.

## Security and data

All clinical, financial, operational and account APIs enforce server-side identity/role/clinic/ownership checks. Supabase private application tables are protected by RLS and inaccessible to browser database roles. Privileged credentials remain in Express/Vercel environment variables. Public displays contain no patient identities or clinical content. Patient responses exclude private doctor working notes. Patient demographic editing does not grant permission to edit doctor-authored clinical records.

Never commit `.env.local`, CLI credentials, database passwords or keys. `work/`, local caches, build outputs, database files and CLI state are ignored. Production migrations live in `supabase/migrations/`; apply them through authenticated Supabase administrative tooling, with row counts/checksums before and after. Never run a reset against production. Bootstrap credentials apply only when no administrator exists and never overwrite existing accounts.

## Application email foundation

Supabase Auth continues to send authentication/recovery emails. It is not used to impersonate arbitrary application email delivery. Application notices for appointments, released documents, issued invoices and follow-up changes are queued in `email_delivery_log`. Bodies contain only a generic account-update message and the application origin, with no diagnosis, notes or document URL.

A server-only provider abstraction supports Resend. To enable delivery, an administrator must configure `EMAIL_PROVIDER=resend`, `EMAIL_API_KEY` and `EMAIL_FROM` using a verified sender. Keep those values outside Git/frontend code. Admin Data Management explicitly reports an unconfigured provider and disables delivery. Delivery is an authorized manual batch action (20 pending notices per request), not a background scheduler. Failed attempts remain visibly failed and are not automatically retried, preventing unbounded sends. Appointment/follow-up reminder scheduling is not automated. In-app notifications work without an email provider.

## Exports and backups

Admin Reports/Data Management exports patient directory, appointments, visit metadata, invoices and payments. Exports exclude private working notes, medical file URLs and authentication material; every export is audited. Clinic-specific patient exports include patients with appointment/visit history in that clinic.

Full backups belong in Supabase administrative tooling on a trusted machine: use the available database backup features or an authenticated CLI `pg_dump`. Back up private Storage objects separately because database backups do not include their contents. Encrypt backups, restrict access, apply a retention policy, and test restoration in a separate project. Do not expose database dump endpoints or credentials in the application.

## Verification and deployment

```sh
npm test
npm run test:backend
npm run typecheck
npm run build
npm run test:supabase
```

PostgreSQL integration tests require the existing CLI administrative session and create/drop disposable schemas; they must never seed dummy records into production. Vercel serves the SPA and `/api/server` Express function, including the existing realtime WebSocket transport. Preserve the production `APP_URL` and required server environment variables when deploying the already-linked personal project.
