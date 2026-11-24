# Neuro Spine Care Center — Project Submission Summary

## Website

| | |
|---|---|
| **Name** | Neuro Spine Care Center |
| **URL** | https://patientqueuesystem.vercel.app/ |
| **Login page** | https://patientqueuesystem.vercel.app/login |
| **Public waiting-room display** | https://patientqueuesystem.vercel.app/public-display |

## What the system does

A clinic queue and electronic health record system for one doctor/administrator, receptionists, nurses and patients. Patients can book appointments, track their token, and view their own visits, prescriptions and invoices. Staff manage the queue, prepare consultations, upload private scans/reports and issue invoices. The public display shows token numbers only, never patient names or clinical data.

## Problems reported and fixed

| Reported problem | Fix | Verified result |
|---|---|---|
| Site slow to load on every page | Removed unnecessary API calls on login; cached data with TanStack Query; split route bundles | Login page now loads 18 JS chunks instead of 26; initial JS 829 KB → 700 KB |
| Login took ~10 seconds | Moved Vercel function to the same region as the Supabase database (`iad1`), raised the DB pool from 1 to 5 connections, joined the staff-role lookup into the login query | **Login → dashboard: 1.3 seconds** |
| Switching pages/tabs took 10+ seconds | Removed `/auth/me` on browser-tab focus; restored correct database connection release so the pool no longer empties | **Tab switch: 109 ms** |
| Intermittent 15-second failures and `timeout exceeded when trying to connect` | Replaced the custom per-request connection wrapper with standard `pg` pool semantics compatible with Vercel's `attachDatabasePool` | Zero DB connection errors in new deployment logs |

## Verification

- `npm run typecheck` — pass
- `npm run lint` — 0 errors
- `npm test` — 151/151 pass
- `npm run test:backend` — 64 pass, 1 skipped
- `npm run build` — pass
- Live browser test with a real account on the deployed site — login 1.3 s, all page APIs succeed, no console errors

## Full documentation

The complete page-by-page functional inventory, role matrix, API groups, domain requirements and known gaps are in:

**`SYSTEM_REQUIREMENTS_AND_FUNCTIONALITY.md`** (project root)
