# Company Management System — Session Handoff

_Last updated: 2026-09-25 (Africa/Lusaka)_

This file exists so a new Claude session (voice, chat, or another window) can
pick up this project without the user having to re-explain everything.
Read this first, then ask the user what they want to do next.

## Who / what this is

- User: **Fannwell**, Administration Manager at Magen Security Limited and
  its group companies (Direct Guard Limited, Cheetah Logistics Limited,
  Ancient Builders Limited), Lusaka, Zambia.
- Project: **Company Management System (CMS)** — an internal web app
  (+ an in-progress Android app) covering HR, payroll, operations,
  invoicing/finance, and a Marketing department module.
- Repo (local): `C:\Users\FANNWELL\Desktop\PROJECTS\company-management-system`
  on the user's Windows PC, device name `fannwell-igris`.
- GitHub: `fannwell-igris/company-management-system`, branch `main`.
- Hosting: **backend on Railway** (auto-deploys on push to `main`),
  **frontend on Vercel** (auto-deploys on push to `main`).
  - Frontend URL: `https://company-management-system-chi.vercel.app`
  - Backend URL: `https://company-management-system-production-4d77.up.railway.app`

## How this session works (important constraints)

- Claude has **no direct shell on the user's PC**. All git/npm/prisma
  commands are run BY THE USER in their own terminal — Claude gives them
  the exact commands to paste, and they paste back the output.
- Claude DOES have a **device bridge** (when connected) that can:
  - `device_list_dir` — list files/folders on the PC
  - `device_stage_files` — pull a file from the PC into the session to read it
  - `device_commit_files` — write a file from the session back onto the PC
  - Standard workflow for any code change: edit the file in the session's
    working copy → copy to `/mnt/user-data/outputs/...` → `device_commit_files`
    to the real path on the PC → `device_stage_files` to re-pull it →
    `md5sum` compare the two copies to confirm the write actually landed
    (this has occasionally silently failed — always re-verify, don't
    assume `device_commit_files` succeeding means the content is correct).
  - If the device bridge is ever disconnected, fall back to building
    everything in the session's own working copy and delivering as a zip
    via `SendUserFile`, with manual terminal instructions for extraction.
- Claude also has a **Chrome browser extension connection** (when the
  user's Chrome + extension are open) that can navigate the live site,
  read console/network output, and run JS in the page — very useful for
  diagnosing "X page is broken" reports directly instead of guessing.
- The user is **not a developer** — give them copy-pasteable terminal
  commands, not instructions to "go edit the file yourself."

## What's been built so far

### Core system (pre-existing before this session)
Clients, Sites, Employees, Contracts, Roster, Operations, Inventory,
Invoices, Payroll, Tasks, Department Requests, Expenses, Users & Roles,
Settings (Shift Types / Allowance Types / Deduction Types / Statutory
Rules), Alerts, Site Coverage, Finance, Messages, Deployment.

### Marketing module (built across recent sessions, Phases 1-8, all live)
- Phase 1-3 (pre-existing): Prospects, Activities, Marketing Dashboard
- Phase 4: **Field Visits** (`/marketing/field-visits`) — with file/photo
  attachment upload
- Phase 5: **Targets** (`/marketing/targets`) — monthly targets vs. actuals
  per marketer, new `MarketingTarget` Prisma model + full CRUD module
- Phase 6: **Marketing Expenses** (`/marketing/expenses`) — read-only view
  of General Expenses filtered to the Marketing department
- Phase 7: **Reports** (`/marketing/reports`) — Daily/Weekly/Monthly
  printable report, reuses the Marketing Dashboard aggregation
- Phase 8: **Management View** (`/marketing/management`) — team table that
  drills into each marketer's individual numbers
- All wired into `App.tsx` routes and the `Sidebar.tsx` Marketing nav group.

### Departments management
- `DepartmentsPage.tsx` — full CRUD (create/edit/archive), was missing
  entirely before; its absence was the root cause of an empty Department
  dropdown bug on the New/Edit User form.
- `PAYROLL` role is now displayed as **"Finance"** in the Users UI (label
  only — the underlying enum value in the database is still `PAYROLL`).

### Salary Advances (new — this is how the boss records direct payments)
- User's actual request: "my boss pays some employees directly, without
  going through me or finance — can he mark those in the system?"
  Clarified via AskUserQuestion: this means **ad hoc/informal salary
  payments outside the normal payroll run**, and the boss wants **full
  record access** (create/edit/record repayments), not just viewing.
- The backend for Salary Advances already existed and was solid
  (one active advance per employee at a time, monthly deduction schedule,
  repayment tracking, auto-transitions to FULLY_REPAID) — but had **no
  frontend page at all**. Built `SalaryAdvancesPage.tsx` from scratch:
  list/filter, create-advance modal, record-repayment modal, cancel action.
- Routed at `/finance/salary-advances`, added to the Finance sidebar group.
- `permissions.ts`: MANAGER (the boss's role) was given POST/PUT/PATCH on
  `/api/salary-advances` specifically — a deliberate, narrow exception to
  the standing rule "only Admin and Finance can edit Finance" (the rest of
  the Finance cluster — Invoices, Payments, Operational Costs, General
  Expenses, Payroll — stays Admin/Finance-only, view-only for Manager).

### Firebase / push notifications (Android app) — IN PROGRESS
- `mobile/android/` is a native Android app, package `com.magensecurity.cms`.
- Gradle is already fully wired for Firebase Cloud Messaging: the
  `com.google.gms.google-services` plugin, Firebase BOM, and
  `firebase-messaging-ktx` dependency are all in `build.gradle.kts`
  (root and app-level) — this was done in an earlier session.
- Backend already has a `push-notifier.ts` module (this is what caused a
  major incident earlier — see Bugs Fixed below).
- **Last thing in progress**: walking the user through the Firebase
  Console's "Add Firebase to your Android app" wizard. They'd gotten to
  step 2 (download `google-services.json`) when this handoff was written.
  **Next step for whoever picks this up**: confirm the user has placed
  `google-services.json` into `mobile/android/app/google-services.json`
  (the exact file, sitting next to `build.gradle.kts` in that folder),
  then continue the Firebase wizard's remaining steps and wire up the
  actual FCM token registration / notification handling code on both the
  Android side and confirm it matches what `push-notifier.ts` sends.

## Bugs found and fixed this session (chronological)

1. **Marketing module was silently dead in production for a while.**
   `GET /api/marketing-activities` returned "no permission rule defined"
   in prod despite the rule existing in the pushed code. Root cause:
   Railway had been silently FAILING every deploy since a TypeScript
   build error was introduced in `push-notifier.ts` (a `string[]` vs
   `UserRole[]` type mismatch, unrelated to Marketing) — so the ACTIVE
   deployment was from before the Marketing module even existed. Fixed
   the type error; always check Railway's Deployments tab shows "Active"
   after a push, don't just trust that `git push` succeeded.

2. **Empty Department dropdown on the New/Edit User form.** No
   `DepartmentsPage.tsx` had ever been built. Fixed by building it.

3. **`marketerId` vs `performedById` bug** in
   `marketing-targets.service.ts` — caught before the user hit it.

4. **Git history blew past GitHub's 100MB file limit** — an earlier
   broad `git add ..` had swept up a stray 385MB `desktop.zip` into a
   commit. Fixed safely with `git reset --soft` (nothing had been pushed
   yet) + `.gitignore` entry, since force-pushing/rewriting pushed history
   would have been unsafe. **Note: `desktop.zip` (404MB) still sits at the
   project root on disk, now gitignored — it's harmless there but was
   never cleaned up; ask the user if it can be deleted.**

5. **Blank white screen on Marketing Reports and Targets pages.** Both
   pages read the `/prospects/assignable-users` API response as `r.data`
   instead of `r.data.data` — the backend wraps responses as
   `{status, data}`, so `r.data` was an object, and calling `.find()`/
   `.map()` on it crashed the whole page render. Fixed both files.

6. **Empty Employee dropdown in Roster's "Schedule Shift" form, for the
   Operations role.** `/api/employees` had a deliberate rule blocking
   Operations from GET access (meant to route Operations through other
   endpoints' nested employee data instead) — but Roster's own dropdown
   calls `/api/employees` directly, so Operations could never schedule
   anyone. Asked the user how to resolve it; they chose granting
   Operations GET-only access to the employee list (name/position/status
   — not salary or contract data, which stays behind separate endpoints).

7. **"Schedule Shift" Shift Type dropdown empty for everyone** — this
   turned out to NOT be a bug. Shift Types are managed under
   Settings → Shift Types (Admin-only) and none had been created yet.
   User needs to add at least one there (e.g. "Day Shift", "Night Shift")
   for it to show up anywhere Shift Type is selected.

8. **Finance Overview showing garbled numbers** like
   "ZMW 07900142004740" instead of "ZMW 26,840.00". Root cause: the
   backend sends Decimal money fields as JSON **strings** (for precision),
   but `FinancePage.tsx` summed them with plain `reduce((s,i) => s + i.amount, 0)`
   — since `i.amount` is a string, this does text concatenation instead of
   arithmetic. Fixed every instance in that file (there were ~20) by
   wrapping with `Number(...)`. Every other page in the app already did
   this correctly — it was isolated to `FinancePage.tsx`.

9. **User on a mobile hotspot got `ERR_CONNECTION_TIMED_OUT` specifically
   for the Vercel frontend domain**, while every other site worked fine
   on the same connection. This is a network/carrier-level issue (likely
   DNS or domain-level filtering on their mobile carrier), not an app bug
   — was mid-troubleshooting (suggested trying Cloudflare 1.1.1.1 DNS app,
   then a VPN as a diagnostic) when the conversation moved on. **Unclear
   if this was ever resolved — worth asking the user.**

## Commit trail (most recent last)

```
0e9d578  Fix push-notifier TypeScript build error blocking Railway deploys
079eed6  Add Marketing Tasks, Targets, Expenses, Reports, and Management drill-down (Phases 5-8)
bd8c043  Add Salary Advances page and let Manager record salary advances directly
b2430c0  Fix blank screen on Marketing Reports and Targets pages (marketer list response shape)
efa5f9f  Fix empty Employee dropdown in Roster for Operations role
bff8197  Fix Finance figures showing as concatenated text instead of totals
```
All pushed and confirmed live (Railway "Active" / Vercel deployed) as of
2026-09-24 ~17:10 Lusaka time.

## Standing rules established this session (don't relitigate these)

- **"Only Admin and Finance can edit Finance"** (2026-09-23) — Manager has
  view-only (GET) access across the whole Finance cluster by default.
  The one deliberate exception: **Manager can write to Salary Advances**
  specifically (see above), because that's the boss's own direct-payment
  workflow.
- Employees (`/api/employees`) GET access: Admin, Manager, Payroll, HR,
  and now Operations (basic fields only).
- `PAYROLL` role displays as "Finance" in the UI only — do not rename the
  underlying enum without a migration.

## Not yet started / raised but not acted on

- Mobile APK rebuild/signing/distribution process — not discussed yet.
- True multi-line-item invoice support — flagged earlier as a bigger
  change; user hasn't responded on whether/when to do it.
- Confirm whether the mobile-hotspot network issue (#9 above) got resolved.
- `desktop.zip` (404MB) cleanup at the project root (see #4 above).
- Firebase setup is mid-flow — see "Firebase / push notifications" section.

## Recommended first message from whoever picks this up

Something like: "I've got the handoff notes from your last session — looks
like we were in the middle of setting up Firebase for the Android app
(placing `google-services.json`). Want to continue there, or is there
something more urgent first?"
