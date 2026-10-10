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

A server-only provider abstraction supports Resend. To enable delivery, an administrator must configure `EMAIL_PROVIDER=resend`, `EMAIL_API_KEY` and `EMAIL_FROM` using a verified sender. Keep those values outside Git/frontend code. The retained administration API reports an unconfigured provider and disables delivery; it has no normal navigation entry. Delivery is an authorized manual batch action (20 pending notices per request), not a background scheduler. Failed attempts remain visibly failed and are not automatically retried, preventing unbounded sends. Appointment/follow-up reminder scheduling is not automated. In-app notifications work without an email provider.

## Exports and backups

Admin Reports and retained administration APIs export patient directory, appointments, visit metadata, invoices and payments. Exports exclude private working notes, medical file URLs and authentication material; every export is audited. Clinic-specific patient exports include patients with appointment/visit history in that clinic.

Full backups belong in Supabase administrative tooling on a trusted machine: use the available database backup features or an authenticated CLI `pg_dump`. Back up private Storage objects separately because database backups do not include their contents. Encrypt backups, restrict access, apply a retention policy, and test restoration in a separate project. Do not expose database dump endpoints or credentials in the application.

## Verification and deployment

```sh
npm test
npm run test:backend
npm run typecheck
npm run build
npm run test:supabase
```

PostgreSQL integration tests require the existing CLI administrative session and create/drop disposable schemas; they must never seed dummy records into production. Vercel serves the SPA and `/api/server` Express function, with local Socket.IO invalidation and a visible-page polling fallback on Vercel. Preserve the production `APP_URL` and required server environment variables when deploying the already-linked personal project.

## Doctor availability and patient booking

Admin → Doctor Schedule configures weekly, split-shift availability for the main doctor at each clinic. Doctor windows must fit clinic opening hours and cannot overlap across clinics. Existing clinic-branding appointment duration is reused. Clinics have no invented default doctor schedule: configure hours before accepting new bookings. Patient Appointments provides self-booking from backend-generated Asia/Karachi slots; admin/staff booking, follow-up booking and rescheduling share the same transactional validator. Existing appointments remain intact and can retain their current time during status updates. New reservations snapshot their duration. Notifications use the existing in-app/email queue foundation.

Apply `supabase/migrations/20261009000100_doctor_availability.sql` additively through authenticated administrative tooling; never reset production. `npm run test:availability:postgres` verifies the feature in a disposable PostgreSQL schema using the saved Supabase CLI session, including the Vercel single-connection configuration. Calendar updates use existing invalidation with a 30-second visible-page fallback.

## Clinical booking and prescribing

Patient booking uses City -> Area -> Clinic -> Date -> Available time -> Reason -> Confirm, with optional notes and no document/upload step. Patient Documents navigation and pages are removed. Existing private files remain stored and accessible to authorized clinical staff in patient records. The server rejects all new appointment attachment mutations, including direct API attempts; historical download authorization remains unchanged.

Doctor consultations show appointment context and the latest completed clinical visit. The clinic-specific Medicine Library is administrator-only. Selecting a library medicine fills editable structured fields; custom medicine entry never implicitly adds a library record. Previous prescriptions copy into the current unsaved draft only, with repeated-copy protection and the existing 20-item limit. Preview and A4 printing do not save or complete consultations. Completed prescriptions retain their historical structured values independently of library edits.

`20261010000100_clinical_workflow.sql` adds four companion tables, backend-only RLS and indexes without changing existing rows. Apply it additively and record/compare existing table counts and checksums. `npm run test:clinical-workflow:postgres` runs the feature against a disposable PostgreSQL schema with Vercel's maximum-one connection setting. The original QueueCare theme and locally bundled Manrope font are shared across the app; A4 prescription printing uses a separate document-only print surface.

## Simplified daily workflow

Admin navigation groups Home; Appointments and Live Queue; Patients and Medicine Library; Clinics and Doctor Schedule; Staff, Billing and Reports. Activity, Follow-ups, Branding, Account, Data Management and Settings URLs redirect to Home. Clinical records, print branding and protected APIs remain intact. Home guides clinic/schedule setup, then shows today's appointments, next patients, queue, in-progress consultations and secondary reports. Compact appointment rows expose the next valid action. Patient records retain appointment/token context through consultation, preview, completion and the next patient.

Clinic setup uses searchable City -> Area -> Name fields. New clinics require a city and area; existing locations remain nullable and selectable as "Location not yet specified" until explicitly completed. New token prefixes are generated atomically from clinic-name initials with a unique alphabetic suffix on collision. Existing prefixes remain stable. Prefix and queue-average fields are absent from normal setup; appointment duration remains in Doctor Schedule.

Queue estimates use the median of the most recent 30 completed token consultation timestamps within the same clinic, excluding skipped consultations and invalid/non-finite durations outside 0.5-120 minutes. At least five valid samples are required. Estimates round to whole minutes and clamp to 2-30 minutes; insufficient history uses an internal five-minute fallback. Appointment duration and historical configured averages do not drive queue estimates.

Patients can be searched by name, email and phone and filtered by clinic and explicit manual condition tags, with most-recent visits first. Only administrators/doctors can add or remove condition tags. Group counts derive exclusively from these tags; diagnosis/chronic-condition free-text matches are a separately labelled search and never infer membership. Audit records contain mutation identifiers rather than medical condition text.

`20261011000100_workflow_simplification.sql` only adds nullable clinic location fields, backend-only condition/tag tables, constraints and indexes. No historical rows are backfilled or deleted. `npm run test:workflow:postgres` verifies location compatibility, prefix stability, condition counts/isolation, role restrictions, upload denial and queue estimates in a disposable PostgreSQL schema.
