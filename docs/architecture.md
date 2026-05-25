# Shri Balaji Dental Clinic — WhatsApp Conversation Engine Architecture

> **Stack:** Next.js 16 (App Router) · Meta WhatsApp Cloud API · Neon DB (PostgreSQL) · Node.js
>
> **Status:** Architecture v1.0 — ready for implementation

---

## Table of Contents

1. [Conversation State Design](#1-conversation-state-design)
2. [Session Model](#2-session-model)
3. [Intent Routing Architecture](#3-intent-routing-architecture)
4. [Entity Extraction Strategy](#4-entity-extraction-strategy)
5. [Appointment Workflow Design](#5-appointment-workflow-design)
6. [Error Recovery Strategy](#6-error-recovery-strategy)
7. [Human Handoff Design](#7-human-handoff-design)
8. [Validation Rules](#8-validation-rules)
9. [State Transition Diagrams](#9-state-transition-diagrams)
10. [Folder Structure](#10-folder-structure)
11. [AI Integration Architecture](#11-ai-integration-architecture)
12. [Database Schema](#12-database-schema)
13. [Message Normalization Layer](#13-message-normalization-layer)
14. [Idempotency Handling](#14-idempotency-handling)
15. [Retry Safety](#15-retry-safety)
16. [WhatsApp Webhook Edge-Case Handling](#16-whatsapp-webhook-edge-case-handling)
17. [Middleware Pipeline](#17-middleware-pipeline)
18. [Deterministic vs AI-Based Routing](#18-deterministic-vs-ai-based-routing)
19. [Anti-Spaghetti-Code Architecture](#19-anti-spaghetti-code-architecture)
20. [Engineering Patterns](#20-engineering-patterns)

---

## 1. Conversation State Design

The state machine models the **patient journey**, not just message flow. Every state has:

- `onEnter` — what to send when entering
- `onMessage` — how to process user input
- `onTimeout` — what to do on inactivity
- `allowedTransitions` — valid next states
- `validationRules` — per-field validators

### State Map

```
                  ┌──────────────┐
                  │    IDLE      │
                  └──────┬───────┘
                         │ any inbound
                         ▼
                  ┌──────────────┐
            ┌────►│  MAIN_MENU   │◄───────── back/0 ─────────┐
            │     └──┬───┬───┬──┬┘                           │
            │        │   │   │  │                            │
   ┌────────┤   ┌────┘   │   └──┐                    ┌───────┴───────┐
   │        │   │        │      │                    │               │
   ▼        ▼   ▼        ▼      ▼               ┌───┴────┐    ┌─────┴────┐
┌──────┐ ┌──────┐ ┌────────┐ ┌───────┐   ┌─────►RE-BOOK │    │ CANCEL   │
│ BOOK │ │SERVICES││LOCATION││TIMINGS│   │    │(resched)│    │ (confirm)│
│ DATE │ │       │ │        │ │       │   │    └────────┘    └────┬─────┘
└──┬───┘ └───────┘ └────────┘ └───────┘   │                      │
   │                                       │                      ▼
   ▼                                       │               ┌──────────────┐
┌──────┐                                   │               │  CANCELLED   │
│ TIME │                                   │               └──────────────┘
└──┬───┘                                   │
   │                                       │
   ▼                                       │
┌──────────┐                               │
│TREATMENT │◄── edit treatment ───┐        │
└────┬─────┘                      │        │
     │                            │        │
     ▼                            │        │
┌──────────────┐   ┌──────────┐   │        │
│ CONFIRMATION │──►│EDIT_DATE │───┘        │
└──┬─────┬─────┘   └──────────┘            │
   │     │                                  │
   │     └── change mind ──────────────────►│
   ▼                                        │
┌──────────┐                                │
│ BOOKED   │── post-booking menu ──────────►│
└──────────┘
```

### Edge States (reachable from any state)

| State | Trigger | Behavior |
|---|---|---|
| `EMERGENCY` | Emergency keywords | Highest priority; immediate escalation + staff alert |
| `HUMAN_ESCALATION` | Explicit request, 3x failure, frustration | Warm handoff with full context |
| `CALLBACK_REQUESTED` | "Call me back" | Collect phone + preferred time slot |
| `ABANDONED` | Session timeout | Recovery prompt on next message |

### All States

```javascript
STATES = [
  'IDLE',                  // No active conversation
  'MAIN_MENU',             // Showing main options
  'BOOKING_DATE',          // Collecting preferred date
  'BOOKING_TIME',          // Collecting preferred time
  'BOOKING_TREATMENT',     // Collecting treatment needed
  'BOOKING_CONFIRMATION',  // Confirming all details
  'BOOKED',                // Appointment confirmed
  'RESCHEDULING',          // Modifying existing appointment
  'CANCELLING',            // Cancelling appointment
  'SERVICES',              // Browsing treatment list
  'LOCATION',              // Asking for clinic address
  'TIMINGS',               // Asking for operating hours
  'EMERGENCY',             // Emergency triage
  'HUMAN_ESCALATION',      // Handed off to staff
  'CALLBACK_REQUESTED',    // Awaiting callback
  'FEEDBACK',              // Post-appointment feedback
  'ABANDONED',             // Session timed out
  'DONE',                  // Terminal
]
```

---

## 2. Session Model

The session is the **single source of truth** for a conversation. It lives in Redis (hot) and PostgreSQL (persistent).

```javascript
{
  id: "sess_abc123",
  waId: "919876543210",            // WhatsApp sender ID (primary lookup key)
  phoneNumberId: "1167005879826347",
  profileName: "Rahul Sharma",

  state: "BOOKING_DATE",
  previousState: "MAIN_MENU",      // Enables "back" navigation

  // Structured slot-filling context — NOT freeform
  context: {
    booking: {
      date: null,                  // "2026-05-25"
      time: null,                  // "10:30"
      treatment: null,             // "cleaning"
      patientName: null,
      patientPhone: null,
      notes: null
    },
    appointmentId: null,
    escalationReason: null
  },

  // Behavior tracking
  metrics: {
    failedAttempts: 0,             // Current field failures
    totalFailedAttempts: 2,        // Session lifetime
    messagesInState: 4,
    frustrationScore: 0,
    currentField: "date"           // Which slot we're filling
  },

  // Lifecycle
  flowId: "flow_20260524_001",
  locale: "en",

  lastActivityAt: 1716512345678,
  createdAt: 1716512000000,
  expiresAt: 1716512345678 + 30 * 60 * 1000,  // 30min TTL

  // Flags
  isEscalated: false,
  isBlocked: false,
  isInFreeFormWindow: true
}
```

### Design Decisions

- **No conversation history array** in session — history belongs in the `messages` table. Session keeps only current state and slot context.
- **`previousState`** enables seamless "back" navigation without a stack.
- **30min inactivity TTL** (not 24h CSW). A compact session in Redis; full history persists in Neon.
- **On expiry**, next inbound creates a fresh session, but can query `messages` table for context recovery.

---

## 3. Intent Routing Architecture

Two-pass architecture: **classifier → validator → handler**.

```text
                  ┌─────────────────────┐
                  │  Message Normalizer  │
                  └─────────┬───────────┘
                            │ normalized text
                            ▼
                  ┌─────────────────────┐
                  │   Intent Classifier  │
                  │                     │
                  │  1. State-aware      │ ← session.state restricts valid intents
                  │  2. Keyword/regex    │ ← deterministic base
                  │  3. [future] LLM     │ ← pluggable, same output schema
                  └─────────┬───────────┘
                            │ intent + confidence
                            ▼
                  ┌─────────────────────┐
                  │   Entity Extractor   │
                  │                     │
                  │  1. Regex patterns   │ ← dates, times, phone
                  │  2. Keyword match    │ ← treatments
                  │  3. [future] LLM     │ ← schema-constrained extraction
                  └─────────┬───────────┘
                            │ validated entities
                            ▼
                  ┌─────────────────────┐
                  │  Transition Validator│
                  │                     │
                  │  Is (state + intent) │
                  │  a valid transition? │
                  └──────┬──────┬───────┘
                         │      │
                    valid │      │ invalid
                         ▼      ▼
                  ┌──────────┐ ┌──────────────┐
                  │ State    │ │ Re-prompt or │
                  │ Machine  │ │ re-route     │
                  └────┬─────┘ └──────────────┘
                       │
                       ▼
                  ┌──────────┐
                  │ Handler  │ ← Per-state handler
                  └────┬─────┘
                       │
                       ▼
                  ┌──────────┐
                  │ Response │ ← Template + dynamic data → WhatsApp
                  └──────────┘
```

### Transition Validation Table (excerpt)

```javascript
const TRANSITIONS = {
  IDLE: [
    { intent: 'greeting',    next: 'MAIN_MENU' },
    { intent: 'appointment', next: 'BOOKING_DATE' },
    { intent: 'services',    next: 'SERVICES' },
    { intent: 'emergency',   next: 'EMERGENCY' },
    { intent: 'escalate',    next: 'HUMAN_ESCALATION' },
  ],
  MAIN_MENU: [
    { intent: 'appointment', next: 'BOOKING_DATE' },
    { intent: 'services',    next: 'SERVICES' },
    { intent: 'location',    next: 'LOCATION' },
    { intent: 'timings',     next: 'TIMINGS' },
    { intent: 'emergency',   next: 'EMERGENCY' },
    { intent: 'escalate',    next: 'HUMAN_ESCALATION' },
  ],
  BOOKING_DATE: [
    { intent: 'provide_date',  next: 'BOOKING_TIME',     validate: 'isValidDate' },
    { intent: 'cancel',        next: 'MAIN_MENU' },
    { intent: 'emergency',     next: 'EMERGENCY' },
    { intent: 'escalate',      next: 'HUMAN_ESCALATION' },
    { intent: '*',             next: null },              // stay + reprompt
  ],
  // ... every state has explicit transitions
}
```

The `*` intent is the catch-all — stay in current state, re-prompt with context.

---

## 4. Entity Extraction Strategy

Layered approach — each layer passes through if it can't handle.

### Extraction Pipeline

```javascript
async function extractEntities({ text, state, context }) {
  // Layer 1: Structured types (buttons, lists) — already parsed by normalizer
  // Layer 2: Regex patterns
  // Layer 3: State-aware heuristics
  // Layer 4: [future] LLM with schema constraint

  return { date, time, phone, treatment, patientName };
}
```

### Regex Design for Dates (handles Indian/global formats)

```javascript
const DATE_PATTERNS = [
  // Relative
  { pattern: /(?:to)?day/i,                handler: () => today },
  { pattern: /tomorrow/i,                   handler: () => tomorrow },
  { pattern: /next\s+(mon|tue|wed|thu|fri|sat|sun)/i, handler: nextWeekday },
  { pattern: /this\s+(mon|tue|wed|thu|fri|sat|sun)/i, handler: thisWeekday },

  // Explicit
  { pattern: /(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/, handler: parseDateDMY },

  // Spoken
  { pattern: /(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|...)/i, handler: parseSpokenDate },
];
```

### Key Principle

**Extraction and validation are separate.** The extractor returns best guesses; the validator rejects or accepts. Validation lives in `lib/validation/`, extraction in `lib/conversation/entities.js`.

---

## 5. Appointment Workflow Design

Each state is a module exporting a `handle()` function. The engine calls the current state's handler.

### Example: Booking Date Handler

```javascript
async function handleBookingDate({ session, message, entities }) {
  const { date } = entities;

  // Case 1: Valid date
  if (date && isValidClinicDate(date)) {
    session.context.booking.date = date;
    session.context.metrics.currentField = 'time';
    session.state = 'BOOKING_TIME';
    session.context.metrics.failedAttempts = 0;

    return {
      session,
      reply: `Great! What time works for you?\nWe're open Mon–Sat 9AM–8PM, Sun 10AM–2PM.`,
      action: 'transition',
    };
  }

  // Case 2: Invalid — increment, escalate at 3
  session.context.metrics.failedAttempts++;

  if (session.context.metrics.failedAttempts >= 3) {
    session.state = 'HUMAN_ESCALATION';
    session.context.escalationReason = 'Failed to provide valid date after 3 attempts';
    return {
      session,
      reply: `I'm having trouble understanding the date. Let me connect you to our team.`,
      action: 'escalate',
    };
  }

  // Case 3: Reprompt with examples
  return {
    session,
    reply: `I didn't catch that date. Examples:\n• "tomorrow"\n• "25th May"\n• "next Monday"\n\nOr type "back" to return to menu.`,
    action: 'reprompt',
  };
}
```

### Slot Availability (deterministic, not AI)

```javascript
async function checkAvailability(date) {
  // Phase 1: Static slots from operating hours
  // Phase 2: Query DB for booked slots, subtract
  // Phase 3: [future] Real-time calendar API

  const DAY_SLOTS = {
    weekday: ['09:00','09:30','10:00','10:30','11:00','11:30',
              '12:00','12:30','14:00','14:30','15:00','15:30',
              '16:00','16:30','17:00','17:30','18:00','18:30','19:00','19:30'],
    sunday:  ['10:00','10:30','11:00','11:30','12:00','12:30','13:00','13:30'],
  };

  const dayType = isSunday(date) ? 'sunday' : 'weekday';
  return DAY_SLOTS[dayType];
}
```

### Confirmation Summary Format

```
📋 Appointment Summary
━━━━━━━━━━━━━━━━━━━
Date:      Monday, 25 May 2026
Time:      10:30 AM
Treatment: Teeth Cleaning
Patient:   Rahul Sharma

Reply with:
✅ "confirm" — Book appointment
✏️ "date" — Change date
✏️ "time" — Change time
❌ "cancel" — Cancel
```

---

## 6. Error Recovery Strategy

### Four-Tier Recovery

| Tier | Condition | Action |
|---|---|---|
| **Reprompt** | Invalid input, 1st failure | Re-prompt with context + example |
| **Guided** | 2nd consecutive failure | Show constrained options |
| **Escalate** | 3rd consecutive failure | Offer human handoff |
| **Timeout** | 30min inactivity | Session expires; next message starts fresh with "Welcome back" recovery |

### Frustration Detection (deterministic)

```javascript
function calculateFrustration(session, message) {
  let score = 0;

  // Negative sentiment markers
  if (/(?:\b|^)(no|stop|don't|dont|wrong|not this|ugh|stupid|bad)/i.test(message)) score += 2;
  if (/agent|human|speak|person|manager|cancel|forget it/i.test(message)) score += 3;

  // Behavioral markers
  if (session.context.metrics.messagesInState > 4) score += 1;
  if (message.length < 3 && session.context.metrics.messagesInState > 2) score += 1;
  if (session.context.metrics.failedAttempts >= 2) score += 2;

  return score;
}
```

If frustration score >= 4, proactively offer escalation:
> "I'm sorry this is taking a while. Would you like me to connect you to a team member?"

### Infinite Loop Prevention

- Max 5 consecutive turns in the same state without progress → force escalation
- Max 10 total failed attempts → force escalation
- Session TTL prevents zombie conversations

### Abandonment Recovery

- **30min inactivity**: Session expires silently. Next inbound creates fresh session.
- **24h with incomplete booking**: Send template message recovery prompt:
  > "You were booking an appointment on [date]. Would you like to continue? Reply YES or visit our website."
- **7d inactivity**: Clean up session, mark as abandoned.

---

## 7. Human Handoff Design

### Trigger Matrix

| Trigger | Source | Action | Priority |
|---|---|---|---|
| Explicit "talk to human" | Intent classifier | Immediate warm handoff | Critical |
| Emergency keywords | Pre-classifier | Immediate + staff alert | Critical |
| 3x validation failure | State machine | Offer handoff, execute on yes | High |
| Frustration score >= 4 | Session metrics | Offer handoff | High |
| Out-of-scope 3x | Intent classifier | Offer handoff | Medium |
| Appointment conflict | Business logic | Transfer to staff | Medium |
| User requests callback | Intent router | Collect phone + time | Low |

### Handoff Protocol

```javascript
async function executeHandoff(session, reason) {
  session.state = 'HUMAN_ESCALATION';
  session.isEscalated = true;
  session.context.escalationReason = reason;

  // Persist escalation record
  const escalation = await db.escalations.create({
    sessionId: session.id,
    waId: session.waId,
    reason,
    context: {
      currentState: session.state,
      bookingDraft: session.context.booking,
      failedAttempts: session.context.metrics.totalFailedAttempts,
      history: await getRecentMessages(session.waId, 10),
    },
    status: 'open',
  });

  // Notify staff via webhook/email
  await notifyStaff({
    type: 'HANDOFF_REQUIRED',
    escalationId: escalation.id,
    patientName: session.profileName,
    waId: session.waId,
    reason,
    summary: generateSessionSummary(session),
  });

  // Reply to user
  await sendTextReply(session.waId,
    `Thank you for your patience. A team member will assist you shortly. ` +
    `Your case number: ${escalation.id.slice(0, 8)}`);
}
```

### Re-entry Protocol

After handoff resolves, staff marks escalation `resolved`, which transitions session back to `MAIN_MENU`. This ensures the bot can continue with structured tasks after human intervention.

---

## 8. Validation Rules

All validators are **pure functions**. No side effects. Composable.

### Date Validator

```javascript
function validateDate(raw) {
  if (!raw) return { valid: false, reason: 'MISSING' };

  const date = parseDate(raw);
  if (!date) return { valid: false, reason: 'PARSE_FAILED' };

  const now = new Date();
  if (date < now) return { valid: false, reason: 'PAST_DATE' };
  if (isSunday(date)) return { valid: false, reason: 'CLOSED_SUNDAY_LIMITED', note: 'Sun 10AM–2PM' };
  if (daysBetween(now, date) > 30) return { valid: false, reason: 'BEYOND_BOOKING_HORIZON' };

  return { valid: true, parsed: date };
}
```

### Time Validator

```javascript
function validateTime(raw, date) {
  if (!raw) return { valid: false, reason: 'MISSING' };

  const time = parseTime(raw);
  if (!time) return { valid: false, reason: 'PARSE_FAILED' };

  const isSunday = date.getDay() === 0;
  const { open, close } = isSunday
    ? { open: parseTime('10:00'), close: parseTime('14:00') }
    : { open: parseTime('09:00'), close: parseTime('20:00') };

  if (time < open) return { valid: false, reason: 'BEFORE_OPENING' };
  if (time >= close) return { valid: false, reason: 'AFTER_CLOSING' };

  // Slot alignment — :00 or :30
  const minutes = time.hour * 60 + time.minute;
  if (minutes % 30 !== 0) {
    return { valid: false, reason: 'INVALID_SLOT', suggestion: roundToSlot(time) };
  }

  return { valid: true, parsed: time };
}
```

### Treatment Validator

```javascript
function validateTreatment(raw) {
  if (!raw) return { valid: false, reason: 'MISSING' };

  const normalized = raw.toLowerCase().trim();
  const match = TREATMENTS.find(t =>
    normalized === t.name.toLowerCase() ||
    t.aliases.some(a => normalized.includes(a))
  );

  if (!match) return {
    valid: false,
    reason: 'UNKNOWN',
    suggestions: TREATMENTS.map(t => t.name),
  };

  return { valid: true, parsed: match.name };
}
```

---

## 9. State Transition Diagrams

### Adjacency Matrix

```
                IDLE  MENU  DATE  TIME  TREAT CONF  BOOK  SERV  LOC   TIME  EMER  ESCA  CALL  DONE  ABAN
IDLE              -    ✓    ✓    -     -    -    -    ✓    ✓    ✓    ✓    ✓    -    -     -
MENU              ✓    -    ✓    -     -    -    -    ✓    ✓    ✓    ✓    ✓    ✓    -     -
DATE              ✓    ✓    -    ✓     ✓    -    -    -    -    -    ✓    ✓    -    -     -
TIME              ✓    ✓    ✓    -     ✓    -    -    -    -    -    ✓    ✓    -    -     -
TREATMENT         ✓    ✓    ✓    ✓     -    ✓    -    -    -    -    ✓    ✓    -    -     -
CONFIRMATION      ✓    ✓    ✓    ✓     ✓    -    ✓    -    -    -    ✓    ✓    -    -     -
BOOKED            ✓    ✓    -    -     -    -    -    -    -    -    ✓    ✓    ✓    ✓     -
SERVICES          ✓    ✓    -    -     -    -    -    -    -    -    ✓    ✓    -    -     -
LOCATION          ✓    ✓    -    -     -    -    -    -    -    -    ✓    ✓    -    -     -
TIMINGS           ✓    ✓    -    -     -    -    -    -    -    -    ✓    ✓    -    -     -
EMERGENCY         -    ✓    -    -     -    -    -    -    -    -    -    ✓    -    ✓     -
HUMAN_ESCALATION  ✓    -    -    -     -    -    -    -    -    -    -    -    -    ✓     -
CALLBACK_REQUEST  ✓    ✓    -    -     -    -    -    -    -    -    ✓    ✓    -    ✓     -
ABANDONED         -    -    -    -     -    -    -    -    -    -    -    -    -    -     ✓
```

Key: `✓` = valid transition, `-` = invalid, `IDLE` = main menu response, `DONE` = terminal

---

## 10. Folder Structure

```
src/
├── app/
│   ├── api/
│   │   ├── webhook/
│   │   │   └── whatsapp/
│   │   │       └── route.js              # ~40 lines: parse → dedup → enqueue → 200
│   │   └── health/
│   │       └── route.js                  # Health check
│   └── layout.js
│
├── config/
│   ├── clinic.js                         # Name, address, hours, holidays, phone
│   ├── states.js                         # State definitions + transition table
│   ├── intents.js                        # Intent keyword maps
│   ├── treatments.js                     # Treatment names, aliases, duration
│   └── constants.js                      # TTLs, limits, thresholds
│
├── lib/
│   ├── whatsapp/
│   │   ├── client.js                     # sendMessage(), sendTemplate(), markRead()
│   │   ├── types.js                      # Message type constants
│   │   └── templates.js                  # Structured message builders
│   │
│   ├── session/
│   │   ├── manager.js                    # getOrCreate(), save(), extendTTL()
│   │   ├── store.js                      # Store interface (Map dev, Neon prod)
│   │   └── recovery.js                   # Abandonment detection + prompts
│   │
│   ├── conversation/
│   │   ├── engine.js                     # Main loop: classify → extract → transition → handle
│   │   ├── router.js                     # Intent classification (deterministic + AI adapter)
│   │   ├── entities.js                   # Entity extraction pipeline
│   │   ├── transitions.js                # Transition validator
│   │   └── states/                       # One file per state
│   │       ├── idle.js
│   │       ├── mainMenu.js
│   │       ├── bookingDate.js
│   │       ├── bookingTime.js
│   │       ├── bookingTreatment.js
│   │       ├── bookingConfirmation.js
│   │       ├── booked.js
│   │       ├── services.js
│   │       ├── location.js
│   │       ├── timings.js
│   │       ├── emergency.js
│   │       ├── humanEscalation.js
│   │       └── callbackRequest.js
│   │
│   ├── middleware/
│   │   ├── pipeline.js                   # Pipeline orchestrator
│   │   ├── parsePayload.js               # JSON parse + validate
│   │   ├── normalizeMessage.js           # Extract structured message
│   │   ├── deduplicate.js                # msgId dedup (memory + DB)
│   │   ├── loadSession.js                # Session lookup/creation
│   │   ├── rateLimiter.js                # Per-user rate limiting
│   │   ├── logging.js                    # Structured logging
│   │   └── errorHandler.js               # Global catch → 200 + log
│   │
│   ├── validation/
│   │   ├── date.js
│   │   ├── time.js
│   │   ├── phone.js
│   │   ├── treatment.js
│   │   └── index.js                      # Composer
│   │
│   └── nlp/                              # Future AI
│       ├── classifier.js                 # AI intent classification adapter
│       ├── extractor.js                  # AI entity extraction adapter
│       └── sentiment.js                  # AI sentiment analysis
│
├── services/
│   ├── appointment/
│   │   └── service.js                    # CRUD + business logic
│   ├── notification/
│   │   └── service.js                    # Staff alerts
│   └── escalation/
│       └── service.js                    # Human handoff orchestration
│
├── db/
│   ├── pool.js                           # Neon connection pool
│   ├── migrations/
│   │   ├── 001_sessions.sql
│   │   ├── 002_messages.sql
│   │   ├── 003_appointments.sql
│   │   ├── 004_escalations.sql
│   │   └── 005_idempotency.sql
│   └── repositories/
│       ├── sessionRepository.js
│       ├── messageRepository.js
│       ├── appointmentRepository.js
│       └── escalationRepository.js
│
├── jobs/
│   ├── sessionCleanup.js                 # Cron: expire stale sessions
│   ├── abandonmentRecovery.js            # Cron: follow-up on incomplete bookings
│   └── appointmentReminders.js           # Cron: 24h reminder messages
│
├── utils/
│   ├── logger.js                         # Structured JSON logger
│   ├── formatters.js                     # Date/time/phone display
│   ├── time.js                           # Date math helpers
│   └── idempotency.js                    # Key generation + check
│
├── constants.js
└── types.js                              # JSDoc type definitions
```

---

## 11. AI Integration Architecture

### Principle: AI is a Plugin, Not the Backbone

```text
┌──────────────────────────────────────────────────────────┐
│                    DETERMINISTIC CORE                    │
│                                                          │
│  State Machine  ──  Transition Validator  ──  Handlers  │
│       ↑                    ↑                    ↑        │
│       │                    │                    │        │
│  ┌────┴────┐        ┌─────┴─────┐       ┌──────┴──────┐ │
│  │ Intent  │        │  Entity   │       │  Response   │ │
│  │ Classif.│        │ Extract.  │       │  Composer   │ │
│  └────┬────┘        └─────┬─────┘       └──────┬──────┘ │
│       │                  │                     │        │
│  ┌────▼──────────────────▼─────────────────────▼────┐   │
│  │              AI ADAPTER LAYER                     │   │
│  │                                                   │   │
│  │   LLM Intent Classifier  →  fallback to regex    │   │
│  │   LLM Entity Extraction  →  schema-constrained   │   │
│  │   LLM Response Gen       →  within state bounds  │   │
│  │   Sentiment Analysis     →  frustration signals  │   │
│  └───────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

### AI Adapter Interface

```javascript
class AIClassifierAdapter {
  async classifyIntent({ text, state, context }) {
    // Must return { intent: string, confidence: number }
    // Must fall back to deterministic if AI unavailable
    throw new Error('Not implemented');
  }
}

class AIExtractorAdapter {
  async extractEntities({ text, state, context }) {
    // Must return { date, time, treatment, ... }
    throw new Error('Not implemented');
  }
}
```

### When to Call AI

| Function | Fallback | Latency Budget |
|---|---|---|
| Intent classification | Keyword/regex | < 500ms |
| Entity extraction | Regex | < 300ms |
| Response generation | Template | < 2s |
| Sentiment analysis | Rule-based | < 300ms |

### Guardrail

**The state machine is always authoritative.** If AI suggests an invalid transition, the validator rejects it. The handler runs only after validation passes.

---

## 12. Database Schema (Neon DB — PostgreSQL)

### Sessions

```sql
CREATE TABLE sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wa_id           VARCHAR(20) NOT NULL UNIQUE,
    phone_number_id VARCHAR(20),
    profile_name    VARCHAR(100),
    state           VARCHAR(50) NOT NULL DEFAULT 'IDLE',
    context         JSONB NOT NULL DEFAULT '{}',
    metrics         JSONB NOT NULL DEFAULT '{}',
    previous_state  VARCHAR(50),
    locale          VARCHAR(10) DEFAULT 'en',
    is_escalated    BOOLEAN NOT NULL DEFAULT FALSE,
    is_blocked      BOOLEAN NOT NULL DEFAULT FALSE,
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at       TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 minutes'),

    CONSTRAINT valid_state CHECK (state IN (
        'IDLE','MAIN_MENU','BOOKING_DATE','BOOKING_TIME','BOOKING_TREATMENT',
        'BOOKING_CONFIRMATION','BOOKED','SERVICES','LOCATION','TIMINGS',
        'EMERGENCY','HUMAN_ESCALATION','CALLBACK_REQUESTED','DONE','ABANDONED'
    ))
);

CREATE INDEX idx_sessions_wa_id ON sessions(wa_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at) WHERE state != 'DONE';
```

### Messages

```sql
CREATE TABLE messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    msg_id          VARCHAR(100) UNIQUE,
    session_id      UUID REFERENCES sessions(id) ON DELETE CASCADE,
    wa_id           VARCHAR(20) NOT NULL,
    role            VARCHAR(10) NOT NULL,          -- 'user' | 'bot' | 'system'
    message_type    VARCHAR(20),
    content         TEXT,
    intent          VARCHAR(50),
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_role CHECK (role IN ('user', 'bot', 'system'))
);

CREATE INDEX idx_messages_wa_id ON messages(wa_id);
CREATE INDEX idx_messages_session ON messages(session_id);
CREATE INDEX idx_messages_msg_id ON messages(msg_id);
CREATE INDEX idx_messages_created ON messages(created_at);
```

### Appointments

```sql
CREATE TABLE appointments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      UUID REFERENCES sessions(id),
    wa_id           VARCHAR(20) NOT NULL,
    patient_name    VARCHAR(100),
    patient_phone   VARCHAR(20),
    date            DATE NOT NULL,
    time            TIME NOT NULL,
    treatment       VARCHAR(100),
    status          VARCHAR(20) NOT NULL DEFAULT 'pending',
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    confirmed_at    TIMESTAMPTZ,
    cancelled_at    TIMESTAMPTZ,
    rescheduled_from UUID,

    CONSTRAINT valid_status CHECK (status IN (
        'pending','confirmed','cancelled','completed','rescheduled','no_show'
    ))
);

CREATE INDEX idx_appointments_wa_id ON appointments(wa_id);
CREATE INDEX idx_appointments_date ON appointments(date);
CREATE INDEX idx_appointments_status ON appointments(status);
```

### Escalations

```sql
CREATE TABLE escalations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      UUID REFERENCES sessions(id),
    wa_id           VARCHAR(20) NOT NULL,
    reason          VARCHAR(100) NOT NULL,
    reason_detail   TEXT,
    context_snapshot JSONB,
    status          VARCHAR(20) NOT NULL DEFAULT 'open',
    assigned_to     VARCHAR(100),
    resolved_by     VARCHAR(100),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at     TIMESTAMPTZ,

    CONSTRAINT valid_esc_status CHECK (status IN ('open','acknowledged','resolved','closed'))
);

CREATE INDEX idx_escalations_status ON escalations(status) WHERE status IN ('open','acknowledged');
```

### Idempotency

```sql
CREATE TABLE idempotency (
    key             VARCHAR(100) PRIMARY KEY,
    action          VARCHAR(50) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_idempotency_created ON idempotency(created_at);
```

### Schema Notes

- **Neon is serverless PostgreSQL** — this schema is fully compatible. Use `pg` (node-postgres) or `@neondatabase/serverless` for connection pooling.
- **JSONB** for session context gives schema flexibility without migrations for new fields.
- **UUID PKs** are distributed-friendly and avoid sequential ID guessing.
- **Unique constraint on `messages.msg_id`** provides durable deduplication across instances.
- **Partial indexes** on `escalations.status` optimize the most common query (open escalations).
- **Auto-purge**: `idempotency` rows older than 7 days can be cleaned via a cron job.

---

## 13. Message Normalization Layer

Converts raw WhatsApp message to structured internal format. Runs early in middleware, before any business logic.

### Normalizer

```javascript
function normalizeMessage(msg, value) {
  if (!msg?.id || !msg?.from) return null;

  const base = {
    raw: msg,
    msgId: msg.id,
    waId: msg.from,
    profileName: value.contacts?.[0]?.profile?.name || '',
    type: msg.type || 'unknown',
    timestamp: parseInt(msg.timestamp, 10) * 1000,
    phoneNumberId: value.metadata?.phone_number_id,
    hasMedia: false,
  };

  switch (base.type) {
    case 'text':
      base.text = normalizeText(msg.text?.body || '');
      break;

    case 'interactive':
      base.text = normalizeText(
        msg.interactive?.button_reply?.title ||
        msg.interactive?.list_reply?.title ||
        msg.interactive?.nfm_reply?.response_json || ''
      );
      base.interactionType = msg.interactive?.type;
      break;

    case 'image':
      base.text = normalizeText(msg.image?.caption || '');
      base.media = { id: msg.image?.id, mimeType: msg.image?.mime_type };
      base.hasMedia = true;
      break;

    case 'audio':
      base.text = '';
      base.media = { id: msg.audio?.id, mimeType: msg.audio?.mime_type };
      base.hasMedia = true;
      break;

    case 'video':
      base.text = normalizeText(msg.video?.caption || '');
      base.media = { id: msg.video?.id, mimeType: msg.video?.mime_type };
      base.hasMedia = true;
      break;

    case 'document':
      base.text = normalizeText(msg.document?.caption || '');
      base.media = {
        id: msg.document?.id,
        filename: msg.document?.filename,
        mimeType: msg.document?.mime_type,
      };
      base.hasMedia = true;
      break;

    case 'location':
      base.text = '';
      base.location = {
        lat: msg.location?.latitude,
        lng: msg.location?.longitude,
        name: msg.location?.name,
        address: msg.location?.address,
      };
      break;

    case 'contacts':
      base.text = '';
      base.contacts = (msg.contacts || []).map(c => ({
        name: c.name?.formatted_name || c.name?.full_name,
        phones: (c.phones || []).map(p => p.phone),
      }));
      break;

    case 'reaction':
      base.text = normalizeText(msg.reaction?.emoji || msg.reaction?.text || '');
      base.reactionTo = msg.reaction?.message_id;
      break;

    default:
      base.text = '';
      break;
  }

  // Normalized text variants
  base.textClean = cleanText(base.text);
  base.textLower = base.textClean.toLowerCase();
  base.textTrimmed = base.textClean.trim();
  base.textLength = base.textClean.length;

  return base;
}
```

### Text Cleaner

```javascript
function normalizeText(text) {
  if (!text || typeof text !== 'string') return '';
  return text.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function cleanText(text) {
  return text
    .replace(/[\u{1F600}-\u{1F64F}]/gu, '')     // Faces
    .replace(/[\u{1F300}-\u{1F5FF}]/gu, '')     // Symbols
    .replace(/[\u{1F680}-\u{1F6FF}]/gu, '')     // Transport
    .replace(/[\u{1F1E0}-\u{1F1FF}]/gu, '')     // Flags
    .replace(/[^\w\s\d.,!?@#₹$%&*()\-+]/g, '')  // Alphanumeric + basic punct
    .trim();
}
```

---

## 14. Idempotency Handling

### Three-Layer Defense

#### Layer 1: In-Memory (fastest, per-instance)

```javascript
const recentIds = new Set();
const MAX_CACHE_SIZE = 10000;

function isDuplicateInMemory(msgId) {
  if (recentIds.has(msgId)) return true;

  recentIds.add(msgId);
  if (recentIds.size > MAX_CACHE_SIZE) {
    const entries = [...recentIds].slice(-5000);
    recentIds.clear();
    entries.forEach(id => recentIds.add(id));
  }
  return false;
}
```

#### Layer 2: Database Unique Constraint

Handles multiple instances and server restarts. The `msg_id` column in `messages` has a `UNIQUE` constraint — `INSERT ... ON CONFLICT DO NOTHING`.

#### Layer 3: Action-Level Idempotency

For side effects like appointment creation:

```javascript
async function isDuplicateAction(key) {
  const result = await db.query(
    'INSERT INTO idempotency (key, action) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING key',
    [key, 'book_appointment']
  );
  return !result.rows.length;  // true if key already existed
}
```

Idempotency key composition for appointments:
```
appt:booking:{waId}:{sessionId}:{timestamp_rounded_to_minute}
```

---

## 15. Retry Safety

### Core Principle

**200 always sent within 100ms.** All retry-unsafe operations happen after the response.

```javascript
export async function POST(req) {
  const rawBody = await req.text();

  // Phase 1: Sync — always < 50ms
  const event = parseRawPayload(rawBody);
  if (!event) {
    return Response.json({ received: true }, { status: 200 });
  }

  // Phase 2: Async — fire and forget
  // [future] push to Redis/SQS queue instead
  processEventAsync(event).catch(err => {
    logger.error({ event: 'WEBHOOK_ASYNC_FAILURE', error: err.message });
  });

  // Phase 3: Always 200
  return Response.json({ received: true }, { status: 200 });
}
```

### Retry-Safe Design Rules

| Rule | Implementation |
|---|---|
| All side effects use idempotency keys | `idempotency` table with UNIQUE constraint |
| Webhook handler never retries | Delegates to async processing |
| Failed processing → dead letter | Logged for manual inspection |
| No synchronous external calls before 200 | Pipeline runs after response |
| WhatsApp API failures are caught and logged | `sendTextReply` has try/catch |

---

## 16. WhatsApp Webhook Edge-Case Handling

### Event Classifier

```javascript
function classifyWebhookEvent(event) {
  for (const entry of event.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value;

      // Status update (delivery/read receipts)
      if (value.statuses) {
        return { type: 'STATUS_UPDATE', statuses: value.statuses };
      }

      // Incoming messages
      if (value.messages?.length) {
        const messages = value.messages.filter(m =>
          !value.metadata?.phone_number_id ||
          m.from !== process.env.WHATSAPP_PHONE_NUMBER_ID
        );
        if (messages.length === 0) return { type: 'NOOP' };
        return { type: 'MESSAGES', messages, contacts: value.contacts, metadata: value.metadata };
      }

      // Errors
      if (value.errors) {
        return { type: 'ERROR', errors: value.errors };
      }
    }
  }
  return { type: 'UNKNOWN' };
}
```

### Edge Case Matrix

| Scenario | Signal | Handling |
|---|---|---|
| Business echo message | `msg.from` matches business number | Skip — not a real user message |
| Delivery/read receipt | `value.statuses` present | Log, no further action |
| User outside 24h window | N/A — webhook still delivers | Handle normally; reply only via templates |
| Banned user | `errors` in payload | Log, set `isBlocked` on session |
| Empty `entry[]` | Webhook with no changes | Skip silently |
| Duplicate webhook | Same `msg_id` | Dedup → skip |
| Reaction message | `msg.type === 'reaction'` | No-op; future: feedback tracking |
| Location share | `msg.type === 'location'` | Normalize, reply with clinic address |
| Contact share | `msg.type === 'contacts'` | Extract phone for booking |
| Multiple messages in 1 webhook | 2+ in `messages[]` | Process by `timestamp` order |
| Out-of-order messages | Non-monotonic timestamps | Sort by `timestamp` before processing |
| Very long text | > 4096 chars | Truncate before intent classification |
| Media without caption | image/video/document, no text | Reply asking for description |
| Invalid JSON | Parse error | Log, return 200 |

---

## 17. Middleware Pipeline

### Pipeline Orchestrator

```javascript
class MessagePipeline {
  constructor(steps) {
    this.steps = steps;
  }

  async run(rawBody) {
    let context = { rawBody };

    for (const step of this.steps) {
      try {
        const result = await step.handler(context);
        if (result === null || result === false) {
          logger.debug(`Pipeline halted at: ${step.name}`);
          return null;
        }
        context = { ...context, ...result };
      } catch (error) {
        logger.error({ step: step.name, error: error.message });
        if (step.fatal) throw error;
      }
    }
    return context;
  }
}
```

### Step Definitions

```javascript
const pipeline = new MessagePipeline([
  { name: 'parsePayload',        fatal: false, handler: parsePayload },
  { name: 'classifyEvent',       fatal: false, handler: classifyEvent },
  { name: 'deduplicate',         fatal: false, handler: deduplicateMessage },
  { name: 'normalizeMessage',    fatal: false, handler: normalizeMessage },
  { name: 'loadSession',         fatal: true,  handler: loadSession },
  { name: 'classifyIntent',      fatal: false, handler: classifyIntent },
  { name: 'extractEntities',     fatal: false, handler: extractEntities },
  { name: 'validateTransition',  fatal: false, handler: validateTransition },
  { name: 'executeHandler',      fatal: false, handler: executeStateHandler },
  { name: 'sendResponse',        fatal: false, handler: sendResponse },
  { name: 'saveHistory',         fatal: false, handler: saveMessageHistory },
  { name: 'updateSession',       fatal: false, handler: persistSession },
  { name: 'logCompletion',       fatal: false, handler: logCompletion },
]);
```

### What Each Step Produces

```
parsePayload     → { event }
classifyEvent    → { eventType, messages }
deduplicate      → (remove duplicates from context)
normalizeMessage → { normalized }
loadSession      → { session }
classifyIntent   → { intent, confidence }
extractEntities  → { entities }
validateTransition → { validTransition, nextState }
executeHandler   → { reply, actions }
sendResponse     → (side effect: WhatsApp API call)
saveHistory      → (side effect: DB insert)
updateSession    → (side effect: DB/Redis save)
logCompletion    → (side effect: structured log)
```

---

## 18. Deterministic vs AI-Based Routing

### Phase 1 — Fully Deterministic (Ship Now)

```javascript
async function classifyIntent({ normalized, session }) {
  const { textLower, textTrimmed } = normalized;

  // 1. System commands (always work, any state)
  if (['back', 'menu', '0', 'main menu'].includes(textTrimmed)) {
    return { intent: 'main_menu', confidence: 1.0, source: 'system' };
  }
  if (['cancel', 'stop', 'forget it', 'nevermind'].includes(textTrimmed)) {
    return { intent: 'cancel', confidence: 1.0, source: 'system' };
  }
  if (['agent', 'human', 'person', 'speak', 'representative'].some(k => textLower.includes(k))) {
    return { intent: 'escalate', confidence: 1.0, source: 'system' };
  }

  // 2. Emergency (highest priority)
  if (['emergency', 'pain', 'bleeding', 'swelling', 'accident', 'hurt', 'urgent',
       'broken tooth', 'severe'].some(k => textLower.includes(k))) {
    return { intent: 'emergency', confidence: 1.0, source: 'system' };
  }

  // 3. State-aware routing
  const allowedIntents = getTransitionsFrom(session.state);

  for (const intent of allowedIntents) {
    const keywords = INTENT_KEYWORDS[intent];
    if (!keywords) continue;
    if (keywords.exact?.includes(textTrimmed)) {
      return { intent, confidence: 1.0, source: 'keyword_exact' };
    }
    if (keywords.some(k => textLower.includes(k))) {
      return { intent, confidence: 1.0, source: 'keyword_contains' };
    }
  }

  return { intent: 'unknown', confidence: 0, source: 'fallback' };
}
```

### Phase 2 — AI-Enhanced (Future)

```javascript
async function classifyIntent({ normalized, session }) {
  // ... same system intents and emergency check ...

  // Try AI
  if (aiClassifier.isAvailable()) {
    const aiResult = await aiClassifier.classify({
      text: normalized.textClean,
      state: session.state,
      allowedIntents: getTransitionsFrom(session.state),
      context: session.context,
    });

    if (aiResult.confidence >= AI_CONFIDENCE_THRESHOLD) {
      return { intent: aiResult.intent, confidence: aiResult.confidence, source: 'ai' };
    }
  }

  // Fallback: loose keyword match across all intents
  const bestMatch = findBestIntentAcrossAll(textLower);
  if (bestMatch.confidence > 0.6) return bestMatch;

  return { intent: 'unknown', confidence: 0, source: 'fallback' };
}
```

### AI Integration Decision Matrix

| Capability | AI Can Help | Must Stay Deterministic |
|---|---|---|
| Intent classification | Fuzzy matching, synonyms | State transition validation |
| Entity extraction | Parse "around 2pm" | Date/time validity checking |
| Response generation | Natural language variation | Appointment confirmation format |
| Sentiment analysis | Tone detection | Escalation trigger conditions |
| Slot filling | Multi-entity extraction | Schema constraint enforcement |
| Error recovery | Understand garbled input | Escalation threshold logic |

---

## 19. Anti-Spaghetti-Code Architecture

### Pattern 1: Pipeline (Not Nested Callbacks)

```javascript
// BAD: nested, 50+ lines deep
async function handle(rawBody) {
  const event = JSON.parse(rawBody);
  for (const entry of event.entry) { /* ... */ }
}

// GOOD: declarative pipeline
const context = await pipeline.run(rawBody);
```

### Pattern 2: State as Module (Not Switch/Case)

```javascript
// BAD: 500-line switch
switch (state) {
  case 'BOOKING_DATE': /* 50 lines */ break;
  case 'BOOKING_TIME': /* 50 lines */ break;
}

// GOOD: one file per state, same interface
const handlers = {
  BOOKING_DATE: require('./states/bookingDate'),
  BOOKING_TIME: require('./states/bookingTime'),
};
const result = await handlers[session.state].handle({ session, normalized, entities });
```

### Pattern 3: Pure Functions for Business Rules

```javascript
// BAD: validation mixed with side effects
async function handleDateInput(session, text) {
  if (isValidDate(text)) {
    session.state = 'BOOKING_TIME';
    await db.save(session);
    await sendMessage(session.waId, reply);
  }
}

// GOOD: validation pure, effects explicit
const validation = validateDate(text);                              // pure
if (validation.valid) {
  session = transition(session, 'BOOKING_TIME');                    // pure
  session = setBookingDate(session, validation.parsed);             // pure
  await sessionStore.save(session);                                 // effect
  await sendReply(session.waId, reply);                             // effect
}
```

### Pattern 4: Immutable Context

```javascript
// BAD: mutates input
function handle(context) {
  context.value = 'x';
}

// GOOD: returns new context
function handle(context) {
  return { ...context, value: 'x' };
}
```

### Pattern 5: Domain Events (Not Direct Coupling)

```javascript
// BAD: service directly calls another service
async function confirmAppointment(data) {
  const appt = await db.save(data);
  await email.send(appt);
  await sms.send(appt);
}

// GOOD: emit event, listeners react
async function confirmAppointment(data) {
  const appt = await db.save(data);
  eventBus.emit('appointment.confirmed', appt);
}
```

### File Size Budget

| Layer | Max Lines | Enforcement |
|---|---|---|
| Route handler | 50 | Code review |
| State handler | 80 | Code review |
| Validator | 40 | Code review |
| Middleware step | 60 | Code review |
| Repository | 100 | Code review |
| Config file | 30 | Code review |

---

## 20. Engineering Patterns

| Pattern | Where | Why |
|---|---|---|
| **State Machine** | Conversation engine | Explicit transitions, no implicit states |
| **Pipeline** | Message processing | Each step isolated, testable, replaceable |
| **Strategy** | Intent classification | Swap keyword/AI without changing callers |
| **Repository** | Database access | Abstract DB behind interface |
| **Factory** | Response generation | Build different response types |
| **Observer** | Internal events | Decoupled side effects |
| **Chain of Responsibility** | Middleware | Each step passes context or halts |
| **Template Method** | Response templates | Consistent structure with overrides |
| **Null Object** | Missing data | `emptySession()` prevents null checks |
| **Value Object** | Dates, times, phone | Immutable, self-validating |
| **Circuit Breaker** | WhatsApp API calls | Prevent cascading failures |
| **Retry (backoff)** | Idempotent operations | Exponential backoff, jitter |
| **Bulkhead** | Critical vs non-critical | Separate pools for webhooks vs jobs |
| **Saga** | Appointment creation | Distributed transaction across services |
| **Event Sourcing (lite)** | Message history | Append-only log of all events |
| **CQRS (lite)** | Read vs write | Session reads from cache, writes to DB |
| **Decorator** | Logging, metrics | Wrap steps without changing internals |
| **Adapter** | External services | One interface for any AI provider |

---

## Implementation Priority

### Week 1: Core Infrastructure

- [ ] Config files (clinic, states, intents, treatments)
- [ ] Session manager + in-memory store
- [ ] Conversation engine + pipeline
- [ ] All state handlers (deterministic)
- [ ] Validation utilities
- [ ] WhatsApp client (send, templates, markRead)
- [ ] Refactored `route.js` (~40 lines)

### Week 2: Persistence (Neon DB)

- [ ] Neon connection pool (`@neondatabase/serverless`)
- [ ] Repository layer (sessions, messages)
- [ ] Migration: sessions + messages tables
- [ ] Session persistence (load/save)
- [ ] Message history recording
- [ ] Idempotency table + checks
- [ ] Abandonment recovery job

### Week 3: Appointment System

- [ ] Appointment service (CRUD)
- [ ] Confirmation workflow
- [ ] Slot availability logic
- [ ] Notification service (staff alerts)
- [ ] Human handoff service
- [ ] Callback request flow
- [ ] Migration: appointments + escalations tables

### Week 4: Resilience + Operations

- [ ] Rate limiting per user
- [ ] Frustration detection
- [ ] Escalation logic
- [ ] Structured JSON logging
- [ ] Health check endpoint
- [ ] Metrics instrumentation
- [ ] Load testing with k6/artillery

---

## Environment Variables (Neon)

```bash
# Existing
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=

# New — Neon DB
DATABASE_URL=postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/clinic-bot?sslmode=require

# Optional
CLINIC_PHONE_NUMBER=+9198XXXXXXXX
CLINIC_ADDRESS=123 Main Street, City
```

---

*Document v1.0 — Last updated: 2026-05-24*

---

## Appendix: Post-Review Refinements

The following refinements were added after architecture review. They tighten the design before implementation begins.

### A.1 Implementation Phasing — Do NOT Create 25 Files First

**Approach: build one happy path, then split.**

1. Start with a single file per functional area (one session manager, one engine, 3 handlers) inside a flat `lib/` structure.
2. Get a complete booking flow working end-to-end.
3. After the flow is solid, extract stable patterns into separate files.

**Why:** Premature abstraction generates refactoring churn. Let the code tell you where the natural boundaries are.

**In practice:**
- Session + session store can live in `lib/session.js` initially.
- All 3 booking handlers + menu + services can live in `lib/handlers.js`.
- Split into separate files only when a handler exceeds 80 lines or is needed independently.

### A.2 Optimistic Locking on Sessions

**Problem:** WhatsApp can deliver messages for the same conversation concurrently (batched, retried, duplicated). If two webhook executions mutate the same session simultaneously, state gets corrupted.

**Solution:** Add a `version` column to the sessions table. Increment on every write. Use `WHERE version = :current` to detect stale updates.

```sql
-- Add to sessions table
version INTEGER NOT NULL DEFAULT 1
```

**Session save (repository layer):**

```javascript
async function save(session) {
  const result = await db.query(`
    UPDATE sessions
    SET state = $1, context = $2, metrics = $3,
        previous_state = $4, last_activity_at = NOW(),
        version = version + 1
    WHERE id = $5 AND version = $6
    RETURNING version
  `, [
    session.state, JSON.stringify(session.context),
    JSON.stringify(session.metrics), session.previousState,
    session.id, session.version
  ]);

  if (result.rows.length === 0) {
    // Stale write — another process updated this session
    // Reload and re-apply logic, or discard (duplicate message)
    logger.warn({ sessionId: session.id }, 'Stale session write detected');
    throw new STALE_SESSION_ERROR();
  }

  session.version = result.rows[0].version;
}
```

### A.3 Appointment Snapshot in Message Metadata

**Problem:** Once the booking state machine transitions forward, the collected data (date, time, treatment) lives only in `session.context`. If the session is interrupted or lost before the `appointments` table exists, data is unrecoverable.

**Solution:** Even without an `appointments` table, snapshot the booking draft into the bot's reply message metadata.

```javascript
// During booking confirmation handler:
await saveMessage({
  waId: session.waId,
  sessionId: session.id,
  role: 'bot',
  messageType: 'text',
  content: reply,
  metadata: {
    appointmentDraft: {
      date: session.context.booking.date,
      time: session.context.booking.time,
      treatment: session.context.booking.treatment,
      patientName: session.context.booking.patientName,
      patientPhone: session.context.booking.patientPhone,
    },
    intent: 'booking_confirmation',
    stateBefore: session.previousState,
    stateAfter: session.state,
    rawPayload: event.raw,  // see A.6
  }
});
```

### A.4 Pipeline HALT Semantics

**Problem:** Returning `null` from a pipeline step is ambiguous — is it a halt or an error?

**Solution:** Use a symbolic sentinel for explicit halts.

```javascript
export const PIPELINE_HALT = Symbol('PIPELINE_HALT');

class MessagePipeline {
  async run(rawBody) {
    let context = { rawBody };

    for (const step of this.steps) {
      try {
        const result = await step.handler(context);

        if (result === PIPELINE_HALT) {
          logger.debug(`Pipeline halted at: ${step.name}`);
          return null;
        }

        context = { ...context, ...result };
      } catch (error) {
        logger.error({ step: step.name, error: error.message });
        if (step.fatal) throw error;
      }
    }
    return context;
  }
}
```

**Explicit halt reasons:**
```
deduplicate    → PIPELINE_HALT (duplicate msgId)
classifyEvent  → PIPELINE_HALT (status update, echo, error, noop)
parsePayload   → PIPELINE_HALT (invalid JSON, wrong object type)
```

### A.5 Structured Logging as a First-Class Concern

**Not console.log.** Every log entry is JSON with consistent fields.

```javascript
// utils/logger.js
const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const CURRENT_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL || 'info'] ?? 1;

function log(level, message, data = {}) {
  if (LOG_LEVELS[level] < CURRENT_LEVEL) return;

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    service: 'whatsapp-bot',
    ...data,
  };

  if (level === 'error') {
    console.error(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

export const logger = {
  debug: (msg, data) => log('debug', msg, data),
  info:  (msg, data) => log('info',  msg, data),
  warn:  (msg, data) => log('warn',  msg, data),
  error: (msg, data) => log('error', msg, data),
};
```

**Every pipeline step logs with context:**

```javascript
logger.info('MESSAGE_PROCESSED', {
  waId: session.waId,
  msgId: normalized.msgId,
  state: session.state,
  intent,
  nextState: session.state,  // after transition
  processingMs: Date.now() - startTime,
  flowId: session.flowId,
});
```

### A.6 Raw Payload Storage for Replayability

**Problem:** When debugging production issues, you need to see exactly what Meta sent. Reconstructing from logs is lossy.

**Solution:** Store the raw webhook payload in the message record (only for user messages, not status updates).

```javascript
// In saveMessageHistory pipeline step
const savedMessage = await messageRepository.create({
  msgId: normalized.msgId,
  sessionId: session.id,
  waId: normalized.waId,
  role: 'user',
  messageType: normalized.type,
  content: normalized.text,
  intent: intentResult?.intent,
  metadata: {
    rawPayload: event.raw,  // The raw JSON parsed from webhook
    normalized,              // The normalized message object
  }
});
```

**Important:** Limit raw payload storage. For high-traffic, store only for N days or sample 1 in N messages. For a dental clinic bot, storing all is fine.

### A.7 Freeform Message Handling (Interruption Design)

**Problem:** Users say random things in any state. Current router assumes `state → expected input → transition`. Reality: user asks about pricing while booking a time.

**Solution:** The router should attempt **cross-state intent matching** before falling back to state-specific matching. This is a design consideration for the engine, not full implementation yet.

```javascript
// In classifyIntent, after state-specific matching fails:
// 1. Try matching against ALL intents (not just allowed from current state)
// 2. If a high-confidence cross-state intent is found:
//    a. Answer the question (side quest)
//    b. Then re-prompt for the current state's expected input
// 3. Only escalate if no intent is matched at all

// Example flow:
// State: BOOKING_TIME
// User:  "How much is RTC?"
// Bot:   "RTC costs ₹XXX. Now, what time works for you?"
// State: stays BOOKING_TIME (session.context unaffected)
```

This is noted as a **Level 2 concern** but the engine should not prevent this pattern. The handler interface must allow side-quest responses that don't change state.

### A.8 Revised Level 1 File Plan (Not 25 Files)

**Start with these files only.** Add files when a clear extraction pattern emerges.

```
src/
├── app/api/webhook/whatsapp/route.js    # ~40 lines, unchanged pattern
├── config/
│   ├── clinic.js                        # Name, hours, address, treatments
│   ├── states.js                        # State enum + transition table
│   └── intents.js                       # Keyword maps
├── db/
│   ├── pool.js                          # Neon connection (serverless)
│   └── repositories/
│       ├── sessionRepository.js         # getOrCreate, save, extendTTL
│       └── messageRepository.js         # create, findByMsgId
├── lib/
│   ├── logger.js                        # Structured JSON logger
│   ├── session.js                       # Session manager (cache + repo)
│   ├── engine.js                        # Pipeline orchestrator
│   ├── router.js                        # Intent classifier
│   ├── entities.js                      # Entity extraction (regex)
│   ├── transitions.js                   # State transition validator
│   ├── handlers.js                      # ALL state handlers (flat)
│   ├── validators.js                    # ALL validators (flat)
│   ├── whatsapp.js                      # sendMessage, markRead
│   └── deduplicate.js                   # In-memory + DB dedup
└── utils/
    └── formatters.js                    # Date/time display helpers
```

**17 files total** — not 50+. Split later when a file exceeds ~150 lines or when two concerns need different rates of change.

### A.9 Revised Session Schema (With Optimistic Locking)

```sql
CREATE TABLE sessions (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wa_id            VARCHAR(20) NOT NULL UNIQUE,
    phone_number_id  VARCHAR(20),
    profile_name     VARCHAR(100),
    state            VARCHAR(50) NOT NULL DEFAULT 'IDLE',
    context          JSONB NOT NULL DEFAULT '{}',
    metrics          JSONB NOT NULL DEFAULT '{}',
    previous_state   VARCHAR(50),
    locale           VARCHAR(10) DEFAULT 'en',
    is_escalated     BOOLEAN NOT NULL DEFAULT FALSE,
    is_blocked       BOOLEAN NOT NULL DEFAULT FALSE,
    version          INTEGER NOT NULL DEFAULT 1,          -- ← optimistic lock
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at       TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 minutes'),

    CONSTRAINT valid_state CHECK (state IN (
        'IDLE','MAIN_MENU','BOOKING_DATE','BOOKING_TIME','BOOKING_TREATMENT',
        'BOOKING_CONFIRMATION','BOOKED','SERVICES','LOCATION','TIMINGS',
        'EMERGENCY','HUMAN_ESCALATION','CALLBACK_REQUESTED','DONE','ABANDONED'
    ))
);

CREATE INDEX idx_sessions_wa_id ON sessions(wa_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at) WHERE state != 'DONE';
```

### A.10 Revised Level 1 Implementation Sequence

```
Step 1:  Neon pool + logger + config files         (runs, returns 200)
Step 2:  Session repo + message repo               (runs, persists)
Step 3:  Dedup + session manager                    (runs, idempotent)
Step 4:  Engine + router + entities + transitions   (runs, routes)
Step 5:  ONE handler (booking date → time)          (runs, transitions)
Step 6:  Remaining booking handlers                 (runs, full flow)
Step 7:  Services + location + timings + emergency  (runs, all intents)
Step 8:  Escalation + callback                      (runs, handoff)
Step 9:  Load test with ngrok + real WhatsApp       (validated)
```

Each step is **deployable and testable**. No step leaves the bot in a broken state because `route.js` always returns 200, and unhandled intents gracefully fall back to `MAIN_MENU`.
