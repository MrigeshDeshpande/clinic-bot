# Open-Closed Principle Migration Plan

## Goal

Move the clinic-bot codebase toward the Open-Closed Principle (OCP): common new behavior should be added by creating or registering a new module, config entry, strategy, or section, instead of editing central files repeatedly.

This should be a targeted refactor. Do not apply abstraction everywhere. Focus on parts of the system that change often: clinical visit workflows, dental diagnosis/treatment rules, PDF generation, dashboard data loading, WhatsApp intents, and appointment/payment status behavior.

## Current Hotspots

The main OCP pressure points are files that combine orchestration, rules, UI state, rendering, and extension-specific branches:

- `src/lib/handlers.js`
  - Very large WhatsApp flow handler.
  - Many intent/state-specific branches.
  - New conversational capabilities likely require editing this central file.

- `src/app/dashboard/visit/page.js`
  - Large visit logging page.
  - Mixes patient lookup, billing, dental chart state, clinical form state, media, submission, and rendering.
  - New clinical widgets or visit fields are likely invasive.

- `src/app/dashboard/page.js`
  - Dashboard overview mixes data loading, calendar orchestration, booking, walk-in, checkout, and rendering.
  - Calendar data loading currently has overlapping ownership with `Calendar`.

- `src/components/ToothGrid.js`
  - Domain-specific rendering and interaction logic for FDI teeth, quick diagnoses, status dots, severity shading, treatment labels, context menu, and bulk selection.
  - New dental states or display rules should not require editing many branches.

- `src/components/PerToothDiagnosisPanel.js`
  - Combines dental surface geometry, diagnosis selection, treatment planning, severity/outcome/status selectors, and notes.
  - New dental fields should be additive.

- `src/lib/prescription.js`
  - PDF generation is procedural.
  - New PDF sections or formatting variants likely require editing the core generation function.

- `src/services/completeVisit.js`
  - Uses many field-specific `if` branches to build updates and payment behavior.
  - New visit fields add more central branching.

- `src/db/pool.js`
  - Migrations are centralized in a long function.
  - New schema changes are additive, but discoverability and review safety get weaker as the function grows.

## Target Architecture

### 1. Registries for Changeable Domain Concepts

Use registries for domain concepts that naturally grow over time.

Candidate registries:

- `diagnosisRegistry`
- `treatmentPlanRegistry`
- `severityRegistry`
- `toothStatusRegistry`
- `outcomeRegistry`
- `paymentModeRegistry`
- `appointmentStatusRegistry`
- `dashboardWidgetRegistry`
- `pdfSectionRegistry`

Example shape:

```js
export const toothStatusRegistry = {
  active: {
    label: 'Active',
    color: '#ef4444',
    dotClass: 'fill-red-500',
    countsAsOpen: true,
  },
  in_progress: {
    label: 'In Progress',
    color: '#f59e0b',
    dotClass: 'fill-amber-500',
    countsAsOpen: true,
  },
  treated: {
    label: 'Treated',
    color: '#22c55e',
    dotClass: 'fill-green-500',
    countsAsOpen: false,
  },
};
```

Adding a new status should usually mean adding one registry entry, not editing `ToothGrid`, `PerToothDiagnosisPanel`, patient history, and PDF rendering separately.

### 2. Explicit Workflow Strategies

The current architectural decision is correct: Quick Checkout and Rapid Walk-In both call `POST /api/dashboard/visit`. Keep one completion path.

Move toward explicit input strategies around the same completion engine:

- `completeScheduledVisitStrategy`
- `quickCheckoutStrategy`
- `rapidWalkInStrategy`

Each strategy should normalize UI-specific input into the canonical visit completion payload. The underlying business logic should remain shared.

Target shape:

```js
const visitCompletionStrategies = {
  scheduled: completeScheduledVisitStrategy,
  quick_checkout: quickCheckoutStrategy,
  rapid_walk_in: rapidWalkInStrategy,
};
```

The API route should select a strategy based on request shape or explicit source, then call the same completion service.

### 3. Section-Based PDF Generation

Move prescription and chart rendering toward ordered sections.

Target shape:

```js
export const prescriptionSections = [
  patientInfoSection,
  clinicalFindingsSection,
  toothDiagnosisTableSection,
  medicinesSection,
  adviceSection,
  followUpSection,
  signatureSection,
];
```

Each section should expose:

```js
{
  id: 'tooth-diagnosis-table',
  shouldRender: (ctx) => ctx.toothDiagnoses.length > 0,
  render: (doc, ctx) => { /* draw section */ },
}
```

Adding future sections such as implant notes, lab reports, consent notes, or radiograph summaries should not require rewriting `generatePrescription()`.

### 4. Declarative Field Update Builders

`src/services/completeVisit.js` currently builds SQL updates with many `if (field !== undefined)` branches.

Move toward declarative field handlers:

```js
const visitFieldUpdaters = {
  diagnosis: textField('diagnosis'),
  medicines: jsonField('medicines'),
  tooth_diagnoses: jsonField('tooth_diagnoses'),
  advice_selected: textArrayField('advice_selected'),
  diagnosis_selected: textArrayField('diagnosis_selected'),
  paidAmount: paymentUpdater,
};
```

Field-specific logic should live in reusable update builders. The completion service should orchestrate validation, policy, and transaction boundaries.

### 5. Data Ownership in Components

Avoid components that both accept data from a parent and fetch the same data internally.

Current example:

- `src/app/dashboard/page.js` fetches `/api/dashboard/calendar`.
- `src/components/Calendar.js` also fetches `/api/dashboard/calendar`.
- `src/app/dashboard/appointments/page.js` passes `dotDates`, while `Calendar` can still fetch full calendar data.

Preferred shape:

```jsx
<Calendar
  selectedDate={selectedDate}
  onDateSelect={setSelectedDate}
  datesData={datesData}
  autoFetch={false}
  onMonthChange={handleMonthChange}
/>
```

Rules:

- If parent owns data, child is presentational and `autoFetch={false}`.
- If the calendar is standalone, child can fetch with `autoFetch={true}`.
- Direct duplicate fetches should be replaced with shared helper functions and `fetchCached`.

## Priority Refactor Plan

### Phase 1: Dental Domain Registry

Start here because dental requirements are actively changing.

Create or consolidate:

- `src/lib/dental/fdi.js`
- `src/lib/dental/toothTypes.js`
- `src/lib/dental/surfaces.js`
- `src/lib/dental/diagnoses.js`
- `src/lib/dental/treatments.js`
- `src/lib/dental/statuses.js`
- `src/lib/dental/outcomes.js`

Move source-of-truth logic out of UI components:

- FDI tooth numbering
- tooth type mapping
- quadrant mapping
- surface labels
- surface positions per tooth type
- diagnosis options
- treatment options
- severity options
- status/outcome display metadata

Then update:

- `ToothGrid`
- `PerToothDiagnosisPanel`
- patient profile tooth history
- PDF tooth table/chart rendering

The desired result is that a new dental status, diagnosis, or treatment mostly changes one registry file.

### Phase 2: Calendar Data Ownership

Refactor calendar fetching so each endpoint is called once per state change.

Actions:

- Add explicit `autoFetch` behavior to `Calendar`.
- Use `fetchCached` for calendar requests in parent components.
- Keep month navigation data loading owned by the parent when parent passes `datesData` or `dotDates`.

Expected behavior:

- Initial `/dashboard` load: one appointments request and one calendar request.
- Calendar component: no duplicate request when parent supplies data.
- Month navigation: one calendar request.
- Notification SSE remains separate and expected.

### Phase 3: Visit Completion Strategies

Keep `POST /api/dashboard/visit` as the only completion API path.

Separate UI-specific input adaptation:

- Quick Checkout input adapter
- Rapid Walk-In input adapter
- Full Visit input adapter

All adapters should normalize into the same service call shape.

Target:

- Adding a new completion UI should add a strategy/adapter.
- It should not duplicate completion business logic.
- Payment calculation should stay centralized.

### Phase 4: Prescription PDF Sections

Break `src/lib/prescription.js` into section modules.

Potential structure:

```text
src/lib/prescription/
  index.js
  context.js
  sections/
    patientInfo.js
    clinicalFindings.js
    toothDiagnosisTable.js
    medicines.js
    advice.js
    followUp.js
    signature.js
  chart/
    dentalChart.js
```

Keep rendering order explicit. Each section should be independently testable with a minimal context object.

### Phase 5: WhatsApp Intent/State Modules

Split `src/lib/handlers.js` by intent or state group.

Candidate structure:

```text
src/lib/handlers/
  index.js
  registry.js
  booking.js
  appointmentManagement.js
  doctorDashboard.js
  visitLogging.js
  payments.js
  fallback.js
```

Target shape:

```js
export const handlerRegistry = {
  book_appointment: bookingHandler,
  cancel_appointment: cancelAppointmentHandler,
  reschedule: rescheduleHandler,
  my_appointments: myAppointmentsHandler,
};
```

Adding a new intent should mean adding a handler module and registering it, not editing a giant conditional block.

## Implementation Rules

- Prefer config/registry changes over central conditionals when behavior is domain-specific and expected to grow.
- Keep orchestration files thin.
- Put business logic in services, not components.
- Keep UI components presentational where possible.
- Do not create abstract classes unless they remove real complexity.
- Avoid plugin architecture for areas that are not changing.
- Do not refactor unrelated behavior while implementing a feature.
- Preserve the single completion path: multiple UIs, one visit completion engine.

## Definition of Progress

The migration is working when:

- Adding a new dental diagnosis does not require editing multiple UI files.
- Adding a new treatment plan does not require touching PDF, grid, panel, and summary separately.
- Adding a PDF section does not require modifying the internals of the core PDF generator.
- Adding a new dashboard widget does not require editing the dashboard page layout deeply.
- Adding a new WhatsApp intent does not require editing a very large handler file.
- Quick Checkout, Rapid Walk-In, and Full Visit continue to share one completion service.

## Non-Goals

- Do not rewrite the whole application.
- Do not introduce broad dependency injection containers.
- Do not abstract every `if` statement.
- Do not convert every component into a registry-driven component.
- Do not split files only because they are large; split around stable ownership boundaries and repeated change pressure.

