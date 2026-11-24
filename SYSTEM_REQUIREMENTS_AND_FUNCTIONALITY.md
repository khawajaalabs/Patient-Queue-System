# Neuro Spine Care Center — System Requirements & Functional Inventory

**Document status:** Derived from the deployed codebase and verified against live routes and APIs.
**Date:** 20 November 2026
**Application name:** Neuro Spine Care Center (internal project name: QueueCare)
**Website URL:** https://patientqueuesystem.vercel.app/
**Login page URL:** https://patientqueuesystem.vercel.app/login
**Hosting:** Vercel (production), region `iad1`

This document is the authoritative description of what the system currently does. It was produced by reviewing every page, role, API endpoint and shared component. Where the specification and the implementation disagree, **this document records the implementation** and lists the gap under "Known gaps".

---

## 1. Purpose and scope

The system is a web-based clinic queue and electronic health record application for one main doctor (the administrator) plus receptionist and nurse staff, serving multiple clinics. Patients use it to book appointments, track their token, and view their own clinical records, prescriptions and bills. Staff use it to manage the queue, prepare consultations, upload documents and issue invoices.

Explicitly **out of scope** (not implemented, do not assume present):

- A separate radiology / PACS reporting module or modality-specific throughput dashboard.
- Automated email reminder scheduling, background jobs or cron delivery.
- Online payment gateway integration (payments are recorded manually by staff).
- Multi-doctor scheduling. There is one main doctor whose role is `admin`; staff can prepare encounters on that doctor's behalf.
- Public registration of staff accounts. Staff accounts are created by the administrator.

---

## 2. System context

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4, TanStack Router + Start, TanStack Query (caching layer), Radix UI |
| Backend | Node.js 24, Express 5, Socket.IO (local only), Zod validation |
| Database | Supabase PostgreSQL via `queuecare` schema, restricted server-only role, session/transaction pooler, TLS |
| File storage | Supabase private bucket; short-lived signed URLs only |
| Authentication | Application sessions (hashed token cookie) + Supabase Auth for Google sign-in and recovery email proof |
| Deployment | Vercel SPA + `/api/server` Express function; region `hnd1`; visible-page polling fallback because Vercel cannot upgrade WebSockets |

### Access control model

- `admin` — the doctor/administrator. Global access to all clinics and all administrative pages.
- `receptionist` — clinic-assigned; queue, appointments, patients, billing.
- `nurse` — clinic-assigned; queue, appointments, patient preparation, documents.
- `patient` — may only access their own appointments, tokens, visits, prescriptions, documents and invoices.
- Public — login, registration, password recovery and the sanitised waiting-room display.

Client guards (`ProtectedRoute`) are backed by server-side `requireRole(...)`, per-clinic `authorizeClinic(...)` and patient-ownership checks. Patient-facing reads return `404`/`403` for another patient's records. Public display payloads contain token numbers only — never names or clinical data.

---

## 3. Functional inventory by page

### 3.1 Public and authentication pages

| Page | URL | Access | What it does | Main APIs |
|---|---|---|---|---|
| Root redirect | `/` | Public | Redirects to `/login`. No UI. | — |
| Sign in | `/login` | Public | Email + password for all roles; Google sign-in for patients; role toggle only controls presentation of the Google button — the **account's server-side role** decides the destination. | `POST /auth/login`, `POST /auth/google/start` |
| Register | `/register` | Public | New patient account (name, email, phone, password + confirm) or Google sign-up. | `POST /auth/register` |
| Forgot password | `/forgot-password` | Public | Neutral, non-enumerating confirmation after email submission. | `POST /auth/forgot-password` |
| Reset password | `/reset-password` | Public | Verifies the recovery code, sets a new password, strips the token from the URL, requires signing in again. | `POST /auth/verify-reset`, `POST /auth/reset-password` |
| Complete Google profile | `/complete-profile` | Public (Google ticket) | Reviews Google-provided identity, collects phone, creates patient account. Shows a "Back to sign in" recovery link on error. | `GET/POST /auth/google/profile`, `/auth/google/complete` |
| Waiting-room display | `/public-display` | Public | Full-screen "now serving", optional "up next", live clock, LIVE / CLOSED indicator, optional spoken announcements and chime. Displays **token numbers only**. | `GET /public/queue`, `GET /branding` |

### 3.2 Patient pages

All patient pages are wrapped by `/patient` → `ProtectedRoute role="patient"`.

| Page | URL | What the patient can do | Main APIs |
|---|---|---|---|
| Dashboard | `/patient/dashboard` | See live token and progress, patients ahead and ETA, own appointments, clinic information, "before you arrive" guidance, and a care summary (next appointment, latest visit/prescription, outstanding bills, follow-ups, notifications). CTA opens appointment booking directly. | `/patient/state`, `/patient/summary`, `/patient/appointments` |
| Live queue | `/patient/live-queue` | See live queue order (tokens only), own position and ETA, cancel/reschedule/give up an appointment token. | `/patient/state`, `/patient/token/*` |
| Appointments | `/patient/appointments` | List appointments; book a new one (demographics confirmation → clinic → date → slot → reason → optional private attachments → review → confirm); view appointment details; retry failed uploads. `?book=1` opens booking immediately. | `/patient/appointments`, `/patient/profile`, `/appointments/available-slots`, `/appointments/:id/attachments` |
| Appointment detail | `/patient/appointment/:id` | View clinic, time, status, token, own reason and notes. | `/appointments/:id/context` |
| Token history | `/patient/history` | Table of own past queue tokens with clinic, date, wait time and status. This is **token** history, not clinical history. | `/patient/state` |
| Visits | `/patient/visits` | Clinical visit timeline: clinic, date, released diagnosis, doctor, prescription availability, follow-up date. | `/patient/visits` |
| Visit detail | `/patient/visit/:id` | Own full visit summary (released fields only), treatment plan, follow-up instructions and prescription; print summary or prescription. | `/patient/visits/:id`, `/branding` |
| Prescriptions | `/patient/prescriptions` | List prescriptions from completed consultations. | `/patient/prescriptions` |
| Prescription detail | `/patient/prescription/:id` | Prescription-only view and print preview (no diagnosis/treatment plan). | `/patient/visits/:id`, `/branding` |
| Profile | `/patient/profile` | Edit own name, phone, DOB, gender, address. Email is read-only. Doctor-recorded allergies/conditions/medications are shown read-only. | `/patient/profile` |
| **Billing** | `/patient/billing` | **Read-only invoice portal.** Search and filter own invoices, open invoice detail (line items, totals, balance, payment history) and print an invoice/receipt. It **cannot** create, edit, void or pay invoices — those controls exist only for staff. | `/billing/invoices` (server forces own records), `/billing/invoices/:id` |
| Documents | `/patient/documents` | Redirects to the dashboard. Private documents are currently shown through the dashboard/visit summary rather than a dedicated gallery. | — |
| Account & security | `/account` | Any authenticated role: change password, view sessions, sign out other sessions, sign out. | `/account`, `/account/password`, `/account/revoke-sessions` |

**Legacy aliases (redirect only, kept so existing bookmarks keep working):**
`/patient/join-queue` and `/patient/get-token` → `/patient/appointments?book=1`; `/patient/queue` → `/patient/live-queue`; `/patient/` → `/patient/dashboard`.

#### Clarification: what the patient billing page does
It is intentionally a **view-only invoice portal**. Patients can see what they were charged, what has been paid, the outstanding balance and the payment history, and print a receipt. Money is never collected online; reception issues invoices and records payments. The client still calls the generic `/billing/invoices?clinicId=all` endpoint, but the server ignores the `clinicId` for patients and restricts results to that patient's non-draft invoices.

### 3.3 Administrator (doctor) pages

All `/admin/*` pages require `admin`. Navigation is provided by the admin shell.

| Page | URL | What it does | Main APIs |
|---|---|---|---|
| Today | `/admin` | Setup checklist, four KPIs (appointments, waiting, serving, completed), next five appointments with actions, live queue summary, "needs attention" list, reports link. Polls every 30 s. | `/admin/today`, `/operations/appointments/:id` |
| Appointments | `/admin/appointments` | Today/upcoming/past views with filters; book, reschedule, confirm, check in, no-show, cancel; doctor snapshot for selected patient. | `/admin/appointment-flow`, `/admin/appointments`, `/appointments/available-slots` |
| Live queue | `/admin/live-queue` | Open/close queue, call next / call again / call specific / complete / skip / requeue, per-row search and filters, priority and attention tags, patient drawer, start/continue consultation. | `/admin/state`, `/admin/queue/*`, `/admin/appointments/:id/attention` |
| Patients | `/admin/patients` | Debounced search by name/email/phone, clinic filter, explicit condition groups and free-text clinical matches, open patient record. Group counts use tags only, never free text. | `/admin/patients/search`, `/admin/conditions` |
| Patient record | `/admin/patient-record/:id` | Cross-clinic demographics, condition tags, clinical profile (allergies, chronic conditions, current medicines, doctor notes), documents, visit history, queue history, context actions. | `/admin/patients/:id/record`, `/admin/patients/:id/clinical-profile`, `/documents` |
| Consultation | `/admin/visits/:id` | Doctor snapshot; structured vitals, notes, prescription, follow-up, save draft/complete; documents; previous visits; print prescription and full visit summary; create invoice; next patient. Completed visits are read-only in the UI. | `/admin/visits/:id`, `/admin/patients/:id/record`, `/admin/today`, `/branding` |
| Clinics | `/admin/clinics` | Grouped clinic list; create/edit (city, area, name, address, phone, hours, fee, active); delete empty or archive with history; public display link. | `/admin/clinics` |
| Doctor schedule | `/admin/doctor-schedule` | Per-clinic weekly working windows, slot duration, days off and special leave with conflict detection. | `/admin/doctor-availability`, `/admin/doctor-leave` |
| Staff | `/admin/staff` | Create/edit receptionist or nurse accounts, assign clinics, set password, activate/deactivate. Saving revokes that staff member's sessions. | `/admin/staff` |
| Billing | `/admin/billing` | Invoice list, create/edit invoices with line items and discount, record payments with idempotency key, void unpaid invoices, print invoice/receipt. | `/billing/invoices*`, `/clinic` |
| Scans & documents | `/admin/documents` | Private document library: upload PDF/JPEG/PNG (≤10 MB), categorize imaging/lab/referral/other, download, release or withdraw patient visibility, in-browser scan viewer with zoom/pan/rotate/filters. | `/documents*` |
| Reports | `/admin/reports` | Date/status filters, ten KPIs, clinic comparison, trend charts, status distribution and audited CSV exports. | `/admin/reports`, `/admin/exports/:kind` |
| Queue history | `/admin/history` | Historical queue tokens for a date and clinic. Implemented but has no navigation entry — reachable by URL. | `/admin/state?historyDate=` |

### 3.4 Staff workspace

| Page | URL | Access | What it does |
|---|---|---|---|
| Staff workspace | `/staff` | receptionist, nurse | Tabbed workspace. Both roles: open/close queue, call next/again, check in by exact email, queue list, skip/requeue, appointments and patients. **Nurse only:** consultation preparation (reason, chief complaint, eight vitals) and documents. **Receptionist only:** billing and full appointment calendar. |

Main APIs: `/staff/state`, `/staff/queue/*`, `/staff/check-in`, `/staff/prepare`, `/staff/preparations/:id`, `/staff/patients/:id`, plus shared appointment, billing and document endpoints.

### 3.5 Redirect-only admin URLs (no functionality)

`/admin/settings`, `/admin/account`, `/admin/activity`, `/admin/follow-ups`, `/admin/branding`, `/admin/data-management` all redirect to `/admin`. The components for branding settings, follow-ups and data management still exist in the codebase but are not reachable from the UI. They are documented here so nobody assumes those features are live.

---

## 4. Domain requirements (implemented behaviour)

### 4.1 Appointments and tokens
- Every new appointment atomically creates one unique, date-scoped token for its clinic.
- Retries for the same patient/clinic/time return the original booking.
- Future tokens display as reserved and become waiting on their appointment date without a scheduler.
- Queues are ordered by appointment time, then token ID. Token numbers identify bookings, not queue position.
- Rescheduling keeps token identity; changing the date allocates a new date-scoped number.
- Cancellation or owner "give up" cancels both appointment and token and releases the slot.
- Active or completed consultations cannot give up or reschedule their token.
- Doctor availability is weekly, per clinic, split-shift capable, with cross-clinic overlap validation and special leave. Leave rejects unresolved active appointments.
- Appointment priority and descriptive tags are staff-only and never change queue order or clinical data.

### 4.2 Queue
- One daily queue per clinic; opening is idempotent; closing pauses calls without discarding appointments.
- Call next always selects the earliest waiting appointment token. Skipped tokens return to their original order when requeued.
- Wait estimates use the median of the last 30 completed consultations in that clinic, require five valid samples, and clamp to 2–30 minutes with a five-minute fallback.

### 4.3 Clinical records
- Encounters store chief complaint, examination, diagnosis, patient summary, treatment plan, follow-up and private doctor working notes. **Private doctor notes are never returned to patients.**
- Structured vitals include systolic/diastolic BP, pulse, temperature, respiratory rate, oxygen saturation, weight, height and derived BMI.
- Prescriptions are structured (medicine, strength, dose form, dose, frequency, duration, instructions), limited to 20 items. Completed prescriptions keep their historical values even if the medicine library changes.
- Medicines without prescription references can be deleted; referenced medicines are archived.
- Completed visits are authoritative; later follow-up actions do not rewrite them.

### 4.4 Documents and imaging
- PDF/JPEG/PNG up to 10 MB, validated by magic bytes; uploads go to a private bucket.
- No permanent public URLs. Downloads use short-lived signed URLs after ownership checks and are audited.
- Only the doctor can release a document to the patient portal.
- The in-browser viewer supports pan, zoom, rotation and radiology-style filters; PDFs open in an embedded viewer.

### 4.5 Billing
- Integer minor units (no floating-point money). Partial and full payments, immutable payment records.
- Draft invoices are never shown to patients. Payments require a client idempotency key.
- Void is only allowed when nothing has been paid. All exports and prints are audited.

### 4.6 notifications, audit and reporting
- In-app notifications persist; email delivery is a manual, authorised batch over the queue foundation (not automated).
- Sensitive actions append to an immutable audit log.
- Reports use Asia/Karachi dates, optional status filters, clinic comparisons and audited CSV exports with spreadsheet-formula protection.

### 4.7 Non-functional requirements
- **Performance:** login and page loads must not wait on unnecessary API calls; 30-second visible-page polling only where live data is needed; responses cached for 30 seconds in the client where safe.
- **Reliability:** single database connection per API request on Vercel; no background listener; bounded connection retries.
- **Privacy:** public display contains no identities; patient endpoints are ownership-scoped; private notes excluded from patient payloads; exports exclude secrets and medical file URLs.
- **Usability:** practical clinical workflows — no developer-only controls on staff screens beyond the waiting-room audio test; role-appropriate navigation; dates in Asia/Karachi.

---

## 5. API surface summary

Approximately 90 endpoints are implemented across: authentication (11), queue and clinics (25), appointments and availability (13), clinical records and conditions (18), documents and attachments (13), billing (6), reports/branding/catalog (14), notifications (3), account/system (6).

Detailed endpoint-by-endpoint inventory (method, path, role, purpose and caller) is available in the project audit output; the table above maps every user-facing action to its endpoints. Notable unused/legacy endpoints that exist server-side but have no current UI caller: `/admin/analytics`, `/admin/history`, `/admin/patients`, `/admin/appointments` (GET/POST), `/admin/activity`, `/patient/history`, `/schedule`, `/patient/tokens/:id` (non-PDF), and `PUT /admin/patients/:id/profile`.

---

## 6. Known gaps and recommendations

These are implementation gaps found during the audit, not missing work to be silently assumed:

1. **No radiology throughput dashboard.** The specification mentions one; only a generic `documents` KPI exists.
2. **Implemented but unreachable features:** branding settings, follow-up management and data management/email delivery components exist but their URLs redirect to `/admin`.
3. **Duplicate/legacy routes:** `/admin/queue` duplicates `/admin/live-queue`; `/patient/queue` now redirects to `/patient/live-queue`; `/patient/join-queue` and `/patient/get-token` now redirect to booking.
4. **Login role toggle is presentational.** It changes the Google button visibility, not the account role; a note should make this explicit to users.
5. **Admin account settings are hidden.** `/account` works for admins but there is no link in the admin shell.
6. **Staff check-in requires an exact email address**, which is awkward for walk-in patients; phone/token lookup would be more practical.
7. **Clinic form does not expose department/doctor/public-name/show-next fields** even though the public display consumes them.
8. **Password fields for staff have no confirmation field**; a typo locks the account out.
9. **Rate limits and session caches are per serverless instance**; external KV/Redis would be needed for strict global limits.
10. **Public `/branding` exposes doctor contact details** (phone, email, licence) by design for prescriptions — review if a stricter public payload is required.

---

## 7. Performance work completed (verified)

| Phase | Change | Measured effect |
|---|---|---|
| 1 | Skip queue/clinic APIs and Socket.IO on login; precomputed bcrypt dummy hash; immutable asset headers; debounced patient search | Login stopped making `/public/queue` (5.1 s) and `/clinics` (4.4 s) calls; six failed WebSocket attempts removed |
| 2 | One Postgres client per request; lightweight session creation; single ranked query for admin patient state | Backend test suite 56 s → 18 s; removed ~8–11 TLS handshakes per login |
| 3 | TanStack Query caching, one global invalidation listener, synchronous clinic selection | Navigating back to a page no longer refetches within 30 s; only one request per endpoint on boot |
| 4 | Route-shell refactor (19 thin route files, screen modules under `src/screens/`) | Login preloads 23 → 13 chunks; 829 KB → 700 KB of initial JS; all doctor/staff chunks removed from the login critical path |
| 5 | Root cause of remaining 10 s loads: Vercel function in `hnd1` (Tokyo) while Supabase is in `us-east-1`. Moved the function to `iad1` (same region as the database), raised the serverless pool from 1 to 5 connections, removed `/auth/me` on browser-tab focus, folded the staff-role lookup into the login/session queries, and removed background session cleanup | Every login/session query no longer crosses the Pacific; parallel page requests no longer queue behind one TLS connection; switching browser tabs makes no API call |
| 6 | Fixed a pool leak introduced by a custom "one client per request" wrapper: clients were released outside Vercel's request scope and parallel queries shared a single pg client, eventually exhausting the Supabase pooler. Restored standard pg checkout/release semantics compatible with `attachDatabasePool` | Repeated logins measured locally against the production database: 1.4 s consistently, no connection timeouts. This was the actual cause of intermittent 15-second failures after the port change |

Verification at the end of every phase: `npm run typecheck`, `npm run lint` (0 errors), `npm test` (151/151), `npm run test:backend` (64 passed, 1 skipped), `npm run build`, plus browser smoke tests of the affected routes.
