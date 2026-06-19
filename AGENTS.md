## Goal
Phase 1: Transform the clinic-bot into a dentist-specific clinical record system with per-tooth diagnosis tracking, treatment planning, severity/outcome tracking, interactive tooth grid, professional PDF exports, and a receptionist-focused quick checkout & walk-in workflow.

Phase 2 (Dhara): Build the Treatment Lifecycle Engine — a distributed human-aware reasoning architecture that shifts the system from appointment-centric to treatment-centric modeling, with operational attention surfacing on the dashboard.

## Architecture — Completion
One completion path, multiple UIs. Both Quick Checkout and Rapid Walk-In call the existing `POST /api/dashboard/visit` — same business logic, different UI. No duplicate completion engines.

## Constraints & Preferences
- Use FDI (ISO 3950) tooth numbering (11-48) instead of Universal #1-32
- 2 rows only (upper + lower), 16 teeth per row in a single row, zero gaps between grid cells
- Teeth SVGs as large as possible (`w-full`), minimal padding (`p-px`), no `aspect-square`
- SVG tooth paths for 4 types: molar, premolar, canine, incisor — must be clearly distinguishable
- Clean, interactive design: hover scale, click glow, right-click context menu, bulk select
- All 4 tooth SVGs are user-provided in 24×24 viewBox
- PDF prescription must show tooth diagnoses in a bordered table format (not plain text list)
- Surface diagram renders the actual tooth shape (not a generic outline) with positions that adapt per tooth type
- Do NOT modify existing `appointments`, `patients` tables, existing APIs, queries, migrations, WhatsApp bot logic, AI Gateway, Dhara logic, or dashboard code (Phase 2)
- Only ADD new schema, repositories, services; no UI, no API routes, no AI until all foundation layers are complete (Phase 2)
- All migrations use idempotent patterns (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`, `DO $$ ... EXCEPTION WHEN duplicate_object`)
- Fully backward compatible; appointment system must never break if treatment engine fails (best-effort integration)
- Native PostgreSQL enums preferred over CHECK constraints for treatment statuses
- `expected_steps` belongs to `procedure_codes`, not to repository callers; service layer derives it
- Repository = pure persistence (returns null/[] on error); Service = business logic (throws with status code, uses `sql.begin()` transactions); Workflow integration = best-effort, logged only

## Progress
### Done — Phase 1 (UI & Clinical Records)
- Replaced all 4 generated SVG tooth paths with user-provided SVGs (molar, premolar, canine, incisor) — clean 24×24 viewBox
- Switched from Universal #1-32 to FDI notation (11-48) in both `ToothGrid` and `PerToothDiagnosisPanel`
- Changed layout from 4 rows (2 per jaw) to 2 rows total — 16 teeth per row in `grid-cols-16`
- Removed arch curve SVGs, background gradient, midline markers — replaced with clean white/gray-900 bg
- Added interactive tooth effects: `hover:scale-110 hover:z-10 hover:drop-shadow-lg`, `active:scale-95`, `ring-2 ring-blue-500/50 ring-offset-1` for active
- Added tooth surface diagram: SVG with actual tooth shape (molar/premolar/canine/incisor), clickable O/M/B/D/L zones with 14×14px hit areas, per-tooth-type positions (canine centered at x=18, incisor B at y=17, etc.)
- Surface label terminology adapts: O="Incisal" for front teeth vs "Occlusal" for posteriors, L="Palatal" for upper vs "Lingual" for lower
- Added treatment plan selector with 13 options + custom input, shows treatment label below tooth in grid
- Added severity levels (mild/moderate/severe) with opacity-based tooth shading
- Added outcome tracking (Successful/Complication/Ongoing/Failed) with color-coded badges
- Added per-tooth notes textarea in panel
- Added status management (Active/Treated/In Progress) with status dots on tooth SVGs (rendered on top of tooth outline)
- Added right-click context menu: quick diagnoses (Caries, Pocket, Mobility, Fractured, Missing) + clear
- Added bulk select mode: "Multi" toggle → click teeth → bulk action bar with quick diagnoses + clear
- Added per-tooth history timeline on patient profile: clickable expand/collapse cards, dot-and-line progress bars color-coded by outcome, full per-visit detail (date, surface, diagnosis, severity, treatment, outcome, notes)
- Updated prescription PDF with 4-column tooth table (Tooth | Surf. | Plan | Diagnosis)
- Added printable dental chart PDF: landscape A4 with all 32 teeth colored by diagnosis, treatment labels, legend — `POST /api/dashboard/visits/[id]/chart` route + Chart buttons on patient profile
- Added full surface name labels below SVG (e.g., "B = Buccal") instead of truncated + removed redundant button row
- Auto-scroll to conditions list when surface is selected
- Updated `onQuickDiagnosis` handler in visit page to preserve treatment, severity, status fields
- Updated patient profile chips and visit summary to show treatment, severity, outcome, status
- Added `chartKey` and `Chart` button UI on patient profile (per-visit + header)
- Medical History → collapsible accordion (single-line header with chevron, `showMedical` state toggle)
- Per-Tooth History → tighter padding (`p-3 md:p-5` instead of `p-4 md:p-8`)
- Feedback → hidden when count=0, collapsed accordion header with count badge when >0, expand on click
- Messages → hidden when count=0, collapsed accordion header with count badge when >0, expand on click; pre-loaded on page init
- Messages section: reduced visual weight (smaller avatars, condensed spacing, compact header)
- **Quick Checkout modal**: Receptionist-only completion with Fee + Paid + Payment Mode + Notes — `src/components/QuickCheckoutModal.js`
- **Appointment Details modal**: Lightweight routing hub on calendar click → [Edit Visit] [Quick Checkout] [Cancel] — `src/components/AppointmentDetailsModal.js`
- **Rapid Walk-In modal**: 15-second walk-in with Name\* + Phone + Fee + Paid + Payment Mode + Notes, no treatment required — `src/components/RapidWalkInModal.js`
- **FAB dropdown menu**: Dashboard FAB expanded to `[Quick Walk-In] [New Appointment]` on week/day views
- **Reschedule discoverability**: `cursor: grab`/`grabbing` on confirmed appointment blocks + one-time "Drag to reschedule" tooltip in WeekView and DayTimeline
- **Quick Checkout in appointments table**: Replaces old "Done" flow — `₹ Quick Checkout` button opens QuickCheckoutModal, calls same `POST /api/dashboard/visit`
- **Single completion path**: Quick Checkout and Rapid Walk-In reuse `POST /api/dashboard/visit` — no separate completion engine

### Done — Phase 2 (Dhara Treatment Lifecycle Engine)
- **Commit 1 (Schema)**: Created `procedure_codes`, `treatment_plans`, `treatment_plan_steps` tables + two enums (`treatment_plan_status`, `treatment_step_status`) + seed data (4 procedures: rct/scaling/extraction/crown) in `src/db/pool.js`.
- **Commit 2 (Repository)**: Created `src/db/repositories/treatmentPlanRepository.js` with 12 functions: `createPlan()`, `getPlanById()`, `getPlansForPatient()`, `getActivePlansForPatient()`, `createSteps()`, `getStepsForPlan()`, `getStepById()`, `completeStep()`, `skipStep()`, `markPlanCompleted()`, `getProcedureCodeById()`, `getProcedureCodeByCode()`.
- **Commit 3 (Service Layer)**: Created `src/services/treatmentPlanService.js` with 4 functions: `createPlanWithSteps()` (transactional, derives steps from procedure code), `completeVisitSteps()` (handles multi-plan stepIds, validates all exist/are pending, groups by plan), `recalculatePlan()` (CTE-based: counts completed, derives next_action via SQL subquery, auto-completes if all done), `getNextPendingStep()`.
- **Commit 4 (Workflow Integration)**: Modified `src/services/completeVisit.js` (added `stepIds` support, calls `completeVisitSteps` inside `try/catch` with `logger.warn('STEP_ADVANCE_FAILED', ...)`), modified `src/services/createWalkIn.js` (added `procedureCodeId` support, calls `createPlanWithSteps` only — no auto-complete, uses `appointment.patient_id` for safety).
- **Commit 5 (Attention Engine)**: Created `src/services/attentionEngine.js` (3 query functions + `getAttentionSummary` running all in parallel), `src/app/api/dashboard/attention/route.js` (thin pass-through — necessary because dashboard is `'use client'`), `src/components/AttentionPanel.js` (collapsible dashboard widget with 3-tab bar: Overdue / Treatments / Payments, severity badges, empty states), updated `src/app/dashboard/page.js` (added `attentionData` state, third `fetchCached` in `Promise.all`, `<AttentionPanel>` between KPI strip and calendar).

### Fixed
- **`column a.tooth_diagnoses does not exist`** — Added missing `tooth_diagnoses JSONB` column to `appointments` table via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (was already in pool.js:391-395 migration but needed a server restart to apply, or the DB was created before the migration was added). Ran manually via psql and verified API returns 401 instead of 500.
- **Reschedule 500 (unique constraint `idx_appointments_unique_slot`)** — Three-part fix: (1) `supersedeAppointment` now sets `status='superseded'` on the old version so it doesn't hold the slot in the `WHERE status='confirmed'` constraint, (2) reschedule route now checks slot availability upfront and returns 409 if taken, (3) WeekView/DayTimeline call `invalidateFetchCache('/api/dashboard/appointments')` after successful drop so the 60s cache doesn't hide the new position.
- **Reschedule 500 (CHECK constraint `valid_appt_status`)** — `status='superseded'` was not in the allowed list (`confirmed,cancelled,completed,no_show`). Fix: (1) Updated `CREATE TABLE IF NOT EXISTS` constraint to include `'superseded'`, (2) Added migration block to DROP/ADD constraint in `pool.js`, (3) Added `await runMigrations()` to reschedule route (was missing), (4) Applied ALTER TABLE manually. Root cause: migration code didn't run before the reschedule POST since that route never called `runMigrations()`.

### In Progress
- (none)

### Next Up
- **Commit 6 — Attention Acknowledgement Flow**: Wire up `attention_status` (`new`/`acknowledged`/`resolved`) on attention items. Currently the schema column exists but is unused. Add API route `PATCH /api/dashboard/attention/[id]/acknowledge` (or status toggle), update `AttentionPanel` to allow acknowledging items, and filter acknowledged items out of the default dashboard view (keep them accessible in a collapsed "Acknowledged" section).

## Key Decisions
### Phase 1 (UI)
- **FDI over Universal**: User explicitly requested 18-11, 21-28 upper and 48-41, 31-38 lower with 2 rows only
- **One row per jaw**: 16 teeth in `grid-cols-16` (no splitting into 2 rows per jaw)
- **`w-full` SVGs**: Fill available column width, square viewBox maintains aspect ratio, zero gaps
- **`toothPath()` function**: Uses `toothType()` which maps FDI second digit to shape, with `toothQuadrant()` for labels
- **Surface diagram uses actual tooth shape**: Molar/premolar/canine/incisor paths rendered in 40×40 viewBox with per-type zone positions for O/M/B/D/L
- **`buildEntry()` helper**: Centralized entry creation in panel to avoid missing fields across all setter functions
- **Single `expandedTooth` state**: Used instead of per-item `useState` since hooks can't be called inside JSX map callbacks
- **`tooth_diagnoses` JSONB is additive**: Backward-compatible — old `diagnosis_selected TEXT[]` column kept unchanged
- **Status dots render after tooth stroke**: Moved `circle` elements after the `<path>` outline so they appear on top, opacity increased from 0.5 → 0.7
- **One completion path**: Both Quick Checkout and Rapid Walk-In call `POST /api/dashboard/visit` — no separate API endpoints. Different UI, same business logic.
- **Appointment Details modal as single entry point**: Calendar appointments no longer navigate directly to patient profiles. Single click → AppointmentDetailsModal → [Edit] [Quick Checkout] [Cancel]
- **Fee maps to treatment_charges**: Quick Checkout uses a single `Fee` input mapped to `treatment_charges`. Consultation and medicine charges are preserved from prior data.
- **Discount-ready structure**: Quick Checkout uses `subtotal → discount → total → paid → outstanding` internally, even though discount is hidden for V1.

### Phase 2 (Dhara)
- **Treatment engine is secondary to appointments**: `completeVisitSteps` is fire-and-forget; failure logs warning, never blocks visit completion.
- **Walk-in creates plan only, never completes steps**: Preserves "diagnosed but not started" category; `completed_steps=0`, `next_action=first step`.
- **`recalculatePlan()` is the heart of the treatment engine**: Everything funnels through it — counts completed, derives next_action, auto-completes.
- **Use direct SQL inside transactions, not repository functions**: `sql.begin()` with `tx.unsafe()` for bulk inserts; avoids N+1 and transaction-scoping issues.
- **Neon pooler (transaction mode) supports `sql.begin()`**: Verified with simple test — works with `postgres` library.
- **API route exists as thin pass-through**: `/api/dashboard/attention` exists only because `dashboard/page.js` is a `'use client'` component. If migrated to server components, remove the route and call `attentionEngine` directly.
- **Attention uses 7-day inactivity threshold** to avoid "everything is attention" problem.
- **Overdue follow-ups exclude patients who have returned** (a newer completed appointment after the follow-up date).
- **`follow_up_status`/`reason`/`created_by` columns on `appointments`**: Added with CHECK constraint and index. `follow_up_status` defaults to `'pending'` on visit completion with a date, `'cancelled'` when cleared. `followup_created_by` stores `'doctor'` (checkout) or `'reception'` (walk-in).
- **`attention_status` is fully wired**: `new`↔`acknowledged` toggle, `resolved` is terminal. Auto-resolves on full plan completion. Dashboard panel shows New/Acknowledged sub-sections.
- **Future — Upcoming Followups (next 3 days)**: Currently unsignaled. `getUpcomingFollowups` query in attentionEngine would join `appointments` where `follow_up_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 3` AND `follow_up_status = 'pending'`. Intended as first "Morning Brief" card.

## Critical Context
### Phase 1
- All 4 tooth SVGs are user-provided in 24×24 viewBox — paths stored as constants with `toothPath(num)` dispatcher
- `toothType()` uses FDI second digit: `pos % 10` — 1-2=incisor, 3=canine, 4-5=premolar, 6-8=molar
- `surfaceLabel(id, num)` returns correct terminology: Incisal for incisors/canines, Palatal for upper teeth
- `ZONE_POSITIONS` maps per tooth type with specific x,y coordinates for surface labels in 40×40 viewBox
- `buildEntry()` in PerToothDiagnosisPanel ensures all fields (diagnoses, surface, treatment, severity, status, outcome, notes) are always included
- The dental diagram's B label was recently centered for canines (x=20→18), incisor B moved up (y=18→17)
- Chart PDF (`generateDentalChart`) renders A4 landscape with all 32 teeth, color-coded by diagnosis
- R2 cached PDFs must be invalidated (`prescription_key = NULL`) before PDF changes appear
- Server running on port 3000

### Phase 2 (Dhara)
- `treatment_plans.attention_status` column (`new`/`acknowledged`/`resolved`) with index is now fully wired — queries filter out `resolved`, sort `new` before `acknowledged`.
- `attention_status` is distinct from `status` (treatment lifecycle: `active`/`completed`/`abandoned`/`on_hold`). The Attention Engine queries raw data to produce attention items; it does not read `attention_status`.
- Three database enum types exist: `treatment_plan_status` (`active,completed,abandoned,on_hold`), `treatment_step_status` (`pending,in_progress,completed,skipped`), and system-level enums are cast with `::treatment_plan_status` in SQL.
- Dashboard is a client component (`'use client'`) that loads data via `fetchCached()` from API routes. Attention data is fetched from `/api/dashboard/attention` which wraps `attentionEngine.js`.
- `getAttentionSummary` runs 3 queries in parallel via `Promise.all()` — each is independently caught, so one failure returns `[]` for that category without crashing the others.
- `follow_up_date` exists on `appointments` — `getOverdueFollowups` uses it alongside `follow_up_status = 'pending'`. Follow-up scheduling engine adds `follow_up_status`/`reason`/`created_by` columns with CHECK constraint.
- Full pipeline: `Clinical Activity → Treatment Plans → Attention Engine → Dashboard Surface`

## Relevant Files
### Phase 1 (UI)
- `src/components/ToothGrid.js`: Full rewrite — FDI, 2-row grid, interactive hover/active, context menu, bulk select, severity shading, status dots, treatment labels, legend
- `src/components/PerToothDiagnosisPanel.js`: Surface diagram (per-tooth-type), diagnosis checklist, treatment planner, severity/outcome/status selectors, tooth notes, auto-scroll, `buildEntry()` pattern
- `src/lib/prescription.js`: `generatePrescription()` — 4-column tooth table (Tooth | Surf. | Plan | Diagnosis); `generateDentalChart()` — A4 landscape chart PDF with 32 colored teeth and legend
- `src/app/api/dashboard/patients/[id]/route.js`: Fetches `tooth_diagnoses` in patient visits query
- `src/app/api/dashboard/visit/route.js`: Saves `tooth_diagnoses` JSONB on PATCH/INSERT
- `src/app/api/dashboard/appointments/route.js`: Includes `tooth_diagnoses` in GET SELECT queries
- `src/app/api/dashboard/visits/[id]/prescription/route.js`: Passes `tooth_diagnoses` to PDF generator
- `src/app/api/dashboard/visits/[id]/chart/route.js`: New route for printable dental chart PDF
- `src/app/dashboard/patients/[id]/page.js`: Per-tooth diagnosis chips with treatment/severity/outcome, per-tooth history timeline with clickable expand/collapse, progress dot visualization, Chart + Print buttons
- `src/app/dashboard/visit/page.js`: Integration of ToothGrid + PerToothDiagnosisPanel, `onQuickDiagnosis` handler preserves all fields, summary chips with surface/treatment/severity
- `src/components/WeekView.js`: 7-column weekly calendar with time-slot grid (8am-8pm), appointment blocks positioned by time, **drag-to-reschedule** via native HTML5 DnD, click empty slot to book, click appointment to view patient
- `src/components/DayTimeline.js`: Single-day vertical timeline with hour rows, wider appointment blocks (name/time/treatment/location/phone/status), drag-to-reschedule
- `src/app/dashboard/page.js`: View switcher `[Month] [Week] [Day]` in header — Month renders existing Calendar+SlotGrid, Week renders WeekView, Day renders DayTimeline; `?book=time` query param auto-opens QuickBook modal

### Phase 2 (Dhara)
- `src/db/pool.js`: Migration code (lines 694-781) — `procedure_codes`, `treatment_plans`, `treatment_plan_steps` tables + enums + seed data
- `src/db/repositories/treatmentPlanRepository.js`: 13 repository functions for CRUD on procedure_codes, treatment_plans, treatment_plan_steps (added `updateAttentionStatus` with transition validation)
- `src/services/treatmentPlanService.js`: 4 service functions — `createPlanWithSteps`, `completeVisitSteps`, `recalculatePlan`, `getNextPendingStep`
- `src/services/completeVisit.js`: Modified to accept `stepIds`; calls `completeVisitSteps` after appointment update (best-effort)
- `src/services/createWalkIn.js`: Modified to accept `procedureCodeId`/`toothNumber`; calls `createPlanWithSteps` without auto-complete
- `src/services/attentionEngine.js`: 3 query functions + `getAttentionSummary` — `getOverdueFollowups`, `getIncompleteTreatments`, `getPendingPayments`
- `src/app/api/dashboard/attention/route.js`: Thin pass-through — calls `getAttentionSummary(sql)` and returns JSON (exists because dashboard is client component)
- `src/app/api/dashboard/attention/[id]/route.js`: PATCH route for acknowledge/resolve/re-open
- `src/components/AttentionPanel.js`: Collapsible dashboard widget with 3-tab bar (Overdue/Treatments/Payments), acknowledge/resolve buttons, New/Acknowledged sub-sections, severity badges, empty states
- `tests/attention/attentionEngine.test.js`: 17 regression tests covering overdue followups, inactive treatments, pending payments, attention status transitions, parallel execution, and graceful failure handling
