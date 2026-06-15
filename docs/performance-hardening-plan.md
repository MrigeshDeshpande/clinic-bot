# Dashboard Performance Hardening Plan

## Goal

Make the dashboard feel fast and predictable for real clinic staff, especially:

- left sidebar navigation
- booking a new patient
- opening visit logging
- loading appointments/calendar data
- searching patients while booking

This is a client project. The receptionist workflow must not feel slow, uncertain, or blocked by background technical work.

## Current Diagnosis

### 1. Development Mode Is Misleading

`npm run dev` uses Next.js development mode. It compiles pages lazily, enables HMR, and can replay client effects. First navigation to a sidebar item can be much slower than production.

Use production mode when judging client-facing performance:

```bash
npm run build
npm run start
```

Dev mode is still useful for debugging, but not for final UX judgment.

### 2. Dashboard Pages Are Client-Heavy

Several important routes are full client components:

- `src/app/dashboard/page.js`
- `src/app/dashboard/visit/page.js`
- `src/app/dashboard/appointments/page.js`
- `src/app/dashboard/patients/page.js`
- `src/app/dashboard/settings/page.js`

This means a sidebar click often performs this sequence:

```text
click route
load JS chunk
hydrate client component
run useEffect
fetch API data
render useful content
```

That creates a slower perceived transition than server-rendered data or prefetched route data.

### 3. Visit Page Is Heavy

`src/app/dashboard/visit/page.js` imports many expensive/feature-heavy modules up front:

- prescription preview
- camera viewfinder
- tooth chart
- per-tooth diagnosis panel
- attachments
- context sidebar
- walk-in drawer
- edit patient drawer

Even when the user only wants a simple visit or booking flow, the browser pays for much of the visit page bundle.

### 4. Booking Path Runs Migrations

`POST /api/dashboard/appointments` currently calls:

```js
await runMigrations();
```

This is not acceptable for a receptionist-facing booking path.

Booking should not wait for schema migration work. Migrations can involve many `CREATE TABLE`, `ALTER TABLE`, `CREATE INDEX`, backfill, and settings operations.

Migrations should run during:

- deploy/startup
- explicit admin maintenance
- controlled migration command

They should not run inside normal booking requests.

### 5. Calendar Data Is Fetched More Than Once

Known duplication:

- `src/app/dashboard/page.js` fetches `/api/dashboard/calendar`
- `src/components/Calendar.js` also fetches `/api/dashboard/calendar`
- month navigation and booking success paths also use direct calendar fetches

This makes dashboard load and calendar changes more expensive than necessary.

### 6. Patient Search Can Feel Slow

Quick booking searches patients after typing at least two characters. This is useful, but it can feel slow if:

- the DB/network is slow
- search is triggered too often
- the search endpoint returns more data than needed
- trigram indexes were not applied

Search should be fast, cancellable, and lightweight.

## Performance Targets

These are practical targets for clinic usage.

### Production Mode Targets

Measure using `npm run build && npm run start`.

- Sidebar click to visible page shell: under 300 ms after warm load.
- Sidebar click to useful data: under 800 ms for common pages.
- Booking POST response: under 500 ms on healthy network/DB.
- Patient search response: under 300 ms for common queries.
- Dashboard initial data calls:
  - one appointments request
  - one calendar request
  - one notification SSE stream

### Receptionist Workflow Targets

- Booking modal opens instantly.
- Typing patient name does not freeze UI.
- Appointment submit shows immediate saving state.
- Success state appears quickly.
- Opening a newly booked visit should not hard reload the whole app.

## Phase 0: Measure Before Changing

Before applying fixes, capture a baseline.

### Browser Network Tab

Record:

- `/dashboard` initial load requests
- sidebar click to `/dashboard/appointments`
- sidebar click to `/dashboard/visit`
- booking a patient
- patient name search

Note:

- number of API calls
- duplicate calls
- slowest API call
- JS chunk load time
- whether requests are blocked or waiting

### Server Logs

Watch durations in Next logs:

```text
GET /api/dashboard/appointments?... 200 in XXXms
GET /api/dashboard/calendar?... 200 in XXXms
POST /api/dashboard/appointments 200 in XXXms
```

### Production Mode Check

Run:

```bash
npm run build
npm run start
```

Then repeat the same tests. Do not rely only on `npm run dev`.

## Phase 1: Remove Migration Work From Hot Paths

### Problem

Booking currently calls `runMigrations()`.

File:

- `src/app/api/dashboard/appointments/route.js`

This makes normal booking potentially wait on database migration checks.

### Required Change

Remove `runMigrations()` from:

- `POST /api/dashboard/appointments`

Review other user-facing hot paths that call `runMigrations()`:

- `src/app/api/dashboard/appointments/[id]/reschedule/route.js`
- `src/app/api/dashboard/patients/[id]/route.js`
- `src/app/api/dashboard/visits/[id]/compile/route.js`

Some of these may still need migration protection temporarily, but they should not remain in common UI actions long-term.

### Replacement Approach

Use explicit migration flow:

```bash
npm run db:migrate
```

or a dedicated startup/admin migration route/script.

### Acceptance Criteria

- Booking a patient no longer triggers migration logs.
- Booking POST does only booking-related DB work.
- Fresh deploy still has a documented migration step.
- Existing booking behavior remains unchanged.

### Risk

If the database schema is stale, booking may fail with schema errors. That is preferable to hiding migration work inside receptionist actions. Deployment should own schema correctness.

## Phase 2: Fix Duplicate Calendar API Calls

### Problem

`Calendar` fetches data internally even when the parent already owns calendar data.

Files:

- `src/app/dashboard/page.js`
- `src/app/dashboard/appointments/page.js`
- `src/components/Calendar.js`
- `src/lib/clientFetchCache.js`

### Required Change

Add explicit fetch mode to `Calendar`:

```jsx
<Calendar
  selectedDate={selectedDate}
  onDateSelect={setSelectedDate}
  datesData={datesData}
  autoFetch={false}
/>
```

Inside `Calendar`:

```js
useEffect(() => {
  if (!autoFetch) return;
  fetchData(y, m);
}, [autoFetch, y, m, fetchData]);
```

Use `autoFetch={false}` where parent passes:

- `datesData`
- `dotDates`

### Also Do

Replace direct repeated calendar GETs with `fetchCached`.

Create URL helpers:

```js
export function calendarMonthUrl(year, month) {
  return `/api/dashboard/calendar?year=${year}&month=${month}`;
}

export function appointmentsByDateUrl(date) {
  return `/api/dashboard/appointments?date=${date}`;
}
```

### Acceptance Criteria

On `/dashboard` initial load:

- one `/api/dashboard/appointments?date=...`
- one `/api/dashboard/calendar?year=...&month=...`
- one `/api/dashboard/notifications/stream`

On month navigation:

- one calendar request per month click

On `/dashboard/appointments`:

- no duplicate calendar fetch from child `Calendar`

## Phase 3: Add Route-Level Loading UI

### Problem

Sidebar clicks can feel dead while the next page loads.

There are currently no route-level `loading.js` files under `src/app/dashboard/*`.

### Required Change

Add lightweight route loading files:

```text
src/app/dashboard/loading.js
src/app/dashboard/appointments/loading.js
src/app/dashboard/visit/loading.js
src/app/dashboard/patients/loading.js
src/app/dashboard/settings/loading.js
src/app/dashboard/stats/loading.js
```

These should render fast skeletons, not spinners only.

### Acceptance Criteria

- Sidebar click gives immediate visual feedback.
- Page shell/skeleton appears before API data finishes.
- Loading UI matches the actual page layout.

## Phase 4: Prefetch Important Sidebar Routes

### Problem

Sidebar route chunks may not be loaded until click.

### Required Change

In dashboard layout, prefetch common routes after mount:

- `/dashboard`
- `/dashboard/appointments`
- `/dashboard/visit`
- `/dashboard/patients`
- `/dashboard/queue`

Use `router.prefetch()` carefully. Avoid prefetching every heavy page immediately.

### Acceptance Criteria

- First sidebar click after dashboard load feels faster.
- No excessive network activity from prefetching rarely used routes.

## Phase 5: Split Heavy Visit Page

### Problem

The visit page is too large and imports too much up front.

File:

- `src/app/dashboard/visit/page.js`

### Required Change

Lazy-load non-critical modules:

- `CameraViewfinder`
- `PrescriptionPreview`
- `AttachmentsPanel`
- `ContextSidebar`
- `WalkInDrawer`
- `EditPatientDrawer`
- optionally `PerToothDiagnosisPanel` if it is below the fold or behind interaction

Example:

```js
const CameraViewfinder = dynamic(() => import('@/components/CameraViewfinder'), {
  ssr: false,
  loading: () => null,
});
```

### Keep Eager

Keep core visit fields eager:

- patient header
- chief complaint
- basic diagnosis
- treatment plan
- billing summary
- save button

### Acceptance Criteria

- `/dashboard/visit` route JS is smaller.
- Initial visit form appears faster.
- Camera/prescription/attachments load only when needed or below initial priority.

## Phase 6: Optimize Booking Flow

### Problem

Booking should be one of the fastest workflows in the app.

Current booking path:

- client opens booking modal
- patient search may run while typing
- POST `/api/dashboard/appointments`
- parent refreshes appointments/calendar

### Required Changes

1. Remove migrations from booking path.
2. Keep booking POST payload minimal.
3. Optimistically update appointment list after success.
4. Refresh calendar in background.
5. Use `router.push`, not `window.location.href`, when opening the visit page after booking.

Current issue:

```js
window.location.href = `/dashboard/visit?appointmentId=${bookedAppointment.id}...`
```

This causes a full page reload. Use `router.push()` instead.

### Acceptance Criteria

- Booking submit is fast.
- UI shows success immediately after POST.
- Calendar refresh does not block success state.
- Opening visit after booking keeps SPA navigation.

## Phase 7: Optimize Patient Search

### Problem

Patient search can feel slow during booking.

Files:

- `src/db/repositories/patientRepository.js`
- `src/app/api/dashboard/patients/search/route.js`
- `src/app/api/dashboard/patients/route.js`
- quick booking search code in `src/app/dashboard/page.js`

### Required Changes

- Ensure `pg_trgm` indexes exist:
  - `idx_patients_name_trgm`
  - `idx_patients_phone_trgm`
- Return only fields needed by autocomplete:
  - id
  - name
  - phone
  - age
  - sex
  - location
  - visit_count if needed
- Abort stale search requests on input changes.
- Keep debounce around 250-300 ms.
- Consider not searching until 3 characters for names, but keep 2 characters for phone search.

### Acceptance Criteria

- Typing in booking modal does not lag.
- Stale search responses do not overwrite newer input.
- Search API stays under 300 ms on normal data volume.

## Phase 8: Server Endpoint Improvements

### Appointments Endpoint

File:

- `src/app/api/dashboard/appointments/route.js`

Recommendations:

- Keep list queries lean.
- Avoid returning heavy fields in list views unless rendered.
- Consider `view=list` and `view=detail` later.
- Keep date/status indexes.

### Calendar Endpoint

File:

- `src/app/api/dashboard/calendar/route.js`

Recommendations:

- Keep server cache.
- Invalidate after booking, cancellation, reschedule, schedule block/unblock.
- Return only calendar-specific data.

### Settings Endpoint

File:

- `src/app/api/dashboard/settings/route.js`

Recommendations:

- Cache settings server-side.
- Avoid `ensureTable()` on every normal GET once deployment migration is reliable.
- Move default settings seeding to migration/startup.

### Stats Endpoint

File:

- `src/app/api/dashboard/stats/route.js`

Current behavior:

- runs many aggregate queries in parallel
- has server cache

Recommendations:

- Keep cache.
- Avoid loading stats unless user opens stats page.
- Consider summary tables only if data grows significantly.

## Phase 9: Add Timing Instrumentation

### Goal

Stop guessing. Log slow endpoints and slow client transitions.

### Server Timing

Add small timing wrappers around API routes or repository functions.

Log if:

- API route > 500 ms
- DB query > 300 ms
- booking POST > 500 ms
- patient search > 300 ms

### Client Timing

Measure:

- sidebar click timestamp
- route rendered timestamp
- data loaded timestamp

This can be development-only initially.

### Acceptance Criteria

- Slow route reports include endpoint, duration, and major phase.
- Future performance regressions are visible in logs.

## Suggested Execution Order

Do not do everything at once.

1. Measure production-mode baseline.
2. Remove migrations from booking path.
3. Fix duplicate calendar fetching.
4. Add route-level loading UI.
5. Replace full reload after booking with client navigation.
6. Lazy-load heavy visit page modules.
7. Prefetch most-used sidebar routes.
8. Optimize patient search payload/query.
9. Add timing instrumentation.
10. Re-measure and compare.

## What Not To Do

- Do not judge performance only in `npm run dev`.
- Do not add a giant combined endpoint before proving it helps.
- Do not prefetch every route blindly.
- Do not cache mutation responses.
- Do not run migrations inside receptionist workflows.
- Do not lazy-load the core form fields needed immediately.
- Do not hide slowness with only spinners; reduce the work.

## Done Criteria

This hardening effort is complete when:

- production-mode sidebar navigation feels immediate
- booking a patient is consistently fast
- visit page first render is noticeably faster
- duplicate calendar calls are gone
- normal booking does not run migrations
- client route transitions show immediate skeletons
- slow endpoint logs exist for future diagnosis

