# DHARA Technical Discovery Audit

> Generated: 2026-06-20
> Codebase: clinic-bot → DHARA

---

# SECTION 1 — REPOSITORY OVERVIEW

```
Single repo — Next.js monolith + AI gateway subproject
```

```
src/
  app/
    api/
      cron/               — 7 cron endpoints (reminders, follow-ups, daily-summary, etc.)
      webhook/whatsapp/   — Single WhatsApp webhook entry point
      dashboard/          — 38+ API routes (attention, patients, appointments, visits, media, etc.)
    dashboard/            — Client components (page.js, patients/[id]/page.js, visit/page.js, appointments/page.js)
  components/             — React components (AttentionPanel, ToothGrid, Calendar, etc.)
  services/               — Business logic (9 files: completeVisit, createWalkIn, attentionEngine, etc.)
  db/
    pool.js               — All schema migrations + connection pool
    repositories/         — 10 repository files (appointment, patient, treatmentPlan, payment, etc.)
  lib/                    — Utilities (whatsapp.js, engine.js, handlers.js, r2.js, media.js, etc.)
  config/                 — Config (templates.js, clinic.js, states.js, intents.js, translations.js)
  utils/                  — Formatters
ai-gateway/               — Separate Kali AI gateway (server.js, validators.js, prompts.js)
docs/                     — 40+ architecture/analysis docs
tests/                    — Test suites (attention, timeline, dharaReason, etc.)
scripts/                  — Backfill and audit scripts
```

**Major applications/services:** Next.js 16 web app (dashboard + WhatsApp bot), Kali AI gateway
**Major databases:** PostgreSQL (Neon), Cloudflare R2 (object storage)
**ORM used:** None — raw SQL via `postgres` library (`sql` tagged template literal)
**Queue systems:** None — all synchronous; no job queues or message brokers
**Cron systems:** Vercel Cron Jobs — 7 endpoints at `/api/cron/*`
**AI integrations:** Kali AI (self-hosted gateway), Google Gemini (fallback), OpenAI Whisper (transcription)
**WhatsApp integrations:** Meta Cloud API (v19.0) — webhook, text/buttons/list/template/document sends
**Storage providers:** Cloudflare R2 (S3-compatible)

---

# SECTION 2 — CURRENT DATA MODEL

```txt
sessions

purpose: WhatsApp conversation sessions with state machine
important columns: wa_id (UNIQUE), state, previous_state, context (JSONB), metrics (JSONB), is_escalated, version, expires_at
relationships: referenced by messages.session_id, appointments.session_id
---

messages

purpose: WhatsApp message log
important columns: msg_id (UNIQUE), session_id → sessions, wa_id, role (user/bot), content, intent, metadata (JSONB)
relationships: FK to sessions
---

appointments

purpose: Core visit/appointment record — 50+ columns
important columns: id, patient_id → patients, wa_id, date, time, status (confirmed/cancelled/completed/no_show/superseded), treatment, consultation_fee, treatment_charges, medicine_charges, paid_amount, payment_status, follow_up_date, follow_up_status, follow_up_reason, tooth_diagnoses (JSONB), chit_media (TEXT[]), prescription_key, compiled_document_key, patient_phone, location
relationships: FK to patients, referenced by payments, patient_reviews, treatment_plan_steps
---

patients

purpose: Patient records
important columns: id, wa_id, name, phone (UNIQUE), age, sex, patient_ratings (JSONB), habits (JSONB), dental_history, family_history, address, occupation, allergies, chronic_conditions, blood_group, bp, weight, medications
relationships: Referenced by appointments, payments, treatment_plans, patient_reviews, patient_relationships, patient_timeline_events
---

patient_reviews

purpose: Post-visit feedback/ratings
important columns: patient_id → patients, appointment_id → appointments, ratings (JSONB), notes
relationships: FK to patients and appointments
---

payments

purpose: Payment ledger entries (not balance — atomic transaction log)
important columns: appointment_id → appointments, patient_id → patients, amount (CHECK >0), direction (credit/debit), kind (payment/refund/adjustment/migration/waiver/advance), method (cash/upi/card/bank/other), idempotency_key (UNIQUE), recorded_by, recorded_at
relationships: FK to appointments, patients
---

due_reminder_log

purpose: Audit log for automated payment reminders
important columns: triggered_at, triggered_by, total_appointments, sent_count, template_sent_count, details (JSONB)
---

shadow_logs

purpose: AI intent classification shadow evaluation
important columns: wa_id, session_state, message_text, rule_intent, ai_intent, ai_confidence, matched, provider, processing_time_ms
---

patient_relationships

purpose: Family/linked patient relationships
important columns: patient_id → patients, related_patient_id → patients, relationship_type
constraint: UNIQUE(patient_id, related_patient_id), CHECK(patient_id != related_patient_id)
---

settings

purpose: Key-value app settings
important columns: key (PK), value (JSONB), updated_at
seed: clinic, doctor, prescription, checklists, google_maps, medicines
---

ai_classifications

purpose: AI intent classification logs for debugging/audit
important columns: session_state, message, intent, entities (JSONB), language, provider, processing_ms, rule_intent, matched
---

procedure_codes

purpose: Dental procedure catalog (Dhara Phase 2)
important columns: code (UNIQUE), name, category, expected_steps (JSONB — step names array), default_fee, active
seed data: rct (Root Canal Treatment), scaling (Teeth Scaling), extraction (Tooth Extraction), crown (Dental Crown)
relationships: referenced by treatment_plans
---

treatment_plans

purpose: Per-patient treatment plan (Dhara Phase 2)
important columns: id, patient_id → patients, procedure_code_id → procedure_codes, tooth_number, status (ENUM: active/completed/abandoned/on_hold), source (doctor/reception), attention_status (new/acknowledged/resolved), expected_steps, completed_steps, next_action, last_activity_at
relationships: FK to patients, procedure_codes; referenced by treatment_plan_steps
---

treatment_plan_steps

purpose: Individual steps within a treatment plan
important columns: id, plan_id → treatment_plans (CASCADE), step_order, step_name, status (ENUM: pending/in_progress/completed/skipped), tooth_number, appointment_id → appointments, completed_at, notes
indexes: UNIQUE(plan_id, step_order), plan_status index
---

patient_timeline_events

purpose: Canonical event log per patient (Dhara Phase 2)
important columns: id, patient_id → patients (CASCADE), event_type (VARCHAR 50), event_time, actor_type (NOT NULL — doctor/reception/system/dhara), actor_id, source_type, source_id, metadata (JSONB)
indexes: (patient_id, event_time DESC), (event_type), (source_type, source_id)
---

blocked_dates

purpose: Doctor's blocked schedule dates
important columns: date (UNIQUE), reason
```

---

# SECTION 3 — EXISTING DHARA COMPONENTS

## Treatment Lifecycle

```txt
Files:
  src/services/treatmentPlanService.js              — Business logic (4 functions)
  src/db/repositories/treatmentPlanRepository.js    — Persistence (13 functions)
  src/db/pool.js                                    — Schema: procedure_codes, treatment_plans, treatment_plan_steps

Responsibilities:
  - Create treatment plans with derived step sequences from procedure_codes
  - Complete steps across multiple plans in a single visit
  - Recalculate plan state (CTE-based: counts, derives next_action, auto-completes)
  - Look up next pending step for a plan
  - Record PLAN_CREATED, STEP_COMPLETED, PLAN_COMPLETED timeline events

Inputs:
  - Patient ID, procedure code ID, optional tooth number
  - List of step IDs to complete (from checkout)
  - Plan ID for recalculation

Outputs:
  - Created plan + steps rows
  - Updated step statuses
  - Updated plan (completed_steps, next_action, status, attention_status)
  - Timeline events recorded
```

## Attention Engine

```txt
Files:
  src/services/attentionEngine.js                   — 3 query functions + setAttentionStatus + getAttentionSummary
  src/app/api/dashboard/attention/route.js          — GET pass-through
  src/app/api/dashboard/attention/[id]/route.js     — PATCH status change
  src/components/AttentionPanel.js                  — Dashboard UI widget

Responsibilities:
  - Run 3 parallel queries (overdue followups, incomplete treatments, pending payments)
  - Manage attention status transitions (new↔acknowledged→resolved)
  - Record attention-related timeline events (ATTENTION_ACKNOWLEDGED, RESOLVED, REOPENED)
  - Present collapsible dashboard widget with 3-tab bar + action buttons

Current Attention Types:
  1. Overdue Follow-ups — patients with past follow_up_date + no subsequent visit
  2. Incomplete Treatments — active treatment plans with 7+ days inactivity
  3. Pending Payments — completed visits with outstanding balance > 0
```

## Follow-Up Engine

```txt
Files:
  src/services/completeVisit.js                     — Sets follow_up_date, follow_up_status on checkout
  src/services/attentionEngine.js                   — getOverdueFollowups() queries follow_up data
  src/app/api/cron/follow-up-reminders/route.js     — Cron: sends text reminders for overdue follow-ups
  src/components/QuickCheckoutModal.js              — Follow-up checkbox UI (default OFF)
  src/app/dashboard/patients/[id]/page.js           — Follow-up chips on visit cards

Responsibilities:
  - Set follow-up date + reason + creator on visit completion
  - Query overdue follow-ups (past date, pending status, no return visit)
  - Send follow-up reminders via WhatsApp text
  - Display follow-up status per-visit on patient profile

Triggers:
  - Visit completion with follow-up checkbox checked (QuickCheckoutModal)
  - Cron job (daily) — checks follow_up_status='pending' AND follow_up_date < CURRENT_DATE
```

## Payment Awareness

```txt
Files:
  src/services/attentionEngine.js                   — getPendingPayments() query
  src/services/recordPayment.js                     — Atomic payment ledger recording (CTE-based)
  src/services/completeVisit.js                     — Payment recording on checkout
  src/services/createWalkIn.js                      — Payment recording on walk-in
  src/db/pool.js                                    — payments table schema

Responsibilities:
  - Query completed appointments with outstanding balance > 0
  - Record payments in atomic ledger with idempotency_key dedup
  - Sync appointment cache columns (paid_amount, payment_status, paid_at) from ledger

Current Logic:
  - outstanding = SUM(fees) - SUM(payments WHERE direction='credit') + SUM(payments WHERE direction='debit')
  - Appointment payment_status: 'paid' when net >= total, 'partial' when >0 but < total, 'pending' when 0
  - Payments table records ALL financial events (credit, debit, refund, adjustment, waiver, advance, migration)
```

## Timeline Infrastructure

```txt
Files:
  src/services/timelineService.js                   — recordEvent(), getPatientTimeline()
  src/lib/timelineRenderer.js                       — describeEvent(), getEventSeverity(), getEventColor(), getEventIcon()
  src/db/pool.js                                    — patient_timeline_events table (lines 803-815)

Responsibilities:
  - Record canonical timeline events atomically (same transaction as business op)
  - Retrieve patient timeline ordered by event_time DESC
  - Render events as human-readable descriptions with severity/color/icon

Current State:
  - 10 event types registered: PLAN_CREATED, STEP_COMPLETED, PLAN_COMPLETED, FOLLOWUP_CREATED, FOLLOWUP_CANCELLED, PAYMENT_RECEIVED, VISIT_COMPLETED, ATTENTION_ACKNOWLEDGED, ATTENTION_RESOLVED, ATTENTION_REOPENED
  - Integrated into: treatmentPlanService, completeVisit, createWalkIn, attentionEngine
  - All recording is atomic (same sql.begin() transaction)
  - Presentation layer is pure (no DB calls)
```

## Reason Engine

```txt
Files:
  src/services/dharaReason.js                       — getReason() — 262 lines
  src/app/api/dashboard/patients/[id]/reason/route.js — GET endpoint

Responsibilities:
  - Run 5 parallel DB queries (patient, plans, last visit, timeline, recent treatment)
  - Analyze 3 signals: active plan, follow-up concern, outstanding balance
  - Produce deterministic priority (HIGH/MEDIUM/LOW), confidence (1.0/0.8/0.6/0.4)
  - Generate human-readable reason + actionable recommendation + evidence[]

Current State:
  - Read-only: queries never mutate state
  - Graceful degradation: each query has .catch(() => [])
  - Evidence list: machine-readable strings for downstream consumption
  - 15+ tests covering all priority tiers and edge cases
  - Not yet wired into UI (no "Why?" modal or Morning Brief cards)
```

---

# SECTION 4 — WHATSAPP ARCHITECTURE

```txt
Meta
↓
Webhook (GET verify + POST ingest)
↓
processEvent(payload) [engine.js]
↓
classifyEvent() → extract messages from payload
↓
for each message:
  isDuplicate(msgId) → dedup
  getOrCreate(waId) → session
  markAsRead(messageId)
  classifyWithFallback(normalized, session) → rule or AI intent
  extractEntities(normalized, session)
  handle(intent, session, normalized) → state router [handlers.js]
  getNextState(session) → state transition
  save(session) → persist

Webhook Entry Point:
  src/app/api/webhook/whatsapp/route.js — GET (verify) + POST (ingest)

Files:
  src/lib/engine.js            — Core pipeline (398 lines)
  src/lib/handlers.js          — All conversation flows (5716 lines)
  src/lib/whatsapp.js          — WhatsApp Cloud API client (192 lines)
  src/lib/router.js            — Rule-based intent classifier
  src/lib/session.js           — Session management
  src/lib/deduplicate.js       — Message dedup by msg_id
  src/lib/messageEvents.js     — EventEmitter for SSE
  src/lib/media.js             — Media download + store pipeline
  src/lib/transcriber.js       — OpenAI Whisper transcription
  src/config/templates.js      — Template registry
  src/config/states.js         — State machine transitions
  src/config/intents.js        — Intent catalog
```

**How messages are received:** Single webhook POST `processEvent(payload)` synchronous pipeline. No queues.

**How messages are stored:** `messages` table via `createMessage()`/`createMessages()` repository functions.

**How outbound messages are sent:** `apiPost()` helper in `whatsapp.js` — calls Meta Graph API `{{phoneNumberId}}/messages` with 2 retries on 5xx/429.

**Template support:** `sendTemplate()` function — sends approved WhatsApp Business templates with body parameters. 8 templates defined in `src/config/templates.js`. No media (image/audio/video) send function in the library — only text, buttons, list, template, document.

**Media support:** `sendDocument()` — sends documents via public link. No native image/audio/video send function exists.

**Image support:** Images received via webhook, downloaded from Meta API, stored to R2. No outbound image sending capability.

**Voice note support:** Voice notes received, downloaded, stored to R2, transcribed via OpenAI Whisper in doctor LOG_NOTES flow.

---

# SECTION 5 — MEDIA PROCESSING

```txt
image

supported: yes (receive + store only)

current processing path:
  WhatsApp → webhook → engine.js (hasMedia) → handlers.js → media.js (downloadMeta → R2) → appointments.chit_media

files:
  src/lib/media.js
  src/lib/r2.js
  src/app/api/dashboard/media/route.js (dashboard upload)
  src/lib/handlers.js:3101-3102, 3228-3318 (doctor media handler)
  src/app/api/dashboard/media/signed/route.js (signed URL)
  src/components/MediaViewer.js
---

pdf

supported: yes (generate + send via WhatsApp)

current processing path:
  PDFKit → prescription.js → R2 → sendDocument via WhatsApp

files:
  src/lib/prescription.js
  src/lib/compileDocument.js
  src/lib/whatsapp.js sendDocument()
  src/app/api/dashboard/visits/[id]/prescription/route.js
  src/app/api/dashboard/visits/[id]/compile/send/route.js
---

audio

supported: yes (receive + transcribe + store)

current processing path:
  WhatsApp → webhook → engine.js (hasMedia) → handlers.js LOG_NOTES → downloadMediaFromMeta() → transcribeAudio() (Whisper) → processAndStoreMedia() → R2

files:
  src/lib/media.js (getMediaExtension supports ogg/mp3/m4a/amr)
  src/lib/transcriber.js (OpenAI Whisper)
  src/lib/handlers.js:3251-3284 (audio → transcription flow)
---

video

supported: Reception only via dashboard upload route

current processing path:
  Dashboard → POST /api/dashboard/media → R2 (allowed in ALLOWED_MIME_TYPES)

notes:
  No WhatsApp inbound video handling path found
  No outbound video sending capability
```

---

# SECTION 6 — OCR READINESS

**Can system already store uploaded images?** Yes — `appointments.chit_media` (TEXT[]) stores R2 keys. `processAndStoreMedia()` handles the full pipeline.

**Can system access image URLs?** Yes — `getR2SignedUrl()` generates time-limited signed URLs from R2 keys.

**Can system download media?** Yes — `downloadMediaFromMeta(mediaId)` downloads from WhatsApp Meta API. `getR2Object(key)` downloads from R2.

**Can system process PDFs?** No native PDF processing. PDF generation exists (PDFKit) but no PDF parsing/OCR.

**Relevant files:**
```txt
src/lib/media.js            — downloadMeta → R2 pipeline
src/lib/r2.js               — R2 storage: upload, signed URLs, download, delete
src/lib/handlers.js         — Doctor image reception flow
src/app/api/dashboard/media/route.js        — Dashboard upload endpoint
src/app/api/dashboard/media/signed/route.js — Signed URL retrieval
```

---

# SECTION 7 — TIMELINE READINESS

**Yes, timeline events can already be stored.**

**Table:** `patient_timeline_events`

**Columns:**
```txt
id              UUID (PK)
patient_id      UUID (FK → patients, CASCADE)
event_type      VARCHAR(50) NOT NULL
event_time      TIMESTAMPTZ NOT NULL DEFAULT NOW()
actor_type      VARCHAR(20) NOT NULL  (doctor/reception/system/dhara)
actor_id        VARCHAR(255)
source_type     VARCHAR(50)
source_id       VARCHAR(255)
metadata        JSONB NOT NULL DEFAULT '{}'
created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

**Example record:**
```json
{
  "id": "uuid",
  "patient_id": "uuid",
  "event_type": "PAYMENT_RECEIVED",
  "event_time": "2026-06-15T10:30:00Z",
  "actor_type": "reception",
  "actor_id": null,
  "source_type": "appointment",
  "source_id": "appointment-uuid",
  "metadata": {
    "amount": 5000,
    "method": "cash",
    "outstanding_after": 2000
  }
}
```

---

# SECTION 8 — TREATMENT STATE READINESS

**Partial support.** Current schema has:

- `treatment_plans.status` — ENUM: `active`, `completed`, `abandoned`, `on_hold`
- `treatment_plan_steps.status` — ENUM: `pending`, `in_progress`, `completed`, `skipped`

**Gap:** Target states (Recommended, Accepted, Started, Sitting 1, Sitting 2, Completed, Stalled) are finer-grained than current enum values.

**How it maps currently:**
```
Recommended   → no plan exists (not yet modeled)
Accepted      → treatment_plans with status='active', completed_steps=0
Started       → treatment_plans with status='active', completed_steps>0
Sitting 1/2   → treatment_plan_steps level only (step_order + step_name)
Completed     → treatment_plans with status='completed'
Stalled       → treatment_plans with status='on_hold' (or infer from last_activity_at > 30 days)
```

**Missing for direct support:**
- `treatment_plans.status` needs additional enum values: `recommended`, `accepted` (or separate state field)
- No explicit "sitting tracking" — current step model tracks procedural steps, not visit sittings
- `stalled` could be derived from `last_activity_at + inactivity threshold` but not stored as explicit state

---

# SECTION 9 — FINANCIAL TIMELINE READINESS

**Partial support.** Current schema has:

- `payments` table: ledger entries with `amount`, `direction` (credit/debit), `kind` (payment/refund/adjustment/waiver/advance/migration), `method`, `idempotency_key`
- `appointments`: cached balance columns (`consultation_fee`, `treatment_charges`, `medicine_charges`, `paid_amount`, `payment_status`)

**How it maps currently:**
```
Expected Cost  → consultation_fee + treatment_charges + medicine_charges
Collected      → SUM(payments WHERE direction='credit', kind='payment')
Outstanding    → Expected - Collected
Adjustments    → payments WHERE kind IN ('waiver', 'adjustment')
Refunds        → payments WHERE kind='refund' AND direction='debit'
```

**Missing:**
- No per-procedure/fee breakdown tracking in `treatment_plans` — costs are on `appointments` only
- No `expected_total` at plan level — procedure fees exist in `procedure_codes.default_fee` but aren't synced to plans
- `payments` table stores line items but no running balance column (computed dynamically via CTE)

---

# SECTION 10 — PRESCRIPTION PHOTO INGESTION READINESS

```txt
entry point: src/app/api/webhook/whatsapp/route.js → engine.js → handlers.js:3101-3102
files:
  src/lib/handlers.js:3101-3102     (media intercept in doctor dispatch)
  src/lib/handlers.js:3228-3318    (handleDoctorMediaMessage)
  src/lib/media.js                 (downloadMeta → processAndStoreMedia → R2)
  src/lib/r2.js                    (R2 storage client)

recommended hook: After processAndStoreMedia() returns in handleDoctorMediaMessage()
   — in LOG_MEDIA case (line 3246) or DOCTOR_APPOINTMENT_DETAIL case (line 3295)
   — the { key, mediaType } result contains the R2 key
   — pass key to OCR service via getR2SignedUrl(key) or getR2Object(key)
```

**Answers:**
1. **Can WhatsApp image already reach backend?** Yes — intercepted via `normalized?.hasMedia && normalized?.mediaId` in `handleDoctorDispatch()` at handler line 3101
2. **Can backend download image?** Yes — `downloadMediaFromMeta(mediaId)` from Meta API
3. **Can backend store image?** Yes — `processAndStoreMedia()` uploads to R2, stores key in `appointments.chit_media`
4. **Is there existing media pipeline?** Yes — fully functional: webhook → engine → handler → media.js → R2
5. **Best insertion point for OCR:** After `processAndStoreMedia()` returns — `{ key, mediaType }` contains the R2 key for downstream OCR

---

# SECTION 11 — VOICE NOTE READINESS

```txt
entry point: src/app/api/webhook/whatsapp/route.js → engine.js → handlers.js:3101-3102
files:
  src/lib/handlers.js:3251-3284  (audio → transcription in LOG_NOTES state)
  src/lib/media.js               (download + getMediaExtension supports ogg/mp3/m4a/amr)
  src/lib/transcriber.js         (OpenAI Whisper API)

recommended hook: Same media intercept point in handlers.js:3101
   — audio distinguished by mimeType.startsWith('audio/')
   — current transcription only in LOG_NOTES state (line 3252)
   — generalize by adding case outside state-specific branches
```

**Answers:**
1. **Can WhatsApp audio reach backend?** Yes — same `hasMedia` path, distinguished by `mimeType?.startsWith('audio/')`
2. **Can backend download audio?** Yes — `downloadMediaFromMeta(mediaId)` downloads audio buffer
3. **Existing transcription support?** Yes — `transcribeAudio(buffer, mimeType)` via OpenAI Whisper, wired in `LOG_NOTES` state only
4. **Best insertion point:** `handlers.js:3251` — generalize the audio branch outside `LOG_NOTES`-specific code

---

# SECTION 12 — EVENT INVENTORY

```txt
event_name: APPOINTMENT_BOOKED
source_file: src/lib/handlers.js (handleBookingConfirm, handleDoctorBookAppointment)
current_action: INSERT appointment, send confirmation message

event_name: APPOINTMENT_CANCELLED
source_file: src/services/cancelAppointment.js
current_action: UPDATE status='cancelled', clear prescription/compiled keys, send message

event_name: APPOINTMENT_RESCHEDULED
source_file: src/app/api/dashboard/appointments/[id]/reschedule/route.js
current_action: Supersede old + insert new appointment, invalidate cache

event_name: VISIT_COMPLETED
source_file: src/services/completeVisit.js
current_action: Update appointment fields, record VISIT_COMPLETED timeline event

event_name: WALKIN_CREATED
source_file: src/services/createWalkIn.js
current_action: Create patient + appointment, record VISIT_COMPLETED + PAYMENT_RECEIVED events

event_name: PAYMENT_RECEIVED
source_file: src/services/recordPayment.js, completeVisit.js, createWalkIn.js
current_action: INSERT into payments ledger, sync appointment cache, record PAYMENT_RECEIVED event

event_name: FOLLOWUP_CREATED
source_file: src/services/completeVisit.js
current_action: Set follow_up fields on appointment, record FOLLOWUP_CREATED event

event_name: FOLLOWUP_CANCELLED
source_file: src/services/completeVisit.js
current_action: Set follow_up_status='cancelled', record FOLLOWUP_CANCELLED event

event_name: FOLLOWUP_REMINDER_SENT
source_file: src/app/api/cron/follow-up-reminders/route.js
current_action: sendText message, update follow_up_reminder_sent_at

event_name: TREATMENT_PLAN_CREATED
source_file: src/services/treatmentPlanService.js
current_action: INSERT plan + steps, record PLAN_CREATED event

event_name: TREATMENT_STEP_COMPLETED
source_file: src/services/treatmentPlanService.js
current_action: UPDATE step status, record STEP_COMPLETED event, recalculatePlan()

event_name: TREATMENT_PLAN_COMPLETED
source_file: src/services/treatmentPlanService.js (recalculatePlan)
current_action: UPDATE plan status=completed, attention_status=resolved, record PLAN_COMPLETED event

event_name: ATTENTION_ACKNOWLEDGED
source_file: src/services/attentionEngine.js
current_action: UPDATE attention_status='acknowledged', record ATTENTION_ACKNOWLEDGED event

event_name: ATTENTION_RESOLVED
source_file: src/services/attentionEngine.js
current_action: UPDATE attention_status='resolved', record ATTENTION_RESOLVED event

event_name: ATTENTION_REOPENED
source_file: src/services/attentionEngine.js
current_action: UPDATE attention_status='new', record ATTENTION_REOPENED event

event_name: PRESCRIPTION_GENERATED
source_file: src/app/api/dashboard/visits/[id]/prescription/route.js
current_action: Generate PDF, upload to R2, update prescription_key

event_name: DENTAL_CHART_GENERATED
source_file: src/app/api/dashboard/visits/[id]/chart/route.js
current_action: Generate chart PDF, upload to R2

event_name: COMPILED_DOCUMENT_SENT
source_file: src/app/api/dashboard/visits/[id]/compile/send/route.js
current_action: Compile PDFs, send via WhatsApp sendDocument

event_name: FEEDBACK_REQUEST_SENT
source_file: src/app/api/cron/feedback/route.js
current_action: sendTemplate feedback_request to patient

event_name: DUE_REMINDER_SENT
source_file: src/app/api/cron/due-reminders/route.js
current_action: sendTemplate due_reminder, log to due_reminder_log

event_name: MEDIA_UPLOADED
source_file: src/lib/media.js, src/app/api/dashboard/media/route.js
current_action: Download from Meta/R2, upload to R2, append to chit_media

event_name: PATIENT_REGISTERED
source_file: src/lib/handlers.js, src/db/repositories/patientRepository.js
current_action: INSERT patient, set session to next flow step
```

---

# SECTION 13 — IMPLEMENTATION GAP ANALYSIS

## Patient Timeline

```txt
Status: IMPLEMENTED

Missing Components:
  - Event types for non-treatment events (appointment_booked, cancelled, patient_registered, media_uploaded) — NOT YET RECORDED
  - Dashboard-wide timeline view (currently only on patient profile page)
  - Filtering/faceted timeline views (by event_type, date range)
```

## Treatment State Engine

```txt
Status: PARTIAL

Missing Components:
  - "Recommended" and "Accepted" states not in treatment_plans status enum
  - No sitting-level state tracking (only procedure step-level)
  - No sitting counter or visit-number tracking within a treatment plan
  - No explicit stalled state column (derived from last_activity_at threshold)
```

## Prescription OCR

```txt
Status: NOT STARTED

Missing Components:
  - OCR service integration (no OCR library or API call exists)
  - Post-upload hook for OCR processing in media pipeline
  - Prescription photo → structured data mapping
  - Storage for OCR results (no schema for extracted data from images)
```

## Financial Timeline

```txt
Status: PARTIAL

Missing Components:
  - Running balance per patient (computed dynamically, not stored)
  - Per-treatment-plan cost tracking (costs are on appointments, not plans)
  - Refund processing UI (ledger supports refund kind, but no dashboard workflow)
  - Payment link generation (no payment gateway integration)
  - Invoice/receipt generation (PDF exists for prescriptions only)
```

## Reason Engine

```txt
Status: IMPLEMENTED (not wired to UI)

Missing Components:
  - "Why?" button on Attention Panel → DharaReasonModal UI
  - Morning Brief dashboard cards (group by priority)
  - Reason integration with Attention Panel (auto-provide reason alongside attention items)
```

## Daily Brief

```txt
Status: NOT STARTED

Missing Components:
  - Morning Brief aggregation layer (getAttentionSummary + getReason per patient)
  - Dashboard cards grouped by priority (high/medium/low)
  - No cron or scheduled brief generation
```

---

# SECTION 14 — FINAL RECOMMENDATION

**1. Lowest-risk next milestone:**
Wire Dhara Reason into Attention Panel ("Why?" button modal). Reason engine is already built with 15 tests, read-only, deterministic. Adding a modal component has no data mutation risk. All evidence[] strings are ready for display.

**2. Highest leverage milestone:**
Financial Timeline enrichment — per-treatment-plan cost tracking + running balance column on `patients`. The `treatment_plans` table already exists; adding `estimated_cost` and `outstanding` columns enables patient-grouped display (solving the "20 duplicate entries" UI problem) and provides the data foundation for invoicing.

**3. Fastest milestone to ship:**
Dhara Reason Modal (2-3 files: modal component + attention panel integration). No schema changes, no new services, 100% UI. Existing `GET /api/dashboard/patients/[id]/reason` endpoint returns all needed data.

**4. Biggest architectural risk:**
Treatment State Engine expansion (adding sit/sitting tracking). Current step model maps procedure steps to `treatment_plan_steps` — but "Sitting 1" is a temporal grouping across steps. Adding sitting-level state requires a new `visit_sittings` concept that doesn't align cleanly with the existing step-per-row model. This could break `completeVisitSteps()` integration if not designed carefully.

**5. Biggest data-model risk:**
Running balance table. Current architecture computes outstanding dynamically via CTE over the `payments` ledger. Adding a `running_balance` column to patients or treatment_plans introduces write amplification (every credit/debit must update it) and risks drift between ledger and cache. The existing `appointments.paid_amount` already drifts — it's synced from the ledger but has no reconciliation cron. A running balance at patient level would multiply this drift risk by N patients.
