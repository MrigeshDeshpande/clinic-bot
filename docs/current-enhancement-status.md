# Current Enhancement Session — Receptionist & Queue

> **Started:** May 31, 2026
> **Status:** Phase 1 complete, moving to Phase 2 quick wins

## Goal
Build receptionist role + queue management (with priority flag) into the clinic bot.

## Constraints & Preferences
- Three roles: `patient` / `doctor` / `receptionist` — detected by `waId` match in `clinic.js`.
- Receptionist handles patient registration and queue; doctor has fallback queue controls.
- Walk-in patients get `wa_id` linked so `sendPatientSummary()` works for them.
- Queue ordering: priority (⭐) → booked by time → walk-ins by arrival time.
- Queue states: `scheduled → arrived → waiting → called → in_session → done`.
- No SMS gateway or web dashboard in this phase.

## Completed

### Phase 1: Receptionist Role + Queue Management
- `docs/enhancements-roadmap.md` — full Phase 1–4 breakdown
- `docs/README.md` — updated to reference roadmap
- `docs/user-flow-guide.md`, `docs/doctor-flow.md`, `docs/entity-extraction-design.md` — rewritten to match codebase
- `src/config/clinic.js` — `receptionist.waId` (reads `RECEPTIONIST_WA_ID`)
- `src/lib/session.js` — receptionist role detection in `getOrCreate()`
- `src/config/states.js` — `RECEPTIONIST_MAIN_MENU`, `RECEPTIONIST_VIEW_QUEUE`, `RECEPTIONIST_QUEUE_DETAIL`, `DOCTOR_VIEW_QUEUE`
- `src/lib/transitions.js` — receptionist + doctor queue transitions
- `src/config/intents.js` — `doctor_view_queue` intent
- `src/lib/router.js` — `ID_TO_INTENT` mappings + interactive ID patterns
- `src/db/pool.js` — migration: `arrival_status`, `arrived_at`, `called_at`, `is_priority` columns
- `src/db/repositories/appointmentRepository.js` — `fetchTodayQueue()`, `updateArrivalStatus()`, `countTodayByArrivalStatus()`, `toggleAppointmentPriority()`
- `src/lib/handlers.js` — receptionist dispatch, greeting, main menu (queue summary), queue view (scheduled + arrived patients in two sections), patient detail (arrival_status-aware: Mark Arrived for scheduled, Call Now/Toggle Priority for arrived), walk-in registration with doctor notification, doctor queue view with priority badges
- **Doctor notification on walk-in** — `notifyDoctorNewBooking(appt)` called after walk-in creation

### Files Modified
- `src/lib/handlers.js` — receptionist + doctor queue handlers
- `src/lib/router.js` — `queue_mark_arrived` mapping
- `docs/enhancements-roadmap.md` — Phase 1 marked complete

## Next Up (per roadmap recommended order)
1. **Auto-suggest next slot** — when time is taken, suggest next 3 free slots
2. **Walk-in visit shortcut** — "Log Visit" from doctor main menu
3. Bulk actions, Block date warning, Smart Sunday warning
4. Family accounts, Multi-treatment booking
5. Voice transcription, Patient feedback
6. Dashboard, Analytics, PDF, Inventory, Hindi, Templates

## Key Decisions
- `engine.js` needs no changes — role routing is handled by `handle()` in `handlers.js`
- Receptionist reuses existing `REGISTER_*` states for walk-in registration
- Queue detail uses 3-button message instead of list
- Priority flag uses simple `BOOLEAN` column, toggled inline

## Relevant Files
- `src/config/clinic.js` — `receptionist.waId`
- `src/lib/session.js` — role detection
- `src/config/states.js` — all state definitions
- `src/lib/transitions.js` — state transitions
- `src/config/intents.js` — intent definitions
- `src/lib/router.js` — intent routing
- `src/db/pool.js` — schema migration
- `src/db/repositories/appointmentRepository.js` — queue queries
- `src/lib/handlers.js` — all handler logic (~lines 3549–4077)
- `src/lib/engine.js` — unchanged
