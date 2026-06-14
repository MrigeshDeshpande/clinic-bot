# Production Flow Readiness Review

Date: 2026-06-14

Scope:

- Dashboard navigation
- Appointment booking
- Existing patient repeat visits
- Visit completion and completed-visit editing
- Quick Checkout
- Rapid Walk-In
- Attachments / media upload
- Patient profile loading
- Prescription/chart generation
- API reliability and security basics

This is a critical review for production readiness. It intentionally focuses on what can break in a real clinic, not only what works in the happy path.

## Executive Verdict

The product is close, but not production-ready without a short hardening pass.

The core clinical feature set is strong: appointment records, patient records, per-tooth diagnosis, prescriptions, dental chart export, quick checkout, and walk-in completion are all present. The main remaining risk is not feature absence. The risk is workflow ambiguity, slow hot paths, inconsistent mutation handling, and insufficient distinction between:

- completing a scheduled appointment
- editing an already completed visit
- creating a new repeat visit for an existing patient
- uploading attachments to an existing visit
- queueing attachments before a visit exists

These must be made explicit before production.

## What Works

### 1. Single Completion Engine

Quick Checkout, Rapid Walk-In, and the visit page all use `POST /api/dashboard/visit`.

This is the right direction. The system avoids having multiple independent visit-completion engines.

Strength:

- less duplicated business logic
- fewer inconsistent payment/status rules
- easier future OCP extraction into command handlers

Current caveat:

- the same endpoint is now overloaded with several meanings: create walk-in, complete appointment, edit completed visit
- the endpoint can support this, but the intent needs to be explicit

### 2. Dentist-Specific Clinical Record Is Meaningful

The current visit flow has real dental value:

- FDI tooth numbering
- per-tooth diagnoses
- tooth surfaces
- severity
- treatment plan
- status and outcome
- PDF table output
- dental chart output
- patient timeline/history

This is not a generic clinic CRUD app anymore. The dental record direction is correct.

### 3. Attachments Are Backed By R2

Media storage is designed correctly in principle:

- upload file to R2
- store object key in `appointments.chit_media`
- generate signed URLs for viewing
- invalidate compiled PDF on new media

This is a good production architecture.

Current caveat:

- R2 env must be present in production
- upload behavior must be explicit in UI
- failed upload should not be confused with failed visit save

### 4. Patient Reuse Exists

The system can find existing patients by phone and attach appointments/visits to `patient_id`.

This is important for repeat patients.

Current caveat:

- the UI must clearly distinguish "edit this old visit" from "create new visit for this existing patient"

## Critical Breakpoints

### P0: Completed Visit Editing Was Ambiguous

Problem:

The visit page was submitting every appointment with:

```js
status: 'completed'
```

Backend completion logic only allows this when the appointment is still:

```sql
status = 'confirmed'
```

So an already completed visit could fail when the doctor opened it again and tried to edit/save.

Current mitigation:

- completed appointments now submit without `status: 'completed'`, so the backend treats it as an edit instead of a new completion action

Remaining production concern:

- this is still implicit
- the API decides behavior based on whether `status` is sent

Required production fix:

Use explicit operation intent.

Recommended API contract:

```json
{
  "mode": "completeAppointment",
  "appointmentId": "..."
}
```

```json
{
  "mode": "editCompletedVisit",
  "appointmentId": "..."
}
```

```json
{
  "mode": "createWalkIn",
  "patient_id": "..."
}
```

Acceptance criteria:

- completing a confirmed appointment works
- editing a completed visit works
- editing a cancelled/no-show/superseded visit is rejected with a clear message
- frontend labels show "Save changes" for completed visits, not "Complete Visit"

### P0: Repeat Visit Flow Is Not Explicit Enough

Problem:

For a registered patient who already has one completed visit, there are two valid actions:

- edit the old completed visit
- create a new visit for the same patient

These are not the same.

Risk:

Receptionist/doctor may accidentally overwrite the previous visit instead of creating the next visit.

Required production fix:

On patient profile and visit entry points, use explicit actions:

- `New Visit`
- `Edit Last Visit`
- `Open Visit History`

Do not route "existing patient + visit page" ambiguously.

Recommended URL contract:

```text
/dashboard/visit?patientId=...&mode=new
/dashboard/visit?appointmentId=...&mode=edit
```

Acceptance criteria:

- clicking "New Visit" for Rahul creates a new completed/walk-in appointment row
- clicking an old visit opens that specific visit for editing
- saving an old visit does not create a new appointment
- creating a new visit does not mutate the old appointment

### P0: Raw `fetch` Is Used For Mutations In Several Client Components

Problem:

Some mutation calls use raw `fetch` instead of `apiFetch`.

Examples found:

- `QuickCheckoutModal`
- `RapidWalkInModal`
- appointment status/arrival/cancel flows
- prescription/chart/compile actions
- family link/unlink areas

Current CSRF implementation allows same-origin requests without requiring the header, so this may work locally. But relying on that makes security behavior inconsistent and makes future CSRF tightening risky.

Required production fix:

All client-side non-GET dashboard mutations should use `apiFetch`.

Rule:

```text
GET/SSE: fetch or fetchCached
POST/PATCH/DELETE JSON: apiFetch
multipart upload: apiFetch
```

Acceptance criteria:

- `rg "fetch\\(.*method: 'POST|method: 'PATCH|method: 'DELETE'"` has no dashboard client mutations that bypass `apiFetch`, except intentional external URLs
- server still enforces `requireCsrf` on all mutation routes

### P0: Some Server Mutations Miss CSRF Enforcement

Problem:

At least `src/app/api/dashboard/patients/[id]/family/route.js` has POST/DELETE mutations with rate limiting but no `requireCsrf`.

Risk:

Security inconsistency before production.

Required production fix:

Audit every `POST`, `PATCH`, and `DELETE` under:

```text
src/app/api/dashboard
```

Every mutation must have:

- `requireCsrf(req)`
- `checkRateLimit(req)`
- body size check where applicable
- clear status codes

Acceptance criteria:

- no dashboard mutation route lacks CSRF
- tests or script verify this pattern

### P0: Migrations Run In Hot User Paths

Problem:

Booking and rescheduling currently call `runMigrations()`.

Files:

- `src/app/api/dashboard/appointments/route.js`
- `src/app/api/dashboard/appointments/[id]/reschedule/route.js`

Risk:

Receptionist actions can wait on schema work. This is unacceptable in production.

Required production fix:

Remove migrations from normal user requests.

Run migrations during:

- deploy
- startup
- explicit admin command

Acceptance criteria:

- booking endpoint does no schema migration work
- reschedule endpoint does no schema migration work
- deployment checklist includes migration step

### P1: Attachments Previously Looked Uploaded But Were Only Local

Problem:

Selecting a file only put it into local React state. It was uploaded later after visit save.

Risk:

Doctor thinks attachment was saved, but visit submit fails and file is lost after refresh.

Current mitigation:

- existing appointments upload immediately on selection
- no-appointment/walk-in state shows queued behavior
- queued copy changed from `Pending Upload` to `Queued Attachments`
- upload success and failure toasts are shown

Remaining production concern:

- queued files are still memory-only before a visit exists
- refresh before save loses queued files

Recommended production fix:

For walk-ins, create the visit shell earlier or make the UI say:

```text
Queued locally. Save visit before leaving this page.
```

Better long-term:

- create draft visit row first
- upload media against draft appointment ID
- finalize draft on save

### P1: Visit Page Is Too Heavy For Common Work

Problem:

The visit page loads many heavy modules upfront:

- tooth chart
- per-tooth panel
- prescription preview
- camera viewfinder
- context sidebar
- drawers
- attachment gallery

Risk:

Sidebar navigation and "book/open visit" feel slow.

Required production fix:

Split heavy sections with dynamic imports and only load them when needed.

Candidates:

- `PrescriptionPreview`
- `CameraViewfinder`
- `PerToothDiagnosisPanel`
- attachment image viewer
- optional side panels/drawers

Acceptance criteria:

- production route transition to `/dashboard/visit` shows useful shell under 300-500 ms on a normal laptop
- tooth/chart modules load after shell, not before the page becomes usable

### P1: Dashboard API Calls Are Duplicated

Problem:

Calendar and appointment data can be fetched more than once by parent and child components.

Known risk:

- dashboard page fetches calendar
- `Calendar` can fetch calendar internally
- appointments page may fetch calendar dots and child calendar data

Required production fix:

Use one owner per dataset.

Rule:

- parent owns data, child renders data
- child fetches only when `autoFetch=true`

Acceptance criteria:

- initial dashboard load performs:
  - one appointments request
  - one calendar request
  - one notification stream
- no duplicate same-month calendar requests

### P1: Patient Profile Fetch Is Too Broad For Visit Page

Problem:

Opening `/dashboard/visit?appointmentId=...&patientId=...` can trigger:

- appointment fetch
- patient full profile fetch
- patient messages fetch
- family fetch
- sometimes patient search fallback

Observed real issue:

- patient profile request took several seconds in local testing

Risk:

Doctor waits before entering clinical data.

Required production fix:

Split patient data into:

- visit header/demographics
- clinical history summary
- messages
- family
- full timeline

Load only header and required clinical history first. Lazy-load messages/family/timeline after the form is usable.

Acceptance criteria:

- visit form fields are usable before messages/family finish loading
- messages/family failures do not block visit save

### P1: Payment Logic Needs Idempotency Review

Problem:

`completeVisit` inserts into `payments` with:

```sql
ON CONFLICT (idempotency_key) DO NOTHING
```

But the insert shown does not provide an `idempotency_key`.

Risk:

Retrying a completion request with payment could double-record payments or behave inconsistently depending on database constraints/defaults.

Required production fix:

Every payment mutation must include deterministic idempotency key.

Recommended:

```text
visit-complete:{appointmentId}:{amount}:{method}:{clientSubmitId}
quick-checkout:{appointmentId}:{amount}:{method}:{clientSubmitId}
```

Acceptance criteria:

- double-click submit does not double-count payment
- browser retry does not double-count payment
- server logs show idempotency key

### P1: Complete Visit Button Should Reflect Mode

Problem:

The UI still risks saying "Complete Visit" while editing a completed visit.

Risk:

Doctor cannot tell if they are saving corrections or creating/completing a visit.

Required production fix:

Button labels by mode:

- confirmed appointment: `Complete Visit`
- completed appointment: `Save Visit Changes`
- walk-in/new visit: `Save Visit`

Acceptance criteria:

- user can infer what will happen before clicking
- no completed visit edit appears as a second completion

### P2: File Upload Error Handling Needs Better Per-File State

Current mitigation:

- uploaded files are removed from queue
- failed files remain queued
- toast shows failure

Remaining issue:

- the UI does not show per-file status like `uploading`, `failed`, `retry`

Recommended:

Represent media queue as objects:

```js
{
  id,
  file,
  status: 'queued' | 'uploading' | 'uploaded' | 'failed',
  error
}
```

Acceptance criteria:

- failed upload can be retried without reselecting file
- file card clearly shows failed reason

### P2: Server Error Messages Leak Too Much Detail

Problem:

`jsonError` returns raw error messages for many failures.

Risk:

Database/network internals are exposed to UI. In development this helps, but production should separate user message from diagnostic log.

Recommended:

Production response:

```json
{ "error": "Could not save visit. Please try again." }
```

Server log:

```text
DASHBOARD_VISIT_ERROR detail=...
```

Acceptance criteria:

- production users see actionable non-technical messages
- logs retain exact root cause

### P2: No Formal Flow Regression Checklist

Problem:

Important flows are being manually tested ad hoc.

Required before production:

Create a checklist and run it before every deploy.

Minimum flows:

- login
- dashboard load
- book new appointment
- open appointment details
- quick checkout
- create walk-in
- existing patient new visit
- edit completed visit
- upload attachment
- generate prescription
- generate dental chart
- patient profile timeline
- reschedule appointment
- cancel appointment
- no network / DB timeout behavior

## Flow-By-Flow Assessment

### Dashboard Load

Works:

- loads appointments and calendar
- notification stream works

Breaks/risks:

- duplicate calendar calls possible
- dev mode makes performance look worse, but production still needs measured target
- DB network timeout currently impacts core data

Production status:

- needs API call cleanup before launch

### Sidebar Navigation

Works:

- routes exist and render

Breaks/risks:

- client-heavy pages delay useful content
- visit route imports too much upfront

Production status:

- acceptable for beta only after production-mode timing check
- should be optimized before full clinic rollout

### New Appointment

Works:

- creates appointment
- checks slot conflict
- links existing patient by phone

Breaks/risks:

- `runMigrations()` in booking path
- patient phone normalization may produce duplicate patients if formats differ elsewhere
- search/booking performance depends heavily on DB latency

Production status:

- remove migrations from hot path before launch

### Repeat Patient New Visit

Works:

- possible through walk-in/new visit payload with existing `patient_id`

Breaks/risks:

- UI distinction is not strong enough
- old visit edit and new visit creation can be confused

Production status:

- must add explicit mode labels/actions before launch

### Completed Visit Edit

Works:

- recently fixed so completed visits can submit as edits

Breaks/risks:

- behavior still relies on omitted `status`
- API intent is implicit

Production status:

- usable now
- should be made explicit soon

### Quick Checkout

Works:

- simple receptionist flow
- same `/api/dashboard/visit` completion path

Breaks/risks:

- uses raw `fetch`
- payment idempotency needs review
- completing already completed appointment should be blocked with clear UI

Production status:

- needs `apiFetch` and idempotency hardening

### Rapid Walk-In

Works:

- fast patient + fee flow
- creates completed appointment

Breaks/risks:

- uses raw `fetch`
- no attachment support before appointment row exists except local queue
- patient matching by name search can be ambiguous

Production status:

- usable after mutation fetch hardening

### Attachments

Works:

- R2-backed upload route exists
- accepted MIME and size checks exist
- signed URL viewing exists

Breaks/risks:

- R2 missing env returns 500
- queued files before save are memory-only
- no per-file retry UI

Production status:

- existing appointment upload is acceptable after latest fix
- walk-in attachment handling needs clearer warning or draft visit model

### Prescription / Chart

Works:

- prescription PDF exists
- dental chart PDF exists
- cache invalidates on media/visit updates

Breaks/risks:

- R2 dependency must be verified in production
- cached PDF can appear stale if invalidation misses any mutation path
- generation failure can block clinic document workflow

Production status:

- needs production R2 smoke test

## Pre-Production Must-Fix Checklist

### Must Fix Before Launch

- Remove `runMigrations()` from booking/reschedule hot paths.
- Convert client dashboard mutations from raw `fetch` to `apiFetch`.
- Add CSRF to all dashboard mutation routes, including patient family POST/DELETE.
- Make repeat-patient flow explicit: `New Visit` vs `Edit Visit`.
- Confirm completed-visit edit button says `Save Visit Changes`.
- Add payment idempotency key to completion/checkout flows.
- Run production-mode performance test with `npm run build && npm run start`.
- Verify R2 env and upload/download/signed URL in production environment.

### Should Fix Before Wider Rollout

- Split visit page heavy modules with dynamic imports.
- Remove duplicate calendar calls.
- Lazy-load patient messages/family/timeline on visit page.
- Add per-file upload status and retry.
- Replace raw technical errors with production-safe messages.
- Add a regression checklist or smoke test script.

## Suggested Implementation Order

1. Security and correctness pass:
   - `apiFetch` for mutations
   - CSRF route audit
   - explicit visit modes
   - payment idempotency

2. Hot-path performance pass:
   - remove migrations from hot paths
   - calendar fetch ownership
   - lazy-load secondary visit data

3. UX reliability pass:
   - clearer buttons by mode
   - attachment per-file status
   - production-safe errors

4. Launch smoke test:
   - run all core flows in production mode
   - test on the target clinic network
   - test DB/R2 failure behavior

## Final Recommendation

Do not push to production as-is without the P0 items.

The feature surface is impressive and the dental workflow is mostly there, but production readiness depends on predictable clinical data behavior. The biggest danger is not a missing button. The biggest danger is a staff member accidentally editing an old visit instead of creating a new visit, or a mutation silently failing due to inconsistent request/security/DB behavior.

Fix the P0 list first. Then ship a controlled beta with one clinic user, watch logs, and keep a rollback path.
