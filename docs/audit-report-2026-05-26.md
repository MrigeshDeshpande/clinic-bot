# Project Audit Report — Shri Balaji Dental Clinic WhatsApp Bot

> **Date:** 2026-05-26  
> **Audit Scope:** Full project audit — all source files, config, docs, DB schema  
> **Bot Version:** Level 2 (interactive messages, entity extraction, state machine)  
> **Stack:** Next.js 16 (App Router) · Meta WhatsApp Cloud API · Neon DB (PostgreSQL) · Node.js

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Technology Stack](#2-technology-stack)
3. [Project Structure & File Inventory](#3-project-structure--file-inventory)
4. [Architecture Analysis](#4-architecture-analysis)
5. [State Machine & Conversation Flow](#5-state-machine--conversation-flow)
6. [Intent Routing System](#6-intent-routing-system)
7. [Entity Extraction Engine](#7-entity-extraction-engine)
8. [Validation Layer](#8-validation-layer)
9. [Session Management](#9-session-management)
10. [Database Schema](#10-database-schema)
11. [WhatsApp Integration](#11-whatsapp-integration)
12. [Configuration Analysis](#12-configuration-analysis)
13. [Code Quality Assessment](#13-code-quality-assessment)
14. [Known Issues & Bugs](#14-known-issues--bugs)
15. [Documentation Audit](#15-documentation-audit)
16. [Recommendations](#16-recommendations)
17. [Appendix: File-by-File Summary](#17-appendix-file-by-file-summary)

---

## 1. Project Overview

A WhatsApp chatbot for **Shri Balaji Dental Clinic** in Bhilai, Chhattisgarh, India. The bot handles appointment booking, service inquiries, clinic information, emergency triage, and human escalation — all through WhatsApp's Business API with interactive list/button messages.

### Core Capabilities

| Feature | Status | Details |
|---|---|---|
| Appointment Booking | ✅ Complete | Full 4-step flow: Date → Time → Treatment → Confirmation |
| Service Listings | ✅ Complete | 8 dental treatments with alias-based matching |
| Clinic Location/Timings | ✅ Complete | Address, maps link, phone, hours |
| Emergency Detection | ✅ Complete | Keyword-based, highest priority |
| Human Escalation | ✅ Complete | Manual request or auto-triggered after 3 failures |
| Callback Requests | ✅ Complete | Phone number collection |
| Appointment Management | ✅ Complete | Cancel, reschedule, view upcoming |
| Multi-Entity Extraction | ✅ Complete | Date/time/treatment from single sentence |
| Session Persistence | ✅ Complete | PostgreSQL via Neon serverless |
| Message Deduplication | ✅ Complete | 2-layer (memory + DB) |
| Optimistic Locking | ✅ Complete | Version-based concurrency control |

---

## 2. Technology Stack

| Technology | Version | Purpose |
|---|---|---|
| **Next.js** | 16.2.1 | App Router framework (API routes) |
| **React** | 19.2.4 | UI framework (used for minimal frontend) |
| **React DOM** | 19.2.4 | Peer dependency |
| **@neondatabase/serverless** | ^1.1.0 | Serverless PostgreSQL driver |
| **Tailwind CSS** | ^4 | CSS framework (PostCSS plugin v4) |
| **ESLint** | ^9 | Linting |
| **eslint-config-next** | 16.2.1 | Next.js ESLint config |
| **babel-plugin-react-compiler** | 1.0.0 | React compiler plugin |
| **Node.js** | (runtime) | ES modules throughout |
| **PostgreSQL (Neon)** | Serverless | Database |
| **Meta WhatsApp Cloud API** | v19.0 | WhatsApp messaging |

### Package Manager
- `npm` (implied by `package-lock.json` convention)
- Scripts: `dev`, `build`, `start`, `lint`, `db:migrate`, `db:status`

### Build Configuration
- `next.config.mjs` — React Compiler enabled (`reactCompiler: true`)
- `postcss.config.mjs` — Tailwind CSS PostCSS plugin
- `jsconfig.json` — Path alias `@/` → `./src/*`
- `eslint.config.mjs` — Uses `eslint-config-next/core-web-vitals`, ignores `.next/`, `out/`, `build/`

---

## 3. Project Structure & File Inventory

### Complete File Tree

```
/
├── package.json                          # Dependencies, scripts
├── next.config.mjs                       # Next.js config
├── postcss.config.mjs                    # PostCSS/Tailwind config
├── jsconfig.json                         # JS path aliases
├── eslint.config.mjs                     # ESLint flat config
├── .gitignore                            # Git ignore rules
├── README.md                             # Setup instructions (generic Next.js)
├── docs/
│   ├── user-flow-guide.md                # End-user conversation guide
│   ├── architecture.md                   # Architecture design doc
│   ├── entity-extraction-design.md       # Entity extraction strategy doc
│   └── audit-and-improvements.md         # Previous audit & fix plan
└── src/
    ├── app/
    │   ├── layout.js                     # Root layout (Geist fonts)
    │   ├── page.js                       # Homepage (default Next.js starter)
    │   ├── globals.css                   # Tailwind CSS imports + theme vars
    │   └── api/
    │       └── webhook/
    │           └── whatsapp/
    │               └── route.js          # WhatsApp webhook handler (GET + POST)
    ├── config/
    │   ├── clinic.js                     # Clinic details, hours, treatments
    │   ├── states.js                     # State enum + transition table
    │   └── intents.js                    # Intent keyword maps
    ├── lib/
    │   ├── engine.js                     # Main pipeline orchestrator
    │   ├── router.js                     # Intent classifier
    │   ├── entities.js                   # Entity extraction (regex)
    │   ├── transitions.js                # State transition validator
    │   ├── handlers.js                   # ALL state handlers (~600 lines)
    │   ├── validators.js                 # ALL validators (date, time, treatment, phone)
    │   ├── session.js                    # Session manager (getOrCreate, save)
    │   ├── whatsapp.js                   # WhatsApp API client (send, markRead)
    │   ├── deduplicate.js                # In-memory + DB dedup
    │   └── logger.js                     # Structured JSON logger
    ├── db/
    │   ├── pool.js                       # Neon connection + migrations runner
    │   ├── migrations/
    │   │   └── 001_core.sql              # Core SQL schema (sessions, messages)
    │   └── repositories/
    │       ├── sessionRepository.js      # Session CRUD
    │       ├── messageRepository.js      # Message CRUD
    │       └── appointmentRepository.js  # Appointment CRUD
    └── utils/
        └── formatters.js                 # Date/time/phone display formatters
```

### File Count: **23 source files** (excluding docs, config files)
- App: 4 files
- Config: 3 files
- Lib: 9 files
- DB: 5 files (pool, 1 migration, 3 repos)
- Utils: 1 file

---

## 4. Architecture Analysis

### 4.1 Architecture Overview

The bot follows a **pipeline architecture** with these stages:

```
Webhook POST → Parse JSON → Check dedup → Normalize message →
Load session → Classify intent → Extract entities →
State handler → Send reply → Save messages → Save session
```

### 4.2 Strengths

1. **Clean separation of concerns**: Each lib file has a single responsibility
2. **Deterministic by design**: No AI dependency; all logic is rule-based
3. **Idempotency-first**: Two-layer dedup (in-memory + DB unique constraint)
4. **Retry-safe**: Webhook returns 200 immediately, processing is async
5. **Optimistic locking**: Version-based session updates prevent corruption
6. **Pure validators**: No side effects in validation functions
7. **Structured logging**: JSON-formatted logs with consistent fields
8. **ES modules throughout**: Modern JavaScript

### 4.3 Weaknesses

1. **State machine is decorative, not enforced**: `transitions.js` defines valid transitions but `engine.js` never blocks invalid ones — the router dispatches by intent regardless of current state
2. **Monolithic handlers file**: `handlers.js` is ~600 lines containing ALL 15+ state handlers — violates Single Responsibility Principle
3. **Validation feedback is swallowed**: When validation fails, the specific error message (e.g., "We close at 20:00") is replaced with a generic "I didn't catch that" response
4. **No TypeScript**: Entire codebase is JavaScript with no JSDoc types — reduces IDE support and catches fewer bugs
5. **No test suite**: Zero unit or integration tests
6. **Minimal error boundaries**: Engine errors are logged but recovery is limited

### 4.4 Engineering Patterns Used

| Pattern | Location | Notes |
|---|---|---|
| Pipeline | `engine.js` | Sequential processing with `PIPELINE_HALT` sentinel |
| State Machine | `states.js`, `transitions.js` | Explicit states, transition table |
| Strategy | `router.js` | Deterministic intent classification |
| Repository | `db/repositories/` | Abstract DB operations |
| Factory (lite) | `handlers.js` | Reply object constructors |
| Null Object | `session.js` | `emptySession()` prevents null checks |
| Adapter (planned) | `router.js` | AI adapter interface documented in architecture |

---

## 5. State Machine & Conversation Flow

### 5.1 All States (16 total)

| State | Purpose | Entry Trigger |
|---|---|---|
| `IDLE` | Initial state before first interaction | New session |
| `MAIN_MENU` | Main navigation | Greeting, menu return |
| `BOOKING_DATE` | Collecting appointment date | "Book" from menu |
| `BOOKING_TIME` | Collecting appointment time | Valid date provided |
| `BOOKING_TREATMENT` | Collecting treatment selection | Valid time provided |
| `BOOKING_CONFIRMATION` | Confirming full booking | All booking fields filled |
| `BOOKED` | Appointment confirmed | Confirmation accepted |
| `SERVICES` | Browsing dental services | "Services" from menu |
| `LOCATION` | Showing clinic address | "Location" from menu |
| `TIMINGS` | Showing operating hours | "Timings" from menu |
| `EMERGENCY` | Emergency response | Emergency keywords |
| `HUMAN_ESCALATION` | Human handoff | Escalation trigger |
| `CALLBACK_REQUESTED` | Collecting callback phone | "Call back" request |
| `CANCEL_CONFIRM` | Confirm cancellation | Cancel from BOOKED |
| `DONE` | Terminal state | Booking completed |
| `ABANDONED` | Session timed out | Inactivity timeout |

### 5.2 Booking Flow

```
IDLE/MAIN_MENU → BOOKING_DATE → BOOKING_TIME → BOOKING_TREATMENT → BOOKING_CONFIRMATION → BOOKED
                                                         ↑                   │
                                                         └─── edit_date ─────┘
                                                         └─── edit_time ─────┘
```

### 5.3 Global States (Reachable from Any State)

- `EMERGENCY` — Emergency keywords
- `HUMAN_ESCALATION` — "agent", "human", 3x failure
- `MAIN_MENU` — "0", "menu", "cancel"

### 5.4 Transition Table

Defined in `src/config/states.js` as `TRANSITIONS` object. Each state maps to an array of allowed intent names. The transition table is **comprehensive but not enforced** — see Section 14.

### 5.5 State-Specific Features

- **Abandonment detection**: Sessions with `expires_at` in the past and non-terminal state are marked `ABANDONED` on load
- **State-aware greetings**: Returning users get context-appropriate prompts (e.g., "Hi! We were picking a date for your appointment.")
- **Frustration tracking**: Score based on negative sentiment, repetition, and failed attempts. Score >= 4 triggers escalation offer
- **Auto-escalation**: After 3 consecutive failed validation attempts, user is routed to `HUMAN_ESCALATION`

---

## 6. Intent Routing System

### 6.1 Intent Priority Order

The router (`src/lib/router.js`) matches intents in this order:

1. **Interactive ID match** (highest) — deterministic tap handling for list/button IDs
2. **Global intents** — `emergency`, `cancel`, `main_menu`, `escalate`, `back`, `greeting`, `thanks`, `help`
3. **State-specific intents** — intents valid for current state
4. **Entity-derived intents** — date/time/treatment/phone found in text
5. **Number match** (BOOKING_TREATMENT only) — numeric treatment selection
6. **Fallback** → `unknown`

### 6.2 All Intents (32 total)

| Intent | Source | Description |
|---|---|---|
| `emergency` | Global | Medical emergency |
| `cancel` | Global | Cancel/forget |
| `main_menu` | Global | Return to menu |
| `escalate` | Global | Request human agent |
| `back` | Global | Navigate back |
| `greeting` | Global | hi/hello/hey |
| `thanks` | Global | thank you |
| `help` | Global | Show help |
| `appointment` | State | Book appointment |
| `services` | State | View services |
| `location` | State | View location |
| `timings` | State | View timings |
| `callback` | State | Request callback |
| `my_appointments` | State | View upcoming |
| `confirm` | State | Confirm booking |
| `edit_date` | State | Change date |
| `edit_time` | State | Change time |
| `cancel_appointment` | State | Cancel existing |
| `reschedule` | State | Reschedule existing |
| `confirm_cancel` | State | Confirm cancellation |
| `provide_date` | Derived | Date entity found |
| `provide_time` | Derived | Time entity found |
| `provide_treatment` | Derived | Treatment entity found |
| `provide_phone` | Derived | Phone entity found |
| `date_custom` | Interactive | Type custom date |
| `time_custom` | Interactive | Type custom time |
| `unknown` | Fallback | No match |

### 6.3 Interactive ID Mapping

List/button taps map to intents via `ID_TO_INTENT`:

```javascript
{ apt: 'appointment', svc: 'services', loc: 'location', tim: 'timings',
  confirm: 'confirm', edit_date, edit_time, cancel, time_other: 'time_custom',
  my_appts: 'my_appointments', book_another: 'appointment',
  cancel_appt: 'cancel_appointment', resched: 'reschedule',
  confirm_cancel_yes: 'confirm_cancel', confirm_cancel_no: 'back' }
```

Date IDs (`date_today`, `date_tomorrow`, `date_next_mon`, `date_YYYY-MM-DD`) are resolved to `Date` objects and passed as entities.

---

## 7. Entity Extraction Engine

### 7.1 Architecture

`src/lib/entities.js` → Preprocessing → Date extraction → Time extraction → Treatment extraction → Phone extraction

### 7.2 Preprocessing Layer

Strips conversational noise before extraction:
- Request prefixes: `i want to`, `i would like to`, `can i`, `could you`, `please`
- Polite suffixes: `please`, `thanks`, `thank you`
- Question prefixes: `can you tell me`, `do you have`, `what about`

### 7.3 Date Extraction Capabilities

| Pattern | Example | Status |
|---|---|---|
| Absolute references | `today`, `tomorrow`, `day after tomorrow` | ✅ |
| Weekday references | `next Monday`, `this Friday`, `Wednesday` | ✅ |
| Spoken DMY | `25 May`, `May 25th`, `25th May 2026` | ✅ |
| Spoken MDY | `May 25`, `May 25, 2026` | ✅ |
| ISO format | `2026-05-25` | ✅ |
| Numeric DMY full | `25/05/2026`, `25-05-2026` | ✅ |
| Numeric DMY short | `25/05` (assumes current year) | ✅ |

Validation checks: past dates (rejected), booking horizon (30 days max, rejected).

### 7.4 Time Extraction Capabilities

| Pattern | Example | Status |
|---|---|---|
| HH:MM with am/pm | `2:30pm`, `2:30 pm`, `14:30` | ✅ |
| Hour + am/pm | `2pm`, `10 am` | ✅ |
| Spoken | `half past 2`, `quarter past 2`, `quarter to 3` | ✅ |
| O'clock | `2 o'clock` | ✅ |

Validation checks: before opening (rejected), after closing (rejected), non-30-min slots (rounded suggestion), unavailable slot (suggestion).

### 7.5 Treatment Extraction

8 treatments defined in `CLINIC.treatments`:

| Treatment | Aliases |
|---|---|
| General Dentistry | checkup, consultation, dental checkup |
| Teeth Cleaning | cleaning, scaling, teeth cleaning, clean |
| Root Canal | root canal, rct, rc, nerve treatment |
| Whitening | whitening, teeth whitening, bleaching |
| Implants | implant, dental implant |
| Braces | braces, orthodontic, aligners, invisalign |
| Crowns | crown, cap, bridge |
| Pediatric Dentistry | pediatric, child, children, kids, baby teeth |

Matching uses word-boundary regex (`\b`) on aliases sorted by length (descending) for multi-word priority.

### 7.6 Phone Extraction

Extracts 10-digit Indian mobile numbers:
- Optional `+91` or `0` prefix
- Returns standardized `+91XXXXXXXXXX` format
- Also handles landlines with STD codes

### 7.7 Multi-Entity Auto-Fill

If date + time + treatment are extracted from a single message, the engine auto-advances to `BOOKING_CONFIRMATION` (skipping intermediate steps).

---

## 8. Validation Layer

All validators in `src/lib/validators.js` are **pure functions** with no side effects.

### 8.1 Date Validator (`validateDate`)

| Reason | Description |
|---|---|
| `MISSING` | No input |
| `PARSE_FAILED` | Could not parse date |
| `PAST_DATE` | Date is in the past |
| `BEYOND_HORIZON` | More than 30 days ahead |

### 8.2 Time Validator (`validateTime`)

| Reason | Description |
|---|---|
| `MISSING` | No input |
| `PARSE_FAILED` | Could not parse time |
| `BEFORE_OPENING` | Before clinic opening |
| `AFTER_CLOSING` | At or after clinic closing |
| `INVALID_SLOT` | Not aligned to 30-min slots (rounded suggestion) |
| `SLOT_UNAVAILABLE` | Not in available slots list |

### 8.3 Treatment Validator (`validateTreatment`)

- `MISSING` — No input
- `UNKNOWN` — Not matched to any treatment (shows available list)

### 8.4 Phone Validator (`validatePhone`)

- `MISSING` — No input
- `INVALID` — Not a valid 10-digit number (shows format hint)

---

## 9. Session Management

### 9.1 Session Data Model

```javascript
{
  id: UUID,
  waId: "919876543210",         // WhatsApp sender ID (primary key)
  phoneNumberId: "1167005879826347",
  profileName: "Rahul Sharma",
  state: "BOOKING_DATE",        // Current FSM state
  previousState: "MAIN_MENU",   // For back navigation
  context: {
    booking: { date, time, treatment, patientName, patientPhone, notes },
    appointmentId: null,
    escalationReason: null,
    reschedulingAppointmentId: null  // Set during reschedule flow
  },
  metrics: {
    failedAttempts: 0,           // Current field failures
    totalFailedAttempts: 2,      // Session lifetime
    messagesInState: 4,
    frustrationScore: 0,
    currentField: "date"
  },
  isEscalated: false,
  version: 5,                   // Optimistic lock
  lastActivityAt: ISO datetime,
  createdAt: ISO datetime,
  expiresAt: ISO datetime        // 30-min TTL
}
```

### 9.2 Key Behaviors

- **Abandonment**: On load, if `expires_at < now` and state is not terminal, state is set to `ABANDONED`
- **Concurrency**: Optimistic locking via `version` column — writes use `WHERE version = :current`, increment on success
- **Session expiry**: 30-minute inactivity TTL (`expires_at = NOW() + INTERVAL '30 minutes'`)
- **Context reset**: `resetBookingContext()` clears booking fields but preserves other context

---

## 10. Database Schema

### 10.1 Sessions Table

```sql
CREATE TABLE sessions (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wa_id            VARCHAR(20) NOT NULL UNIQUE,
    phone_number_id  VARCHAR(20),
    profile_name     VARCHAR(100),
    state            VARCHAR(50) NOT NULL DEFAULT 'IDLE',
    previous_state   VARCHAR(50),
    context          JSONB NOT NULL DEFAULT '{}',
    metrics          JSONB NOT NULL DEFAULT '{}',
    is_escalated     BOOLEAN NOT NULL DEFAULT FALSE,
    version          INTEGER NOT NULL DEFAULT 1,
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at       TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 minutes')
);
```

- Unique constraint on `wa_id` (one session per WhatsApp user)
- CHECK constraint on `state` (validates against all 16 states)
- Index on `wa_id`
- JSONB for flexible context/metrics storage

### 10.2 Messages Table

```sql
CREATE TABLE messages (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    msg_id       VARCHAR(100) UNIQUE,
    session_id   UUID REFERENCES sessions(id) ON DELETE CASCADE,
    wa_id        VARCHAR(20) NOT NULL,
    role         VARCHAR(10) NOT NULL CHECK (role IN ('user','bot')),
    content      TEXT,
    intent       VARCHAR(50),
    metadata     JSONB DEFAULT '{}',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

- Unique constraint on `msg_id` (for deduplication via `ON CONFLICT DO NOTHING`)
- Foreign key to sessions with CASCADE delete
- Indexes on `wa_id` and `msg_id`

### 10.3 Appointments Table

```sql
CREATE TABLE appointments (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id          UUID REFERENCES sessions(id),
    wa_id               VARCHAR(20) NOT NULL,
    patient_name        VARCHAR(100),
    date                DATE NOT NULL,
    time                TIME NOT NULL,
    treatment           VARCHAR(100),
    status              VARCHAR(20) NOT NULL DEFAULT 'confirmed',
    cancelled_at        TIMESTAMPTZ,
    cancellation_reason VARCHAR(255),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

- CHECK constraint on `status` (confirmed, cancelled, completed, no_show)
- Indexes on `wa_id` and `date`
- Optional `cancelled_at` and `cancellation_reason` (added via ALTER TABLE)

### 10.4 Migration Strategy

Migrations run automatically on first webhook via `runMigrations()` in `pool.js`. Uses `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ADD COLUMN IF NOT EXISTS` for idempotency. A standalone SQL file (`001_core.sql`) is also available for manual migration.

---

## 11. WhatsApp Integration

### 11.1 Webhook Endpoint

`POST /api/webhook/whatsapp/route.js`

- **GET**: WhatsApp verification challenge (compares `hub.verify_token` against env)
- **POST**: Accepts webhook events, returns 200 immediately, processes async

### 11.2 WhatsApp API Client (`src/lib/whatsapp.js`)

| Function | Method | Description |
|---|---|---|
| `sendText(to, text)` | POST messages | Send plain text |
| `sendButtons(to, body, buttons[])` | POST interactive | Send button message (max 3 buttons) |
| `sendList(to, body, buttonLabel, sections[])` | POST interactive | Send list message |
| `markAsRead(messageId)` | POST messages | Mark message as read |

Uses Meta Graph API v19.0. All calls are fire-and-forget with error logging.

### 11.3 Edge Case Handling

- Business echo messages: Filtered out (messages from `WHATSAPP_PHONE_NUMBER_ID`)
- Status updates (delivery/read receipts): Silently skipped
- Duplicate webhooks: Caught by 2-layer dedup
- Invalid JSON: Logged, 200 returned
- Network errors: Caught and logged, returns `null`
- Multi-message webhooks: Sorted by timestamp, processed in order

---

## 12. Configuration Analysis

### 12.1 Clinic Config (`src/config/clinic.js`)

```javascript
{
  name: 'Shri Balaji Dental Clinic',
  phone: '+91 91833 74850',
  address: 'Ground Floor, MIG-1/321, Amdi Nagar, Hudco Colony, Hudco, Bhilai, Chhattisgarh 490009',
  mapsLink: 'https://share.google/a2jCV7O4P6KbgrQoo',
  hours: {
    weekday: { open: '09:00', close: '20:00', label: 'Mon–Sat: 9:00 AM – 8:00 PM' },
    sunday:  { open: '10:00', close: '14:00', label: 'Sunday: 10:00 AM – 2:00 PM' },
  },
  bookingHorizonDays: 30,
  slotIntervalMinutes: 30,
  slots: {
    weekday: ['09:00','09:30',...,'19:30'],  // 20 slots (lunch break 12:30-14:00)
    sunday:  ['10:00','10:30',...,'13:30'],   // 8 slots
  },
  treatments: [ /* 8 treatments with aliases */ ]
}
```

Notable: Lunch break from 12:30 to 14:00 on weekdays (no slots listed). The bot implicitly handles this.

### 12.2 State Config (`src/config/states.js`)

16 states defined. Transition table for each state with allowed intents. Additionally exports `TRANSITIONS` constant used by `transitions.js`.

### 12.3 Intent Config (`src/config/intents.js`)

Two exports:
- `GLOBAL_INTENTS`: 8 global intents with keyword arrays
- `STATE_INTENTS`: State-scoped intents for MAIN_MENU, BOOKING_CONFIRMATION, BOOKED, CANCEL_CONFIRM

---

## 13. Code Quality Assessment

### 13.1 Metrics by File

| File | Lines | Complexity | Notes |
|---|---|---|---|
| `handlers.js` | ~680 | High | Largest file, all 15+ state handlers |
| `engine.js` | ~195 | Medium | Pipeline orchestration |
| `validators.js` | ~230 | High | Date/time parsing is regex-heavy |
| `router.js` | ~160 | Medium | Intent classification logic |
| `entities.js` | ~80 | Medium | Entity extraction |
| `whatsapp.js` | ~120 | Low | API client |
| `session.js` | ~105 | Medium | Session management |
| `pool.js` | ~95 | Low | DB connection + migrations |
| All repos | ~60 each | Low | CRUD operations |
| `formatters.js` | ~35 | Low | Display formatting |
| `logger.js` | ~35 | Low | Structured logging |
| `deduplicate.js` | ~55 | Low | Dedup logic |

### 13.2 Strengths

- **Consistent error handling**: Try/catch with structured logging throughout
- **Clean separations**: Each file has a clear, single purpose
- **No circular dependencies**: Import graph is a DAG
- **Modern JavaScript**: ES modules, arrow functions, destructuring, spread operators
- **No external AI dependency**: Fully deterministic — no API calls to LLMs
- **Immutable patterns**: Session is always spread-copied, never mutated in place
- **Idempotent DB operations**: Upserts, `ON CONFLICT DO NOTHING`

### 13.3 Weaknesses

- **No TypeScript**: All JS with no type annotations — missed opportunities for IDE support and catching bugs
- **No tests**: Zero test files (no `*.test.js`, `*.spec.js`, or test directory)
- **Monolithic handler file**: `handlers.js` at ~680 lines violates SRP
- **Hardcoded string messages**: Reply messages are inline strings, not in a separate i18n/template file
- **Async/await mixed with fire-and-forget**: Some promises are not awaited (e.g., `markAsRead`, migration promises after response)
- **Light error recovery**: Failed message processing is logged but not retried or dead-lettered

---

## 14. Known Issues & Bugs

### Critical (P0)

| ID | Issue | Location | Description |
|---|---|---|---|
| B1 | `confirm` intent hijacking | `intents.js` (lines 47-52) | "yes", "ok", "sure", "done" match `confirm` globally — users saying "ok" during booking get hijacked to confirmation flow |
| B2 | State machine not enforced | `engine.js` / `transitions.js` | `findTransition()` returns information but `processEvent()` never blocks invalid transitions — router dispatches by intent regardless of state |
| B3 | Bot reply messages lost | `engine.js` (save section) | Bot replies saved with user's `msg_id` → UNIQUE constraint violation → silent data loss; `sendReply()` returns a new msgId but it's never stored |

### High (P1)

| ID | Issue | Location | Description |
|---|---|---|---|
| B4 | Slot rounding produces broken text | `validators.js` (~line 54) | `10.5:30` shown instead of `10:30` because `Math.floor(645/30)*30/60 = 10.5` |
| B5 | Validation feedback swallowed | `handlers.js`/`validators.js` | "We close at 20:00", "That date has passed" etc. thrown away; generic "I didn't catch that" shown instead |
| B6 | Initial prompt counts as failure | `handlers.js` (multiple) | Entering BOOKING_DATE/TIME/TREATMENT increments `failedAttempts` — user gets 1 fewer retry before escalation |
| B7 | `services` intent blocks treatment selection by number | `router.js` | Typing "2" in SERVICES state matches `services` again instead of routing to appointment |

### Medium (P2)

| ID | Issue | Location | Description |
|---|---|---|---|
| B8 | "thanks" and "help" leave user hanging | `handlers.js` | No re-prompt after showing help/thanks |
| B9 | "back" from non-booking shows vague message | `handlers.js` | Shows "Going back." without re-prompting |
| B10 | Sessions never expire server-side | `pool.js` / `session.js` | `expires_at` is set but no cron job or server-side timeout check updates sessions |
| B11 | HUMAN_ESCALATION recovery not communicated | `handlers.js` | Escalation message says "call us" but doesn't mention user can type "0" to return to menu |
| B12 | Reschedule flow incomplete | `handlers.js` | Reschedule sets `reschedulingAppointmentId` but date/time/treatment from original booking not pre-filled in confirmation |

### Low (P3)

| ID | Issue | Location | Description |
|---|---|---|---|
| B13 | Duplicate format functions | `handlers.js` / `formatters.js` | `formatDateDisplay()` in handlers duplicates `formatDate()` in formatters |
| B14 | Dead `State.GREETING` reference | `handlers.js` | Referenced but doesn't exist in state enum |
| B15 | Inconsistent voice/formtting | Throughout | Mixed `—` vs `-`, `\n\n` vs `\n`, bullet styles |
| B16 | No phone validation in callback | `handlers.js` | `handleCallbackRequested` proceeds even if phone not extracted |

---

## 15. Documentation Audit

### 15.1 Existing Documentation

| Document | Quality | Coverage |
|---|---|---|
| `README.md` | ❌ Generic Next.js template | Doesn't describe the bot at all |
| `docs/architecture.md` | ✅ Excellent | Comprehensive design doc with state diagrams, pipeline design, DB schema, patterns |
| `docs/user-flow-guide.md` | ✅ Excellent | End-to-end walkthrough of every user journey with examples |
| `docs/entity-extraction-design.md` | ✅ Excellent | Detailed extraction design with regex patterns, scoring, before/after tables |
| `docs/audit-and-improvements.md` | ✅ Excellent | Previous audit with 18 negative flows, bug catalog, priority matrix |

### 15.2 Missing Documentation

- **Setup guide**: No `.env.example` or environment variable documentation
- **API reference**: No document describing the webhook API
- **Deployment guide**: No deployment instructions
- **Code comments**: Minimal inline comments in source files
- **JSDoc types**: No type annotations anywhere
- **Environment variables**: Documented only in architecture doc appendix, not in a `.env.example`

### 15.3 Documentation Quality

The docs/ directory is **exceptional** — thorough, well-structured, with useful tables and diagrams. However, the README is still the default Next.js starter, which is misleading.

---

## 16. Recommendations

### Immediate (Next Sprint)

1. **Fix B1 — `confirm` intent hijacking**: Remove "yes", "ok", "sure", "done", "yeah", "yep" from `confirm` matching. Only match "confirm", "book it", "proceed", "go ahead". Use a separate `affirmative` intent for casual affirmation that re-prompts contextually.

2. **Fix B3 — Bot message storage**: Store bot replies with the WhatsApp message ID returned by `sendReply()` instead of the user's `msg_id`.

3. **Fix B5 — Validation feedback**: Pass validation `suggestion` through to the user instead of using generic "I didn't catch that" responses.

4. **Fix B4 — Slot rounding**: Fix the math in `validateTime` to produce correct time suggestions like `10:30` instead of `10.5:30`.

### Short-term

5. **Enforce state machine (B2)**: After `classifyIntent`, check that the intent is valid for the current state. If not, show a contextual message or auto-route to the closest valid state.

6. **Fix B6 — `failedAttempts` counting**: Don't increment `failedAttempts` on initial state entry — only when the user actually provides invalid input.

7. **Add re-prompts (B8)**: Append state-specific reprompt after "help" and "thanks" responses.

8. **Improve back navigation (B9)**: Always show the target state's prompt after navigating back.

9. **Add `.env.example`**: Document all required environment variables.

10. **Update `README.md`**: Replace generic Next.js template with project-specific documentation.

### Medium-term

11. **Add TypeScript**: Start with critical files (validators, entities, engine) and expand.

12. **Write tests**: Priority on validators (pure functions, easy to test), then handlers.

13. **Split `handlers.js`**: Extract each state handler into its own file under `src/lib/states/`.

14. **Add session expiry cron job**: Implement server-side timeout and abandonment marking.

15. **Add retry mechanism for failed messages**: Implement dead-letter queue for processing failures.

16. **Add rate limiting**: Prevent abuse and excessive API calls.

### Long-term

17. **AI integration**: Add pluggable AI adapter for intent classification and entity extraction, with deterministic fallback.

18. **Multi-language support**: Template-based i18n for Hindi/English.

19. **Appointment reminders**: Cron job for 24h reminders via WhatsApp templates.

20. **Analytics dashboard**: Track booking rates, drop-off points, popular treatments.

---

## 17. Appendix: File-by-File Summary

### `package.json`
- **Purpose**: Project metadata, dependencies, scripts
- **Dependencies**: Next.js 16.2.1, React 19.2.4, @neondatabase/serverless
- **Scripts**: dev, build, start, lint, db:migrate, db:status
- **Notable**: React Compiler enabled via babel-plugin

### `next.config.mjs`
- Very minimal config (8 lines)
- `reactCompiler: true` enabled

### `src/config/clinic.js`
- Shri Balaji Dental Clinic in Bhilai, Chhattisgarh
- 8 treatments with multiple aliases each
- Weekday hours: 9AM-8PM (with lunch break 12:30-2PM)
- Sunday hours: 10AM-2PM
- 30-day booking horizon

### `src/config/states.js`
- 16 states defined
- Complete transition table for all state+intent pairs
- Used by `transitions.js` for validation

### `src/config/intents.js`
- 8 global intents with keyword arrays
- State-specific intents for 4 states (MAIN_MENU, BOOKING_CONFIRMATION, BOOKED, CANCEL_CONFIRM)
- Keywords use exact match and contains match strategies

### `src/lib/engine.js` (~195 lines)
- Pipeline orchestrator with 10+ sequential steps
- `processEvent()` is the main entry point
- Uses `PIPELINE_HALT` sentinel for early termination
- Handles multi-message webhooks sorted by timestamp

### `src/lib/router.js` (~160 lines)
- Intent classification with 5 priority tiers
- Interactive ID resolution (list/button tap IDs → intents)
- Date ID resolution (date_YYYY-MM-DD → Date objects)
- Fallback to `unknown` intent

### `src/lib/entities.js` (~80 lines)
- Preprocesses text (strips conversation fluff)
- Extracts date, time, treatment, phone using validators
- Returns structured entities object with null for unfound fields

### `src/lib/transitions.js` (~55 lines)
- `isValidTransition()` — checks if intent is valid for state
- `getNextState()` — maps valid intent+state to next state
- Hardcoded global intent → state mappings

### `src/lib/handlers.js` (~680 lines)
- Largest file — contains all state handler functions
- Handlers: IDLE, MAIN_MENU, BOOKING_DATE, BOOKING_TIME, BOOKING_TREATMENT, BOOKING_CONFIRMATION, BOOKED, SERVICES, LOCATION, TIMINGS, EMERGENCY, HUMAN_ESCALATION, CALLBACK_REQUESTED, CANCEL_CONFIRM
- Plus: greeting, help, my_appointments, cancel, cancel_appointment
- Helper functions: resetBookingContext, buildConfirmationBody, formatDateDisplay, confirmationSections, mainMenuSections, etc.

### `src/lib/validators.js` (~230 lines)
- 4 validators: `validateDate()`, `validateTime()`, `validateTreatment()`, `validatePhone()`
- Date: Parses multiple formats (relative, spoken, numeric), checks past/horizon
- Time: Parses HH:MM, hour+meridiem, spoken patterns, checks hours/slots
- Treatment: Word-boundary alias matching with config-based treatments
- Phone: 10-digit Indian mobile number parsing

### `src/lib/session.js` (~105 lines)
- `getOrCreate()` — Load existing session or create new
- `save()` — Persist session with optimistic locking
- `rowToSession()` — DB row → session object with JSONB parsing
- `emptySession()` — Default session factory

### `src/lib/whatsapp.js` (~120 lines)
- WhatsApp Cloud API v19.0 client
- 4 functions: sendText, sendButtons, sendList, markAsRead
- Truncates titles to WhatsApp limits (20 chars buttons, 24 chars list rows)
- Max 3 buttons per message enforced

### `src/lib/deduplicate.js` (~55 lines)
- 2-layer deduplication: in-memory Set + DB UNIQUE constraint
- In-memory cache capped at 10,000 entries (LRU-style trim)
- Falls through on DB errors (process twice rather than drop)

### `src/lib/logger.js` (~35 lines)
- Structured JSON logger
- 4 levels: debug, info, warn, error
- Configurable via `LOG_LEVEL` env var
- Errors go to stderr, others to stdout

### `src/db/pool.js` (~95 lines)
- Neon serverless connection via `@neondatabase/serverless`
- `getSql()` — lazy singleton SQL client (returns null if no DATABASE_URL)
- `runMigrations()` — Creates sessions, messages, appointments tables + indexes + constraints

### `src/db/repositories/sessionRepository.js` (~80 lines)
- `findSessionByWaId()` — Session lookup by WhatsApp ID
- `upsertSession()` — Create or update (ON CONFLICT DO UPDATE)
- `saveSession()` — Update with version increment (optimistic lock)

### `src/db/repositories/messageRepository.js` (~55 lines)
- `createMessage()` — Insert with ON CONFLICT DO UPDATE (idempotent by msg_id)
- `findMessageByMsgId()` — Simple lookup

### `src/db/repositories/appointmentRepository.js` (~95 lines)
- CRUD: create, cancel, update, find by WA ID, find upcoming
- `findUpcomingByWaId()` — Confirmed appointments with date >= today, ordered by date/time
- `cancelAppointment()` — Sets status, cancelled_at, cancellation_reason

### `src/db/migrations/001_core.sql`
- Core tables: sessions, messages
- Indexes and constraints
- Used for manual CLI migration via `npm run db:migrate`

### `src/utils/formatters.js` (~35 lines)
- `formatDate()` — en-IN locale, full date string
- `formatTime()` — HH:MM → 12-hour format
- `formatPhone()` — +91XXXXX → "+91 XXXXX XXXXX"

### `src/app/api/webhook/whatsapp/route.js`
- GET: WhatsApp verification challenge
- POST: Accept webhook, return 200, process async
- Migrations run on first request with retry on failure

### `src/app/layout.js`
- Next.js root layout
- Geist/Geist Mono fonts from `next/font/google`
- Tailwind CSS classes for full-height layout

### `src/app/page.js`
- Default Next.js starter page (not used by bot)
- Would need updating for any frontend UI

### `src/app/globals.css`
- Tailwind CSS import
- Light/dark theme variables
- @theme inline configuration

---

*End of Audit Report — 26 May 2026*
