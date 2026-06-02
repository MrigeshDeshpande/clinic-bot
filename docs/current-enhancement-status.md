# Current Enhancement Status — All Phases

> **Last updated:** June 2, 2026
> **Status:** Phase 1 ✅ · Phase 2 ✅ · Phase 3 ✅ · Phase 4 ⏳ Pending

## Completed

### Phase 1: Receptionist Role + Queue Management
- `src/config/clinic.js` — `receptionist.waId` (reads `RECEPTIONIST_WA_ID`)
- `src/lib/session.js` — receptionist role detection in `getOrCreate()`
- `src/config/states.js` — `RECEPTIONIST_MAIN_MENU`, `RECEPTIONIST_VIEW_QUEUE`, `RECEPTIONIST_QUEUE_DETAIL`, `DOCTOR_VIEW_QUEUE`
- `src/lib/transitions.js` — receptionist + doctor queue transitions
- `src/config/intents.js` — `doctor_view_queue` intent
- `src/lib/router.js` — `ID_TO_INTENT` mappings + interactive ID patterns
- `src/db/pool.js` — migration: `arrival_status`, `arrived_at`, `called_at`, `is_priority` columns
- `src/db/repositories/appointmentRepository.js` — `fetchTodayQueue()`, `updateArrivalStatus()`, `countTodayByArrivalStatus()`, `toggleAppointmentPriority()`
- `src/lib/handlers.js` — receptionist dispatch, greeting, main menu (queue summary), queue view, patient detail with arrival_status actions, walk-in registration with doctor notification, doctor queue view with priority badges
- **Doctor notification on walk-in** — `notifyDoctorNewBooking(appt)` called after walk-in creation

### Phase 2: High Impact Enhancements

#### 2.1 Auto-Suggest Next Available Slot ✅
When a time slot is taken, the bot scans forward and suggests the next 3 free slots:
```
Bot: Sorry, 2:00 PM is already booked.
     Next available:
     • 2:30 PM
     • 3:00 PM
     • 3:30 PM
```
- `src/db/repositories/appointmentRepository.js` — `findNextAvailableSlots(date, afterTime, allSlots, count=3)`
- `src/lib/handlers.js` — `handleBookingConfirmation` calls `findNextAvailableSlots` when slot is booked, returns suggestions to user

#### 2.2 Walk-in Visit Shortcut (Log Visit) ✅
Doctor can log a visit from the main menu without navigating through appointments:
```
Doctor Menu → [📝 Log Visit for Walk-in] → search patient → enter visit details
```
- `src/config/states.js` — `DOCTOR_LOG_VISIT_NAME` state
- `src/lib/handlers.js` — `handleDoctorLogVisitName()`, `startLogVisitForPatient()`, registration-to-visit shortcut via `logVisitPending`
- `src/lib/router.js` — `doctor_log_visit`, `log_visit_register_new` intent mappings
- Creates walk-in appointment + marks arrived + jumps into LOG_TREATMENT state

#### 2.3 Bulk Actions for Doctor ✅
Doctor can mark all confirmed appointments as completed for today:
```
📋 Appointments list → [✅ Mark All Completed] → bulk status update
```
- `src/db/repositories/appointmentRepository.js` — `bulkCompleteAppointmentsForDate()`, `bulkCancelAppointmentsForDate()`
- `src/lib/handlers.js` — `handleDoctorAppointmentList` handles `doctor_bulk_complete` intent
- Appointment list shows "Mark All Completed" button for today's date

#### 2.4 Block Date Warning ✅
When the doctor blocks a date with confirmed appointments, the bot warns and offers choices:
```
Bot: ⚠️ You have 3 appointments on 15 June.
     Blocking will cancel them.
     [🚫 Block & Cancel All] [📲 Block & Notify to Reschedule] [🔙 Cancel]
```
- `src/lib/handlers.js` — `handleDoctorManageSchedule` checks for confirmed appointments before blocking, shows warning with `block_cancel_all` and `block_notify_reschedule` buttons
- `block_notify_reschedule` sends cancellation messages to affected patients

#### 2.5 Smart Sunday Warning ✅
When a user selects a Sunday date, Sunday hours are shown upfront in the time prompt:
```
Bot: ⚠️ Sunday hours: 10:00 AM – 2:00 PM only.
     Slots: 10:00, 10:30, 11:00, 11:30, 12:00, 12:30, 13:00, 13:30
```
- `src/lib/handlers.js` — `buildFieldPrompt()` and `getTimeListReply()` show `sundayWarn` with hours and available slots
- Sunday filtering removes Sunday from date list options
- Date acknowledgment (`buildFieldAck`) shows Sunday warning when date is Sunday

#### 2.6 Family/Group Accounts ✅
Patients sharing a WhatsApp number can select which family member to book for:
```
User: "book appointment"
Bot: Who is this appointment for?
     [Ramesh (Self)]
     [Priya (Wife)]
     [Aryan (Son)]
     [New Person]
```
- `src/config/states.js` — `FAMILY_SELECTION` state
- `src/lib/handlers.js` — `handleFamilySelection()`, family check in `appointment` intent handler
- `src/lib/router.js` — `family_patient_<id>` interactive ID mapping
- `src/db/repositories/patientRepository.js` — `findPatientsByWaId()` for lookup

#### 2.7 Multi-Treatment Booking ✅
Patients can select multiple treatments in a single appointment:
```
Bot: Tap "Add Another" to add more treatments or "Done" when finished.
     [➕ Add Another] [✅ Done]
```
- `src/lib/handlers.js` — `handleBookingCollection` handles `add_treatment` and `treatment_done` intents
- Treatments stored as comma-separated string in appointment row

### Phase 3: Medium Impact Enhancements

#### 3.1 Voice Note Transcription ✅
Doctor sends audio during LOG_NOTES → transcribed via Whisper → accept/edit/re-record:
```
Doctor: [sends voice note]
Bot: ✅ Transcribed: "Patient has sensitivity..."
     [✅ Accept] [✏️ Edit] [🔁 Re-record]
```
- `src/lib/transcriber.js` — OpenAI Whisper integration
- `src/lib/handlers.js` — `handleDoctorMediaMessage` transcribes audio in LOG_NOTES state, `applyTranscribedNotes()`, `pendingTranscription` flow
- `src/lib/router.js` — `transcription_accept`, `transcription_edit`, `transcription_rerrecord` mappings

#### 3.2 Patient Feedback After Visit ✅
24h after visit, feedback request sent via cron; bot handles ratings + callback escalation:
```
Bot: How was your visit?
     [😊 Great] [🙂 Okay] [😞 Poor]
```
- `src/app/api/cron/feedback/route.js` — hourly cron
- `src/lib/handlers.js` — `handleFeedbackRating()`, `handleFeedbackCallback()`
- `src/db/repositories/feedbackRepository.js` — feedback CRUD + summary queries
- Dashboard feedback page with satisfaction %, rating distribution, callback requests

#### 3.3 Doctor Dashboard (Web UI) ✅
Full web dashboard for doctor: calendar, slot grid, queue board, stats, patient search, visit logging, feedback, schedule management:
- `src/app/dashboard/` — all dashboard routes and pages
- `src/app/api/dashboard/` — REST API endpoints for all dashboard features
- Charts (Recharts), queue board with auto-refresh, notification panel, message history with SSE, family accounts, bulk operations, edit past visits

#### 3.4 PDF Prescription Generator ✅
On visit completion, a formatted PDF is auto-generated and sent to the patient:
```
Patient receives:
  📄 [Prescription document via WhatsApp Document API]
  📝 (text summary receipt also sent as before)
```
- `src/lib/prescription.js` — pdfkit-based PDF generator with clinic header, patient info, treatment, fees breakdown, next visit, notes, doctor signature
- `src/lib/whatsapp.js` — `sendDocument()` function for WhatsApp document API
- `src/lib/handlers.js` — `sendPrescriptionToPatient()` called after visit logging in `handleLogMedia`
- PDF uploaded to R2 → signed URL → sent as WhatsApp document
- R2 key persisted in `appointments.prescription_key` column — visible in dashboard patient detail, appointment list, and visit detail APIs
- Falls back gracefully (text-only) if PDF generation or upload fails

#### 3.5 WhatsApp Template Messages ✅
Templates bypass the 24-hour window for proactive messaging. Cron jobs use templates with automatic fallback to free-form text (works pre-approval):
- `src/lib/whatsapp.js` — `sendTemplate()` builds template payload for Meta API
- `src/config/templates.js` — template registry listing name, parameters, and categories
- `src/app/api/cron/reminders/route.js` — sends `appointment_reminder` template first, falls back to text
- `src/app/api/cron/feedback/route.js` — sends `feedback_request` template first, falls back to buttons
- **Setup required:** Register templates in Meta Business Manager (guide: `docs/whatsapp-templates-setup.md`)
- **Zero-downtime:** Deploy code anytime; crons keep working via fallback until templates are approved

#### 3.6 Analytics — Bot & Dashboard ✅
Comprehensive analytics across both bot and web dashboard:

**Bot (`handleDoctorStats`):**
- Today's breakdown: confirmed, completed, no-show, waiting, in-session
- Week-over-week trend with 📈/📉 emoji and % change
- Week revenue, no-show rate %
- Month total + most popular treatment
- 👥 Sex ratio (M/F) for the month
- 🧑 Top age group for the month

**Dashboard (`/dashboard/stats`):**
- Period selector: 7d / 30d / 90d
- KPI cards: appointments today, revenue (period), no-show rate %, returning patient %
- AreaChart: daily completed + revenue (Recharts)
- BarChart: peak hours by time slot
- BarChart: day-of-week distribution
- Treatment breakdown: horizontal bars + vertical bar chart
- **Demographics**: sex distribution (M/F with icons + bars) + age group bar chart
- Patient growth: new this month, total, returning
- CSV export

**API (`/api/dashboard/stats`):**
- `period` param: `week`, `month`, `quarter`
- Peak hours, retention rate, no-show %, cancellation count
- Revenue trend, visit trend with prev-period comparison
- Day-of-week distribution, avg revenue per visit
- **`demographics.bySex`** — visits grouped by patient sex
- **`demographics.byAgeGroup`** — visits grouped by age brackets (0-17, 18-35, 36-50, 51-65, 65+)

#### 3.7 Language Toggle on Web ❌ NOT STARTED
Add English/Hinglish toggle for patient-facing content on the web dashboard.
Deferred — bot already supports bilingual mode.

## Next Up — Remaining Features

### Pending

#### Language Toggle on Web
- Add English/Hinglish toggle for patient-facing content on the web dashboard
- Small effort, low impact — deferred as bot already supports bilingual mode

#### Full Hindi Bot
- All 60+ prompts translated to Hindi
- Language detection → full Hindi mode (not just Hinglish mixed)
- Hindi numbers, date formats, treatment descriptions

#### Inventory Tracking
- Track materials used per treatment
- Low stock alerts
- Monthly usage reports

## Implementation Priority Matrix

| Feature | Effort | Impact | Status |
|---------|--------|--------|--------|
| Smart Sunday warning | Tiny | Small | ✅ Done |
| PDF prescriptions | Medium | Low | ✅ Done |
| WhatsApp templates | Small | Medium | ✅ Done (needs Meta approval) |
| Analytics | Large | Low | ✅ Done |
| Language toggle (web) | Small | Small | ❌ |
| Full Hindi bot | Large | Medium | ❌ |
| Inventory | Large | Low | ❌ |

## Recommended Order
1. **Language toggle on web** — small effort
2. **Full Hindi bot** — comprehensive translation effort
3. **Inventory** — standalone feature

## Key Decisions
- `engine.js` needs no changes — role routing is handled by `handle()` in `handlers.js`
- Receptionist reuses existing `REGISTER_*` states for walk-in registration
- Queue detail uses button message instead of list
- Priority flag uses simple `BOOLEAN` column, toggled inline
- All Phase 2 items were implemented alongside Phase 1 and web dashboard work

## Relevant Files
- `src/config/clinic.js` — `receptionist.waId`
- `src/lib/session.js` — role detection
- `src/config/states.js` — all state definitions
- `src/lib/transitions.js` — state transitions
- `src/config/intents.js` — intent definitions
- `src/lib/router.js` — intent routing
- `src/db/pool.js` — schema migration
- `src/db/repositories/appointmentRepository.js` — queue queries + next available slots
- `src/lib/handlers.js` — all handler logic (~5045 lines)
- `src/lib/engine.js` — unchanged
- `src/lib/prescription.js` — PDF prescription generator
- `src/lib/whatsapp.js` — `sendDocument()`, `sendTemplate()`
- `src/config/templates.js` — template registry
- `src/db/pool.js` — `prescription_key` column on appointments
- `docs/whatsapp-templates-setup.md` — Meta approval setup guide
