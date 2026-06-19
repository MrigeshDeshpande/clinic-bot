# Clinic Bot — Principal Engineer Technical Status Report

**Date:** 2026-06-19  
**Repository:** `/home/mrigesh/Desktop/Khazana/clinic-bot`

---

## 1. Executive Summary

### Problem
Clinic Bot is a WhatsApp-first chatbot + web dashboard for **Shri Balaji Advanced Dental Care & Implant Center** (Bhilai, India). It replaces phone-call-only appointment booking with an automated conversational flow, provides a web-based dental practice management system (PMS), and eliminates paper-based prescription/chart workflows.

### Users
- **Patients:** Book/cancel/reschedule appointments via WhatsApp, receive reminders, view visit summaries, receive payment due reminders
- **Doctor (Dr. Vishnu Vardhan):** Receives daily summaries, views queue/today's appointments via WhatsApp, manages schedule
- **Receptionist:** Manages patient queue, walk-in registration, quick checkout, billing, appointment scheduling via web dashboard
- **Dashboard admin:** All clinical documentation, tooth-level diagnosis, prescription PDFs, billing, patient records

### Operational Workflows
1. **WhatsApp booking** — full conversational flow (date/time/treatment collection, confirmation, correction, reschedule, cancel)
2. **Queue management** — arrival tracking (scheduled → arrived → called → in-session → completed)
3. **Clinical documentation** — per-tooth diagnosis with FDI notation, surface-level mapping, severity/outcome/status tracking
4. **Prescription PDF generation** — A4 prescription with tooth table, cached in R2
5. **Dental chart PDF** — A4 landscape, 32 teeth color-coded by diagnosis
6. **Compiled visit document** — prescription + photos bundled into one PDF, sent via WhatsApp
7. **Quick checkout** — single-click completion with fee/paid/payment-mode
8. **Rapid walk-in** — 15-second walk-in registration (name + phone + fee + payment)
9. **Cron jobs (5):** 24h reminders, daily summary to doctor, evening check-in, feedback requests, follow-up reminders, due payment reminders
10. **Family accounts** — multiple patients per WhatsApp number

### Maturity
**Late-stage MVP / Early Production.** The WhatsApp chatbot has ~30 conversation states and has been in real use. The dashboard is actively used for clinical documentation. Code is JavaScript (no TypeScript), deployed on Vercel (serverless) with Neon Postgres. Shadow-mode AI (Gemini) is configured but not yet trusted for production — all classifications currently fall back to rule-based.

### Biggest Strengths
- **Architectural clarity:** Clean separation of concerns — webhook → classify → session → handle → reply pipeline is well-structured
- **Single completion path:** POST `/api/dashboard/visit` handles quick checkout, walk-ins, and visit edits — no duplicated business logic
- **Comprehensive tooth-level diagnosis:** FDI notation, per-tooth surface diagrams, severity shading, treatment plans, outcome tracking — unique differentiator
- **Deterministic by default, AI as optional overlay:** Rule-based classification works independently; AI runs in shadow mode. Excellent safety-first design
- **No external job queue dependencies:** Everything runs synchronously in-request — simpler deployment, no Redis/Bull/RabbitMQ

### Biggest Weaknesses
- **No tests for core workflows:** 6 unit tests exist, none for the WhatsApp booking flow or dashboard APIs
- **No message queue:** Every webhook is processed inline with no retry mechanism — a single failure during DB write loses the message
- **JavaScript, not TypeScript:** Zero type safety across 216+ source files; refactoring is high-risk
- **In-memory rate limiter per-instance:** On Vercel (multiple instances), rate limiting is trivially bypassed
- **No SSH/debug endpoints:** Production debugging requires local log reading only
- **No database migration maturity:** All migrations run in `pool.js` on every cold start via `runMigrations()` — failure-prone and unscalable
- **Shadow log table is empty** due to Gemini free-tier 429 quota exhaustion — zero AI evaluation data after weeks
- **No backup strategy documented:** No backup scripts, no point-in-time recovery plan, no verification of Neon's automated backups

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  WhatsApp Cloud API (Meta)                                                          │
│  POST /api/webhook/whatsapp ←─── incoming messages                                 │
│  GET  /api/webhook/whatsapp  ←─── webhook verification                             │
└──────────────────┬──────────────────────────────────────────────────────────────────┘
                   │ JSON payload
                   ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  Vercel Serverless (Next.js 16, App Router)                                         │
│                                                                                     │
│  ┌── src/proxy.js (auth middleware, no middleware.js) ─────────────────────────┐   │
│  │  Matches /dashboard/* and /api/dashboard/*                                  │   │
│  │  Verifies JWT cookie (dashboard_token), redirects to /dashboard/login        │   │
│  │  Skips /dashboard/login and /api/dashboard/login                             │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
│  ┌── src/app/api/webhook/whatsapp/route.js ──────────────────────────────────┐     │
│  │  GET: Verify webhook (hub.challenge vs WHATSAPP_VERIFY_TOKEN)              │     │
│  │  POST: Parse JSON, runMigrations(), engine.processEvent()                   │     │
│  │  Rate-limited: 60 req/min/IP                                               │     │
│  └─────────────────────────────────────────────────────────────────────────────┘     │
│                                                                                     │
│  ┌── src/lib/engine.js ───────────────────────────────────────────────────────┐     │
│  │  classifyEvent() → deduplicate() → normalize() → markAsRead()               │     │
│  │  → getOrCreateSession() → manualMode check → classifyWithFallback()         │     │
│  │  → extractEntities() → accumulateEntities() → save user message             │     │
│  │  → getNextState() → handle() → sendReply() → save bot message               │     │
│  │  → post-visit check (fire-and-forget)                                        │     │
│  └─────────────────────────────────────────────────────────────────────────────┘     │
│                                                                                     │
│  ┌── AI Layer (shadow mode) ──────────────────────────────────────────────────┐     │
│  │  classifyWithFallback() → Gemini API (if configured, 5% random sample)      │     │
│  │  → if shadow mode: log AI vs rule comparison, return rule result            │     │
│  │  → if production: use AI result if confidence ≥ risk-level threshold        │     │
│  │  → fallback: rule-based classifyIntent() from intents.js                     │     │
│  └─────────────────────────────────────────────────────────────────────────────┘     │
│                                                                                     │
│  ┌── AI services ─────────────────────────────────────────────────────────────┐     │
│  │  Provider: src/lib/ai/provider.js (contract + thresholds)                    │     │
│  │  Gemini:   src/lib/ai/gemini.js (gemini-2.5-flash, 3000ms timeout)           │     │
│  │  Mock:     src/lib/ai/mock.js (replay testing)                               │     │
│  │  Whisper:  src/lib/transcriber.js (whisper-1, audio→text)                    │     │
│  └─────────────────────────────────────────────────────────────────────────────┘     │
│                                                                                     │
│  ┌── Dashboard APIs (41 routes total) ────────────────────────────────────────┐     │
│  │  Patients   → CRUD, search, medical history, family, messages                │     │
│  │  Appointments → CRUD, cancel, reschedule, bulk, arrival, visit               │     │
│  │  Financials → payments, due reminders, stats                                  │     │
│  │  Clinical  → prescription PDFs, dental chart PDFs, compiled docs             │     │
│  │  Media     → upload to R2, signed URLs                                        │     │
│  │  Admin     → settings, schedule (blocked dates), notifications               │     │
│  │  Reviews   → patient ratings CRUD                                             │     │
│  └─────────────────────────────────────────────────────────────────────────────┘     │
│                                                                                     │
│  ┌── Dashboard UI (React 19, Tailwind v4) ───────────────────────────────────┐     │
│  │  Pages: visit (tooth grid + diagnosis), appointments (calendar/week/day     │     │
│  │  views), patients (profile + history), queue, stats, settings, feedback,    │     │
│  │  due reminders, schedule                                                    │     │
│  │  Components: ToothGrid, PerToothDiagnosisPanel, WeekView, DayTimeline,      │     │
│  │  Calendar, QuickCheckoutModal, RapidWalkInModal, AppointmentDetailsModal,   │     │
│  │  NotificationPanel, MediaViewer                                              │     │
│  │  Visit: 15 sub-components (DiagnosisCard, PrescriptionCard, ToothChartCard) │     │
│  └─────────────────────────────────────────────────────────────────────────────┘     │
│                                                                                     │
│  ┌── Cron Jobs (6, via vercel.json + manual trigger) ─────────────────────────┐     │
│  │  03:50 → daily-summary (to doctor)                                           │     │
│  │  17:30 → reminders (24h appt reminders)                                      │     │
│  │  14:00 → evening-checkin (to doctor)                                          │     │
│  │  10:30 → feedback (post-visit)                                                │     │
│  │  Manual: follow-up-reminders, due-reminders                                   │     │
│  └─────────────────────────────────────────────────────────────────────────────┘     │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
                    │                                       │
                    ▼                                       ▼
┌─────────────────────────────────┐   ┌─────────────────────────────────────────────┐
│  Neon PostgreSQL (Serverless)    │   │  Cloudflare R2 (S3-compatible)              │
│  ────────────────────────────    │   │  ────────────────────────────────           │
│  10 tables, 40+ columns on       │   │  Bucket: clinic-bot                        │
│  appointments table              │   │                                            │
│  Connection: postgres library     │   │  - prescription PDFs (7-day cached URLs)  │
│  (tagged template literals)      │   │  - compiled documents                       │
│  Keepalive: 30s pings            │   │  - chit media (photos, audio)               │
│  Migrations: pool.js inline      │   │  - dental chart PDFs                        │
│  Pool: max 5 connections          │   │  SDK: @aws-sdk/client-s3 v3                │
└─────────────────────────────────┘   └─────────────────────────────────────────────┘

Social / External:
  - Meta Graph API v19 (WhatsApp messaging)
  - Gemini 2.5 Flash (AI classification — shadow mode)
  - OpenAI Whisper API (audio transcription)
  - Google Gemini API (intent classification)
```

---

## 3. Repository Structure

```
clinic-bot/
├── .agents/skills/              # AI coding assistant skill definitions
├── .env.example                 # Template for env vars
├── .env.local                   # Active secrets (gitignored)
├── .github/workflows/
│   ├── ci.yml                   # CI pipeline
│   └── cron.yml                 # Cron job deploy
├── AGENTS.md                    # AI coding context (106 lines of architectural notes)
├── README.md                    # Project README
├── docs/                        # 44 documents — architecture, evolution plans, audits
├── eslint.config.mjs            # ESLint flat config (Next.js core-web-vitals)
├── jsconfig.json                # Path alias: @/ → ./src/
├── next.config.mjs              # Next.js config: reactCompiler, headers, CSP
├── package.json                 # Dependencies & scripts
├── postcss.config.mjs           # Tailwind v4 PostCSS
├── public/                      # Static assets: icons, fonts (DejaVu Sans for PDFs)
├── scripts/                     # Utility scripts: analyze-shadow, audit-duplicates, backfill
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── cron/            # 6 cron route files
│   │   │   ├── dashboard/       # 29 API routes (patients, appointments, visits, media, settings)
│   │   │   └── webhook/         # Webhook verification + message processing (1 route)
│   │   ├── dashboard/           # 15 page files
│   │   │   ├── appointments/    # Calendar/week/day views + modals
│   │   │   ├── patients/[id]/   # Patient profile with tooth history
│   │   │   ├── visit/           # Clinical visit page (tooth grid)
│   │   │   ├── layout.js        # Dashboard shell (auth context, sidebar, header)
│   │   │   └── page.js          # Main dashboard
│   │   ├── globals.css          # Tailwind v4 + custom CSS
│   │   ├── layout.js            # Root layout
│   │   └── page.js              # Root page (redirects to /dashboard)
│   ├── components/              # 37 React components
│   │   ├── visit/               # 15 sub-components for visit page
│   │   └── *.js                 # ToothGrid, WeekView, Calendar, modals
│   ├── config/                  # 5 config files
│   │   ├── clinic.js            # Clinic info, treatments, doctor/receptionist WAs
│   │   ├── intents.js           # Keyword maps for all intents (EN+HI)
│   │   ├── states.js            # State machine definitions + transitions
│   │   ├── templates.js         # WhatsApp template registry
│   │   └── translations.js      # Bilingual patient strings
│   ├── db/
│   │   ├── migrations/          # 001_core.sql (superseded by pool.js)
│   │   ├── pool.js              # DB connection, full migration script, 670 lines
│   │   └── repositories/        # 8 repository files
│   ├── lib/
│   │   ├── ai/                  # AI provider abstraction (4 files)
│   │   ├── *.js                 # 25+ utility files
│   │   ├── engine.js            # Main webhook pipeline (398 lines)
│   │   ├── handlers.js          # ~95KB, all conversation handlers (~2400 lines)
│   │   ├── whatsapp.js          # Meta Graph API client
│   │   └── prescription.js      # PDF generation (prescription + chart)
│   ├── proxy.js                 # Auth middleware (instead of middleware.js)
│   ├── services/                # 4 service files
│   └── utils/                   # formatters.js
├── tests/
│   ├── unit/                    # 6 unit tests (auth, env, failure-paths, prescription, rateLimit, sanitize)
│   ├── replay/                  # Shadow mode replay testing framework
│   └── *.mjs                    # Misc test/debug scripts
└── vercel.json                  # Vercel config + 4 cron schedules
```

### Key File Sizes

| File | Lines | Notes |
|------|-------|-------|
| `src/lib/handlers.js` | ~2400 | Largest file — all conversation handlers, doctor/receptionist flows |
| `src/db/pool.js` | 670 | Connection, full migration script, 11 table definitions |
| `src/app/dashboard/visit/page.js` | ~2100 | Clinical visit page with tooth grid + diagnosis |
| `src/app/dashboard/appointments/page.js` | ~1200 | Calendar + week + day views |
| `src/app/dashboard/patients/[id]/page.js` | ~1300 | Patient profile with visit history + tooth timeline |
| `src/lib/prescription.js` | ~500 | Prescription + dental chart PDF generation |
| `src/db/repositories/appointmentRepository.js` | 675 | All appointment DB operations |
| `src/app/api/dashboard/visit/route.js` | ~400 | Single completion path for Quick Checkout + Walk-In |
| `src/app/api/webhook/whatsapp/route.js` | 80 | Webhook entry point |

---

## 4. Data Model

### 4.1 `sessions` — WhatsApp conversation state

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | `gen_random_uuid()` |
| wa_id | VARCHAR(50) UNIQUE | WhatsApp user ID |
| phone_number_id | VARCHAR(20) | Meta business phone ID |
| profile_name | VARCHAR(100) | WhatsApp profile name |
| state | VARCHAR(50) | Current conversation state (30+ states) |
| previous_state | VARCHAR(50) | For back navigation |
| context | JSONB | Booking context, patient info, metadata |
| metrics | JSONB | failedAttempts, messagesInState, frustrationScore |
| is_escalated | BOOLEAN | Manual override flag |
| version | INTEGER | Optimistic locking |
| last_activity_at | TIMESTAMPTZ | For timeout detection |
| expires_at | TIMESTAMPTZ | 30-min inactivity timeout |
| created_at | TIMESTAMPTZ | |

**Constraints:** `CHECK (state IN (...))` — validates all 30+ states  
**Indexes:** `idx_sessions_wa_id`

### 4.2 `messages` — Chat history

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| msg_id | VARCHAR(100) UNIQUE | WhatsApp message ID (dedup) |
| session_id | UUID FK → sessions | ON DELETE CASCADE |
| wa_id | VARCHAR(50) | |
| role | VARCHAR(10) | CHECK: 'user' or 'bot' |
| content | TEXT | Message text |
| intent | VARCHAR(50) | Classified intent |
| metadata | JSONB | State before/after, reply type |
| created_at | TIMESTAMPTZ | |

**Indexes:** `idx_messages_wa_id`, `idx_messages_msg_id`

### 4.3 `appointments` — Core business entity (~45 columns)

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| logical_id | UUID | Stable identity across reschedules |
| version | INTEGER | Monotonically increasing |
| replaces_version | INTEGER | Previous version |
| superseded_at | TIMESTAMPTZ | When rescheduled |
| session_id | UUID FK → sessions | |
| wa_id | VARCHAR(50) | WhatsApp ID |
| patient_name | VARCHAR(100) | |
| patient_phone | VARCHAR(20) | |
| patient_id | UUID FK → patients | |
| date | DATE NOT NULL | Appointment date |
| time | TIME | Slot time |
| treatment | VARCHAR(100) | Primary treatment |
| treatments | JSONB | Multiple treatments `['RCT', 'Crown']` |
| status | VARCHAR(20) | confirmed/cancelled/completed/no_show/superseded |
| location | VARCHAR(100) | |
| advice_selected | TEXT[] | Post-treatment advice |
| diagnosis_selected | TEXT[] | Diagnosis codes |
| diagnosis | TEXT | Free-text diagnosis |
| chief_complaint | TEXT | OPD slip |
| general_examination | TEXT | |
| extra_oral_examination | TEXT | |
| medicines | JSONB | `[{name, dosage, duration, timing}]` |
| follow_up_date | DATE | |
| follow_up_instructions | TEXT | |
| notes | TEXT | Clinical notes |
| consultation_fee | INTEGER | |
| treatment_charges | INTEGER | |
| medicine_charges | INTEGER | |
| treatment_fees | JSONB | Per-treatment fee map |
| payment_status | VARCHAR(20) | pending/paid/partial |
| paid_amount | INTEGER | |
| payment_method | VARCHAR(20) | cash/upi/card/bank |
| transaction_id | VARCHAR(100) | |
| paid_at | TIMESTAMPTZ | |
| tooth_diagnoses | JSONB | `[{tooth, diagnoses[], surface?, treatment?, severity?, status?, outcome?, notes?}]` |
| chit_media | TEXT[] | R2 keys for photos/audio |
| arrival_status | VARCHAR(20) | scheduled/arrived/called |
| arrived_at | TIMESTAMPTZ | |
| called_at | TIMESTAMPTZ | |
| is_priority | BOOLEAN | Queue priority |
| reminder_sent_at | TIMESTAMPTZ | 24h reminder sent |
| feedback_sent_at | TIMESTAMPTZ | Post-visit feedback sent |
| follow_up_reminder_sent_at | TIMESTAMPTZ | |
| due_reminder_sent_at | TIMESTAMPTZ | Payment reminder sent |
| post_visit_sent_at | TIMESTAMPTZ | Visit summary sent |
| prescription_key | TEXT | R2 key for cached PDF |
| compiled_document_key | TEXT | R2 key for compiled doc |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

**Constraints:** `CHECK (status IN ('confirmed','cancelled','completed','no_show','superseded'))`  
**Unique:** `UNIQUE (logical_id, version)` — prevents duplicate versions in concurrent reschedules  
**Partial Unique Index:** `idx_appointments_unique_slot ON appointments (date, time) WHERE status = 'confirmed'` — prevents double-booking  
**Indexes:** `wa_id`, `date`, `(date, status)`, `logical_id`

### 4.4 `patients` — Patient registry

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| wa_id | VARCHAR(50) | WhatsApp ID |
| name | VARCHAR(100) NOT NULL | |
| age | INTEGER | |
| sex | VARCHAR(10) | |
| phone | VARCHAR(20) NOT NULL UNIQUE | |
| location | VARCHAR(100) | City/area |
| address | TEXT | OPD slip |
| occupation | VARCHAR(100) | |
| allergies | TEXT | Medical history |
| chronic_conditions | TEXT | |
| blood_group | VARCHAR(10) | |
| bp | VARCHAR(20) | Blood pressure |
| weight | VARCHAR(20) | |
| medications | TEXT | Current medications |
| habits | JSONB | Smoking, tobacco, etc. |
| dental_history | TEXT | |
| family_history | TEXT | |
| patient_ratings | JSONB | Doctor's ratings per category (7 categories, 1-5) |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

**Unique:** `UNIQUE (phone)`  
**Indexes:** `phone`, `name`, `wa_id`, `name_trgm` (gin), `phone_trgm` (gin)

### 4.5 `payments` — Financial ledger

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| appointment_id | UUID FK → appointments | ON DELETE CASCADE |
| patient_id | UUID FK → patients | ON DELETE CASCADE |
| amount | INTEGER | `CHECK (amount > 0)` |
| direction | VARCHAR(10) | credit/debit |
| kind | VARCHAR(20) | payment/refund/adjustment/migration/waiver/advance |
| method | VARCHAR(20) | cash/upi/card/bank |
| idempotency_key | VARCHAR(100) UNIQUE | Prevents duplicate records |
| notes | TEXT | |
| recorded_by | VARCHAR(20) | reception/system |
| recorded_at | TIMESTAMPTZ | |

**Indexes:** `appointment_id`, `patient_id`, `recorded_at`

### 4.6 `patient_reviews` — Doctor reviews per visit

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| patient_id | UUID FK → patients | |
| appointment_id | UUID FK → appointments | |
| ratings | JSONB | 7 categories (behaviour, cooperative_treatment, timely_appointment, payment_time, oral_hygiene, pain_tolerance, treatment_compliance), numeric 1-5 |
| notes | TEXT | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

**Indexes:** `patient_id`, `appointment_id`

### 4.7 `patient_relationships` — Family links

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| patient_id | UUID FK → patients | ON DELETE CASCADE |
| related_patient_id | UUID FK → patients | ON DELETE CASCADE |
| relationship_type | VARCHAR(20) | spouse/child/parent/sibling/guardian/other |
| created_at | TIMESTAMPTZ | |

**Unique:** `UNIQUE (patient_id, related_patient_id)`  
**Check:** `patient_id != related_patient_id`

### 4.8 `blocked_dates` — Doctor off-days

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| date | DATE NOT NULL UNIQUE | |
| reason | VARCHAR(100) | |
| created_at | TIMESTAMPTZ | |

### 4.9 `settings` — Key-value store

| Column | Type | Notes |
|--------|------|-------|
| key | TEXT PK | |
| value | JSONB | Arbitrary config |
| updated_at | TIMESTAMPTZ | |

**Default entries:** clinic info, doctor credentials, prescription styling, checklists (diagnosis + advice lists), Google Maps URL, medicines catalog (50+ salts with categories)

### 4.10 `due_reminder_log` — Audit trail for payment reminders

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| triggered_at | TIMESTAMPTZ | |
| triggered_by | VARCHAR(20) | manual/cron |
| total_appointments | INTEGER | |
| sent_count | INTEGER | |
| template_sent_count | INTEGER | |
| details | JSONB | Per-appointment results |
| created_at | TIMESTAMPTZ | |

### 4.11 `shadow_logs` — AI evaluation data

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| created_at | TIMESTAMPTZ | |
| wa_id | VARCHAR(50) | |
| session_state | VARCHAR(50) | |
| message_text | TEXT | User message |
| rule_intent | VARCHAR(50) | Rule-based classification result |
| ai_intent | VARCHAR(50) | AI classification result |
| ai_confidence | REAL | 0.0-1.0 |
| matched | BOOLEAN | Whether rule_intent == ai_intent |
| provider | VARCHAR(20) | gemini/mock |
| processing_time_ms | INTEGER | |
| rule_used | BOOLEAN | Whether rule was used (always true in shadow mode) |

**Indexes:** `created_at`, `matched`

---

## 5. Workflow Engine

### Architecture

The engine is a synchronous pipeline in `src/lib/engine.js` (398 lines) that processes each incoming WhatsApp message.

```
classifyEvent(payload)
  │
  ├─ if statuses → PIPELINE_HALT (skip read receipts/delivery)
  ├─ if from clinic's own phone number → PIPELINE_HALT
  └─ returns { messages[], contacts[], metadata[] }
       │
       ▼
  for each message (sorted by timestamp):
       │
       ▼
  Step 2a: isDuplicate(msgId) → in-memory Set + DB msg_id column check
       │   → if duplicate: skip (continue)
       │
       ▼
  Step 2b: normalizeMessage(msg) → {
       │     msgId, waId, type, text, textClean (no emoji),
       │     textLower, textTrimmed, interactiveId, mediaId,
       │     mimeType, hasMedia, timestamp, phoneNumberId
       │   }
       │
       ▼
  Step 2c: markAsRead(msgId) — fire-and-forget (no await)
       │
       ▼
  Step 2d: getOrCreateSession(waId) → load from cache or DB, or create new
       │   → role detection: patient | doctor | receptionist
       │   → if expired: reset to IDLE
       │
       ├─ if session.context.manualMode → save message, notify doctor
       │  on WhatsApp, notify dashboard SSE, CONTINUE (skip bot pipeline)
       │
       ▼
  Step 2d-ii: checkRapidFireSafety() → detect multi-message bursts
       │   → tracks messageSequence, lastMessageIds
       │
       ▼
  Step 2e: classifyWithFallback(normalized, session)
       │   (see AI section §7.4 for full detail)
       │
       ├─ if unknown intent AND booking state:
       │   → detectCorrection() may override intent
       │
       ▼
  Step 2f: extractEntities(text) → { date?, time?, treatment?, phone? }
       │   → accumulateEntities(session.context) for progressive filling
       │
       ▼
  Step 2g(i): createMessage() — save user message to DB (fire-and-forget)
       │
       ▼
  Step 2g(ii): getNextState(session.state, intent, entities, session)
       │   → validates via isValidTransition()
       │   → returns next state or null (handler decides)
       │
       ▼
  Step 2h: handle(state, { session, normalized, entities, intent })
       │   → global intents checked first (emergency, language, escalate, etc.)
       │   → state-specific handler dispatched via switch(state)
       │   → each handler returns { session, reply, replyType }
       │   → replyType: 'text' | 'buttons' | 'list'
       │
       ▼
  Step 2i: sendReply(waId, reply, replyType)
       │   → WhatsApp API call with 2 retries on 5xx/429
       │   → if list/buttons fail: fallback to numbered text list
       │
       ▼
  Step 2j: save(handlerResult.session) → cache + DB (fire-and-forget)
       │
       ▼
  Step 2k: createMessage() — save bot message (fire-and-forget)
       │   → notifyNewMessage(waId) for dashboard SSE
       │
       ▼
  Step 2l: checkAndSendPostVisit(waId) — fire-and-forget
       │   → if appt time + 40min has passed, send visit summary
```

### State Machine

**30+ states** defined in `src/config/states.js`:

**Patient-facing:**
```
IDLE → MAIN_MENU → BOOKING_COLLECTION → BOOKING_CONFIRMATION → BOOKED
                  → SERVICES | LOCATION | TIMINGS (info, no state change)
EMERGENCY → MAIN_MENU
HUMAN_ESCALATION, CALLBACK_REQUESTED
CANCEL_CONFIRM
WALKIN_NAME → WALKIN_AGE → WALKIN_SEX → WALKIN_TREATMENT
BOOKING_PATIENT_AGE → BOOKING_PATIENT_SEX → BOOKING_PATIENT_LOCATION
FAMILY_SELECTION
DONE, ABANDONED
```

**Doctor-facing (via WhatsApp):**
```
DOCTOR_MAIN_MENU → DOCTOR_VIEW_DATE → DOCTOR_APPOINTMENT_LIST → DOCTOR_APPOINTMENT_DETAIL
                 → DOCTOR_MANAGE_SCHEDULE | DOCTOR_STATS | DOCTOR_VIEW_QUEUE
                 → DOCTOR_SEARCH_PATIENT | DOCTOR_PATIENT_VISITS | DOCTOR_VIEW_CHIT
REGISTER_NAME → REGISTER_AGE → REGISTER_SEX → REGISTER_PHONE → REGISTER_APPOINTMENT
LOG_TREATMENT → LOG_CONSULTATION_FEE → LOG_TREATMENT_CHARGES → LOG_MEDICINE_CHARGES
             → LOG_NEXT_VISIT → LOG_NOTES → LOG_MEDIA
```

**Receptionist-facing:**
```
RECEPTIONIST_MAIN_MENU → RECEPTIONIST_VIEW_QUEUE → RECEPTIONIST_QUEUE_DETAIL
```

### Transition Validation

`isValidTransition(state, intent)` in `src/lib/transitions.js`:
- **Global intents** always valid: `emergency`, `cancel`, `main_menu`, `escalate`, `back`, `location`, `timings`, `services`
- **Correction intents** only valid during booking: `BOOKING_COLLECTION`, `BOOKING_CONFIRMATION`, `BOOKED`
- **All others** must be in the `TRANSITIONS[state]` whitelist (defined in `states.js`)
- Returns `null` if transition is not allowed

### Session Handling

- **In-memory cache:** LRU with 500 entry max, 30-minute TTL, 5-minute periodic cleanup
- **DB persistence:** `sessions` table upserted on each message via `saveSession()`
- **Optimistic locking:** `version` column incremented on each write; `WHERE version = expected`
- **Manual mode:** `session.context.manualMode` flag set via dashboard API. 24-hour timeout (`MANUAL_MODE_TIMEOUT_MS`). When active, inbound messages skip bot pipeline but are saved to DB and forwarded to doctor
- **Role system:** `session.context.role` set to `'patient'` | `'doctor'` | `'receptionist'` — determined by phone number match against `DOCTOR_WA_ID` / `RECEPTIONIST_WA_ID` env vars

### Validators

- **Date** (`src/lib/validators.js`): 108 lines of regex. Handles: relative dates (tomorrow, day after, day after tomorrow, next week), named days (Monday, Tuesday...), explicit dates (25th March, 25/03/2026, 2026-03-25). Returns `{ valid, parsed: 'YYYY-MM-DD', display }`
- **Time** (`src/lib/validators.js`): 174 lines of regex. Handles: 12h (10am, 10:30 AM, 10:00pm), 24h (14:30, 22:00), relative (morning=10:00, afternoon=14:00, evening=17:00). Returns `{ valid, parsed: 'HH:MM', display }`
- **Treatment** (`src/lib/validators.js`): Alias matching against `CLINIC.treatments[]`. Each treatment has `name`, `aliases[]`, `symptom`, `hinglish`. Returns `{ valid, parsed: treatmentName }`
- **Phone** (`src/lib/validators.js`): Indian mobile numbers — 10 digits, optional +91 prefix, optional country code

### Side Effects

- **Entity accumulation:** `accumulateEntities(session.context, entities)` — stores extracted entities across multiple messages for progressive slot filling. Supports fragmented inputs like "Tomorrow" (date) followed by "after 5" (time) before bot can reply
- **Frustration scoring:** `calculateFrustration(session, textLower)` — scores based on: negative words (no, stop, wrong, ugh), `messagesInState > 4`, short messages with repeated attempts, `failedAttempts >= 2`. Not currently used for any action
- **Overwrite policy:** `evaluateOverwrite()` — prevents mutation of confirmed booking fields without explicit reschedule flow. Only allows overwrite during `BOOKING_COLLECTION` state
- **Correction detection:** `detectCorrection()` — weighted pattern matching with specificity-ordering. Patterns like "no I said", "change it to", "instead of", "nhi", "galat", "badlo". Returns correction type + new value

### Failure Recovery

- **No retry queue:** If any step fails, the entire pipeline for that message is lost. No dead-letter queue, no background retry
- **DB save is fire-and-forget:** `createMessage(...).catch(err => logger.error(...))` — if DB write fails, the message is silently lost
- **Session save is fire-and-forget:** `save(handlerResult.session).catch(() => {})` — session state may be lost on DB failure
- **WhatsApp API retries:** `sendText`, `sendButtons`, etc. have 2 retry attempts on 5xx/429 with ~500ms delay
- **Post-visit check is fire-and-forget:** `checkAndSendPostVisit(waId).catch(() => {})` — may silently fail
- **Meta webhook retry:** If the webhook returns non-200 or times out, Meta retries for ~24h with backoff. The `isDuplicate()` check prevents reprocessing, but only if the message was saved to DB before the crash

### Example Workflow — Full Booking

```
User: "hi"
  → engine: classifyEvent → normalizeMessage → getOrCreateSession
  → classifyWithFallback → intent='greeting' (interactive not available, text match)
  → handleIdle() → set state=MAIN_MENU
  → send list: menu with options [Book Appointment, Services, Location, Timings]
  → save session + bot message

User: taps "Book Appointment" (interactiveId='apt')
  → dedup (msg_id) → normalize (extract interactiveId)
  → classifyWithFallback → interactiveId match → intent='appointment', confidence=1.0
  → handleMainMenu() → set state=BOOKING_COLLECTION
  → checkPatientDemographicsNeeded() → check if patient record has age/sex/location
  → send list: date quick picks [Today, Tomorrow, Day after, Pick date...]
  → save session + bot message

User: taps "Tomorrow" (interactiveId='tomorrow')
  → dedup → normalize → classify (interactiveId → intent='provide_date')
  → extractEntities(date='2026-06-20') → accumulateEntities
  → handleBookingCollection() → set booking.date = '2026-06-20'
  → progressiveFieldFill(date) → check if time already in accumulated entities (no)
  → send list: time slots for that day's schedule → save

User: taps "10:00 AM" (interactiveId='10:00')
  → dedup → normalize → classify → intent='provide_time'
  → extractEntities(time='10:00') → accumulateEntities
  → handleBookingCollection() → set booking.time = '10:00'
  → progressiveFieldFill(time) → check if treatment in accumulated entities (no)
  → send list: treatment options → save

User: taps "Teeth Cleaning" (interactiveId='Teeth Cleaning' or treatment id)
  → dedup → normalize → classify → intent='provide_treatment'
  → extractEntities(treatment='Teeth Cleaning') → accumulateEntities
  → handleBookingCollection() → set booking.treatment = 'Teeth Cleaning'
  → all fields filled → set state=BOOKING_CONFIRMATION
  → send buttons: [Confirm, Edit Date, Edit Time, Edit Treatment] with booking summary

User: taps "Confirm" (interactiveId='confirm')
  → dedup → normalize → classify → intent='confirm'
  → handleBookingConfirmation() → createAppointment() in DB
  → set state=BOOKED
  → send text: "Your appointment is confirmed!"
  → save session + bot message
```

---

## 6. WhatsApp Integration

### Incoming Message Flow

1. **Meta Cloud API** sends POST to `https://{domain}/api/webhook/whatsapp`
2. **Webhook route** (`src/app/api/webhook/whatsapp/route.js`, 80 lines):
   - Responds 200 immediately (Vercel kills background work after response)
   - Rate-limited: 60 req/min/IP via in-memory sliding window
   - Calls `runMigrations()` on every request (ensures tables exist on cold start)
   - JSON parsed ONCE at entry point, passed to `engine.processEvent(parsedBody)`
   - Returns `{ received: true }` with 200
3. **Engine** (detailed in §5) processes each message synchronously

### Outgoing Message Flow

All outgoing messages go through `src/lib/whatsapp.js`:
```
POST https://graph.facebook.com/v19.0/{WHATSAPP_PHONE_NUMBER_ID}/messages
Authorization: Bearer {WHATSAPP_ACCESS_TOKEN}
Content-Type: application/json
```

**Available functions (all with 2 retry attempts on 5xx/429):**
- `sendText(waId, text, previewUrl?)` — plain text, optional link preview
- `sendButtons(waId, body, buttons[])` — max 3 interactive buttons with titles and IDs
- `sendList(waId, body, sections[])` — single-section list with 1-10 rows, each with id/title/description
- `sendTemplate(waId, templateName, lang?, components?)` — registered Meta templates with header/body/button components
- `sendDocument(waId, link, filename)` — compiled PDF via R2 signed URL
- `markAsRead(msgId)` — read receipt (fire-and-forget)

All functions mock the API call when `REPLAY_MODE=true`.

### Templates

Defined in `src/config/templates.js`, 6 registered with Meta:

| Template | Purpose | Status |
|----------|---------|--------|
| `appointment_reminder` | 24h reminder (name, date, time, treatment, clinic name, location) | Active via cron |
| `feedback_request` | Post-visit feedback request | Active via cron |
| `booking_confirmation` | Confirm appointment details | Registered, not actively used |
| `visit_summary` | Post-visit summary with treatment details | Registered, not actively used |
| `due_reminder` | Payment due reminder (name, clinic name, amount, UPI ID) | Active via cron |
| `payment_reminder` | Payment follow-up | Registered, not actively used |

### Media Handling

- **Incoming media:** `processAndStoreMedia()` in `src/lib/media.js`
  - Downloads from WhatsApp CDN via `mediaUrl` API + access token
  - Uploads to R2 at `dashboard/{appointmentId}/{timestamp}_{type}.{ext}`
  - Allowed MIME types: images (jpeg/png/webp/gif/heic/heif), audio (ogg/mpeg), video, PDF, Word docs
  - Max file size: 10MB
  - Audio files transcribed via Whisper API (`src/lib/transcriber.js`)
- **Outgoing media:** R2 signed URLs (1h expiry) sent via WhatsApp document API
- **Storage:** Cloudflare R2, bucket `clinic-bot`, SDK `@aws-sdk/client-s3` v3

### Webhook Processing

- **Verification (GET):** Standard Meta handshake — validates `hub.verify_token` against `WHATSAPP_VERIFY_TOKEN`, returns `hub.challenge`
- **Event filtering:** Status updates (delivery receipts, read receipts) skipped via `if (value.statuses) return PIPELINE_HALT`. Messages from clinic's own `WHATSAPP_PHONE_NUMBER_ID` filtered out
- **No signature verification:** Meta sends `X-Hub-Signature-256` header but it is not validated. Anyone who knows the webhook URL can POST to it

### Retry Behavior

- **WhatsApp API calls:** 2 retry attempts on 5xx/429 with `setTimeout` delay before retry
- **Webhook delivery:** Meta retries for ~24h if non-200 or timeout. `isDuplicate()` prevents reprocessing
- **No internal retry:** Pipeline failures are logged once and dropped. No retry mechanism for DB failures

### Error Handling

- **API errors:** Logged, fall back from list/buttons to numbered text list
- **DB errors:** Logged via `.catch(err => logger.error(...))` — fire-and-forget, no user-facing error
- **AI errors:** Logged, fall back to rule-based classification (classifyIntent)
- **Handler errors:** Caught by try/catch in engine.js loop, logged, message skipped (continues to next message)

### Supported User Interactions

1. Booking appointments (date/time/treatment collection, correction, confirmation)
2. Cancelling appointments (with confirm step)
3. Checking status of existing appointments
4. Clinic info queries (services, location, timings, contact info)
5. Emergency detection + escalation to human
6. Callback requests (phone number collection, callback intent)
7. Walk-in registration (name → age → sex → treatment → create appointment)
8. Arrival check-in (QR scan or keyword "arrived")
9. Language switching (English ↔ Hindi/Hinglish)
10. Family account patient selection (multiple patients per WhatsApp number)
11. Feedback collection (rating 1-5 + optional callback request)
12. Doctor WhatsApp menu (view today, manage schedule, stats, queue, view chit)
13. Doctor visit logging (treatment, 3 fee types, follow-up, notes, media)
14. Doctor patient search + view past visits
15. Media upload (photos/audio to patient chit)
16. Receptionist WhatsApp menu (queue view, walk-in registration)

---

## 7. AI Readiness Audit

### 7.1 Provider Abstraction (`src/lib/ai/provider.js`)

**Implementation:** Defines `AIRequest` and `AIResponse` JSDoc typedefs (no runtime validation). Sets confidence thresholds: HIGH=0.90, MED=0.75, LOW=0.50. Classifies risk levels: HIGH_RISK_INTENTS (confirm, confirm_cancel, emergency), MEDIUM_RISK_INTENTS (provide_date, provide_time, cancel_appointment, reschedule, etc.). Lists 28 valid intents.

**Limitations:** JSDoc types only — no runtime enforcement. No retry logic in contract. No timeout definition in contract (defined separately in index.js).

**Production readiness:** 9/10. Clean abstraction, well-defined contract.

### 7.2 Gemini Integration (`src/lib/ai/gemini.js`)

**Implementation:** Direct HTTP fetch to `gemini-2.5-flash` REST API (NOT the Google AI SDK). System prompt (~50 lines) includes: treatment list with aliases + symptoms, intent catalog, extraction rules, output JSON schema. Temperature 0.1, max 512 tokens. 3-second timeout via `Promise.race`. Response parsed by extracting first JSON object from model output via regex `\{[\s\S]*\}`.

**Current status:** Never succeeds in production. The API key in `.env.local` is a free-tier key that consistently returns 429 (quota exceeded). Shadow log table is entirely empty as a result. All tests (`tests/unit/failure-paths.test.js`) verify graceful fallback.

**Limitations:**
- Free tier API key → constant 429 errors
- No Google AI SDK — direct HTTP means no built-in retry, streaming, safety config, or error handling
- No conversation history in prompt — only current session state + booking context
- No few-shot examples — single system prompt with no example classifications
- Naive JSON extraction — regex `{...}` will fail on nested objects or malformed responses
- No response schema validation — trusts model to return valid JSON
- Model (`gemini-2.5-flash`) is appropriate but untested

**Production readiness:** 4/10. Design is reasonable. Cannot operate without funded API key.

### 7.3 Shadow Mode (`src/lib/ai/index.js`)

**Implementation:** When `SHADOW_MODE=true` (env var), AI runs on a 5% random sample (`Math.random() < 0.05`). For sampled messages: calls AI classifier, compares result vs rule classification, writes comparison to `shadow_logs` table, returns rule result (never uses AI for actual reply). In non-shadow mode (production), AI result is used if confidence ≥ risk-level threshold.

**Current status:** Shadow logs are empty. The 5% sample produces no data because the Gemini API always returns 429. The entire shadow analysis infrastructure (shadow_logs table, getStats(), getDisagreements(), analyze-shadow.mjs script) has never produced a real result.

**Limitations:**
- 5% sample rate is static and low — would need months to gather statistically significant data even with working API
- Shadow log insert is fire-and-forget — silently lost on DB failure
- No A/B testing framework — can't compare rule vs AI reply quality in production
- No evaluation dashboard — data is in raw DB table, no UI for analysis

**Production readiness:** 6/10 (design), 1/10 (actual data collection). Conceptually correct, practically non-functional.

### 7.4 Intent Detection — Rule-Based (`src/lib/router.js` + `src/config/intents.js`)

**Implementation:** Two-tier deterministic classification:

1. **Interactive IDs** (list/button taps): Direct mapping from `interactiveId` to intent with confidence 1.0. This handles ~80% of real user interactions (patients tap buttons, don't type).

2. **Text classification:** Multi-pass keyword matching:
   - State-specific keywords (`STATE_INTENTS[state]`) — matched first
   - Global keywords (`GLOBAL_INTENTS`) — matched second
   - Word-boundary regex for ASCII text (e.g., `\bcleaning\b`)
   - `includes()` for non-ASCII Hindi text
   - Treatment name matching against CLINIC.treatments
   - Correction intent keywords ordered by specificity (longest patterns first)

**Classification process in `classifyIntent()`:**
1. Check state-specific intent keywords
2. Check global intent keywords
3. Attempt treatment name matching
4. Attempt entity extraction (date/time) for booking intents
5. Return `unknown` if nothing matches

**Limitations:**
- Keyword resolution order matters — "I need cleaning services" matches both "cleaning" and "services"
- No NLP — "I want to cancel my appointment" and "please cancel" match different patterns
- Hindi detection is fragile — mixed Hinglish text may match unexpected categories
- No entity extraction at classification time — dates/times are extracted separately in entities.js

**Production readiness:** 8/10. Reliable for short WhatsApp messages. Correctly handles the ~80% button-tap case.

### 7.5 Fallback Logic

**Implementation:** Hard switch between AI and rules:
- If AI is configured and shadow mode is off: try AI, if fails (timeout/error/low confidence) → fall back to rules
- If shadow mode is on: always use rules, optionally log AI comparison
- If AI is not configured: always use rules
- Interactive replies skip AI entirely (confidence 1.0 from rule)

**Limitations:** No confidence score fusion, no ensemble approach, no "ask human" fallback state.

**Production readiness:** 10/10. The system is fully functional without Gemini. Rule-based classification handles all production traffic.

### 7.6 Structured Extraction (`src/lib/entities.js`)

**Implementation:** Regex-based extraction of 4 entity types:
- **Date:** Relative (tomorrow, day after, next Monday), named (25th March, 25/03), explicit (2026-03-25)
- **Time:** 12h/24h formats, relative (morning, afternoon, evening)
- **Treatment:** Alias matching from CLINIC.treatments (name, aliases, symptoms, hinglish)
- **Phone:** Indian mobile numbers (10 digits, optional +91)

Entities are accumulated across messages via `accumulateEntities()` for progressive slot filling. Supports fragmented messages like "Tomorrow" + "after 5" sent before bot can reply.

**Limitations:** Only 4 entity types. No medication/symptom/diagnosis extraction. No follow-up date extraction.

**Production readiness:** 9/10. Does its job well within defined scope.

### 7.7 Prompting

**Implementation:** Single static system prompt in `gemini.js`:
- Treatment list formatted as `name (aliases: ..., symptoms: ...)`
- Intent catalog as comma-separated list
- Output JSON schema with field descriptions
- Rules: map symptoms to treatments, date in YYYY-MM-DD, time in HH:MM, correction detection, no made-up treatments, no medical advice

**Limitations:**
- No few-shot examples
- No conversation history (only current booking context)
- No dynamic prompt adjustment based on session state
- No guardrails beyond the system prompt text
- No output format validation beyond regex JSON extraction

### 7.8 Logging

**Implementation:** `src/lib/logger.js` (29 lines):
- JSON-structured output to stdout (`console.log` / `console.error`)
- Four levels: debug, info, warn, error
- Service name: `whatsapp-bot`
- Level filtering via `LOG_LEVEL` env var (default: info)

**AI logging:** Each classification call logs:
- `GEMINI_REQUEST` — model, text, state
- `GEMINI_RESPONSE` — model, intent, confidence
- `GEMINI_API_ERROR` — status, error text (on failure)
- `GEMINI_PARSE_FAILED` — text (on JSON parse failure)
- `INTENT_CLASSIFICATION` — provider, intent, confidence, source
- `INTENT_CLASSIFICATION_FAILED` — provider, error, fallback
- `SHADOW_LOG_INSERT_FAILED` — error (on DB write failure)

**Limitations:** No log aggregation platform. No search/query capability. No retention policy. Vercel's built-in log viewer is the only access method. No request IDs for tracing across services.

**Production readiness:** 5/10. Functional but primitive. Adequate for single-clinic debugging.

### Summary — All AI-Related Files

| # | File | Purpose | Lines |
|---|------|---------|-------|
| 1 | `src/lib/ai/provider.js` | AI interface contract, types, thresholds | 80 |
| 2 | `src/lib/ai/gemini.js` | Gemini 2.5 Flash provider | 153 |
| 3 | `src/lib/ai/mock.js` | Mock provider for replay testing | 36 |
| 4 | `src/lib/ai/index.js` | AI orchestration with shadow mode | 183 |
| 5 | `src/db/repositories/shadowLogRepository.js` | Shadow log DB queries | 170 |
| 6 | `src/db/pool.js` (lines 454-476) | Shadow logs table DDL | 23 |
| 7 | `src/lib/transcriber.js` | OpenAI Whisper audio transcription | 42 |
| 8 | `src/lib/envValidate.js` | OPENAI_API_KEY env validation | 38 |
| 9 | `src/lib/engine.js` | Main pipeline calls classifyWithFallback | 398 |
| 10 | `src/lib/router.js` | Rule-based intent classifier (fallback) | 302 |
| 11 | `src/lib/entities.js` | Entity extraction + accumulation | 113 |
| 12 | `src/lib/correction-detector.js` | Correction pattern detection | 187 |
| 13 | `src/lib/overwrite-policy.js` | Booking field overwrite rules | 146 |
| 14 | `src/lib/transitions.js` | State machine (deterministic) | 161 |
| 15 | `src/lib/validators.js` | Date/time/treatment/phone validators | 398 |
| 16 | `src/config/intents.js` | Intent keyword definitions | 51 |
| 17 | `tests/unit/failure-paths.test.js` | AI failure path tests | 113 |
| 18 | `.env.local` | GEMINI_API_KEY + SHADOW_MODE | 26 |
| 19 | `.env.example` | GEMINI_API_KEY (commented) | 14 |
| 20 | `docs/ai-evolution-plan.md` | Full AI evolution strategy | 682 |
| 21 | `docs/shadow-mode-debug-findings-2026-06-05.md` | Debug findings | 50 |

---

## 8. Existing Features — Complete Inventory

### Appointments

| Feature | Description | Technical Implementation | Status |
|---------|-------------|------------------------|--------|
| WhatsApp Booking | Full conversational booking flow (date/time/treatment collection with correction support) | Engine (§5) + handlers (§5) + validators + session state machine | ✅ Live |
| Correction During Booking | User can correct any field mid-flow without restarting | correction-detector.js + overwrite-policy.js | ✅ Live |
| Quick Book (Dashboard) | Create appointment from calendar modal | `POST /api/dashboard/appointments` | ✅ Live |
| Bulk Booking | Complete or cancel ALL confirmed appointments for a date | `POST /api/dashboard/appointments/bulk` | ✅ Live |
| Cancel (WhatsApp) | Cancel with confirmation step, can back out | handleCancelConfirm → cancelAppointment() | ✅ Live |
| Cancel (Dashboard) | Cancel with reason, recorded in DB | `POST /api/dashboard/appointments/[id]/cancel` | ✅ Live |
| Reschedule (Dashboard) | Change date/time via versioned supersede model | `POST /api/dashboard/appointments/[id]/reschedule` + supersedeAppointment() | ✅ Live |
| Drag-to-Reschedule | Drag appointment blocks in WeekView/DayTimeline | Native HTML5 DnD + supersede API | ✅ Live |
| Slot Conflict Prevention | No double-booking within same time slot | Partial unique index `idx_appointments_unique_slot ON appointments (date, time) WHERE status = 'confirmed'` | ✅ Live |
| Walk-in (WhatsApp) | 4-step walk-in via WhatsApp (name → age → sex → treatment) | WALKIN_NAME → AGE → SEX → TREATMENT states | ✅ Live |
| Quick Checkout (Dashboard) | 1-click completion with fee + paid + payment mode | QuickCheckoutModal → `POST /api/dashboard/visit` | ✅ Live |
| Rapid Walk-In (Dashboard) | 15-second walk-in (name + phone + fee + payment mode) | RapidWalkInModal → `POST /api/dashboard/visit` | ✅ Live |
| Single Completion Path | All visit modes hit one endpoint | `completeVisit.js` + `createWalkIn.js` services | ✅ Live |

### Patient Management

| Feature | Description | Technical Implementation | Status |
|---------|-------------|------------------------|--------|
| Patient Search | ILIKE search by name/phone with trigram indexes | `searchPatients()` + pg_trgm GIN indexes | ✅ Live |
| Patient CRUD | Create/update patients from dashboard | `POST/GET /api/dashboard/patients` + `PATCH /api/dashboard/patients/[id]` | ✅ Live |
| Patient Profile | Full detail page with visit history and tooth timeline | `src/app/dashboard/patients/[id]/page.js` (~1300 lines) | ✅ Live |
| Medical History | Allergies, chronic conditions, BP, weight, medications, habits | PATCH endpoint + JSONB columns on patients table | ✅ Live |
| Family Accounts | Multiple patients linked to one WhatsApp number | `patient_relationships` table + FAMILY_SELECTION state | ✅ Live |
| Demographics Collection | Age/sex/location collected before first booking | BOOKING_PATIENT_AGE → SEX → LOCATION states | ✅ Live |
| Chat Mode (Dashboard) | Toggle manual WhatsApp chat from dashboard | SSE + manualMode flag on session | ✅ Live |
| Send WhatsApp (Dashboard) | Dashboard → patient WhatsApp message | `POST /api/dashboard/patients/[id]/send-message` | ✅ Live |
| Message History | Full WhatsApp conversation log with SSE live updates | messages table + SSE endpoint | ✅ Live |

### Clinical Documentation

| Feature | Description | Technical Implementation | Status |
|---------|-------------|------------------------|--------|
| Tooth Grid | FDI notation (11-48), 2-row grid (16 per row), interactive SVGs | ToothGrid.js — w-full SVGs, p-px gaps, hover:scale, active glow, context menu | ✅ Live |
| Per-Tooth Diagnosis | Surface-level diagnosis with 4 tooth types (molar/premolar/canine/incisor) | PerToothDiagnosisPanel.js with per-tooth-type zone positions | ✅ Live |
| Surface Diagram | Clickable O/M/D/B/L zones on actual tooth shape (not generic) | SVG 40×40 viewBox, zones adapted per tooth type, terminology adapts (Incisal vs Occlusal, Palatal vs Lingual) | ✅ Live |
| Bulk Select | Multi-tooth selection + bulk action bar | "Multi" toggle → click teeth → bulk actions (quick Dx + clear) | ✅ Live |
| Right-Click Context Menu | Quick diagnoses (Caries, Pocket, Mobility, Fractured, Missing) + Clear | Context menu on ToothGrid | ✅ Live |
| Treatment Labels | Treatment name shown below tooth in grid | Text labels in grid cells under SVGs | ✅ Live |
| Severity Shading | Opacity-based tooth coloring (mild/moderate/severe) | CSS opacity on tooth path | ✅ Live |
| Status Dots | Active/Treated/In Progress indicators overlaid on tooth SVGs | SVG circle elements after path (z-order) | ✅ Live |
| Outcome Tracking | Successful/Complication/Ongoing/Failed badges | Color-coded badges in panel + timeline | ✅ Live |
| Per-Tooth Notes | Free-text notes per tooth | Textarea in PerToothDiagnosisPanel | ✅ Live |

### Prescription & Documents

| Feature | Description | Technical Implementation | Status |
|---------|-------------|------------------------|--------|
| Prescription PDF | A4 prescription with 4-column tooth table (Tooth, Surf., Plan, Diagnosis) | `generatePrescription()` in src/lib/prescription.js → pdfkit → upload to R2 | ✅ Live |
| Dental Chart PDF | A4 landscape, all 32 teeth colored by diagnosis, legend, treatment labels | `generateDentalChart()` → pdfkit → R2 | ✅ Live |
| Compiled Document | Prescription + all photos in single PDF | `compileVisitDocument()` in src/lib/compileDocument.js → pdfkit → R2 | ✅ Live |
| Send via WhatsApp | Send compiled document to patient as WhatsApp document | `POST /api/dashboard/visits/[id]/compile/send` → sendDocument() | ✅ Live |
| Cached PDFs | Prescription PDFs cached in R2 with 7-day presigned URLs | `prescription_key` column on appointments | ✅ Live |
| Cache Invalidation | When clinic/doctor/prescription settings change, invalidate ALL cached PDFs | `PUT /api/dashboard/settings` sets prescription_key = NULL in migration | ✅ Live |

### Billing

| Feature | Description | Technical Implementation | Status |
|---------|-------------|------------------------|--------|
| Payment Ledger | Source-of-truth financial tracking with credits/debits | `payments` table with direction, kind, method, idempotency_key | ✅ Live |
| Legacy Migration | Migrated existing paid_amount > 0 to payments table | Backfill query in pool.js migrations | ✅ Live |
| Due Reminders | WhatsApp payment reminders sent via cron + manual | `due_reminder` template + due_reminder_log audit trail | ✅ Live |
| Payment Methods | Cash/UPI/Card/Bank with recorded_by tracking | payment_method + recorded_by columns | ✅ Live |
| Quick Checkout Fee | Single Fee input → treatment_charges + paid_amount + payment_method | QuickCheckoutModal → `POST /api/dashboard/visit` | ✅ Live |
| Discount-Ready Structure | Internal subtotal → discount → total → paid → outstanding (discount hidden V1) | QuickCheckoutModal.js internal fields | ✅ Live |

### Notifications

| Feature | Description | Technical Implementation | Status |
|---------|-------------|------------------------|--------|
| 24h Appointment Reminder | WhatsApp reminder 24h before appointment time | Cron at 17:30, template `appointment_reminder`, marks reminder_sent_at | ✅ Live |
| Daily Summary to Doctor | Morning recap of today's appointments | Cron at 03:50, sendText to DOCTOR_WA_ID | ✅ Live |
| Evening Check-in | Evening recap with completion prompts | Cron at 14:00, sendText to DOCTOR_WA_ID | ✅ Live |
| Follow-up Reminders | Upcoming/overdue follow-up visit reminders | Cron API template, custom text per scenario | ✅ Live |
| Feedback Requests | Post-visit feedback via WhatsApp 1h after completion | Cron at 10:30, template `feedback_request`, marks feedback_sent_at | ✅ Live |
| Dashboard Notifications | SSE stream for new messages + notifications | `/api/dashboard/notifications/stream` | ✅ Live |
| Post-Visit Summary | Auto-send visit summary 40min after appointment time | `checkAndSendPostVisit()` in engine.js, fire-and-forget | ✅ Live |

### Admin Panel

| Feature | Description | Technical Implementation | Status |
|---------|-------------|------------------------|--------|
| Settings | Clinic info, doctor credentials, prescription styling, checklists, medicines catalog | `settings` table (key-value, JSONB), GET/PUT API | ✅ Live |
| Schedule Management | Block/unblock dates for doctor off-days | `blocked_dates` table + UI | ✅ Live |
| Patient Reviews | Doctor ratings per visit (7 categories, 1-5) | `patient_reviews` table + CRUD API | ✅ Live |
| Analytics Dashboard | Revenue, visits, demographics, trends, peak hours, treatment breakdown | `GET /api/dashboard/stats?period=week|month|quarter` (120s cache) | ✅ Live |

### WhatsApp-Specific

| Feature | Description | Technical Implementation | Status |
|---------|-------------|------------------------|--------|
| Role-Based Menus | Doctor/Receptionist get different WhatsApp menus | Role detection via WA ID match against DOCTOR_WA_ID/RECEPTIONIST_WA_ID | ✅ Live |
| Media Upload | Photos/audio to patient chit from WhatsApp | Meta CDN download → R2 upload | ✅ Live |
| Audio Transcription | Voice note → text via Whisper API | `transcribeAudio()` in src/lib/transcriber.js | ✅ Live |
| Doctor WhatsApp Menu | View today, queue, manage schedule, stats, log visits | Doctor states in state machine (§5) | ✅ Live |
| Receptionist WhatsApp Menu | Queue view, walk-in registration | Receptionist states | ✅ Live |
| Language Support | English + Hindi/Hinglish responses | `translations.js` + `detectLanguageHint()` | ✅ Live |

---

## 9. Admin Panel

### Screens

| Route | Component File | Purpose |
|-------|---------------|---------|
| `/dashboard` | `page.js` | Main dashboard — stats summary, FAB menu (Quick Walk-In, New Appointment) |
| `/dashboard/login` | `page.js` | Password-based login with JWT cookie |
| `/dashboard/appointments` | `page.js` (~1200 lines) | Month calendar (Calendar.js) + Week view (WeekView.js) + Day view (DayTimeline.js), AppointmentDetailsModal, RescheduleModal, VisitCompleteModal |
| `/dashboard/patients` | `page.js` | Patient search + list with pagination |
| `/dashboard/patients/[id]` | `page.js` (~1300 lines) | Full profile: demographics, medical history (accordion), per-tooth history (expandable timeline), visit history, messages, Chart + Print buttons |
| `/dashboard/visit` | `page.js` (~2100 lines) | Clinical visit page: ToothGrid, PerToothDiagnosisPanel, 15 visit sub-components (DiagnosisCard, PrescriptionCard, ToothChartCard, etc.) |
| `/dashboard/queue` | `page.js` | Today's queue with arrival status (scheduled/arrived/called), priority toggle |
| `/dashboard/schedule` | `page.js` | Blocked dates management calendar |
| `/dashboard/settings` | `page.js` | Clinic info, doctor credentials, prescription styling, checklists (diagnosis + advice), medicines catalog |
| `/dashboard/stats` | `page.js` | Analytics dashboard (recharts): revenue, visits, demographics, treatment breakdown, peak hours |
| `/dashboard/feedback` | `page.js` | Patient reviews list with filter/search |
| `/dashboard/due-reminders` | `page.js` | Due payment reminders queue + send |
| `/dashboard/prescription-preview` | `page.js` | Prescription PDF preview |

### Components

| Component | Purpose | Code |
|-----------|---------|------|
| ToothGrid.js | FDI tooth grid (11-48), 2 rows × 16 teeth, interactive SVGs, context menu, bulk select | ~400 lines |
| PerToothDiagnosisPanel.js | Per-tooth surface diagram (4 tooth types), diagnosis checklist, treatment planner (13 options), severity/outcome/status selectors, notes | ~600 lines |
| WeekView.js | 7-column weekly calendar, time-slot grid (8am-8pm), drag-to-reschedule (HTML5 DnD), click slot to book, click appointment for detail | ~700 lines |
| DayTimeline.js | Single-day vertical timeline, hour rows, wide appointment blocks, drag-to-reschedule | ~600 lines |
| Calendar.js | Monthly calendar grid, day click for slot view | ~400 lines |
| QuickCheckoutModal.js | 1-click checkout: Fee + Paid + Payment Mode + Notes | ~300 lines |
| RapidWalkInModal.js | 15-second walk-in: Name + Phone + Fee + Paid + Payment Mode + Notes | ~250 lines |
| AppointmentDetailsModal.js | Lightweight routing hub on calendar click: Edit Visit, Quick Checkout, Cancel | ~200 lines |
| NotificationPanel.js | SSE-based real-time notification panel | ~200 lines |
| MediaViewer.js | Media file viewer for chit media | ~100 lines |
| PwaRegister.js | PWA install prompt handler | ~100 lines |

**Visit sub-components (15 files in `src/components/visit/`):**
ActionCard, AdviceCard, AttachmentsPanel, BillingProjectionCard, ClinicalNotesCard, ContextSidebar, DiagnosisCard, EditPatientDrawer, FollowUpCard, IntraOralFindings, MediaCard, MedicalAlertsCard, MedicalHistoryCard, PatientHeader, PatientSummaryCard, PrescriptionCard, ProvisionalDiagnosisCard, ToothChartCard, VisitSummary, WalkInDrawer, WalkInPatientCard

### APIs (Admin-Specific)

| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/dashboard/settings` | GET, PUT | Key-value settings store |
| `/api/dashboard/schedule` | GET, POST, DELETE | Blocked dates CRUD |
| `/api/dashboard/patient-reviews` | GET, POST | Reviews list + create |
| `/api/dashboard/patient-reviews/[id]` | PATCH, DELETE | Review update + delete |
| `/api/dashboard/notifications` | GET | Dashboard alerts |
| `/api/dashboard/notifications/stream` | GET | SSE stream |
| `/api/dashboard/calendar` | GET | Month slot availability |

### Current State

The admin panel is **functional but unpolished.** The visit page (~2100 lines) is the most complex — it integrates ToothGrid, PerToothDiagnosisPanel, and all 15 visit cards into a single scrollable page. The appointments page (~1200 lines) handles month/week/day views with drag-to-reschedule. All components are custom-built (no shadcn/ui, no Material UI). Tailwind v4 styling is clean and consistent. There is no component library, no design system, no Storybook.

---

## 10. APIs — Complete Inventory

### Dashboard APIs

#### Authentication

| Route | Method | Auth | Rate Limit | Purpose |
|-------|--------|------|-----------|---------|
| `/api/dashboard/login` | POST | DASHBOARD_PASSWORD | 10/min/IP | Password auth, sets JWT + CSRF cookies (12h) |
| `/api/dashboard/logout` | POST | JWT + CSRF | 120/min/IP | Clears auth cookies |
| `/api/dashboard/health` | GET | None | 120/min/IP | Health check |

#### Patients

| Route | Method | Auth | Cache | Purpose |
|-------|--------|------|-------|---------|
| `/api/dashboard/patients` | GET | JWT | None | List/search patients (q param, limit=N, max 50) |
| `/api/dashboard/patients` | POST | JWT + CSRF | None | Create patient (duplicate phone → 409) |
| `/api/dashboard/patients/search` | GET | JWT | None | Quick patient search (q >= 2 chars) |
| `/api/dashboard/patients/[id]` | GET | JWT | 60s | Get patient + all visits |
| `/api/dashboard/patients/[id]` | PATCH | JWT + CSRF | None | Update patient (name syncs to appointments) |
| `/api/dashboard/patients/[id]/family` | GET | JWT | None | List family relationships |
| `/api/dashboard/patients/[id]/family` | POST | JWT + CSRF | None | Add family member (bidirectional) |
| `/api/dashboard/patients/[id]/family` | DELETE | JWT + CSRF | None | Remove family relationship |
| `/api/dashboard/patients/[id]/medical-history` | PATCH | JWT + CSRF | None | Update medical history fields |
| `/api/dashboard/patients/[id]/messages` | GET | JWT | 30s | Get message history (limit/offset) |
| `/api/dashboard/patients/[id]/messages/stream` | GET | JWT | None | SSE stream for real-time messages |
| `/api/dashboard/patients/[id]/chat-mode` | GET | JWT | None | Get manual mode status |
| `/api/dashboard/patients/[id]/chat-mode` | PATCH | JWT + CSRF | None | Toggle manual mode |
| `/api/dashboard/patients/[id]/send-message` | POST | JWT + CSRF | None | Send WhatsApp to patient |

#### Appointments

| Route | Method | Auth | Cache | Purpose |
|-------|--------|------|-------|---------|
| `/api/dashboard/appointments` | GET | JWT | None | Single by ID, by date, by date range, or future scope |
| `/api/dashboard/appointments` | POST | JWT + CSRF | None | Quick book (slot conflict → 409) |
| `/api/dashboard/appointments/[id]` | PATCH | JWT + CSRF | None | Update appointment fields |
| `/api/dashboard/appointments/[id]/cancel` | POST | JWT + CSRF | None | Cancel with reason |
| `/api/dashboard/appointments/[id]/reschedule` | POST | JWT + CSRF | None | Reschedule (versioned, slot conflict → 409) |
| `/api/dashboard/appointments/bulk` | POST | JWT + CSRF | None | Bulk complete_all or cancel_all |

#### Visit (Single Completion Path)

| Route | Method | Auth | Cache | Purpose |
|-------|--------|------|-------|---------|
| `/api/dashboard/visit` | POST | JWT + CSRF | None | completeAppointment / editCompletedVisit / createWalkIn |

#### Clinical

| Route | Method | Auth | Cache | Purpose |
|-------|--------|------|-------|---------|
| `/api/dashboard/visits/[id]/prescription` | POST | JWT + CSRF | R2 (7d) | Generate prescription PDF |
| `/api/dashboard/visits/[id]/chart` | POST | JWT + CSRF | None | Generate dental chart PDF |
| `/api/dashboard/visits/[id]/compile` | POST | JWT + CSRF | R2 (7d) | Compile visit document (prescription + photos) |
| `/api/dashboard/visits/[id]/compile/send` | POST | JWT + CSRF | None | Compile + send via WhatsApp |

#### Queue

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/dashboard/arrival` | PATCH | JWT + CSRF | Update arrival status (scheduled/arrived/called) |
| `/api/dashboard/schedule` | GET | JWT | List blocked dates |
| `/api/dashboard/schedule` | POST | JWT + CSRF | Block a date |
| `/api/dashboard/schedule` | DELETE | JWT + CSRF | Unblock a date |

#### Financial

| Route | Method | Auth | Cache | Purpose |
|-------|--------|------|-------|---------|
| `/api/dashboard/due-reminders` | GET | JWT | None | List reminder logs + queue |
| `/api/dashboard/due-reminders` | POST | JWT + CSRF | None | Send due payment reminders |
| `/api/dashboard/stats` | GET | JWT | 120s | Analytics: revenue, visits, demographics, trends |

#### Reviews

| Route | Method | Auth | Cache | Purpose |
|-------|--------|------|-------|---------|
| `/api/dashboard/patient-reviews` | GET | JWT | 60s | List reviews (filterable by patient/q) |
| `/api/dashboard/patient-reviews` | POST | JWT + CSRF | None | Create/upsert review (by appointment_id) |
| `/api/dashboard/patient-reviews/[id]` | PATCH | JWT + CSRF | None | Update review |
| `/api/dashboard/patient-reviews/[id]` | DELETE | JWT + CSRF | None | Delete review |

#### Media

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/dashboard/media` | POST | JWT + CSRF | Upload file to R2 (max 10MB) |
| `/api/dashboard/media/signed` | GET | JWT | Get signed URL (1h expiry) |

#### Admin

| Route | Method | Auth | Cache | Purpose |
|-------|--------|------|-------|---------|
| `/api/dashboard/settings` | GET | JWT | None | Get all settings (creates defaults if empty) |
| `/api/dashboard/settings` | PUT | JWT + CSRF | None | Update setting (invalidates PDF caches) |
| `/api/dashboard/notifications` | GET | JWT | None | Dashboard alerts (today counts, cancellations) |
| `/api/dashboard/notifications/stream` | GET | JWT | None | SSE stream for real-time notifications |
| `/api/dashboard/calendar` | GET | JWT | Indefinite | Month slot availability |

#### Send WhatsApp

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/dashboard/send-whatsapp` | POST | JWT + CSRF | Send arbitrary text or template message |

### Webhook

| Route | Method | Auth | Rate Limit | Purpose |
|-------|--------|------|-----------|---------|
| `/api/webhook/whatsapp` | GET | Verify token | None | Webhook verification handshake |
| `/api/webhook/whatsapp` | POST | None | 60/min/IP | Process incoming WhatsApp message |

### Cron APIs

All use `GET` with `CRON_SECRET` authentication (Bearer token, `x-cron-secret` header, or `?secret=` query param).

| Route | Purpose | Schedule |
|-------|---------|----------|
| `/api/cron/reminders` | Send 24h appointment reminders via template | Vercel cron: 17:30 daily |
| `/api/cron/daily-summary` | Send morning summary to doctor | Vercel cron: 03:50 daily |
| `/api/cron/evening-checkin` | Send evening check-in to doctor | Vercel cron: 14:00 daily |
| `/api/cron/feedback` | Send feedback requests 1h post-completion | Vercel cron: 10:30 daily |
| `/api/cron/follow-up-reminders` | Send follow-up visit reminders | Manual trigger |
| `/api/cron/due-reminders` | Send payment due reminders | Manual trigger |

### Security (Applied to All Dashboard APIs)

All dashboard routes (except `/login`) go through `src/lib/apiAuth.js`:
- `requireCsrf(req)` — CSRF: same-origin check (Origin header), falls back to `x-csrf-token` vs cookie comparison. Skips GET/HEAD/OPTIONS
- `checkRateLimit(req)` — 120 req/min/IP via `DASHBOARD_API_LIMITER`. Returns 429 with Retry-After
- `checkBodySize(req)` — 100KB for JSON, 15MB for multipart/form-data. Returns 413
- `jsonError(error, status)` — standardized error response
- `sanitizeResponse(data)` — XSS: strips script tags, on* handlers, javascript: URIs

All dashboard routes (except `/login`) require JWT cookie `dashboard_token` verified by `src/proxy.js`.

---

## 11. Security Review

### Authentication

- **Dashboard:** Password-based (`DASHBOARD_PASSWORD` env var). JWT (`dashboard_token`) via HMAC-SHA256 using Web Crypto API. Key derived from SHA-256 hash of `DASHBOARD_PASSWORD`. 12h expiry. CSRF token as separate cookie (`csrf_token`, 32 random bytes hex).
- **Cron:** Bearer token OR `x-cron-secret` header OR `?secret=` query param against `CRON_SECRET`.
- **Webhook:** GET verification via `WHATSAPP_VERIFY_TOKEN` (standard Meta handshake).

**Risk (CRITICAL):** `DASHBOARD_PASSWORD` is `admin123` stored in `.env.local`. This is the ONLY barrier to the entire admin panel. No 2FA, no IP whitelist, no fail2ban, no account lockout.

### Authorization

**None.** Single role: all authenticated users are full admins. No RBAC — doctor and receptionist share identical dashboard access. WhatsApp role separation is via phone number matching only (no enforcement — a patient could trigger doctor states by knowing the numbers).

### RBAC

**Not implemented.** Everyone who can log in gets complete access to:
- All patient records (including medical history, financial data)
- All clinical documentation (diagnoses, prescriptions)
- All financial data (revenue, payments)
- All system settings (clinic info, doctor credentials, prescription styling)

### Session Management

- JWT stored in httpOnly cookie (secure in production).
- 12h expiry, no refresh mechanism.
- No session invalidation on password change.
- CSRF via same-origin check + `x-csrf-token` header vs cookie comparison.

**Risk:** CSRF check falls back to `x-csrf-token` vs cookie comparison. On Vercel (multiple regions), the cookie may not be accessible from all instances. CSRF could fail spuriously.

### Secrets Management

All secrets in `.env.local` (gitignored):

| Secret | Type | Risk |
|--------|------|------|
| `WHATSAPP_ACCESS_TOKEN` | OAuth token | HIGH — plaintext on filesystem |
| `DATABASE_URL` | Connection string with password | HIGH — plaintext with credentials |
| `GEMINI_API_KEY` | API key | MEDIUM — free tier, already rate-limited |
| `R2_ACCESS_KEY` + `R2_SECRET_KEY` | Cloudflare credentials | HIGH — full R2 bucket access |
| `DASHBOARD_PASSWORD` | Application password | CRITICAL — `admin123` |
| `CRON_SECRET` | API auth secret | MEDIUM |

**Risk:** No secrets manager. `.env.local` is gitignored but lives unencrypted on disk. Vercel environment variables are encrypted at rest but `.env.local` bypasses that.

### Input Validation

- Body size limits: 100KB (JSON), 15MB (multipart)
- `sanitizeResponse(data)` — XSS sanitization on string fields (strips `<script>`, `on*` handlers, `javascript:` URIs)
- No schema validation library (no Zod, Yup, Joi, Ajv)
- SQL injection prevented by `postgres` tagged template literals (parameterized queries)

### Rate Limiting

- **In-memory sliding window** per-process. On Vercel (N instances), the effective limit is N × configured limit.
- **Login:** 10 req/min/IP — potential brute force protection (weak)
- **Webhook:** 60 req/min/IP — acceptable for single clinic
- **Dashboard API:** 120 req/min/IP — generous
- **Cron:** 20 req/min/IP — adequate

### Webhook Verification

- **GET verification:** Standard Meta handshake — correct implementation
- **POST verification:** **NONE.** Meta sends `X-Hub-Signature-256` header with HMAC-SHA256 of the request body + app secret. This is NOT validated. Anyone who discovers the webhook URL can POST fake events.

### Identified Security Risks (Ranked)

| # | Risk | Severity | Description | CVE Pattern |
|---|------|----------|-------------|-------------|
| 1 | Weak dashboard password | **CRITICAL** | `admin123` — trivial to brute force | Broken Authentication |
| 2 | No webhook signature verification | **HIGH** | Anyone with the URL can inject fake WhatsApp messages | Missing Authentication |
| 3 | No RBAC | **HIGH** | All users have full admin access | Broken Access Control |
| 4 | Secrets in `.env.local` plaintext | **HIGH** | R2/DB/Gemini credentials unencrypted on disk | Sensitive Data Exposure |
| 5 | Per-instance rate limiting | **MEDIUM** | Effective limit = configured × N instances | Ineffective Security Control |
| 6 | No account lockout | **MEDIUM** | Unlimited login attempts (rate: 10/min) | Brute Force |
| 7 | No request ID tracing | **LOW** | Can't correlate security events across requests | Insufficient Logging |
| 8 | CSRF cookie on Vercel multi-region | **LOW** | Cookie may not be available on all instances | Cross-Site Request Forgery |
| 9 | JWT tied to password | **LOW** | Password change invalidates all tokens — no roll | Session Management |

---

## 12. Performance Review

### Known Bottlenecks

1. **`runMigrations()` on every webhook cold start:** Each incoming WhatsApp message that hits a cold server triggers the ENTIRE migration script (670 lines, 3 retries at 2s/4s/6s exponential backoff). Uses a `migrationsPromise` lock so it only runs once per cold start, but adds ~12s startup time on first request.

2. **Synchronous pipeline:** Messages processed sequentially. Complex booking flow: classify (300ms-3s if AI) → validate → handle → WhatsApp API call (200-1000ms) → save DB → save session. On Vercel Pro (60s timeout), this is manageable. On Hobby (10s), it risks timeout.

3. **No message queue:** Every webhook requires serial processing of normalize → classify → validate → handle → WhatsApp API → DB write → session save. No parallelization, no batching.

4. **WhatsApp API latency:** 200-1000ms per `sendText`/`sendButtons` outbound call. A booking confirmation flow makes 1-2 calls. A doctor viewing chit media with 5 items makes 5+ calls.

### Expensive Operations

| Operation | Cost | Mitigation |
|-----------|------|------------|
| `GET /api/dashboard/stats` | Full table scan + aggregation | 120s in-memory cache |
| Patient search with `ILIKE %q%` | Sequential scan without trigram | pg_trgm GIN indexes mitigate |
| Prescription PDF generation | pdfkit document creation (100-500ms) | R2 caching (7-day) |
| Compiled document generation | PDF merge (potentially slow with many attachments) | R2 caching (7-day) |
| Calendar slot calculation | Booking slots per day × 30 days | Indefinite cache (never invalidated) |

### Database Concerns

- **Connection pool:** `postgres` client with `max: 5`. Neon free tier supports this.
- **No connection pooling for serverless:** Using raw `postgres` (not `@neondatabase/serverless` with HTTP pooler). Each cold start creates a TCP connection.
- **30s keepalive pings:** Prevents Neon compute auto-pause but generates constant no-op traffic.
- **No migration tracking table:** `runMigrations()` runs the entire migration script on every cold start. No incremental migration support.
- **Unbounded `dataCache`:** No entry limit — could grow under load with different query parameters.

### Caching Architecture

| Cache | Mechanism | TTL | Entries | Invalidation |
|-------|-----------|-----|---------|-------------|
| Session | In-memory LfuMap | 30 min | 500 | On session update |
| Stats API | In-memory Map (keyed by period) | 120s | Unbounded | Time-based |
| Patient detail | In-memory Map | 60s | Unbounded | Time-based |
| Patient messages | In-memory Map | 30s | Unbounded | Time-based |
| Calendar | In-memory Map | Indefinite | Unbounded | None |
| Prescription PDF | R2 (presigned URL) | 7 days | Unlimited | On settings change |
| Compiled document | R2 (presigned URL) | 7 days | Unlimited | On settings/name change |

**Critical gap:** Calendar cache has NO invalidation. Blocking a date won't be reflected until server restart.

### Webhook Latency

- Webhook responds `200` immediately but awaits pipeline completion.
- Vercel Hobby (10s timeout): Long pipelines could timeout, causing Meta to retry.
- Vercel Pro (60s timeout): Adequate for current volume.

### Scalability Limits

| Constraint | Limit | Notes |
|------------|-------|-------|
| Webhook rate (per instance) | 60 req/min | ~1 msg/sec sustained |
| Session cache | 500 entries | ~500 concurrent conversations |
| DB connections | 5 (pool) | Neon free tier limit |
| Vercel function timeout | 10s (Hobby) / 60s (Pro) | Long pipelines may fail |
| In-memory rate limiter | Per-instance | Ineffective at scale |

---

## 13. Technical Debt

| # | Item | Severity | Risk | File(s) | Suggested Fix |
|---|------|----------|------|---------|---------------|
| 1 | **Monolithic handlers.js (~95KB, ~2400 lines)** | CRITICAL | Impossible to test, high merge conflict risk, low maintainability, single-file bottleneck | `src/lib/handlers.js` | Split by domain: `booking.js`, `doctor.js`, `receptionist.js`, `feedback.js`, `corrections.js`, `common.js` |
| 2 | **Inline migrations in pool.js (no tracking)** | CRITICAL | Entire migration runs on every cold start, no rollbacks, no version tracking, 3-retry adds 12s latency | `src/db/pool.js` | Extract to `migrations/` directory with versioned files. Add `_migrations` tracking table. Use `node-pg-migrate` or `umzug` |
| 3 | **JavaScript (no TypeScript)** | HIGH | Zero type safety across 216 files, refactoring is high-risk, runtime errors from undefined/null, no IDE autocompletion for API contracts | All 216 files | `// @ts-check` with JSDoc types on critical paths first, then `.mjs` → `.ts` for API routes |
| 4 | **No test coverage (6 unit tests)** | HIGH | Booking flow, reschedule, cancellation, state machine, handlers have zero tests. Only auth, failure-paths, sanitize, rate-limit tested | `tests/unit/` | Unit test: `transitions.js`, `validators.js`, `entities.js`, `overwrite-policy.js`. Integration test: `engine.js` with mock WhatsApp API |
| 5 | **No message queue** | HIGH | Message loss on any pipeline failure. No retry mechanism. DB saves are fire-and-forget. No dead-letter handling | `src/lib/engine.js` | Add Bull + Vercel Redis. Save webhook payload to work queue → process asynchronously with retries |
| 6 | **Shadow logs empty (Gemini 429)** | HIGH | Zero AI evaluation data after weeks. Cannot iterate on AI without data | `src/lib/ai/gemini.js` | Upgrade Gemini API key to paid tier. Add retry + backoff for shadow mode |
| 7 | **No log aggregation / error tracking** | MEDIUM | stdout-only logging, no search, no alerting, no production error visibility | `src/lib/logger.js` | Add Axiom/BetterStack free tier log drain. Add Sentry free tier error tracking |
| 8 | **Per-instance rate limiter** | MEDIUM | Ineffective on Vercel (multiple instances). Effective limit = configured × instances | `src/lib/rateLimit.js` | Use Vercel KV (Redis) or a centralized rate limiter |
| 9 | **Unbounded dataCache** | MEDIUM | Stats + calendar caches have no entry limits. Could grow unbounded under varied query parameters | `src/lib/dataCache.js` | Add LRU eviction or TTL-based cleanup |
| 10 | **No TypeScript config** | MEDIUM | No `tsconfig.json`, no type checking at all, no path alias resolution for TS | None | Add `tsconfig.json` with `paths` matching `jsconfig.json`. Enable `checkJs: false` initially |
| 11 | **JWT key = DASHBOARD_PASSWORD** | MEDIUM | Password change = all tokens invalidated. Token is 12h with no refresh | `src/lib/auth.js` | Acceptable for MVP. Document that password changes invalidate sessions |
| 12 | **CSRF cookie on Vercel multi-region** | LOW | Origin-tied cookies may not replicate across regions. CSRF fallback to token-header comparison may fail | `src/lib/apiAuth.js` | Test with Vercel multi-region. Consider SameSite=Strict as primary CSRF defense |
| 13 | **No React ErrorBoundary** | LOW | Any uncaught React error shows white screen | Dashboard pages | Add `<ErrorBoundary>` at dashboard layout level |
| 14 | **Hardcoded DO_NOT_MATCH_KEYS in settings** | LOW | Settings blocklist is hardcoded. Some keys can never be updated via API | `src/app/api/dashboard/settings/route.js` | Move to env var or config |
| 15 | **Dead code path: alphabetSlices** | LOW | Referenced in handlers.js but not defined — would throw ReferenceError if reached | `src/lib/handlers.js` | Investigate and either implement or remove |

---

## 14. Bugs & Open Issues

### Known Bugs

| # | Bug | Environment | Impact | Root Cause |
|---|-----|-------------|--------|------------|
| 1 | **`isDateBlocked` uses UTC midnight** | Production | Blocked dates may drift ±1 day in Indian timezone | `blockedDateRepository.js` — no timezone normalization |
| 2 | **SSE streams silently close after 15s** | Dashboard | Real-time notification updates stop working until page refresh | No reconnection logic in NotificationPanel.js |
| 3 | **Media upload >10MB fails with no user feedback** | Dashboard | Returns 413 with no toast/error shown to user | Upload component doesn't handle error responses |
| 4 | **Stats revenueChange/visitsChange divide by zero** | Dashboard | Stats page crashes if previous period has zero revenue/visits | `stats/route.js` — no guard against zero denominator |
| 5 | **`alphabetSlices` is not defined** | Codebase | Would throw ReferenceError if code path is reached | `handlers.js` line near 1291 — undefined variable in scope |
| 6 | **Shadow logs table always empty** | Production | Zero AI evaluation data. Shadow mode has never produced a single record | Gemini free tier API key returns 429 on every call |

### Edge Cases

| # | Scenario | Risk | Details |
|---|----------|------|---------|
| 1 | **Concurrent booking from same wa_id** | MEDIUM | Two messages processed simultaneously could create duplicate appointments. No pessimistic locking at wa_id level. Partial unique index only prevents duplicate time slots, not duplicate patients |
| 2 | **Message loss between markAsRead and pipeline completion** | MEDIUM | If Vercel kills the function between `markAsRead()` and `createMessage()`, the message is marked read but never processed. User won't get a response. Meta retries for 24h, but `isDuplicate()` may find the msg_id in memory only (lost on instance restart) |
| 3 | **Neon compute auto-pause during webhook** | MEDIUM | First request after idle period (typically 5min on free tier) must wait for Neon to resume. Keepalive at 30s prevents this, but if keepalive function is on a different instance than the webhook, the webhook still hits cold Neon |
| 4 | **Vercel cold start + Neon cold start simultaneously** | HIGH | Webhook could timeout (10s on Hobby) while waiting for both Node.js module compilation and Neon compute startup. The 3-retry migration adds another 12s |
| 5 | **WhatsApp template rejection** | LOW | Meta may reject unregistered or poorly formatted template messages. Templates are registered but not verified as current |
| 6 | **Patient phone deduplication** | LOW | `normalizePhone()` strips formatting but duplicate country codes may still slip through. Two patients with the same 10-digit number but different country codes would be treated as separate |

### Reliability Concerns

- **No webhook delivery guarantee:** The engine processes messages synchronously. If the Vercel function is killed mid-pipeline (e.g., timeout, OOM, instance recycling), the partial work is lost. Meta's retry mechanism will resend, but `isDuplicate()` check is in-memory + DB. If DB write happened before the crash, the message is marked as processed but no bot reply was sent.

- **Fire-and-forget DB writes:** Nearly all `createMessage()` and `save()` calls use `.catch(err => logger.error(...))`. A DB failure is logged but never surfaced. The system continues as if the write succeeded.

- **No health check with diagnostics:** The health endpoint (`/api/dashboard/health`) only checks DB connectivity with `SELECT 1`. It doesn't verify WhatsApp API connectivity, R2 access, session cache status, or migration state.

### Operational Concerns

- No error tracking (Sentry/Rollback)
- No uptime monitoring
- No memory/heap monitoring on Vercel
- No log retention policy (Vercel keeps logs for 24h on Hobby, 7d on Pro)
- No backup verification (Neon auto-backup exists but hasn't been tested)
- No SSH access to production

---

## 15. Production Readiness Assessment

| Area | Score | Reasoning |
|------|-------|-----------|
| **Architecture** | 8/10 | Clean pipeline design, good separation of concerns, single completion path. Deductions for no message queue and monolithic handlers.js |
| **Reliability** | 4/10 | No message queue = message loss on failure. DB saves are fire-and-forget. No error tracking. No health monitoring. Shadow logs empty (can't evaluate AI) |
| **Security** | 3/10 | `admin123` password. No webhook signature verification. No RBAC. Secrets in `.env.local` plaintext. Per-instance rate limiting |
| **Scalability** | 5/10 | Per-instance rate limiter. Session cache (500 entries) adequate for single clinic. DB pool (5 connections) is hard limit. Vercel scaling handles throughput but infra doesn't |
| **Maintainability** | 4/10 | JavaScript (no types). Monolithic handlers.js. Inline migrations. No test coverage. 44 docs files in /docs/ (some outdated) |
| **Observability** | 3/10 | JSON stdout only. No aggregation. No metrics. No tracing. No error tracking. Vercel log viewer is the only tool |
| **AI Readiness** | 5/10 | Good abstraction design. Functional fallback. But: shadow logs empty, Gemini API unfunded, no prompt versioning, no evaluation pipeline |

### Overall: 4.6/10

The system works today because the WhatsApp volume is low (single clinic, single doctor). The architecture is well-designed for its stage. The security and reliability gaps prevent it from being production-grade for any multi-clinic or high-volume scenario.

---

## 16. Roadmap

### Next 10 Highest Impact Tasks

| # | Task | Why It Matters | Complexity | Dependencies | Expected Impact |
|---|------|---------------|------------|--------------|-----------------|
| 1 | **Fix Gemini API key (paid tier)** | Shadow logs are empty — zero AI evaluation data after weeks. Cannot iterate on AI without data | Low (~$5/mo) | Budget approval | Enables AI evaluation → data-driven confidence to go live |
| 2 | **Add webhook signature verification** | Anyone can POST to webhook URL. Currently wide open. Meta sends `X-Hub-Signature-256` | Low (1 file, 20 lines) | None | Closes critical security hole |
| 3 | **Replace DASHBOARD_PASSWORD with proper auth** | `admin123` is unacceptable. Add bcrypt password hashing with env var | Medium (2 files) | None | Eliminates weakest security link |
| 4 | **Split handlers.js into domain modules** | 2400-line file is a maintenance catastrophe. Split → booking, doctor, receptionist, feedback, common | Medium (1 file → 6 files) | None | Enables unit testing, reduces merge conflict risk |
| 5 | **Add message queue for webhook** | Current synchronous pipeline loses messages on failure. Add Bull + Vercel Redis | High (new dependency) | Vercel Redis add-on ($0.50/mo) | Eliminates message loss. Enables retries |
| 6 | **Write unit tests for core modules** | transitions.js, validators.js, entities.js, overwrite-policy.js are pure functions and testable | Low (4 test files) | None | Catches regression bugs in critical path |
| 7 | **Add DB migration tracking** | `runMigrations()` reruns full script on every cold start. Add `_migrations` table + version check | Medium (pool.js rewrite) | None | Cuts cold start time by 12s |
| 8 | **Add Sentry error tracking** | No visibility into production errors. Sentry free tier supports Next.js | Low (1 dependency) | None | Enables debugging production issues |
| 9 | **Add request ID tracing** | Can't correlate webhook → pipeline → DB → WhatsApp API calls | Medium (middleware) | None | Enables end-to-end production debugging |
| 10 | **Add Vercel KV rate limiting** | Replace in-memory limiter with distributed Redis-based enforcement | Medium | Vercel KV add-on | Effective rate limiting at any scale |

### Next 30 Days

**Week 1-2 (Security + Data):**
- Fix Gemini API key → enable shadow evaluation
- Add webhook signature verification (close critical security hole)
- Replace `admin123` with bcrypt-hashed password from env var
- Add Sentry error tracking

**Week 2-3 (Maintainability):**
- Split handlers.js into 6 domain modules
- Write unit tests: transitions.js, validators.js, entities.js
- Add `_migrations` tracking table → cut cold start time

**Week 3-4 (Observability + Infra):**
- Implement request ID tracing (UUID per webhook request, threaded through all logs)
- Add distributed rate limiting via Vercel KV
- Add dataCache LRU eviction (prevent unbounded growth)

### Next 90 Days

**Month 2:**
- Add message queue (Bull + Vercel Redis)
- Write integration tests for full booking flow (engine.js with mock WhatsApp API)
- Implement webhook event logging for replay/debug
- Migrate prescription PDFs to versioned R2 keys (enable rollback)
- Add backup verification script (test Neon restore)

**Month 3:**
- TypeScript migration: API routes first (41 files), then repositories, then components
- Add RBAC: doctor role (read clinical) vs receptionist (read financial) vs admin (full)
- Build AI evaluation dashboard using shadow_logs data
- Add rate limit monitoring dashboard

---

## 17. AI Opportunities

### Assumptions
- Local Ollama server with Qwen2.5-Coder (7B), Llama3.2 (3B), Nomic Embed Text
- Open WebUI for prompt management and versioning
- Tailscale for secure network access to local LLM
- Budget: effectively zero (existing hardware)

### Deterministic Workflows (NO AI — Keep as-is)

These must NEVER involve AI. They are safety-critical or require absolute precision:

1. **State machine transitions** (`transitions.js`) — every transition validated against whitelist
2. **Slot conflict prevention** — partial unique index `idx_appointments_unique_slot`
3. **Payment recording** — idempotency keys prevent duplicates
4. **Session persistence** — in-memory cache + DB upsert
5. **Webhook verification** — standard Meta handshake
6. **CSRF validation** — cryptographic token comparison
7. **Rate limiting** — algorithmic enforcement
8. **JWT authentication** — HMAC-SHA256 verification
9. **PDF generation** — deterministic document rendering (pdfkit)
10. **Media upload** — direct to R2 via S3 SDK
11. **Database migrations** — sequential, versioned SQL
12. **WhatsApp API calls** — REST calls to Meta Graph API

### AI-Assisted Workflows (Can be safely introduced)

| # | Opportunity | Business Value | Technical Design | Required Changes | Risks | Safety Mechanism |
|---|-------------|---------------|------------------|------------------|-------|------------------|
| 1 | **AI entity extraction** (replace regex validators) | Better date/time/treatment parsing for complex inputs like "next Monday after 3pm" | Replace `extractEntities()` with dual-path: run regex AND Ollama (Qwen2.5) in parallel. Prefer AI result on confidence >0.85. Same interface (`{ date, time, treatment, phone }`) | Add Ollama HTTP client in `src/lib/ai/ollama.js`. Add Nomic Embed for RAG (treatments, dates). Update `entities.js` to call AI path | LLM latency (500ms-2s on local). Hallucinated dates/times | Regex fallback always available. Never hallucinates a treatment not in the clinic list |
| 2 | **AI intent classification** (replace Gemini) | Replace unfunded Gemini with local Llama3.2 — zero API costs, no quotas | New provider `src/lib/ai/ollama.js` implementing `classify(request)`. Same contract as Gemini. Prompt optimization via Open WebUI. Shadow mode at 100% (not 5%) | Implement Ollama provider. Update `index.js` to support Ollama. Add prompt templates to Open WebUI | Lower accuracy than Gemini for complex intents (Llama3.2 3B vs Gemini 2.5 Flash) | Continue running in shadow mode until agreement rate >90%. Rule fallback always active |
| 3 | **AI correction detection** | Catch more correction patterns than regex (e.g., "I actually wanted RCT, not cleaning") | Replace `correction-detector.js` regex with Nomic Embed similarity search. Compare user message against correction intent embeddings. Threshold-based classification | Add Nomic Embed client + embedding column to sessions (or compute on-the-fly). Keep regex patterns as hard fallback | Over-classification of corrections (false positives) | Regex fallback. Correction never applied automatically — always requires explicit user confirm |
| 4 | **Duplicate patient detection** | Prevent duplicate patient records from different phone numbers | On new patient creation, compute Nomic Embed of patient name, cosine-similarity search against existing patient embeddings. Show warning on dashboard if similarity >0.9 | Add `name_embedding` vector column to patients table. Hook into `POST /api/dashboard/patients`. Query with approximate nearest neighbor | False positives (different patients with similar names) | Non-blocking suggestion. Receptionist makes final decision |
| 5 | **AI follow-up instructions** | Auto-generate post-treatment instructions based on treatment + diagnosis | Qwen2.5 generates structured instructions from template. "AI-generated, review required" label. Doctor approves before adding to appointment | Add to `POST /api/dashboard/visit` flow. Store as `follow_up_instructions` with `ai_generated` flag | Hallucinated medical advice (wrong aftercare for procedure) | Mandatory human review. Flag stored in DB for audit |
| 6 | **Smart reschedule suggestions** | When doctor needs to reschedule, suggest best alternative slots based on patient history + treatment duration | Llama3.2 analyzes: visit history, treatment type (RCT=60min, cleaning=30min), patient location, past preferences. Returns 3 best slots | Add to reschedule flow in dashboard. New `GET /api/dashboard/appointments/[id]/suggest-slots?ai=true` | Complex integration. Modest value for single-clinic | Slot suggestions are non-binding. Receptionist picks |
| 7 | **Message summarization** (doctor-facing) | When manual mode forwards patient messages, show AI summary for context | Llama3.2 summarizes last N messages from a patient into 2-3 bullet points. Attached to forwarded message | Add to `handlers.js` manual mode flow. Async, non-blocking (summary appended after send) | Trivial — doctor reads full messages anyway. Summary is a convenience | Doctor always sees full message history alongside summary |

### Architecture for AI Integration

```
WhatsApp
    │
    ▼
┌── engine.js ────────────────────────────────────────────────────────┐
│                                                                      │
│  classifyWithFallback()                                              │
│    ├─ interactiveId? → rule (always, confidence=1.0)                 │
│    ├─ AI configured? → Ollama/Llama3.2 (100% shadow or prod)         │
│    │   ├─ AI confidence >= threshold? → use AI result                 │
│    │   └─ AI fails/times out/low confidence? → rule fallback          │
│    └─ no AI? → rule (always)                                         │
│                                                                      │
│  extractEntities()                                                   │
│    ├─ AI path: Ollama/Qwen2.5 + Nomic Embed RAG                     │
│    └─ Regex path: existing validators (always available)              │
│                                                                      │
│  detectCorrection()                                                  │
│    ├─ AI path: Nomic Embed similarity against correction intents     │
│    └─ Regex path: existing pattern matching (always available)        │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

**Key principle:** AI is always run as an overlay on deterministic logic. The deterministic path must ALWAYS produce a valid result. AI results are advisory or used only when confidence exceeds threshold.

---

## 18. Final Assessment

### What I Would Keep

1. **Engine architecture** (`engine.js`) — the pipeline is clean, well-documented, and correct. The classify → session → handle → reply flow is exactly right.
2. **Provider abstraction** (`src/lib/ai/`) — the `AIRequest`/`AIResponse` contract, confidence thresholds, risk levels, and shadow mode design are production-quality.
3. **State machine** (`states.js` + `transitions.js`) — explicit transition whitelist is the right approach. No ambiguous states. Easy to audit.
4. **Tooth grid + diagnosis panel** — the dental-specific features (FDI notation, surface diagrams, severity shading, status dots) are the product's differentiator. These are well-implemented with clean SVG rendering.
5. **Single completion path** (`POST /api/dashboard/visit`) — the cleanest piece of business logic in the codebase. Quick checkout, walk-in, and visit edit all flow through the same endpoint.
6. **Versioned appointment model** (`logical_id` + `version` + supersede) — proper event sourcing for reschedules. Prevents the classic "lost update" problem.
7. **Session cache + DB dual-write** — pragmatic performance optimization with optimistic locking.
8. **Partial unique index for slot conflicts** — `idx_appointments_unique_slot` is the right solution for preventing double-booking.
9. **Correction detection + overwrite policy** — well-designed guardrails for conversational booking corrections.

### What I Would Rewrite

1. **`handlers.js` (~2400 lines)** — not rewrite, but split into at least 6 files: `booking.js`, `doctor.js`, `receptionist.js`, `feedback.js`, `corrections.js`, `common.js`. This is the highest-priority refactor.

2. **`pool.js` migrations** — full rewrite. Extract to proper migration files with `_migrations` tracking table, version stamps, `down` migrations for rollback. The current approach is untestable and slow.

3. **Rate limiter** — rewrite to use Vercel KV (Redis) for distributed enforcement. The current in-memory approach is ineffective at scale.

4. **Authentication** — replace `DASHBOARD_PASSWORD` with bcrypt + sessions or short-lived JWT with refresh token. Add webhook signature verification (`X-Hub-Signature-256`).

5. **Logging** — replace `JSON.stringify` stdout with structured logging to a service (Axiom/BetterStack free tier). Add request IDs.

### What I Would Prioritize First

**Day 1-3 (Security):**
- Webhook signature verification — closes the biggest external attack surface
- Replace `admin123` — closes the biggest internal attack surface
- Fix Gemini API key — enables AI evaluation (or decide to abandon AI)

**Week 2 (Reliability):**
- Add Sentry error tracking — enables production debugging
- Add DB migration tracking — cuts cold start latency by 12s
- Add request ID tracing — enables end-to-end debugging

**Week 3-4 (Maintainability):**
- Split handlers.js — enables testing, reduces risk
- Write unit tests for transitions.js, validators.js, entities.js — catches regression bugs
- Add Vercel KV rate limiting — enables effective rate enforcement

**Month 2 (Resilience):**
- Add message queue (Bull + Vercel Redis) — eliminates message loss
- Write integration tests for full booking flow
- Test Neon backup restoration

**Month 3 (Scale):**
- TypeScript migration for API routes (41 files)
- Add RBAC (doctor/receptionist/admin roles with permission checks)
- Build AI evaluation dashboard

### Brutely Honest Assessment

This is a **well-designed MVP** built by someone who understood the domain deeply. The architecture is better than most production systems I've seen from early-stage products. The security gaps are the result of "it works for a single clinic" trade-offs, not incompetence.

The biggest existential risk is not the code quality (which is good for JavaScript) — it's the **lack of tests, lack of error tracking, and lack of message delivery guarantees.** If this system goes down during a busy clinic day, the receptionist can't book appointments, the doctor can't see the queue, and patients don't get reminders. There is no fallback.

The AI strategy is correct: **deterministic by default, AI as optional enhancement, shadow mode before production.** The empty shadow_logs table is unfortunate but the design is right. Do not rush AI into production without data.

The most impressive piece of engineering is the **ToothGrid + PerToothDiagnosisPanel** combination. Full FDI notation, 4 tooth-type-aware SVGs, surface-level diagrams adapted per tooth type, severity shading, status overlays, treatment labels — this is a genuinely differentiated product feature that most dental PMS systems don't have.

**If I were taking over this codebase tomorrow, I would spend the first week exclusively on security and reliability. Everything else can wait.**
