# Complete Architectural Audit: clinic-bot

---

## 1. Project Overview

**Goal:** Build an AI-powered WhatsApp receptionist for a dental clinic (Shri Balaji Dental Clinic) that can autonomously handle appointment booking, rescheduling, cancellation, reminders, and patient communication via WhatsApp — with a web dashboard for clinic staff.

**Problem solved:** Manual phone-based appointment scheduling is labor-intensive for small clinics. This automates the entire patient communication loop over WhatsApp.

**Current stage:** Late MVP / Early production. The bot has been battle-tested with real patients (there is a replay test suite in `scripts/replay.js` and production-sourced replay files in `data/replays/`). However, it is single-tenant (one clinic hardcoded in `src/config/clinic.js`), has no LLM-based conversation understanding, and has committed `.env.local` with live credentials.

**High-level architecture:**

```
WhatsApp Cloud API
        ↕ (webhook + send API)
  ┌──────────────────┐
  │  Webhook Route   │  src/app/api/webhook/whatsapp/route.js
  │  (GET verify,    │
  │   POST messages) │
  └────────┬─────────┘
           │ async, returns 200 immediately
           ▼
  ┌──────────────────┐
  │   Engine (core)  │  src/lib/engine.js
  │                  │
  │  1. classifyEvent│
  │  2. deduplicate  │
  │  3. load/init    │
  │  4. classifyIntent│
  │  5. extractEntities│
  │  6. detectCorrection│
  │  7. evaluateOverwrite│
  │  8. handle       │
  │  9. save session │
  │ 10. respond      │
  └────────┬─────────┘
           ▼
  ┌──────────────────┐
  │   Handler(s)     │  src/lib/handlers.js (~8,000+ lines)
  │   State machine  │
  │   40+ states     │
  └────────┬─────────┘
           ▼
  ┌──────────────────┐
  │ External Systems │
  │                  │
  │ • Postgres/Neon  │  src/db/
  │ • Cloudflare R2  │  src/lib/r2.js
  │ • OpenAI Whisper │  src/lib/transcriber.js
  │ • WhatsApp API   │  src/lib/whatsapp.js
  └──────────────────┘
           ▲
  ┌──────────────────┐
  │  Dashboard       │  src/app/dashboard/
  │  (Next.js pages) │  11 pages + 30 API routes
  │  JWT auth        │  src/middleware.js + src/lib/auth.js
  └──────────────────┘
```

---

## 2. Repository Structure

```
clinic-bot/
├── .env.example                  # Example env vars (no secrets)
├── .env.local                    # COMMITTED — live production secrets!
├── package.json                  # Next.js 16.2.1 + deps
├── next.config.mjs               # Next config
├── postcss.config.mjs            # PostCSS/Tailwind
├── tailwind.config.mjs           # Tailwind config
│
├── src/
│   ├── app/                      # Next.js App Router
│   │   ├── layout.js             # Root layout — env validation on init
│   │   ├── page.js               # Redirects to /dashboard/login
│   │   ├── globals.css           # Global styles + dark mode
│   │   │
│   │   ├── api/
│   │   │   ├── webhook/
│   │   │   │   └── whatsapp/
│   │   │   │       └── route.js  # WhatsApp webhook entry point
│   │   │   │
│   │   │   ├── cron/
│   │   │   │   ├── reminders/route.js
│   │   │   │   ├── feedback/route.js
│   │   │   │   ├── due-reminders/route.js
│   │   │   │   ├── evening-checkin/route.js
│   │   │   │   └── daily-summary/route.js
│   │   │   │
│   │   │   └── dashboard/
│   │   │       ├── login/route.js
│   │   │       ├── logout/route.js
│   │   │       ├── health/route.js
│   │   │       ├── appointments/route.js             # GET (list), POST (create)
│   │   │       ├── appointments/[id]/route.js        # GET, PATCH
│   │   │       ├── appointments/[id]/cancel/route.js  # POST
│   │   │       ├── appointments/[id]/reschedule/route.js
│   │   │       ├── appointments/bulk/route.js
│   │   │       ├── calendar/route.js
│   │   │       ├── stats/route.js
│   │   │       ├── patients/route.js                 # GET (list), POST (create)
│   │   │       ├── patients/search/route.js
│   │   │       ├── patients/[id]/route.js
│   │   │       ├── patients/[id]/messages/route.js
│   │   │       ├── patients/[id]/messages/stream/route.js
│   │   │       ├── patients/[id]/medical-history/route.js
│   │   │       ├── patients/[id]/family/route.js
│   │   │       ├── patients/[id]/send-message/route.js
│   │   │       ├── patients/[id]/chat-mode/route.js
│   │   │       ├── notifications/route.js
│   │   │       ├── schedule/route.js
│   │   │       ├── due-reminders/route.js
│   │   │       ├── visit/route.js
│   │   │       ├── visits/[id]/prescription/route.js
│   │   │       ├── feedback/route.js
│   │   │       ├── feedback/[id]/contact/route.js
│   │   │       ├── media/route.js
│   │   │       ├── media/signed/route.js
│   │   │       ├── send-whatsapp/route.js
│   │   │       └── arrival/route.js
│   │   │
│   │   └── dashboard/            # React pages
│   │       ├── login/page.js
│   │       ├── layout.js         # Shared sidebar, theme, toast, date context
│   │       ├── page.js           # Main dashboard with calendar + slot grid + stats
│   │       ├── appointments/page.js
│   │       ├── patients/page.js
│   │       ├── patients/[id]/page.js
│   │       ├── queue/page.js
│   │       ├── stats/page.js
│   │       ├── visit/page.js
│   │       ├── feedback/page.js
│   │       ├── schedule/page.js
│   │       └── due-reminders/page.js
│   │
│   ├── components/               # React components
│   │   ├── Calendar.js
│   │   ├── NotificationPanel.js
│   │   ├── SessionList.js
│   │   └── MessageLog.js
│   │
│   ├── lib/
│   │   ├── engine.js             # Core pipeline orchestrator
│   │   ├── router.js             # Intent classification (keyword/regex)
│   │   ├── handlers.js           # ~8,000+ line state handler
│   │   ├── transitions.js        # State transition validation
│   │   ├── overwrite-policy.js   # Booking field overwrite rules
│   │   ├── correction-detector.js# User correction detection
│   │   ├── states.js             # State constants (40+)
│   │   ├── intents.js            # Intent constants
│   │   ├── session.js            # Session management (cache + DB)
│   │   ├── messageEvents.js      # Server-sent events for live messaging
│   │   ├── whatsapp.js           # WhatsApp Cloud API client
│   │   ├── media.js              # WhatsApp media download
│   │   ├── transcriber.js        # OpenAI Whisper audio transcription
│   │   ├── deduplicate.js        # Message deduplication
│   │   ├── rateLimit.js          # In-memory rate limiting
│   │   ├── auth.js               # JWT (custom, no library)
│   │   ├── apiAuth.js            # CSRF, rate limit, body size, sanitize
│   │   ├── sanitize.js           # XSS sanitization
│   │   ├── logger.js             # Structured logging
│   │   ├── r2.js                 # Cloudflare R2 client
│   │   ├── validators.js         # Entity extraction (regex)
│   │   ├── entities.js           # Entity helpers
│   │   ├── treatments.js         # Treatment name constants
│   │   ├── date.js               # Date utility functions
│   │   └── envValidate.js        # Environment validation
│   │
│   ├── config/
│   │   ├── clinic.js             # Single clinic configuration
│   │   ├── intents.js            # Intent patterns + handlers
│   │   ├── states.js             # State flow configuration
│   │   ├── translations.js       # EN/HI translations
│   │   └── templates.js          # WhatsApp template definitions
│   │
│   ├── db/
│   │   ├── pool.js               # Neon serverless connection + circuit breaker + retry
│   │   ├── migrations/
│   │   │   └── 001_core.sql      # Core schema
│   │   └── repositories/
│   │       ├── sessionRepository.js
│   │       ├── appointmentRepository.js
│   │       ├── patientRepository.js
│   │       ├── feedbackRepository.js
│   │       ├── messageRepository.js
│   │       └── blockedDateRepository.js
│   │
│   └── middleware.js             # Dashboard route JWT protection
│
├── scripts/
│   ├── replay.js                 # Replay test runner
│   └── searchDups.js             # Duplicate search utility
│
├── data/
│   └── replays/                  # Production replay test data
│
├── public/                       # Static assets
│
└── docs/                         # 28+ markdown documents
    ├── architecture.md
    ├── features.md
    ├── agentic/
    ├── audit/
    ├── dashboards/
    ├── database/
    ├── deployment/
    ├── monorepo/
    └── payments.md
```

### Key module dependencies:

```
webhook/route.js
  → engine.js
    → deduplicate.js
    → session.js → sessionRepository.js
    → router.js
    → validators.js
    → correction-detector.js
    → overwrite-policy.js
    → handlers.js → (whatsapp.js, appointmentRepository.js, r2.js, etc.)
    → messageEvents.js

dashboard routes
  → apiAuth.js (CSRF, rate limit, body size)
  → auth.js (JWT)
  → pool.js
  → repositories/*
  → whatsapp.js (for manual send)
  → session.js (for manual mode)
```

---

## 3. Feature Inventory

### Implemented Features

| # | Feature | Entry Point | Key Files | Status | Missing Pieces |
|---|---------|-------------|-----------|--------|----------------|
| 1 | **WhatsApp webhook ingestion** | `src/app/api/webhook/whatsapp/route.js:12-38` | `route.js` | Complete | — |
| 2 | **Message deduplication** | `engine.js` → `deduplicate.js` | `deduplicate.js` | Complete | In-memory only; resets on restart |
| 3 | **Session management** | `engine.js` → `session.js` | `session.js`, `sessionRepository.js` | Complete | 500-entry cache limit; no TTL-based eviction logging |
| 4 | **Intent classification (keyword)** | `engine.js` → `router.js` | `router.js`, `config/intents.js` | Complete | No NLP/LLM — purely regex |
| 5 | **Entity extraction** | `engine.js` → `validators.js` | `validators.js` | Complete | Regex-based; misses edge cases |
| 6 | **Correction detection** | `engine.js` → `correction-detector.js` | `correction-detector.js` | Complete | Limited to known patterns |
| 7 | **State machine** | `engine.js` → `transitions.js` | `states.js`, `transitions.js`, `handlers.js` | Complete | 40 states, well-defined |
| 8 | **Appointment booking** | `handlers.js` → `bookAppointment()` | `handlers.js` (BOOKING states) | Complete | No multi-provider scheduling |
| 9 | **Appointment rescheduling** | `handlers.js` → RESCHEDULE states | `handlers.js` | Complete | — |
| 10 | **Appointment cancellation** | `handlers.js` → CANCEL state | `handlers.js`, `cancelAppointment()` | Complete | — |
| 11 | **Check available slots** | `handlers.js` → CHECK_SLOTS | `handlers.js`, `appointmentRepository.js` | Complete | — |
| 12 | **Send WhatsApp text messages** | `whatsapp.js` → `sendText()` | `whatsapp.js:8-43` | Complete | — |
| 13 | **Send WhatsApp buttons** | `whatsapp.js` → `sendButtons()` | `whatsapp.js:45-97` | Complete | — |
| 14 | **Send WhatsApp lists** | `whatsapp.js` → `sendList()` | `whatsapp.js:99-155` | Complete | — |
| 15 | **Send WhatsApp templates** | `whatsapp.js` → `sendTemplate()` | `whatsapp.js:157-216` | Complete | — |
| 16 | **Audio transcription (Whisper)** | `engine.js` → `transcriber.js` | `transcriber.js` | Complete | OpenAI API dependency |
| 17 | **Media download from WhatsApp** | `engine.js` → `media.js` | `media.js` | Complete | — |
| 18 | **Media upload to R2** | `handlers.js` → `r2.js` | `r2.js` | Complete | — |
| 19 | **Bilingual support (EN/HI)** | `translations.js` | `config/translations.js` | Complete | Hardcoded; not data-driven |
| 20 | **Manual mode (human takeover)** | `session.js` → manualMode | `session.js:100-130`, `handlers.js` | Complete | 24h auto-release; no explicit handoff protocol |
| 21 | **Rate limiting** | Various → `rateLimit.js` | `rateLimit.js` | Complete | In-memory; resets on restart |
| 22 | **Dashboard login** | `src/app/dashboard/login/page.js` | `login/route.js`, `auth.js` | Complete | Single password (no user management) |
| 23 | **Appointment listing (dashboard)** | `appointments/route.js` (GET) | `route.js` | Complete | — |
| 24 | **Quick book (dashboard)** | `appointments/route.js` (POST) | `route.js` | Complete | — |
| 25 | **Bulk actions (complete/cancel all)** | `appointments/bulk/route.js` | `route.js` | Complete | No notification to patients |
| 26 | **Patient management** | `patients/*/route.js` | Patient routes | Complete | — |
| 27 | **Send message from dashboard** | `patients/[id]/send-message/route.js` | `route.js` | Complete | — |
| 28 | **Live message streaming** | `patients/[id]/messages/stream/route.js` | `route.js`, `messageEvents.js` | Complete | SSE-based |
| 29 | **Chat mode toggle** | `patients/[id]/chat-mode/route.js` | `route.js` | Complete | — |
| 30 | **Medical history** | `patients/[id]/medical-history/route.js` | `route.js` | Complete | — |
| 31 | **Family management** | `patients/[id]/family/route.js` | `route.js` | Complete | — |
| 32 | **Visit logging** | `visit/route.js` | `route.js` | Complete | — |
| 33 | **Prescription management** | `visits/[id]/prescription/route.js` | `route.js` | Complete | — |
| 34 | **Feedback collection & listing** | `cron/feedback/route.js`, `feedback/route.js` | Feedback routes | Complete | — |
| 35 | **Appointment reminders (cron)** | `cron/reminders/route.js` | `route.js` | Complete | Single reminder before appt |
| 36 | **Due reminders (cron)** | `cron/due-reminders/route.js` | `route.js` | Complete | — |
| 37 | **Daily summary (cron)** | `cron/daily-summary/route.js` | `route.js` | Complete | — |
| 38 | **Evening check-in (cron)** | `cron/evening-checkin/route.js` | `route.js` | Complete | — |
| 39 | **Queue board** | `dashboard/queue/page.js` | Queue page + arrival route | Complete | — |
| 40 | **Statistics** | `dashboard/stats/page.js`, `stats/route.js` | Stats page + route | Complete | Basic aggregations |
| 41 | **Schedule management (blocked dates)** | `dashboard/schedule/page.js`, `schedule/route.js` | Schedule route | Complete | — |
| 42 | **Notifications (dashboard)** | `notifications/route.js`, `NotificationPanel.js` | `route.js` | Complete | — |
| 43 | **Calendar view** | `calendar/route.js`, `Calendar.js` | Calendar route + component | Complete | — |
| 44 | **JWT authentication** | `middleware.js`, `auth.js` | `auth.js:60-103` | Complete | Custom implementation, no library |
| 45 | **CSRF protection** | `apiAuth.js` | `apiAuth.js:5-33` | Complete | — |
| 46 | **XSS sanitization** | `sanitize.js`, `apiAuth.js:69-104` | Both | Complete | — |
| 47 | **Replay testing** | `scripts/replay.js` | `replay.js` | Complete | No unit/integration tests |
| 48 | **Circuit breaker (DB)** | `pool.js` | `pool.js:12-65` | Complete | — |
| 49 | **Server-sent events for live messages** | `messageEvents.js` | `messageEvents.js` | Complete | — |
| 50 | **Env validation on startup** | `layout.js:5-12` | `envValidate.js` | Complete | — |

### Not Implemented / Missing

| Feature | Status |
|---------|--------|
| Multi-clinic / multi-tenancy | Not found |
| LLM-based conversation (RAG, embeddings) | Not found |
| Voice calling (telephony) | Not found |
| Payment collection via WhatsApp | Not found (UPI ID is in `.env.local` but no integration) |
| Patient portal / self-service | Not found |
| Email notifications | Not found |
| Real-time sync with Google Calendar | Not found |
| Webhooks to external systems | Not found |
| Audit log | Not found |
| Role-based access control | Not found |
| Unit tests (Jest/Vitest) | Not found |
| E2E tests | Not found |
| CI/CD configuration | Not found |
| Docker/containerization | Not found |
| API documentation (OpenAPI) | Not found |
| Health check endpoint (for monitoring) | Not found (only `/api/dashboard/health`) |
| Prometheus metrics | Not found |
| Sentry/error tracking | Not found |
| Rate limit persistence | Not found (in-memory only) |

---

## 4. WhatsApp Integration Audit

### Incoming Webhook Flow

**File:** `src/app/api/webhook/whatsapp/route.js`

1. **GET /api/webhook/whatsapp** (lines 6-10): WhatsApp verification challenge
   - Checks `hub.mode === 'subscribe'` and `hub.verify_token === WHATSAPP_VERIFY_TOKEN`
   - Returns `hub.challenge` as plain text

2. **POST /api/webhook/whatsapp** (lines 12-38):
   - Immediately returns `200 OK` (line 15)
   - Spawns async processing via `processMessage(entry)` (line 18)
   - Error handling: catches errors, logs them, still returns 200 (lines 37-38)
   - This prevents WhatsApp retries

3. **processMessage flow** (line 18): Calls `engine.js` → `main(waId, message, msgId, msgType)`

### Outgoing Message Flow

**File:** `src/lib/whatsapp.js`

- `sendText(waId, text)` — POST to `{{apiVersion}}/{{phoneNumberId}}/messages` with `{ messaging_product: "whatsapp", to: waId, text: { body: text, preview_url: false } }` (lines 8-43)
- `sendButtons(waId, text, buttons)` — Sends interactive button messages (lines 45-97)
- `sendList(waId, text, sections)` — Sends list messages (lines 99-155)
- `sendTemplate(waId, templateName, params)` — Sends pre-registered WhatsApp templates (lines 157-216)
- `markAsRead(waId, msgId)` — Sends read receipts (lines 218-236)

**Auth:** Bearer token from `WHATSAPP_ACCESS_TOKEN` env var (line 28)

**Retry:** 2 retries with 1000ms delay (lines 30-32, `retryCount` parameter)

**Endpoint:** `https://graph.facebook.com/v22.0/{{phoneNumberId}}/messages` (line 20)

### Authentication

- **Webhook verification:** `WHATSAPP_VERIFY_TOKEN` env var, checked against `hub.verify_token` query param (route.js:7-10)
- **API calls:** `WHATSAPP_ACCESS_TOKEN` as Bearer token (whatsapp.js:28)
- **Phone number ID:** `WHATSAPP_PHONE_NUMBER_ID` env var (whatsapp.js:20)

### Message Parsing

Webhook entry (route.js:18) passes raw `entry` array to `engine.js` which parses:
- `msgId` from entry changes[0].messages[0].id
- `waId` from entry changes[0].messages[0].from
- `msgType` from entry changes[0].messages[0].type
- `message body` based on type (text, audio, interactive button reply, etc.)

**File:** `engine.js` — the `classifyEvent` step extracts these fields.

### Error Handling

**whatsapp.js:**
- Catches fetch errors, logs with logger.error (lines 33-37)
- Returns `null` on failure (line 40)
- Callers check for null return

**Handlers:**
- Individual handler functions have try/catch
- Session save errors are caught (handlers.js, various locations)
- `sendText` failures in handlers typically log error, continue with alternative flow

### Retry Mechanisms

- **WhatsApp API calls:** 2 retries, 1000ms delay (whatsapp.js:30-32)
- **Database (pool.js):** 4 retries, exponential backoff starting at 3s (pool.js:12-65)
- **Session save:** `.catch(() => {})` — silently fails (handlers.js, multiple locations)

### Rate Limiting

**File:** `src/lib/rateLimit.js`

- **Webhook:** 60 requests/minute (line: WEBHOOK_LIMITER)
- **Dashboard API:** 120 requests/minute (line: DASHBOARD_API_LIMITER)
- **Login:** 10 requests/minute (line: LOGIN_LIMITER)
- **Cron:** 20 requests/minute (line: CRON_LIMITER)

All are in-memory sliding window counters. Resets on server restart.

### Media Handling

1. **Download:** `media.js` — `downloadMedia(mediaId)` fetches from WhatsApp's media endpoint, returns buffer + mime type
2. **Transcription:** `transcriber.js` — `transcribeAudio(audioBuffer)` sends to OpenAI Whisper API, returns text
3. **Storage:** `r2.js` — `uploadToR2(key, buffer, mimeType)` stores to Cloudflare R2, `getSignedUrl(key)` generates time-limited URLs

### Conversation Tracking

- **Session per patient:** Each `waId` gets a session object (`session.js`)
- **State machine:** Session has a `state` field (from `states.js`, 40+ states)
- **Context object:** Session has a `context` field containing booking data in progress, conversation history reference
- **Manual mode flag:** `context.manualMode` indicates human takeover
- **Last interaction:** Session tracks `updatedAt` for timeout/expiry calculations

### Request Lifecycle

```
Patient sends WhatsApp message
        │
        ▼
WhatsApp Cloud API → POST /api/webhook/whatsapp
        │
        ▼
route.js: Immediately returns 200
        │
        ▼ (async)
engine.js: main(waId, message, msgId, msgType)
        │
        ├── classifyEvent() → extract msgId, waId, text, type
        ├── deduplicate.isDuplicate(msgId) → skip if already processed
        ├── session.getOrCreate(waId) → load from cache or DB, create if new
        │   └── sessionRepository.findByWaId() / create()
        ├── router.classifyIntent(text, state) → intent string
        │   └── config/intents.js pattern matching
        ├── validators.extractEntities(text, intent) → entity object
        ├── correctionDetector.detect(text) → correction entity
        ├── overwritePolicy.evaluate(context, entities) → allowed/blocked changes
        ├── handlers[state](session, entities, intent) → response text + state change
        │   └── May call: whatsapp.sendText(), appointmentRepository.*(), r2.js, etc.
        ├── session.save(session) → persist to DB + update cache
        ├── messageEvents.notifyNewMessage(waId) → SSE update
        └── Response text returned (but route.js already returned 200)

        Patient receives WhatsApp message ← WhatsApp Cloud API ← whatsapp.sendText()
```

---

## 5. AI Architecture Audit

### AI Components Identified

| Component | File | Description |
|-----------|------|-------------|
| **Intent classification** | `src/lib/router.js` + `src/config/intents.js` | Keyword/regex pattern matching — NOT AI/ML |
| **Entity extraction** | `src/lib/validators.js` | Regex-based extraction — NOT AI/ML |
| **Correction detection** | `src/lib/correction-detector.js` | Regex pattern matching — NOT AI/ML |
| **Audio transcription** | `src/lib/transcriber.js` | **OpenAI Whisper API** — this is the ONLY AI/LLM call |
| **State transitions** | `src/lib/transitions.js` | Deterministic rules engine |
| **Overwrite policy** | `src/lib/overwrite-policy.js` | Deterministic rules engine |

### LLM Providers Used

**Only OpenAI Whisper API** (`transcriber.js:6-20`):
- POST to `https://api.openai.com/v1/audio/transcriptions`
- Uses `OPENAI_API_KEY` env var
- Transcribes audio to text, then the text is processed through the standard keyword pipeline

### Prompt Management

**None found.** There are no prompts, no prompt templates, no LLM prompt engineering anywhere in the codebase.

### Context Management

- **Conversation context:** Stored in session's `context` object (session.js)
- **Context fields:** `intent`, `entities`, `booking` (date, time, treatment, name, phone), `manualMode`
- **No conversation history:** The system does NOT store full conversation history in the session context. Each message is processed independently with only the current state + extracted entities.

### Memory Implementation

- **Session state** (state machine) — tracks where in the booking flow the patient is
- **Booking context** — partial booking data being collected incrementally
- **No long-term memory** beyond what's in the database
- **No vector memory**
- **No conversation summary**

### Conversation State

Managed via `states.js` (40+ states):
- `INITIAL`, `GREETING`, `MENU`
- `BOOKING_START`, `ASK_DATE`, `ASK_TIME`, `ASK_TREATMENT`, `ASK_NAME`, `ASK_PHONE`, `CONFIRM_BOOKING`
- `RESCHEDULE_START`, `RESCHEDULE_SELECT`, `RESCHEDULE_DATE`, `RESCHEDULE_TIME`
- `CANCEL_START`, `CANCEL_CONFIRM`
- `CHECK_SLOTS`, `SHOW_SLOTS`
- `MANUAL`, `MANUAL_RELEASE`
- `FEEDBACK_START`, `FEEDBACK_RATING`, `FEEDBACK_COMMENT`
- `UNKNOWN`, `ERROR`, `END`
- etc.

### Function Calling / Tool Calling

**None.** There is no function calling framework. All actions are triggered by state-based handler functions in `handlers.js`. The system does not use LLM function calling — it uses explicit if/else branching.

### Agent Framework Usage

**None found.** No LangChain, Vercel AI SDK, AutoGPT, or any agent framework.

### Is This Currently:

- **A chatbot?** Technically yes, but not AI-powered. It's a **rule-based chatbot** with a state machine. It handles a specific, constrained domain (dental clinic booking) well but cannot handle novel conversations.
- **Workflow automation?** YES — this is primarily a workflow automation system. The state machine encodes a business process (appointment booking/rescheduling/cancellation) and enforces it step by step.
- **An agentic system?** NO — it is NOT agentic. There is no:
  - Autonomous decision making
  - Tool selection
  - Planning
  - Self-correction
  - Learning from interactions

### What Would Be Required To Become Agentic:

1. **Replace keyword intent classifier with LLM intent classification** — `router.js` would call an LLM instead of regex
2. **Add function calling** — define tools (checkSlots, bookAppointment, cancelAppointment, etc.) and let LLM decide which to call
3. **Add conversation memory** — store full conversation history, use LLM with context window
4. **Add prompt management** — system prompt describing clinic, policies, tone
5. **Add RAG system** — vector database with clinic policies, treatment info, FAQ
6. **Remove hardcoded state machine** — replace with agent loop (observe → think → act)
7. **Add confidence scoring** — fall back to human when LLM confidence is low

**Estimated effort:** 2-4 weeks for basic LLM integration, 2-3 months for full agentic system

---

## 6. Data Model Audit

### Database Schema

**File:** `src/db/migrations/001_core.sql`

**Tables:**

1. **`sessions`**
   - `id` (SERIAL PRIMARY KEY)
   - `wa_id` (TEXT UNIQUE NOT NULL)
   - `state` (TEXT NOT NULL, default 'INITIAL')
   - `context` (JSONB NOT NULL, default '{}')
   - `patient_name` (TEXT)
   - `created_at` (TIMESTAMPTZ, default NOW())
   - `updated_at` (TIMESTAMPTZ, default NOW())
   - Index: `idx_sessions_wa_id` on wa_id

2. **`appointments`** (has been ALTERed multiple times)
   - `id` (SERIAL PRIMARY KEY)
   - `logical_id` (UUID)
   - `version` (INTEGER, default 1)
   - `wa_id` (TEXT)
   - `patient_name` (TEXT)
   - `patient_phone` (TEXT)
   - `patient_id` (INTEGER, FK → patients.id)
   - `date` (DATE)
   - `time` (TIME)
   - `treatment` (TEXT)
   - `treatments` (TEXT[]) — array of treatments
   - `status` (TEXT, default 'confirmed') — confirmed, completed, cancelled, no_show
   - `arrival_status` (TEXT) — scheduled, arrived, called
   - `arrived_at` (TIMESTAMPTZ)
   - `called_at` (TIMESTAMPTZ)
   - `is_priority` (BOOLEAN, default false)
   - `location` (TEXT)
   - `consultation_fee` (DECIMAL)
   - `treatment_charges` (DECIMAL)
   - `medicine_charges` (DECIMAL)
   - `paid_amount` (DECIMAL)
   - `payment_status` (TEXT) — pending, paid, partial
   - `payment_method` (TEXT) — cash, upi, card
   - `transaction_id` (TEXT)
   - `diagnosis` (TEXT)
   - `medicines` (JSONB)
   - `notes` (TEXT)
   - `follow_up_date` (DATE)
   - `follow_up_instructions` (TEXT)
   - `chit_media` (TEXT) — R2 key for receipt/photo
   - `prescription_key` (TEXT) — R2 key for prescription PDF
   - `feedback_requested` (TIMESTAMPTZ)
   - `feedback_id` (INTEGER)
   - `cancellation_reason` (TEXT)
   - `created_at` (TIMESTAMPTZ)
   - `updated_at` (TIMESTAMPTZ)
   - **Unique constraint:** `(date, time)` — prevents double booking
   - Indexes: on date, wa_id, patient_id, logical_id

3. **`messages`**
   - `id` (SERIAL PRIMARY KEY)
   - `msg_id` (TEXT UNIQUE NOT NULL)
   - `session_id` (INTEGER, FK → sessions.id)
   - `wa_id` (TEXT NOT NULL)
   - `role` (TEXT NOT NULL) — 'user' or 'bot'
   - `content` (TEXT)
   - `intent` (TEXT)
   - `metadata` (JSONB)
   - `created_at` (TIMESTAMPTZ)
   - Index: `idx_messages_session` on session_id, `idx_messages_wa_id` on wa_id

4. **`patients`** (appears to exist — referenced heavily in routes)
   - Columns used: `id`, `wa_id`, `phone`, `name`, `age`, `sex`, `location`, `visit_count`
   - Schema defined through usage, not explicitly in 001_core.sql (likely ALTER TABLE from migrations or manual)

5. **`feedback`** (exists — referenced in feedback routes)
   - Columns used: `id`, `wa_id`, `patient_name`, `rating`, `comment`, `contacted`, `created_at`

6. **`blocked_dates`** (exists — referenced in schedule routes)
   - Columns: `id`, `date`, `reason`, `is_holiday`

### ORM Usage

**None.** All database access is via raw SQL using the Neon serverless driver (`sql` tagged template literals). No Prisma, Drizzle, Sequelize, Knex, or TypeORM.

Example (`sessionRepository.js:10-13`):
```javascript
const rows = await sql`SELECT * FROM sessions WHERE wa_id = ${waId} LIMIT 1`;
```

### Migrations

- Single migration file: `src/db/migrations/001_core.sql`
- Migration runner: `runMigrations()` in `pool.js`
- The code calls `runMigrations()` at the start of dashboard API routes (e.g., `appointments/route.js:14`) but NOT in the webhook path
- Appointments table has clearly been ALTERed multiple times (the 001_core.sql has multiple ALTER TABLE statements)

### Relationships

```
sessions.wa_id ──→ messages.wa_id (one-to-many)
sessions.id ──→ messages.session_id (one-to-many)
patients.id ──→ appointments.patient_id (one-to-many)
patients.wa_id/phone ──→ appointments.wa_id (one-to-many via wa_id/phone)
appointments.feedback_id ──→ feedback.id (one-to-one)
```

### Missing Entities

- **Providers/Doctors** — No doctor table. All references to "doctor" are hardcoded as a single WA number in `config/clinic.js:14`.
- **Services/Pricing** — No service catalog. Treatments are hardcoded in `config/clinic.js`.
- **Inventory** — No inventory tracking.
- **Staff** — No staff table.
- **Clinic Configuration** — No multi-tenant config table.
- **Audit Log** — No audit log table.
- **API Keys** — No API key table.
- **Webhook Subscriptions** — No webhook subscriptions.

### Scalability Issues

1. **Single migration file** — All schema changes in one file. When this gets large, it's brittle.
2. **No migration versioning** — `runMigrations()` runs the entire 001_core.sql each time with `CREATE TABLE IF NOT EXISTS`. Schema changes after initial creation are handled by manual ALTER TABLE appended to the same file.
3. **`date + time` uniqueness constraint** — Prevents multiple appointments at the same slot. Works for single clinic but won't scale to multi-provider.
4. **No indexes on context JSONB** — Queries filtering by session context will be slow.
5. **patients table** — Schema is defined entirely through usage, no migration file documents it.

### Data Consistency Risks

1. **Session context vs DB state** — If session save fails silently (`.catch(() => {})`), the DB may not reflect current conversation state.
2. **No transactions for multi-table operations** — Many dashboard endpoints do multiple inserts/updates without wrapping in a transaction.
3. **Race condition on slot booking** — The date+time unique constraint prevents double booking, but there's no application-level locking. Two concurrent requests could both pass the existence check before either inserts.

---

## 7. API Audit

### WhatsApp Webhook

| Method | Route | Purpose | Auth | Validation | Error Handling |
|--------|-------|---------|------|------------|----------------|
| GET | `/api/webhook/whatsapp` | Verify webhook | Verify token query param | hub.mode + hub.verify_token | Returns 403 if invalid |
| POST | `/api/webhook/whatsapp` | Receive messages | None (WhatsApp IP validation not done) | Entry structure validation in engine | Always returns 200; errors logged async |

### Cron Jobs

| Method | Route | Purpose | Auth | Validation | Error Handling |
|--------|-------|---------|------|------------|----------------|
| POST | `/api/cron/reminders` | Send appointment reminders | `CRON_SECRET` header | Date calculation | Caught, logged |
| POST | `/api/cron/feedback` | Request feedback after appt | `CRON_SECRET` header | Feedback window check | Caught, logged |
| POST | `/api/cron/due-reminders` | Due treatment reminders | `CRON_SECRET` header | Due date check | Caught, logged |
| POST | `/api/cron/evening-checkin` | Evening check-in messages | `CRON_SECRET` header | Time window check | Caught, logged |
| POST | `/api/cron/daily-summary` | Daily summary to doctor | `CRON_SECRET` header | Data aggregation | Caught, logged |

### Dashboard API

| Method | Route | Purpose | Auth | Validation | Error Handling |
|--------|-------|---------|------|------------|----------------|
| POST | `/api/dashboard/login` | Login | Rate limited | Password match | 401/400/429 |
| POST | `/api/dashboard/logout` | Logout | Cookie | — | — |
| GET | `/api/dashboard/health` | Health check | Cookie | — | DB ping |
| GET | `/api/dashboard/appointments` | List appointments | Cookie + CSRF (GET exempt) | Query params (date, scope) | 404/500 |
| POST | `/api/dashboard/appointments` | Create appointment | Cookie + CSRF + Rate + Size | Required fields | 400/409/500 |
| GET | `/api/dashboard/appointments/[id]` | Get single appointment | Cookie | ID param | 404/500 |
| PATCH | `/api/dashboard/appointments/[id]` | Update appointment | Cookie + CSRF + Rate | Body validation | 404/500 |
| POST | `/api/dashboard/appointments/[id]/cancel` | Cancel appointment | Cookie + CSRF + Rate | ID param | 404/500 |
| POST | `/api/dashboard/appointments/[id]/reschedule` | Reschedule | Cookie + CSRF + Rate | Date/time validation | 404/500 |
| POST | `/api/dashboard/appointments/bulk` | Bulk complete/cancel | Cookie + CSRF + Rate | Date + action params | 400/500 |
| GET | `/api/dashboard/calendar` | Calendar data | Cookie | Year/month params | 500 |
| GET | `/api/dashboard/stats` | Statistics | Cookie | Date range | 500 |
| GET | `/api/dashboard/patients` | List patients | Cookie | Query, limit, offset | 500 |
| POST | `/api/dashboard/patients` | Create patient | Cookie + CSRF + Rate | Name required | 400/500 |
| GET | `/api/dashboard/patients/search` | Search patients | Cookie | Query (q) | 500 |
| GET | `/api/dashboard/patients/[id]` | Get patient | Cookie | ID | 404/500 |
| PATCH | `/api/dashboard/patients/[id]` | Update patient | Cookie + CSRF + Rate | ID | 404/500 |
| GET | `/api/dashboard/patients/[id]/messages` | Message history | Cookie | ID, pagination | 500 |
| GET | `/api/dashboard/patients/[id]/messages/stream` | SSE stream | Cookie | ID | SSE events |
| GET | `/api/dashboard/patients/[id]/medical-history` | Medical history | Cookie | ID | 500 |
| GET | `/api/dashboard/patients/[id]/family` | Family members | Cookie | ID | 500 |
| POST | `/api/dashboard/patients/[id]/family` | Add family member | Cookie + CSRF + Rate | Name required | 400/500 |
| POST | `/api/dashboard/patients/[id]/send-message` | Send WhatsApp msg | Cookie + CSRF + Rate + Size | Message required | 400/404/500 |
| GET | `/api/dashboard/patients/[id]/chat-mode` | Get chat mode | Cookie | ID | 500 |
| POST | `/api/dashboard/patients/[id]/chat-mode` | Toggle chat mode | Cookie + CSRF + Rate | ID | 500 |
| GET | `/api/dashboard/notifications` | List notifications | Cookie | — | 500 |
| GET | `/api/dashboard/schedule` | Get schedule | Cookie | Month/year | 500 |
| POST | `/api/dashboard/schedule` | Block/unblock date | Cookie + CSRF + Rate | Date required | 400/500 |
| GET | `/api/dashboard/due-reminders` | Due reminders list | Cookie | — | 500 |
| GET | `/api/dashboard/visit` | Visit log list | Cookie | Date, patient | 500 |
| POST | `/api/dashboard/visit` | Log visit | Cookie + CSRF + Rate | Appointment ID | 400/500 |
| POST | `/api/dashboard/visits/[id]/prescription` | Upload prescription | Cookie + CSRF + Rate | File | 500 |
| GET | `/api/dashboard/feedback` | List feedback | Cookie | Date range | 500 |
| POST | `/api/dashboard/feedback/[id]/contact` | Mark feedback contacted | Cookie + CSRF + Rate | ID | 500 |
| GET | `/api/dashboard/media` | List media | Cookie | — | 500 |
| POST | `/api/dashboard/media` | Upload media | Cookie + CSRF | File | 500 |
| GET | `/api/dashboard/media/signed` | Get signed URL | Cookie | Key | 500 |
| POST | `/api/dashboard/send-whatsapp` | Send ad-hoc WhatsApp | Cookie + CSRF + Rate | WA ID + message | 400/500 |
| POST | `/api/dashboard/arrival` | Mark arrival/call | Cookie + CSRF + Rate | Appointment ID | 400/500 |

### Authentication Notes

- **Webhook:** No IP validation. Any caller can POST to the webhook.
- **Cron:** Shared secret (`CRON_SECRET`) passed in header.
- **Dashboard:** JWT in httpOnly cookie (`dashboard_token`). CSRF via double-submit cookie pattern.
- **Dashboard login:** Single password (`DASHBOARD_PASSWORD` env var). No user accounts, no roles.
- **JWT:** Custom HS256 implementation using Web Crypto API (`auth.js:60-103`). No standard library.

### Request/Response Pattern

All dashboard endpoints follow the same pattern:
```javascript
const csrfErr = requireCsrf(req); if (csrfErr) return csrfErr;
const rateErr = checkRateLimit(req); if (rateErr) return rateErr;
const sizeErr = checkBodySize(req); if (sizeErr) return sizeErr;
try {
  // endpoint logic
  logger.info('...');
  return NextResponse.json({ ... });
} catch (error) {
  logger.error('...');
  return jsonError(error);
}
```

Responses are sanitized via `sanitizeResponse()` (`apiAuth.js:74-104`) to prevent XSS.

---

## 8. State Management Audit

### Conversation State

**File:** `src/config/states.js` (40+ states)

States are hierarchical:
- **Global states:** `INITIAL`, `GREETING`, `MENU`, `UNKNOWN`, `ERROR`, `END`
- **Booking flow:** `BOOKING_START` → `ASK_DATE` → `ASK_TIME` → `ASK_TREATMENT` → `ASK_PATIENT_NAME` → `ASK_PHONE` → `CONFIRM_BOOKING` → `BOOKED`
- **Reschedule flow:** `RESCHEDULE_START` → `FIND_APPOINTMENT` → `RESCHEDULE_SELECT` → `RESCHEDULE_DATE` → `RESCHEDULE_TIME` → `RESCHEDULE_CONFIRM`
- **Cancel flow:** `CANCEL_START` → `FIND_APPOINTMENT` → `CANCEL_SELECT` → `CANCEL_CONFIRM`
- **Check slots:** `CHECK_SLOTS` → `SHOW_SLOTS`
- **Manual mode:** `MANUAL` → `MANUAL_RELEASE`
- **Feedback:** `FEEDBACK_START` → `FEEDBACK_RATING` → `FEEDBACK_COMMENT`

Transitions are enforced via `transitions.js`:
- Global intents are valid in any state (`transitions.js:5-10`)
- Correction intents are valid in booking states (`transitions.js:12-18`)
- Otherwise, only intents defined in the state's allowed transitions are accepted

### Session Management

**File:** `src/lib/session.js`

**Cache:**
- In-memory Map with 500-entry LRU eviction (`session.js:15-25`)
- 10-minute TTL per entry (`session.js:10`)
- Keys are `waId` strings
- Values are session objects with `{ waId, state, context, patientName, updatedAt }`

**Persistence:**
- `getOrCreate(waId, msgId, patientName)` — Load from cache first, fall back to DB (`session.js:27-65`)
- `save(session)` — Persist to DB, update cache (`session.js:67-90`)
- `get(waId)` — Cache-only lookup

**Manual Mode:**
- `context.manualMode = true` flag
- `context.manualModeStartedAt` timestamp
- 24-hour auto-release timer (checked in `handlers.js`)
- Applied when dashboard sends message to patient (triggered by `send-message/route.js:68-74`)
- During manual mode, bot still receives messages but forwards to `MANUAL` state handler

### User Tracking

- **Primary key:** `waId` (WhatsApp ID) — a unique phone number identifier assigned by WhatsApp
- **Fallback:** Phone number (for dashboard-created patients without waId)
- **Patient name:** Stored in session and in patients table
- **No user IDP:** No OAuth, no phone number OTP verification, no email

### Cache Usage

| Cache | Location | Purpose | Size | TTL | Eviction |
|-------|----------|---------|------|-----|----------|
| Session cache | `session.js` | Avoid DB reads on every message | 500 entries | 10 min | LRU |
| Dedup set | `deduplicate.js` | Skip duplicate messages | Unbounded | — | Manual cleanup on restart |
| Rate limiters | `rateLimit.js` | Track request counts | Per-window entries | Window duration | Sliding window |
| SSE clients | `messageEvents.js` | Track connected dashboard clients | Unbounded | — | Client disconnect |

### Persistence Strategy

- **Primary store:** Neon Serverless Postgres
- **Session persistence:** On every bot response (after handler runs)
- **Message logging:** Every incoming and outgoing message logged to `messages` table
- **Appointment data:** Single source of truth in `appointments` table with optimistic concurrency via `version` field
- **No caching layer:** No Redis. No read replicas. No CDN for API responses.

---

## 9. Human Handoff Audit

### Current Implementation

**Yes, human handoff is partially implemented:**

1. **Manual mode activation:** When a dashboard user sends a WhatsApp message to a patient (`send-message/route.js:68-74`), the patient's session is put into manual mode:
   ```javascript
   session.context.manualMode = true;
   session.context.manualModeStartedAt = new Date().toISOString();
   ```

2. **Manual mode behavior:** In `handlers.js`, when `session.context.manualMode` is true, the bot routes to `MANUAL` state handler which:
   - Forwards the message (no auto-reply logic)
   - Allows the dashboard user to continue the conversation manually

3. **Auto-release:** After 24 hours (`session.js:100-130`), if no dashboard user has sent a message, the session auto-releases from manual mode:
   ```javascript
   const MANUAL_MODE_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours
   ```

4. **Session list:** `components/SessionList.js` — shows active sessions to dashboard user

5. **Chat mode toggle:** `chat-mode/route.js` — allows toggling between auto/manual mode per patient

### What's Missing

| Feature | Status | Required For |
|---------|--------|--------------|
| **Explicit "Talk to human" intent** | Not found — no intent for requesting human | Patient-initiated escalation |
| **Escalation queue** | Not found — no queue system | Multiple simultaneous human conversations |
| **Handoff acknowledgment** | Not found — no handshake protocol | Reliable takeover |
| **Conversation ownership** | Not found — no who-is-handling tracking | Accountability |
| **Canned responses** | Not found | Efficient human replies |
| **Escalation notes/context** | Not found — no summary passed to human | Informed handoff |
| **Auto-suggest responses** | Not found | Faster human replies |
| **Escalation to doctor** | Not found — no distinct doctor/receptionist routing | Clinical questions |
| **Supervision dashboard** | Not found | Monitoring all active handoffs |

**Critical gap:** There is NO patient-initiated escalation. A patient cannot say "I want to talk to a human" and get routed to a human. The only way to enter manual mode is for the dashboard operator to proactively send a message to the patient.

---

## 10. Knowledge Base Audit

### Static Knowledge

- **Clinic info:** Hardcoded in `src/config/clinic.js` — name, address, hours, phone, treatments list, doctor/receptionist WhatsApp numbers, location names
- **Treatment list:** 12 treatments hardcoded in `clinic.js`
- **Translations:** Bilingual strings hardcoded in `src/config/translations.js`
- **Templates:** 5 WhatsApp templates defined in `src/config/templates.js`

### Dynamic Knowledge

- **Appointment data:** Stored in Postgres `appointments` table
- **Patient data:** Stored in `patients` table
- **Session data:** Stored in `sessions` table + in-memory cache
- **Feedback data:** Stored in `feedback` table

### RAG Implementation

**None found.** There is no:
- Vector database (Pinecone, Weaviate, Qdrant, pgvector)
- Embedding generation
- Document chunking/retrieval
- Context augmentation from external documents

### Vector Databases

**None found.**

### Embeddings

**None found.**

### Search Layer

- **Patient search:** SQL `ILIKE` queries (`patients/search/route.js`)
- **No full-text search:** No Postgres tsvector, no Elasticsearch, no Meilisearch
- **No semantic search**

### How Answers Are Generated

The system does NOT "generate" answers. It selects pre-written responses based on:

1. **Current state** — which step of the booking flow the patient is in
2. **Classified intent** — what the patient wants (book, cancel, reschedule, check slots, etc.)
3. **Extracted entities** — date, time, name, phone, treatment extracted from message
4. **Template matching** — responses are constructed from string templates in `translations.js`

Example flow:
```
Patient: "I want to book an appointment tomorrow at 3pm"
  → router.js classifies intent: "BOOK_APPOINTMENT"
  → validators.js extracts: { date: "2026-06-06", time: "15:00" }
  → transitions.js validates: BOOK_APPOINTMENT is valid in current state
  → handlers.js BOOKING state handler:
    → Checks slot availability in DB
    → If available, constructs response from translations.js
    → Calls whatsapp.sendText() with response
    → Transitions state to CONFIRM_BOOKING
```

The system has **zero generative AI** in the response pipeline. It is 100% template-driven, deterministic response selection.

---

## 11. Production Readiness Assessment

| Area | Score (1-10) | Reasoning |
|------|-------------|-----------|
| **Architecture** | 6 | Clean separation of concerns (engine → router → handlers → transitions). State machine is well-defined. However, `handlers.js` is a monolithic 8,000+ line file. Single-tenant design limits scalability. No event-driven architecture. Module boundaries are clear but the handler file violates SRP. |
| **Reliability** | 5 | Circuit breaker on DB is good. Retry mechanisms exist for WhatsApp API and DB. However, session saves fail silently `.catch(() => {})`. No message queue — if processing crashes mid-flow, the message is lost (200 already returned to WhatsApp). No DLQ. No processing guarantees. |
| **Scalability** | 3 | Single-tenant. In-memory caches (rate limit, dedup, session) don't scale across multiple instances. Monolithic handler can't be distributed. No horizontal scaling consideration. Will break under 100+ concurrent patients. |
| **Security** | 4 | JWT is custom (no audited library) — risky. `.env.local` committed with live secrets. Webhook has no IP allowlisting. Single dashboard password. No rate limit on webhook itself (60/min is per-IP sliding window but no WhatsApp IP verification). CSRF and XSS protection are good. Custom crypto is a red flag. |
| **Observability** | 4 | Structured logging with `logger.js` is good. But no metrics, no tracing, no health check endpoint (except basic `/health`), no Sentry/error tracking, no performance monitoring. Cannot diagnose production issues effectively. |
| **Maintainability** | 4 | 8,000-line handler file is a maintenance nightmare. No tests. No TypeScript. Config is JS files (no validation). Dashboard components mix API calls with UI rendering. Migration strategy is fragile (single file). |
| **Testing** | 2 | Replay tests exist (`scripts/replay.js`) which is good for regression. But no unit tests, no integration tests, no E2E tests. Cannot safely refactor. |
| **Documentation** | 7 | Docs directory has 28+ files covering architecture, features, dashboards, database, deployment, agentic plans. Well-documented for a project this size. However, docs may be stale vs actual code. |

**Overall: 4.4/10** — Functional MVP with structural issues that prevent scaling.

---

## 12. Missing Features

### Critical (Blocking Production Use)

| Feature | Why | Complexity |
|---------|-----|------------|
| **Multi-clinic / Multi-tenancy** | Currently hardcoded single clinic in `config/clinic.js`. Cannot support 2+ clinics. | High — affects schema, config, auth, session routing |
| **Message queue** (Redis Bull / RabbitMQ) | Currently lossy — if crash during processing, message is lost | Medium |
| **Security remediation** | `.env.local` committed; custom JWT; single password; no webhook IP verification | Low |
| **Session save reliability** | `.catch(() => {})` silent failures lose conversation state | Low |
| **Unit tests & integration tests** | Cannot refactor safely | Medium |

### Important (Strongly Recommended)

| Feature | Why | Complexity |
|---------|-----|------------|
| **Patient-initiated human escalation** | Patients cannot ask for human help | Low-Med |
| **Conversation history in session** | Currently no context window for LLM readiness | Low |
| **TypeScript migration** | 8,000-line JS file is unmaintainable without types | High |
| **Multi-provider scheduling** | No concept of different doctors | Medium |
| **Payment integration** | UPI ID exists in env but no actual payment flow | Medium |
| **Database migration system** | Single-file migration is fragile | Low |

### Nice-to-Have

| Feature | Why |
|---------|-----|
| Voice calling (Twilio/Vonage) | Some patients prefer calls |
| Google Calendar sync | Doctor's existing workflow |
| Patient portal | Self-service booking view |
| Automated voice summary for doctor | Morning briefings |
| Analytics dashboard | Business intelligence |
| Email notifications | Secondary communication channel |

---

## 13. Agentic Readiness Assessment

### 1. Is this system ready for multi-agent architecture?

**No.** The system is fundamentally not ready for multi-agent architecture because:

1. **Monolithic handler** (`handlers.js`, ~8,000 lines) — All logic is in one file. There are no clear module boundaries to split into agents.
2. **In-memory everything** — Session cache, rate limits, dedup set are all in-memory. Agents would need distributed state.
3. **No event bus** — No message queue or event system for agents to communicate.
4. **No LLM integration** — Agents typically use LLMs for reasoning. This system has zero LLM integration for conversation.
5. **No function/tool abstraction** — Functions are called directly, not declared as tools that an agent could discover.
6. **Single-process architecture** — Cannot run multiple agents concurrently.

### 2. Is introducing agents today a good idea?

**No.** Introducing agents now would add immense complexity before the fundamentals are solid. The system needs:
- Reliable message processing (message queue)
- Multi-tenancy
- Basic testing
- Type safety
- Distributed state management

Adding agents on top of the current architecture would create a fragile, un-debuggable system.

### 3. What should be built first?

**Phase 0 (Prerequisite for agents):**
1. Message queue for reliable processing
2. Distributed caches (Redis) for session, rate limit, dedup
3. TypeScript migration
4. Unit test suite
5. Multi-tenancy data model
6. Split handler.js into domain modules
7. Add LLM for intent classification (replace router.js)

### 4. At what maturity stage should agents be introduced?

**Stage 4 (Scale phase), not before.** The progression should be:

- **Stage 1 (Current):** Rule-based state machine — works for constrained domain
- **Stage 2 (Next):** LLM-powered intent classification + entity extraction, still using state machine
- **Stage 3 (Scale):** LLM with function calling, dynamic conversation flow, still single-agent
- **Stage 4 (Agentic):** Multi-agent architecture with specialized agents

### 5. What specific agents would eventually make sense?

| Agent | Responsibility | When to Build | Complexity |
|-------|---------------|---------------|------------|
| **Reception Agent** | Greet, triage, route to appropriate agent | Stage 2 (with LLM) | Medium — replaces current intent classifier |
| **Appointment Agent** | Book, reschedule, cancel, check slots | Stage 2-3 | Low-Med — already implemented as state machine |
| **Follow-up Agent** | Post-appointment check-in, reminder sending | Stage 3 | Low — partially implemented in cron jobs |
| **Billing Agent** | Payment collection, invoice, receipts | Stage 3 | Medium — needs payment gateway integration |
| **Review Collection Agent** | Feedback collection, review prompts | Stage 3 | Low — partially implemented |
| **Escalation Agent** | Detect confusion, route to human | Stage 3 | Medium — needs confidence scoring |
| **Doctor Assistant Agent** | Summarize patient history, prep for visit | Stage 4 | High — needs RAG, medical record access |

**The Reception Agent should be the first agent** — it's the natural entry point. Today, the entire system is effectively a reception agent, but rule-based. Converting it to an LLM-powered agent with function calling is the natural evolution.

---

## 14. Technical Debt

### Architectural Debt

| Debt | Severity | Details |
|------|----------|---------|
| **Monolithic handlers.js** | **HIGH** | ~8,000+ lines, single file, ~40 state handlers mixed with DB calls, WhatsApp API calls, and business logic. Impossible to test or refactor safely. File: `src/lib/handlers.js` |
| **Single-tenant design** | **HIGH** | Clinic config hardcoded in `src/config/clinic.js`. Schema has no `clinic_id` on any table. Multi-tenancy requires full re-architecture. |
| **In-memory state** | **HIGH** | Session cache (`session.js`), rate limits (`rateLimit.js`), dedup (`deduplicate.js`), SSE clients (`messageEvents.js`) — all in-memory. Cannot scale horizontally. |
| **No message queue** | **MEDIUM** | Webhook returns 200 immediately, then processes async in the same request. If the server crashes, the message is lost. No retry mechanism for failed processing. |
| **No transaction boundaries** | **MEDIUM** | Multi-table operations not wrapped in transactions. Partial failures can leave inconsistent state. |
| **Single migration file** | **MEDIUM** | `001_core.sql` contains all CREATE TABLE + accumulated ALTER TABLE statements. No versioning, no rollback, no down migrations. |

### Code Debt

| Debt | Severity | Details |
|------|----------|---------|
| **No TypeScript** | **HIGH** | Entire codebase is plain JavaScript. 8,000-line handler has no type checking. Refactoring is dangerous. |
| **No tests** | **HIGH** | Zero unit tests, zero integration tests. Only replay tests (`scripts/replay.js`) which test end-to-end but are slow and brittle. |
| **Overly large components** | **MEDIUM** | `dashboard/page.js` is 867 lines with inline QuickBookForm and SlotGrid components. `dashboard/layout.js` is 342 lines. |
| **Error handling inconsistency** | **MEDIUM** | Some places use `.catch(() => {})` (silent failure), others throw. No consistent error handling pattern. |
| **Magic strings** | **LOW** | State names, intent names, context field names are strings scattered across files. No TypeScript enum enforcement. |
| **Mixed concerns in API routes** | **MEDIUM** | API routes contain business logic (patient creation, appointment slot checking) alongside HTTP handling. Not separated into service layer. |

### Operational Debt

| Debt | Severity | Details |
|------|----------|---------|
| **Live credentials committed** | **CRITICAL** | `.env.local` committed with real WhatsApp tokens, Neon DB URL, R2 keys, UPI ID, OpenAI key, password. |
| **No CI/CD** | **HIGH** | No GitHub Actions, no deployment pipeline, no staging environment evident. |
| **No Docker/containerization** | **MEDIUM** | No Dockerfile, docker-compose, or containerization for reproducible deployments. |
| **No monitoring/alerting** | **HIGH** | No Sentry, no Datadog, no Grafana, no uptime monitoring. Cannot detect production issues proactively. |
| **No backup strategy** | **MEDIUM** | No documented backup strategy for Postgres DB or R2 storage. |
| **No rate limit persistence** | **LOW** | Rate limit counters reset on every server restart. An attacker could flood immediately after restart. |
| **No secret rotation** | **MEDIUM** | Single WhatsApp token, single password. No mechanism for rotation without downtime. |

---

## 15. Recommended Roadmap

### Phase 1 — Immediate (Month 1-2)

**Goals:** Secure the system, make it reliable, prepare for growth.

**Deliverables:**
1. **Security remediation:** Remove `.env.local` from git. Rotate all compromised credentials. Implement webhook IP verification. Add proper rate limiting with Redis.
2. **Message queue:** Implement Redis Bull queue for webhook processing. Guarantees at-least-once processing. Adds retry with backoff.
3. **Distributed caches:** Move session cache, rate limit counters, dedup set to Redis.
4. **Reliable session persistence:** Remove all `.catch(() => {})` silent failures. Implement retry with backoff for session saves.
5. **Split handlers.js:** Extract domain modules — `appointmentHandler.js`, `feedbackHandler.js`, `rescheduleHandler.js`, `cancelHandler.js`.
6. **Database migrations:** Implement proper migration system (e.g., Postgrator or custom) with version tracking.

**Complexity:** Medium (familiar patterns, well-understood problems)
**Risk:** Low-Medium (primarily infrastructure changes, not algorithmic)

### Phase 2 — Next (Month 3-4)

**Goals:** Scale to multiple clinics, improve developer experience, add missing features.

**Deliverables:**
1. **Multi-tenancy:** Add `clinic_id` to all tables. Create clinic configuration system. Add clinic selection/login.
2. **TypeScript migration:** Migrate core lib files first (engine, router, handlers split modules). Then API routes.
3. **Test suite:** Unit tests for extraction/validation logic. Integration tests for engine pipeline. E2E tests for booking flows.
4. **Patient-initiated escalation:** Add "talk to human" intent. Implement escalation queue. Add notification to dashboard.
5. **LLM intent classification:** Replace `router.js` keyword matching with LLM call (GPT-4o-mini or similar). Keep state machine as fallback.

**Complexity:** High (multi-tenancy is a major architectural change)
**Risk:** Medium (TypeScript migration is mechanical but tedious; LLM integration is new territory)

### Phase 3 — Scale (Month 5-7)

**Goals:** Full production readiness, advanced features, operational maturity.

**Deliverables:**
1. **Multi-provider scheduling:** Provider model, provider-specific availability, provider assignment logic.
2. **Payment integration:** WhatsApp payment links, invoice generation, partial payment support.
3. **Monitoring stack:** Sentry for errors, Grafana/Prometheus for metrics, structured logging with correlation IDs.
4. **CI/CD pipeline:** GitHub Actions for test/lint/deploy. Staging environment. Zero-downtime deploys.
5. **Analytics dashboard:** Booking trends, patient acquisition, revenue analytics, no-show rates.
6. **Conversation history in context:** Store recent messages in session context for LLM awareness.

**Complexity:** High (payments add compliance requirements)
**Risk:** Medium-High (payments processing has legal/financial risk)

### Phase 4 — Agentic Evolution (Month 8-12)

**Goals:** Multi-agent architecture, autonomous operation, competitive advantage.

**Deliverables:**
1. **Reception Agent:** LLM-powered with function calling (checkSlots, bookAppointment, etc.). Replaces state machine for normal flows.
2. **Agent system:** LangGraph or custom agent runtime. Agent coordination via event bus.
3. **RAG system:** Vector database (pgvector) with clinic policies, treatment info, FAQ. Dynamic context augmentation.
4. **Escalation Agent:** Confidence scoring, confusion detection, automatic escalation with context summary.
5. **Voice agent:** Twilio integration for voice calls. Whisper + LLM for voice conversations.
6. **Follow-up Agent:** Proactive check-ins, treatment reminders, reactivation campaigns.
7. **Knowledge base management UI:** Dashboard for managing FAQ, policies, treatment info.

**Complexity:** Very High (agent systems are research-grade in production)
**Risk:** High (unpredictable LLM behavior in production)

---

## 16. Final Verdict

### Current Maturity Level

**MVP / Early Production (4.4/10)**

This is a functional system that solves a real problem effectively for a single clinic using rule-based automation. The state machine is well-designed and battle-tested with real patients (evidenced by replay tests). The dashboard is comprehensive and well-built. However, the system has fundamental architectural limitations (single-tenant, monolithic handler, in-memory state) and critical security issues (committed credentials, custom JWT) that prevent it from being considered production-ready.

### Biggest Weakness

**The 8,000-line `handlers.js` monolithic file combined with zero tests.** This single file contains the entire business logic of the bot — state handling, database operations, WhatsApp API calls, entity validation, response construction. It is untestable, impossible to reason about, and any change risks breaking unrelated functionality. This is the single biggest impediment to evolving the system.

**Runner up:** Committed `.env.local` with production credentials. This is a critical security incident waiting to happen.

### Biggest Strength

**The architectural design of the engine pipeline** (`engine.js`). The decision to have a clean, sequential pipeline (classifyEvent → deduplicate → load → classifyIntent → extractEntities → detectCorrection → evaluateOverwrite → handle → save → respond) with well-defined interfaces between steps is excellent. This design makes it straightforward to:
- Replace intent classification (swap router.js for LLM)
- Add new pipeline steps
- Debug by inspecting pipeline output at any stage
- Test individual pipeline steps in isolation

This pipeline architecture is the foundation that makes the agentic evolution path viable.

### Scaling Potential

| Scale | Verdict | Rationale |
|-------|---------|-----------|
| **1 clinic** | ✅ **Yes** | Current design works. Fix security and reliability issues, and it's production-ready for single clinic. |
| **10 clinics** | ⚠️ **Needs Phase 2 first** | Multi-tenancy, distributed state, and queue are prerequisites. Without these, 10 clinics would require 10 separate deployments. |
| **100 clinics** | ❌ **Needs Phase 3+** | Would need: microservices or modular monolith, dedicated DB per tenant or robust tenant isolation, auto-scaling infrastructure, full observability stack, dedicated ops team. |

### Should You Focus on Product Features or Agentic Systems Right Now?

**Product features. Not agentic systems.**

Here's why:
1. **The current system is NOT broken** — it works well for its constrained domain (dental clinic booking). The pain points are reliability, security, and maintainability — not conversational ability.
2. **Adding LLMs introduces unpredictability** — A rule-based system that works 99% of the time is better than an LLM system that works 95% of the time with 5% bizarre failures. For a medical receptionist, predictability is paramount.
3. **The ROI on basic improvements is higher** — Fixing silent session failures, adding a message queue, splitting the handler, adding tests — these deliver compounding value. Adding an LLM delivers marginal improvement at high complexity cost.
4. **Multi-tenancy unlocks revenue** — If you want to sell this to multiple clinics, multi-tenancy is the feature that enables that. Agentic capabilities are a differentiator, not a prerequisite.
5. **Agentic readiness is not zero** — Your pipeline architecture is inherently agent-friendly. When you're ready, you can swap the intent classifier for an LLM without rewriting the system.

**Recommended strategy:** Fix the foundation (Phase 1-2), then add LLM intent classification (end of Phase 2), then evaluate whether full agentic architecture adds value for your specific use case. Most dental clinics do not need autonomous agents — they need a reliable, always-available booking system that can hand off to a human when needed.
