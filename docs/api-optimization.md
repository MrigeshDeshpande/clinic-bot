# API Call and Endpoint Optimization Plan

## Goal

Reduce unnecessary API calls, make data ownership explicit, improve endpoint efficiency, and keep the dashboard responsive without duplicating business logic.

This document focuses on API usage and endpoint behavior. The broader extensibility plan lives in `docs/ocp.md`.

## Current Observations

### Dashboard Overview

On `/dashboard`, the parent page fetches:

- `/api/dashboard/appointments?date=YYYY-MM-DD`
- `/api/dashboard/calendar?year=YYYY&month=M`

This is expected because the overview needs both:

- appointment rows and totals for the selected date
- month-level slot/date availability metadata

However, the `Calendar` component also fetches `/api/dashboard/calendar` internally, even when the parent already passed `datesData`.

Current duplication:

- `src/app/dashboard/page.js` fetches calendar data.
- `src/components/Calendar.js` fetches calendar data again.
- `src/app/dashboard/page.js` also directly fetches calendar data after booking and on month changes.

### Appointments Page

On `/dashboard/appointments`, the page fetches:

- `/api/dashboard/appointments?...`
- `/api/dashboard/calendar?...` for calendar dots

It passes `dotDates` into `Calendar`, but `Calendar` can still fetch full calendar data internally. This can create another duplicate fetch path.

### Notification Stream

`NotificationPanel` opens:

- `/api/dashboard/notifications/stream`

This is an SSE connection, not regular polling. It is expected to stay open. In development, Fast Refresh or reconnects may make it appear more than once.

### Client Cache

`src/lib/clientFetchCache.js` already provides:

- request caching
- in-flight deduplication
- TTL-based reuse

But not all client requests use it. Some components use direct `fetch`, which bypasses dedupe.

## Optimization Principles

### 1. One Owner Per Data Set

Every data set should have a clear owner.

Good:

- Dashboard page owns selected date appointments.
- Dashboard page owns month calendar data.
- `Calendar` renders what it receives.

Bad:

- Parent fetches month data and child fetches the same month data.

Rule:

- If a parent passes data into a component, the child should not fetch the same data unless explicitly configured to do so.

### 2. Prefer Explicit Fetch Modes

Components that can be standalone should support explicit fetch behavior.

Example:

```jsx
<Calendar
  selectedDate={selectedDate}
  onDateSelect={setSelectedDate}
  datesData={datesData}
  autoFetch={false}
/>
```

Recommended contract:

- `autoFetch={false}`: component is presentational and uses parent-owned data.
- `autoFetch={true}`: component fetches its own data.

Avoid implicit behavior based only on whether `datesData` is truthy. Loading states can make that fragile.

### 3. Use `fetchCached` for Repeated GETs

Use `fetchCached` for idempotent GET endpoints that are likely to be requested repeatedly:

- calendar month data
- selected-date appointments
- patient details
- patient messages
- settings
- dashboard stats

Use raw `fetch` for:

- POST/PATCH/DELETE
- SSE streams
- file uploads
- requests that must bypass cache

### 4. Invalidate Narrowly

When a mutation changes data, invalidate only the affected cache keys.

Examples:

- Booking appointment:
  - invalidate `/api/dashboard/appointments?date=YYYY-MM-DD`
  - invalidate `/api/dashboard/calendar?year=YYYY&month=M`

- Completing visit:
  - invalidate appointment date key
  - invalidate patient detail key
  - invalidate relevant prescription/chart keys if cached client-side

- Rescheduling:
  - invalidate old date appointments
  - invalidate new date appointments
  - invalidate old month calendar
  - invalidate new month calendar

Avoid broad invalidations such as `/api/dashboard/appointments` unless the operation truly affects multiple scopes.

## Recommended Client-Side Changes

### 1. Fix Calendar Duplicate Fetching

Current issue:

- `DashboardPage` loads calendar data.
- `Calendar` loads calendar data again.

Recommended:

```jsx
<Calendar
  selectedDate={selectedDate}
  onDateSelect={setSelectedDate}
  datesData={datesData}
  autoFetch={false}
  onMonthChange={handleCalendarMonthChange}
/>
```

Inside `Calendar`:

```js
useEffect(() => {
  if (!autoFetch) return;
  fetchData(y, m);
}, [autoFetch, y, m, fetchData]);
```

Expected result:

- Initial dashboard load: one appointments request, one calendar request.
- Calendar component: zero duplicate calendar requests.
- Month navigation: one calendar request.

### 2. Centralize Dashboard Month Loading

Create a dashboard helper:

```js
async function loadCalendarMonth(year, month) {
  const data = await fetchCached(`/api/dashboard/calendar?year=${year}&month=${month}`);
  setDatesData(data.dates || {});
  if (data.slotDefinitions) setSlotDefinitions(data.slotDefinitions);
}
```

Use this helper for:

- initial dashboard load
- month navigation
- after booking
- after quick checkout if calendar state may change
- after walk-in if calendar state may change

### 3. Avoid Duplicate Initial Effects

React dev mode and Fast Refresh can replay effects. This is normal, but duplicate network calls should still be minimized.

`fetchCached` helps because it dedupes in-flight requests and caches successful responses.

Make sure duplicated mount effects use the same exact URL string. These are different cache keys:

```text
/api/dashboard/calendar?year=2026&month=6
/api/dashboard/calendar?month=6&year=2026
```

Prefer helper functions to generate URLs consistently.

### 4. Normalize API URL Builders

Create small client URL helpers:

```js
export function appointmentsByDateUrl(date) {
  return `/api/dashboard/appointments?date=${date}`;
}

export function calendarMonthUrl(year, month) {
  return `/api/dashboard/calendar?year=${year}&month=${month}`;
}
```

Benefits:

- consistent cache keys
- fewer typo bugs
- easier invalidation

### 5. Keep SSE Separate

Do not cache or dedupe:

- `/api/dashboard/notifications/stream`
- `/api/dashboard/patients/[id]/messages/stream`

These are long-lived streams. Reconnect behavior should be handled by the stream component, not by `fetchCached`.

## Recommended Server-Side Changes

### 1. Add Server-Side Cache Where Data Is Reused

Some endpoints already use in-memory server cache through `src/lib/dataCache.js`.

Good candidates:

- `/api/dashboard/calendar`
- `/api/dashboard/settings`
- `/api/dashboard/stats`
- `/api/dashboard/feedback`
- patient messages if short TTL is acceptable

Rules:

- Use short TTL for dashboard data.
- Invalidate or bypass cache after mutations.
- Avoid caching patient-sensitive data longer than needed.

### 2. Keep Endpoint Shapes Purpose-Specific

Avoid one endpoint returning everything unless the UI always needs everything.

Good:

- `/api/dashboard/appointments?date=...`
- `/api/dashboard/calendar?year=...&month=...`
- `/api/dashboard/stats?period=...`

Potential future endpoint:

```text
GET /api/dashboard/overview?date=YYYY-MM-DD
```

This could return:

- selected date appointments
- selected month calendar data
- dashboard totals

Only add this if the overview page always needs these together. Otherwise, separate endpoints plus client dedupe are simpler and more reusable.

### 3. Avoid Duplicate Query Logic

If multiple endpoints need the same appointment selection logic, move that logic into repository functions.

Examples:

- fetch appointments by date
- fetch appointments by range
- fetch appointment totals
- fetch calendar month availability

Prefer:

```text
route -> service/repository -> SQL
```

Avoid:

```text
route -> copied SQL
route -> copied SQL with slight differences
```

### 4. Return Only Needed Fields

Large endpoints should not return fields the UI does not render.

Examples:

- Calendar month endpoint only needs date, time, blocked status, reason, slot definitions.
- Appointment list does not always need full medicines, notes, tooth diagnoses, prescription keys, and payment details.

Possible approach:

```text
/api/dashboard/appointments?date=...&view=list
/api/dashboard/appointments?id=...&view=detail
```

Do this only after measuring payload size or UI delay. Do not prematurely fragment endpoints.

### 5. Use Conditional Aggregates Carefully

Appointment totals are useful, but repeated aggregate queries can become expensive.

For dashboard totals:

- keep the current direct aggregate if data volume is small
- consider materialized summaries only if the table grows significantly
- index by `date` and `status`

Existing indexes already include:

- `idx_appointments_date`
- `idx_appointments_date_status`

## Endpoint-Specific Notes

### `/api/dashboard/calendar`

Current role:

- returns month availability and slot metadata

Optimization:

- keep server cache
- ensure all clients use `fetchCached`
- avoid child component duplicate fetches
- invalidate calendar month after booking, cancellation, reschedule, completion, no-show, and schedule block/unblock

### `/api/dashboard/appointments`

Current role:

- date query
- range query
- future scope query
- single appointment by ID
- POST quick booking

Optimization:

- keep URL generation consistent
- invalidate date/range caches after mutations
- consider separating detail and list field sets later
- avoid broad cache invalidation where a date-specific invalidation is enough

### `/api/dashboard/settings`

Current role:

- returns clinic, doctor, prescription, checklist, medicine, and map settings

Optimization:

- cache on server and client
- invalidate after settings update
- avoid refetching settings from multiple mounted components if one shared settings context can own it

### `/api/dashboard/notifications/stream`

Current role:

- SSE stream for manual chat notifications

Optimization:

- do not use `fetchCached`
- ensure cleanup closes `EventSource`
- reconnect with backoff
- avoid duplicate mounted `NotificationPanel` instances

## Measurement Checklist

Use browser Network tab and server logs.

For `/dashboard` initial load, target:

- `GET /api/dashboard/appointments?date=...`: 1 request
- `GET /api/dashboard/calendar?year=...&month=...`: 1 request
- `GET /api/dashboard/notifications/stream`: 1 long-lived SSE connection
- settings requests only if the visible page needs them

For month navigation:

- one calendar request per clicked month

For booking:

- one POST booking request
- one appointments refresh for affected date
- one calendar refresh for affected month

For reschedule:

- one POST reschedule request
- refresh affected old/new date data
- refresh affected old/new month calendar data

## Anti-Patterns to Avoid

- Component fetches data already owned by parent.
- Same endpoint called with different query parameter ordering.
- Raw `fetch` used for repeated GETs where `fetchCached` would dedupe.
- Broad cache invalidation after narrow mutations.
- Endpoints returning large detail payloads for compact list views.
- Adding a combined endpoint before confirming the UI always needs all combined data.
- Treating SSE streams like normal GET requests.

## Suggested First PR

Scope:

- Add `autoFetch` prop to `Calendar`.
- Set `autoFetch={false}` where parent passes `datesData` or `dotDates`.
- Replace direct calendar GETs in dashboard pages with `fetchCached`.
- Add URL helper functions for calendar and appointments cache keys.

Expected outcome:

- Remove duplicate calendar calls on `/dashboard`.
- Remove duplicate calendar calls on `/dashboard/appointments`.
- Keep standalone `Calendar` behavior available.
- Preserve current UI behavior.




