# Missing Functionality & Gap Analysis — Roadmap for a Complete Hospital System

## Website details

| | |
|---|---|
| **Website name** | Neuro Spine Care Center |
| **Website URL** | https://patientqueuesystem.vercel.app/ |
| **Login page** | https://patientqueuesystem.vercel.app/login |
| **Current scope** | Single-doctor clinic queue and electronic health record system |
| **Document date** | 20 November 2026 |

---

## 1. Executive summary

The deployed application is a functional **clinic queue and electronic health record (EHR)** system. It already covers appointment booking, token queues, consultations, prescriptions, private documents, billing, notifications and reports, with role-based access and audited actions. Performance has been verified: login takes about 1.3 seconds and page changes are effectively instant.

This document records what is **not yet present** and what would be required to present the product as a complete hospital system to a client. The gaps are grouped into five priority tiers so that the work can be phased and budgeted.

**Important:** several items below are already implemented in the codebase but are not reachable from the user interface. Those are the cheapest and highest-value fixes.

---

## 2. What the system does today

- Patient registration, email/password and Google sign-in, password recovery.
- Multi-clinic setup with city/area locations and configurable clinic hours.
- Patient self-booking and staff booking with doctor availability, split shifts and leave management.
- Atomic appointment tokens, daily queues, call next/call again/complete/skip/requeue, and a sanitised public waiting-room display with optional voice announcements.
- Doctor consultations with structured vitals, diagnosis, private notes, prescriptions, follow-ups and printable A4 documents.
- Private document uploads (PDF/JPEG/PNG) with an in-browser scan viewer and doctor-controlled release to the patient.
- Integer-minor-unit invoicing, partial/full payments, voiding and printable receipts.
- In-app notifications, append-only audit logging, reports and audited CSV exports.
- Performance and reliability fixes: same-region hosting, pooled database connections, cached client data and reduced bundle size.

---

## 3. Gap inventory by priority

### Tier 1 — Must fix before clinical/production use

| # | Gap | Why it matters | Effort |
|---|---|---|---|
| 1.1 | **Hidden/unreachable features:** branding settings, follow-up management, data management/email delivery and the audit-log page exist in code but their URLs redirect to the admin home | The client cannot use features that are already built. Either expose them in navigation or remove them from scope | Small |
| 1.2 | **Completed visits are read-only in the interface only** | Server-side immutability must be enforced so a completed clinical record cannot be silently changed | Small |
| 1.3 | **No allergy or drug-interaction warning while prescribing** | Allergies are stored on the patient's clinical profile but are not checked when a prescription is written — a patient-safety gap | Medium |
| 1.4 | **No walk-in patient creation and check-in requires an exact email address** | Reception needs phone/name/token lookup and the ability to register a walk-in patient quickly | Medium |
| 1.5 | **Admin account settings are not linked from the admin navigation** | Password change and session revocation are reachable only by typing `/account` manually | Small |
| 1.6 | **Rate limits and session caches are per serverless instance** | Login limits and session revocation are not global across Vercel instances. A shared store such as Redis/KV is needed | Medium |
| 1.7 | **No multi-factor authentication for staff accounts** | Expected for a system holding clinical and financial data | Medium |
| 1.8 | **Public branding endpoint exposes doctor phone, email and licence** | Needed on prescriptions, but the public payload should be reviewed and minimised | Small |

### Tier 2 — Missing hospital and clinic operations

| # | Gap | Current state | Notes |
|---|---|---|---|
| 2.1 | **Laboratory module** | Lab reports are uploaded PDFs/images only | No structured results, reference ranges, trend graphs or lab-order workflow |
| 2.2 | **Radiology / PACS workflow** | Imaging uploads and a viewer exist | No study/series grouping, no prior/current comparison, no reporting workflow, no modality-based throughput |
| 2.3 | **Pharmacy and inventory** | Medicine library is a catalogue only | No stock levels, dispensing, batch/expiry tracking or issue register |
| 2.4 | **Multi-doctor support** | One doctor account (admin); staff prepare on that doctor's behalf | No separate doctor accounts, per-doctor schedules or doctor workload |
| 2.5 | **Inpatient / ward / bed / operating theatre / emergency modules** | Not present | May be intentionally out of scope for a small specialist clinic — confirm with the client |
| 2.6 | **Insurance and claims** | Not present | Billing is manual/cash only |
| 2.7 | **Automated reminders** | In-app notifications; email is a manual authorised batch | No automated SMS/email appointment or follow-up reminders |
| 2.8 | **Privacy consent at registration** | Not present | Health data collection needs explicit consent text |

### Tier 3 — Reporting and analytics

| # | Gap | Notes |
|---|---|---|
| 3.1 | Peak-hour and patient-traffic analysis | Not available in current reports |
| 3.2 | Average consultation duration and doctor productivity | Not available |
| 3.3 | No-show and cancellation trend analysis | Not available |
| 3.4 | Radiology and OPD throughput dashboards | Only a generic document count KPI exists |
| 3.5 | Usable audit-log page | API exists, page redirects to home |
| 3.6 | Self-service backup/export page | API exists, page redirects to home |

### Tier 4 — Patient experience

| # | Gap | Notes |
|---|---|---|
| 4.1 | Dedicated patient documents gallery | `/patient/documents` currently redirects to the dashboard |
| 4.2 | Longitudinal health timeline | Visits, vitals, imaging and prescriptions are not shown as one timeline |
| 4.3 | Side-by-side imaging comparison | Not available |
| 4.4 | Mobile "you are number 3, ETA 12 minutes" tracking link | Patients must open the full patient portal |
| 4.5 | Patient feedback / satisfaction capture | Not available |
| 4.6 | Urdu/English bilingual interface | Important for a Pakistan-based clinic |

### Tier 5 — Platform and reliability

| # | Gap | Notes |
|---|---|---|
| 5.1 | Real-time updates on Vercel | WebSockets cannot upgrade; 30-second visible-page polling is used instead |
| 5.2 | Uptime monitoring and alerting | Not configured |
| 5.3 | Separate staging environment | Not configured |
| 5.4 | Automated UI regression tests for clinical features | Not configured |

---

## 4. Recommended roadmap for a client demo

| Phase | Scope | Outcome |
|---|---|---|
| **Phase A — Safety and cleanup** | Tier 1 items 1.1–1.8 | Turns the prototype into a safe clinical tool; lowest effort, highest credibility |
| **Phase B — Management visibility** | Tier 3 analytics, audit-log page, export page | Strong visual impact for a client demonstration |
| **Phase C — Clinical depth** | Structured lab results, imaging study grouping and comparison, allergy checking | Closes the biggest clinical functionality gaps |
| **Phase D — Patient journey** | Health timeline, documents gallery, mobile tracking, bilingual UI | Improves patient experience and demonstrates completeness |
| **Separate budget / later phase** | IPD/wards, OT, pharmacy stock, insurance/claims, multi-doctor, MFA infrastructure | Should not be promised as part of the current system |

---

## 5. Suggested message to the client

> The current platform already delivers the core digital clinic workflow: booking, token queues, consultations, prescriptions, private reports, billing and reporting, backed by role-based security and audit records. We have also resolved the initial performance issues and verified the live deployment.
>
> To position it as a complete hospital system, the next phase should first make the existing features fully reachable and clinically safe, then add structured laboratory and imaging workflows, management analytics and a richer patient experience. Larger hospital departments such as inpatient wards, operating theatres, pharmacy inventory and insurance would be a separate implementation phase.

---

## 6. Conclusion

None of the gaps above undermine what has already been delivered — the core system is working and verified. The priority is to **finish and expose what is already built**, then add the clinical modules that a hospital would expect. This phased approach keeps the work practical, reliable and easy to demonstrate to a real client.
