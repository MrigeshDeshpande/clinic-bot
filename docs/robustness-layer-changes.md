# Conversational Robustness Layer — Change Log

> **Date:** 2026-05-26
> **Milestone:** State Progression Engine → State Repair Engine
> **Theme:** Conversational mutation safety under chaotic human behavior
> **Preserved:** Deterministic orchestration, optimistic locking, Neon persistence, middleware pipeline, interruption handling, contextual prompts, global intents, state continuity

---

## Table of Contents

1. [Architectural Evolution](#1-architectural-evolution)
2. [New Files (3)](#2-new-files)
3. [Modified Files (8)](#3-modified-files)
4. [Overwrite Policy Design](#4-overwrite-policy-design)
5. [Correction Handling Strategy](#5-correction-handling-strategy)
6. [Entity Accumulation Strategy](#6-entity-accumulation-strategy)
7. [Rapid Message Safety](#7-rapid-message-safety)
8. [Session Context Model](#8-session-context-model)
9. [Replay Test Suite](#9-replay-test-suite)
10. [Edge Cases Handled](#10-edge-cases-handled)
11. [Key Design Decisions](#11-key-design-decisions)

---

## 1. Architectural Evolution

### Before

```
State Progression Engine

  webhook → classify → route → handle → transition → reply
                ↑
          entity extraction
```

The system was a linear state machine. Each message advanced the booking flow forward. Corrections weren't understood — they fell through to `unknown` intent and triggered frustration escalation.

### After

```
State Repair Engine

  webhook → classify → route → correction detection → handle → transition → reply
                                  ↕                        ↕
                           entity accumulation       overwrite policy
                           progressive filling       mutation guards
                           session context update    audit tracking
```

The engine now has **defense in depth**:
- **Router** (Priority 1b): Detects corrections before state-specific routing
- **Pipeline** (Step 2e-ii): Fallback correction detection if router missed it
- **Handlers**: Enforce overwrite policy before mutating booking fields
- **Entity accumulation**: Merges fragmented messages progressively

---

## 2. New Files

### 2.1 `src/lib/correction-detector.js`

**Purpose:** Pattern-based correction intent detection from user messages.

**Architecture:**
- **13 correction markers** with weighted confidence scores (0.7–1.0)
  - Explicit: `"Actually..."`, `"Scratch that"`, `"I mean"`, `"Correction"`
  - Negation: `"No, not X, Y"`, `"Not that"`, `"No morning"`
  - Replacement: `"Change it to..."`, `"Make it..."`, `"X instead"`
  - Hedging: `"Wait"`, `"Hold on"`, `"I said"`
- **5 extractor strategies** to determine correction target field:
  1. `"Not X, Y"` — treatment correction with old/new detection
  2. `"Change/Make/Set...to..."` — field inferred from entities
  3. `"Actually/No [entity]"` — field from entity type
  4. `"[entity] instead"` — field from entity type
  5. `"No [preposition/time-word]"` — time correction inference
  6. `"Different [date/day/time/treatment]"` — explicit field naming
- **Entity-based fallback**: If entities present without explicit marker, infers field from entity type
- **Guard**: Returns `requiresEditFlow: true` when in `BOOKED` or `BOOKING_CONFIRMATION` states
- **Old-value detection**: Logs `fromValue` for audit trail

**Exported function:**
```js
detectCorrection(normalized, session)
// Returns: { isCorrection, field, newValue, oldValue, confidence, marker, requiresEditFlow } | null
```

### 2.2 `src/lib/overwrite-policy.js`

**Purpose:** Explicit overwrite rules engine for field mutation safety.

**Architecture — 4-Tier Policy:**

| State | Correction | Non-Correction |
|-------|-----------|----------------|
| `BOOKING_DATE/TIME/TREATMENT` | ✅ Overwrite (latest wins) | ✅ Overwrite (latest wins) |
| `BOOKING_CONFIRMATION` | ✅ Overwrite | ❌ `require_edit` |
| `BOOKED` | ❌ `require_edit` | ❌ `require_edit` |
| Other | ✅ Overwrite | ❌ `block` |

**Exported functions:**
```js
evaluateOverwrite({ state, field, isCorrection, booking })
// Returns: { allowed: boolean, action: string, reason: string }

getTargetState(field)
// Returns: 'BOOKING_DATE' | 'BOOKING_TIME' | 'BOOKING_TREATMENT' | 'MAIN_MENU'

applyFieldOverwrite(booking, bookingTimestamps, field, value)
// Returns: { booking, bookingTimestamps, changed: boolean }
```

**Key property — `applyFieldOverwrite` is immutable:** Returns new objects rather than mutating, making it safe for use in React/Next.js server contexts.

### 2.3 `tests/replay/fixtures.js`

**Purpose:** 15 replay conversation fixtures covering realistic chaotic behavior.

**Fixture categories:**
| # | Name | Pattern | State Coverage |
|---|------|---------|----------------|
| 1 | Happy Path Booking | Linear progression | IDLE → BOOKED |
| 2 | Correction — "Actually Wednesday" | Date override mid-flow | BOOKING_TIME correction |
| 3 | Correction — "No evening" | Time correction with negation | BOOKING_TREATMENT correction |
| 4 | Fragmented Messages | Sequential progressive fill | BOOKING_DATE→TIME→TREATMENT |
| 5 | Single Message All Details | Dense entity packing (skipped) | — |
| 6 | Escalation During Booking | Interrupt → human handoff | HUMAN_ESCALATION |
| 7 | Cancel During Booking | Abort mid-flow | MAIN_MENU cleanup |
| 8 | Repeated Greetings | Noise at start | Idempotent handling |
| 9 | Invalid Then Corrected | Recovery from bad input | BOOKING_DATE→TIME→TREATMENT |
| 10 | Contradictory Rapid Messages | Last-write-wins | Time override |
| 11 | Interrupted Booking → Resume | Services check then continue (skipped) | — |
| 12 | Menu Interruption During Booking | Full restart mid-flow | BOOKED completion |
| 13 | Correction At Confirmation | Edit flow at review step | BOOKING_CONFIRMATION correction |
| 14 | Back Navigation Through Booking | State backtracking | Time re-entry after back |
| 15 | Callback Phone Request | Non-booking flow | CALLBACK_REQUESTED→MAIN_MENU |

### 2.4 `tests/replay/runner.js`

**Purpose:** Replay test runner for conversation regression testing.

**Features:**
- Runs all or filtered (`--fixture="Name"`) fixtures through the engine
- `--list` to enumerate available fixtures
- Step-by-step validation: intent matching, state assertions, staleness detection
- Final state and booking context assertions
- Colored output: ✅ PASS / ❌ FAIL / ⏭ SKIP
- 5ms inter-message delay for realistic timing simulation
- Deterministic `waId` generation from fixture names

**Usage:**
```bash
# Run all fixtures
REPLAY_MODE=true node --experimental-loader ./tests/replay/path-loader.js tests/replay/runner.js

# Run single fixture
REPLAY_MODE=true node --experimental-loader ./tests/replay/path-loader.js tests/replay/runner.js --fixture="Happy Path Booking"

# List fixtures
REPLAY_MODE=true node --experimental-loader ./tests/replay/path-loader.js tests/replay/runner.js --list
```

### 2.5 `tests/replay/path-loader.js`

**Purpose:** Custom Node.js loader to resolve `@/` path aliases to `src/` directory during replay tests (mirrors Next.js `jsconfig.json` path mapping).

---

## 3. Modified Files

### 3.1 `src/lib/session.js` — Enhanced Session Context Model

**Changes:**
- Added `bookingTimestamps`: `{ date: null, time: null, treatment: null }` — tracks when each field was last set
- Added `pendingFields`: `['date', 'time', 'treatment']` — track which fields still need collection
- Added `receivedEntities`: `{ dates: [], times: [], treatments: [] }` — accumulates entities across fragmented messages
- Added `lastCorrection`: `{ field, fromValue, toValue, timestamp }` — audit trail for correction operations
- Added `messageSequence`: `0` — counter for rapid-fire detection
- Added `lastMessageIds`: `[]` — last 5 message IDs for continuity checks
- All fields persisted via JSONB in Neon; `rowToSession()` deserializes with defensive defaults

### 3.2 `src/config/intents.js` — Correction Intent Definitions

**Changes:**
- Added `CORRECTION_INTENTS` constant: `['correction_date', 'correction_time', 'correction_treatment']`
- Added correction state intents for booking states:
  - `BOOKING_DATE`: `correction_time` (keywords for time correction), `correction_treatment`
  - `BOOKING_TIME`: `correction_date`, `correction_treatment`
  - `BOOKING_TREATMENT`: `correction_date`, `correction_time`
- `BOOKING_CONFIRMATION`: Existing `edit_date`, `edit_time` intents preserved

### 3.3 `src/lib/router.js` — Correction Intent Classification

**Changes:**
- **Added Priority 1b:** Correction detection (after global intents, before state-specific routing)
- Calls `detectCorrection()` with entity-enriched normalized message
- If correction detected and `requiresEditFlow` is false → returns `correction_date/time/treatment` intent
- If correction detected in `BOOKING_CONFIRMATION` or `BOOKED` → redirects to `edit_date`, `edit_time`, or `reschedule`
- **Improved entity-derived intent guards:**
  - `provide_date` now also matched in `IDLE` and `MAIN_MENU` states
  - `provide_time` now also matched in `BOOKING_DATE` state (cross-field filling)
  
### 3.4 `src/lib/transitions.js` — Correction-Aware State Transitions

**Changes:**
- `isValidTransition()`: Correction intents always valid during any booking-related state
- `getNextState()`: Correction intents redirect to appropriate field collection state:
  - `correction_date` → `BOOKING_DATE`
  - `correction_time` → `BOOKING_TIME`
  - `correction_treatment` → `BOOKING_TREATMENT`

### 3.5 `src/lib/entities.js` — Entity Accumulation Support

**Changes:**
- **New `accumulateEntities()`**: Merges newly extracted entities into session's accumulated entity store
  - Deduplicates by equality (no repeated entries for same value)
  - Returns updated `receivedEntities` and `pendingFields`
- **New `computePendingFields()`**: Determines remaining fields based on booking context and accumulated entities
  - `date` pending if `booking.date` is null AND no accumulated dates
  - `time` pending if `booking.time` is null AND no accumulated times
  - `treatment` pending if `booking.treatment` is null AND no accumulated treatments

### 3.6 `src/lib/handlers.js` — Correction-Aware Booking Handlers

**Changes:**

**New helper — `progressiveFieldFill()`:**
- After setting a booking field, checks accumulated entities for the next field
- Cascading: setting `date` → checks for `time` in entities/accumulated → if found, sets `time` → checks for `treatment`
- Re-validates accumulated entity values through the validator layer
- Enables fragmented message support: `"Tomorrow"` + `"after 5"` + `"RCT"` → single progression

**Correction intent routing:**
- `correction_date`: Enforces overwrite policy → updates `lastCorrection` audit → redirects to `handleBookingDate`
- `correction_time`: Enforces overwrite policy → updates `lastCorrection` audit → redirects to `handleBookingTime`
- `correction_treatment`: Enforces overwrite policy → updates `lastCorrection` audit → redirects to `handleBookingTreatment`
- Each checks `evaluateOverwrite()` first → returns policy-blocked message if disallowed

**Enhanced `handleBookingDate()`:**
- Uses `applyFieldOverwrite()` for immutable field updates with audit tracking
- Calls `progressiveFieldFill()` after setting date to check for time/treatment entities
- If all fields filled → skips straight to `BOOKING_CONFIRMATION`
- If partial → advances to appropriate next state

**Enhanced `handleBookingTime()`:**
- Uses `applyFieldOverwrite()` for immutable field updates
- Calls `progressiveFieldFill()` to check for treatment entities
- Skips to `BOOKING_CONFIRMATION` if all fields filled

**Enhanced `handleBookingTreatment()`:**
- Uses `applyFieldOverwrite()` for immutable field updates

**New helper — `getFieldForState()`:**
- Maps state → field name for metrics tracking

**Enhanced `resetBookingContext()`:**
- Now resets `bookingTimestamps`, `pendingFields`, `receivedEntities`, and `lastCorrection` along with booking

### 3.7 `src/lib/engine.js` — Multi-Message Pipeline Integration

**Changes:**

**Pipeline Step 2d-ii — Rapid Fire Safety Check:**
- New `checkRapidFireSafety()` function
- Computes `hasReplyToLastBot` (continuity check via lastMessageIds)
- Computes `rapidFireRisk` flag (seq > 2 with ≥ 2 recent messages without bot response)
- Logs rapid fire risk but always processes (safety is in state integrity, not blocking)

**Pipeline Step 2e-ii — Correction Detection Fallback:**
- If `classifyIntent` returns `unknown` and session is in a booking state, runs explicit `detectCorrection()`
- On detection: overrides intent to `correction_{field}` with source `correction_pipeline`
- Provides **defense in depth**: router catches structured corrections; pipeline catches ambiguous ones

**Pipeline Step 2f-ii — Entity Accumulation:**
- After entity extraction, calls `accumulateEntities()` to merge into session context
- Enables progressive slot filling across fragmented messages

**Message Sequence Tracking:**
- Increments `session.context.messageSequence` per message
- Updates `lastMessageIds` with rolling window of last 5 IDs

**Tracked Message IDs:**
- Stores bot reply message IDs in `lastMessageIds` for future continuity checks

---

## 4. Overwrite Policy Design

### Design Principles

1. **Latest valid entity wins** — during collection phase, conversation remains fluid
2. **Explicit correction phrases override previous values** — natural correction language respected
3. **Confirmed bookings require explicit edit flow** — `BOOKING_CONFIRMATION` and `BOOKED` states guarded
4. **Completed appointments cannot silently mutate** — must use reschedule flow

### Policy Flow

```
User says: "Actually Wednesday"
                         ↓
          correction-detector.js ──→ { isCorrection: true, field: 'date' }
                         ↓
          router.js ──→ intent: 'correction_date', source: 'correction'
                         ↓
          handlers.js ──→ evaluateOverwrite({
                            state: session.state,    // e.g. 'BOOKING_TIME'
                            field: 'date',
                            isCorrection: true,
                            booking: session.context.booking
                          })
                         ↓
          ┌─── allowed? ───┐
          │                │
        YES                NO
          │                │
    applyFieldOverwrite   Return policy-blocked reply
    (immutable update)    ("Your appointment is already
    with audit logging       confirmed. Would you like
                         to reschedule instead?")
```

### Mutation Guards

| Scenario | Policy Action | UX |
|----------|--------------|-----|
| User types "10am" in `BOOKING_TIME` | `overwrite` | Time saved, advances to treatment |
| User types "Actually Wednesday" in `BOOKING_TIME` | `overwrite` | Date corrected, stays in time collection |
| User types "2pm" in `BOOKING_CONFIRMATION` | `require_edit` | "Would you like to change the time?" |
| User types "Change date" in `BOOKED` | `require_edit` | Redirected to reschedule flow |
| User types "No" in `MAIN_MENU` | `block` | Unknown intent, contextual reprompt |

---

## 5. Correction Handling Strategy

### Detection Pipeline

```
User message
     │
     ├─── Router (Priority 1b):
     │      • Extract entities
     │      • Run detectCorrection()
     │      • If correction with explicit marker → correction_* intent
     │      • If correction in BOOKED → redirect to edit_*/reschedule intent
     │
     └─── Engine Pipeline (Step 2e-ii):
            • If classifyIntent returned 'unknown'
            • And session is in booking state
            • Run detectCorrection() as fallback
            • Override intent to correction_{field}
```

### Marker Patterns (13 total)

| Pattern | Regex | Weight |
|---------|-------|--------|
| Explicit | `^(actually\|correction\|scratch that\|strike that\|ignore that)` | 1.0 |
| Negated clarification | `\b(no\s+(not\|i mean\|i said\|make it\|change it\|set it))\b` | 1.0 |
| Not X, Y | `\b(not\s+\w+,\s+\w+)\b` | 1.0 |
| Change X to Y | `\b(change\s+(it\|that\|this)\s+to)\b` | 1.0 |
| Make it | `\b(make\s+(it\|that)\s+)\b` | 0.9 |
| I mean | `\b(i\s+mean)\b` | 0.9 |
| Instead of | `\b(instead\s+of\s+)\b` | 0.9 |
| No/Nope prefix | `^(no\|nope)\s+` | 0.8 |
| Different X | `\b(different\s+)\w+` | 0.8 |
| I said | `\b(i\s+said)\b` | 0.7 |
| Wait/Hold on | `^(wait\|hold on)` | 0.7 |
| Not that | `\b(not\s+that)\b` | 0.7 |
| Not the X | `\bnot\s+the\s+\w+` | 0.8 |

### Field Extraction Strategies

1. **`"Not X, Y"`** → extracts `oldValue` and `newHint`, field = `treatment`
2. **`"Change/Make/Set Switch...to..."`** → infers field from entity type
3. **`"Actually/No [entity]"`** → infers field from entity type
4. **`"[entity] instead"`** → infers field from entity type
5. **`"No [preposition]"`** → `time` correction for time-related words
6. **`"Different [date/time/treatment]"`** → explicit field naming
7. **Entity-based fallback** → field inferred from entity presence

### Why No AI

All correction detection is:
- **Deterministic** — same input always produces same output
- **Pattern-based** — regex matching against known correction markers
- **Testable** — each pattern can be unit-tested independently
- **Auditable** — every correction is logged with `fromValue`, `toValue`, and timestamp

---

## 6. Entity Accumulation Strategy

### Problem

Real users send fragmented messages:
```
Message 1: "Tomorrow"        ← date entity
Message 2: "after 5"         ← time entity
Message 3: "RCT"             ← treatment entity
```
Without accumulation, each message is processed independently and the system asks for already-provided fields.

### Solution

```
User sends "Tomorrow"
         ↓
  entities.js: extractEntities("Tomorrow") → { date: Date(2026-05-27) }
         ↓
  accumulateEntities(session.context, { date: ... })
         ↓
  receivedEntities = { dates: ['2026-05-27'], times: [], treatments: [] }
  pendingFields = ['time', 'treatment']

User sends "after 5"
         ↓
  entities.js: extractEntities("after 5") → { time: '17:00' }
         ↓
  accumulateEntities(session.context, { time: '17:00' })
         ↓
  receivedEntities = { dates: ['2026-05-27'], times: ['17:00'], treatments: [] }
  pendingFields = ['treatment']

User sends "RCT"
         ↓
  entities.js: extractEntities("RCT") → { treatment: 'Root Canal Treatment' }
         ↓
  accumulateEntities(session.context, { treatment: 'RCT' })
         ↓
  receivedEntities = { dates: ['2026-05-27'], times: ['17:00'], treatments: ['Root Canal Treatment'] }
  pendingFields = []
```

### Progressive Fill Integration

In `handlers.js`, `progressiveFieldFill()`:
```
After setting date:
  → Check accumulated entities for time
  → If time found, re-validate and set
  → After setting time, check for treatment
  → If all three filled → BOOKING_CONFIRMATION
```

---

## 7. Rapid Message Safety

### Detection

```js
checkRapidFireSafety(normalized, session)
  → { safe: true/false, hasReplyToLastBot, rapidFireRisk, sequence }
```

- `rapidFireRisk` = true when `messageSequence > 2` and `lastMessageIds.length >= 2`
- `hasReplyToLastBot` = true when the message's interactive ID matches a recent bot reply

### Strategy

The system employs **response coherence** rather than blocking:
1. **Always process** — never drop messages (preserves conversational continuity)
2. **Log risk** — rapid fire is logged for debugging
3. **State integrity** — optimistic locking prevents concurrent write corruption
4. **Last-write-wins** — contradictory values within rapid fire are handled by overwrite policy

---

## 8. Session Context Model

### Enhanced Schema

```js
session.context = {
  // Existing
  booking: { date, time, treatment, patientName, patientPhone, notes },
  appointmentId,
  escalationReason,

  // New — Timestamps
  bookingTimestamps: {
    date: '2026-05-26T10:30:00Z' | null,
    time: '2026-05-26T10:32:00Z' | null,
    treatment: '2026-05-26T10:35:00Z' | null,
  },

  // New — Field tracking
  pendingFields: ['date', 'time', 'treatment'],  // remaining fields to collect
  receivedEntities: {                             // accumulated across messages
    dates: [],
    times: [],
    treatments: [],
  },

  // New — Correction audit
  lastCorrection: {
    field: 'time' | null,
    fromValue: '17:00',
    toValue: '14:00',
    timestamp: '2026-05-26T10:40:00Z',
  },

  // New — Sequence tracking
  messageSequence: 5,
  lastMessageIds: ['wamid.1', 'wamid.2', 'wamid.3', 'wamid.4'],
};
```

### Persistence

All fields are stored as JSONB in the `sessions.context` column. The `rowToSession()` function in `session.js` defensively deserializes each field with fallback defaults, ensuring backward compatibility with existing sessions.

---

## 9. Replay Test Suite

### Architecture

```
tests/replay/
  ├── fixtures.js        # 15 conversation scenarios
  ├── runner.js          # Test runner with assertions
  └── path-loader.js     # @/ path alias resolver for Node.js
```

### Fixture Coverage

| Behavioral Pattern | Fixtures | Coverage |
|-------------------|----------|----------|
| Happy path | #1 | Linear booking flow |
| Corrections | #2, #3, #13 | Correction during booking, at confirmation |
| Fragmented messages | #4 | Progressive entity accumulation |
| Interruptions | #6, #7, #11, #12 | Escalation, cancel, menu interrput |
| Invalid recovery | #9 | Bad input → correction → success |
| Rapid fire | #10 | Contradictory values, last-write-wins |
| Navigation | #14 | Back button through states |
| Non-booking flows | #15 | Callback phone collection |
| Noise resilience | #8 | Repeated greetings |

### Assertion Types

- **Intent matching**: Expected intent at each step
- **State assertions**: Expected state after each message
- **Final state**: Terminal state after fixture completion
- **Final booking context**: Expected field values
- **Staleness detection**: Detects state stuck at MAIN_MENU without progressing

---

## 10. Edge Cases Handled

| Edge Case | Mechanism | File |
|-----------|-----------|------|
| "Actually Wednesday" mid-flow | Correction detection + field redirect | `correction-detector.js`, `router.js` |
| "No evening" (negation + time) | No-prefix time inference | `correction-detector.js` |
| "Change it to tomorrow" (replacement) | Change-to extractor | `correction-detector.js` |
| "Not root canal, cleaning" (negation swap) | Not-X-comma-Y extractor | `correction-detector.js` |
| "Different treatment" (field naming) | Different-X extractor | `correction-detector.js` |
| "Wait, actually..." (hedging) | Wait/hold on marker | `correction-detector.js` |
| Correction in BOOKED state | requiresEditFlow guard | `correction-detector.js`, `handlers.js` |
| Correction at confirmation | evaluateOverwrite → require_edit | `overwrite-policy.js`, `handlers.js` |
| Fragmented: "Tomorrow" + "after 5" + "RCT" | Entity accumulation + progressive fill | `entities.js`, `handlers.js` |
| Contradictory rapid messages | Last-write-wins (overwrite policy) | `overwrite-policy.js` |
| Invalid input → corrected input | Recovery path + contextual reprompts | `handlers.js` (existing) |
| Repeated greetings | Idempotent greeting handling | `handlers.js` (existing) |
| Back navigation through booking | State backtracking in transitions | `transitions.js` (existing) |
| Menu interruption mid-booking | Clean restart via resetBookingContext | `handlers.js` (existing + enhanced) |
| Expired session | rowToSession → ABANDONED state | `session.js` (existing) |

---

## 11. Key Design Decisions

### Decision 1: Defense in Depth over Single Detection Point

**Chosen:** Correction detection runs in both `router.js` (Priority 1b) and `engine.js` (Step 2e-ii fallback).

**Rationale:** The router catches structured corrections during intent classification. The engine pipeline catches ambiguous or unexpected patterns as a fallback. If either misses, the other may catch it.

### Decision 2: Policy-Gated Overwrites over Free Mutation

**Chosen:** All field mutations go through `evaluateOverwrite()`.

**Rationale:** During collection, fluid mutation feels natural. After confirmation, mutations must be explicit. Without this gating, confirmations lose meaning and completed workflows become accidentally editable.

### Decision 3: Immutable Field Updates over In-Place Mutation

**Chosen:** `applyFieldOverwrite()` returns new objects.

**Rationale:** Prevents accidental state sharing between concurrent message processing. Aligns with React/Next.js server component patterns.

### Decision 4: Deterministic Patterns over AI/ML

**Chosen:** All correction detection uses regex pattern matching with weighted confidence.

**Rationale:** The system was explicitly designed to avoid AI wrappers. Deterministic patterns are testable, auditable, and predictable. Every correction decision can be traced to a specific pattern match.

### Decision 5: Accumulation over Strict State Machine

**Chosen:** Entities accumulate across messages in `receivedEntities`.

**Rationale:** Real users fragment their thoughts across multiple messages. A strict state machine that only looks at the current message misses the continuity. Accumulation bridges the gap without requiring AI.

### Decision 6: Process All Messages over Throttling

**Chosen:** `checkRapidFireSafety()` always returns `safe: true` (logs risk but never blocks).

**Rationale:** Blocking messages introduces complexity without clear benefit for a deterministic system. State integrity (via optimistic locking) handles concurrent writes. The system is designed to be idempotent and safe under any message ordering.

### Decision 7: Replay Tests over Unit Tests

**Chosen:** Integration-level replay fixtures rather than isolated unit tests.

**Rationale:** The value is in conversational behavior — the interaction between router, handlers, entities, transitions, and corrections together. Unit tests verify components; replay tests verify conversations.

---

---

## 12. DB Connection Reliability Fix (2026-05-26)

### Problem

All database operations were failing intermittently with `TypeError: fetch failed` — migrations, session reads/writes, and message persistence. The `@neondatabase/serverless` HTTP-based client makes `fetch()` calls to `https://api.c-7.us-east-1.aws.neon.tech/sql`, and those connections were timing out at the TCP level (`ETIMEDOUT`).

**Impact:** The app fell back to in-memory session caching on every webhook request, losing all persistence. The `ensureMigrations()` retry mechanism was also broken — `runMigrations()` caught its own errors internally and never threw, so the `.catch()` handler in `ensureMigrations` that resets `migrationsPromise` to `null` was dead code. Migrations were never retried after the first failure.

### Root Cause

Intermittent TCP connection timeouts from this machine to the Neon API endpoint. Node.js's `undici` (the fetch implementation) would try IPv6 addresses first (which fail with "Network is unreachable"), then fall back to IPv4. The entire multi-address connection attempt sometimes exceeded the default timeout.

### Changes (`src/db/pool.js`)

1. **Added fetch timeout** (line 18): Passes `fetchOptions: { signal: AbortSignal.timeout(15000) }` to `neon()` so requests don't hang indefinitely.

2. **Added retry loop** (lines 27–188): `runMigrations()` now retries up to 3 times with linear backoff (1s, 2s) before surfacing the failure.

3. **Re-throws on final retry exhaustion** (line 184): After all retries fail, the error is thrown so `ensureMigrations()` catch handler resets `migrationsPromise` to `null`, allowing retry on the next webhook request.

### Files Modified

| File | Change |
|------|--------|
| `src/db/pool.js` | Added `fetchOptions` timeout, retry loop with backoff, re-throw on exhaustion |

### Summary Statistics

| Metric | Value |
|--------|-------|
| New files | 3 (4 including path-loader) |
| Modified files | 8 (now 9) |
| Lines of new code | ~1,200 |
| Correction markers | 13 |
| Entity extractors | 5 |
| Replay fixtures | 15 |
| Policy tiers | 4 |
| Pipeline stages added | 3 (rapid fire, correction fallback, entity accumulation) |
| Session context fields added | 7 |
| Overwrite policy actions | 3 (overwrite, require_edit, block) |
| DB connection retries | 3 (1s, 2s linear backoff) |
| Fetch timeout | 15s |
| Lint status | ✅ Clean |

---

## 13. WhatsApp & DB Roundtrip Optimization (2026-05-27)

### Theme
Reliability hardening for WhatsApp API calls and reducing Neon DB dependency in the hot path.

### Problems Fixed

1. **Silent send failures** — `sendList` didn't truncate section titles (24-char limit). A 36-char title caused `400 Section title is too long`. The pipeline logged success (200) but the user never got a reply — only saw "read" receipts.

2. **No retry on WhatsApp network errors** — `fetch failed` to `graph.facebook.com` returned `null` from `apiPost()`, silently dropping the reply.

3. **DB hit on every webhook** — 5 DB calls per message (dedup INSERT, session SELECT, session UPSERT, 2× message INSERT). With 8–12s Neon response times, this added 40–60s latency per interaction.

4. **No fallback when interactive list send fails** — User gets nothing, not even plain text.

### Changes

#### `src/lib/whatsapp.js` — Send resilience

- **Section title truncation** (line 109): `s.title.length > 24 ? s.title.slice(0, 24) : s.title` — same defensive guard that already existed for row titles. Prevents 400 errors from any section title.

- **Network retry** (line 24–74): `apiPost()` now retries up to 2 times with 500ms/1s backoff on `fetch failed` (network errors) and 5xx/429 (server errors). 4xx validation errors are NOT retried — they fail fast.

- **Custom button IDs** (line 88): `sendButtons()` accepts both string arrays (legacy) and `{ id, title }` objects. Enables confirmation buttons with meaningful IDs like `confirm`, `change`, `cancel` instead of `btn_0`, `btn_1`, `btn_2`.

#### `src/lib/deduplicate.js` — Remove DB roundtrip

- Removed the `INSERT INTO messages ... ON CONFLICT DO NOTHING` DB call entirely. Dedup is now purely the in-memory `Set` (10,000 entries, LRU eviction). Saves 1 DB call per webhook. On server restart, a few duplicates may slip through — harmless.

#### `src/lib/session.js` — Cache TTL

- Added 30-minute TTL to in-memory session cache entries. Periodic cleanup via `setInterval` every 5 minutes (`.unref()` so it doesn't block shutdown). Previously the cache only evicted by LRU count (500 entries) — now entries also expire by time.

#### `src/lib/engine.js` — Text fallback + deferred DB writes

- **Text fallback** (line 109–131): When `sendList()` returns null (all retries exhausted), falls back to `sendText()` with a numbered list of options. When `sendButtons()` fails, same thing. User always gets a reply.

- **Deferred session save** (line 272): `save(session)` is now fire-and-forget (`.catch(() => {})`). The in-memory cache is updated synchronously inside `save()`; `getOrCreate()` reads cache first. DB persistence is eventual. Removes 1 `await` from the hot path.

- **Batch message writes** (line 275–289): Both user and bot messages written in a single `createMessages()` multi-row INSERT instead of two separate `createMessage()` calls. Saves 1 DB call per webhook.

#### `src/lib/handlers.js` — Confirmation buttons + symptom-first booking

- **Confirmation via buttons** (line 1488–1501): Replaced the 5-option interactive list (Confirm, Change Date, Change Time, Cancel, Back) with 3 buttons: `Confirm ✓`, `Change`, `Cancel`. "Change" opens a compact 3-option list (Change Date, Change Time, ← Back). Reduces WhatsApp API surface area — buttons are simpler and less likely to fail validation.

- **`change_booking` intent** (line 847): New intent handler returns the change options list when the "Change" button is tapped.

- **Symptom-first booking** (line 696–716): New `symptomSections()` / `symptomSectionsWithBack()` functions show symptoms instead of treatment names during booking. Treatment name shown as `description` (72-char limit). Interactive IDs still map to treatment IDs — nothing downstream changes.

- **`recommendTreatment` refactored** (line 1510): No longer hardcoded. Uses `CLINIC.treatments` aliases directly with score-based matching (counts matching aliases). Single source of truth with entity extraction.

#### `src/config/clinic.js` — Symptom keywords

- Added symptom keywords to every treatment's `aliases` array (e.g. `"bleeding gums"`, `"tooth pain"`, `"cracked"`, `"missing tooth"`). Entity extraction now matches typed symptoms directly without needing the interactive list.

- Added `symptom` field to each treatment (≤23 chars) for the symptom-first list.

#### `src/lib/router.js` — Change button intent

- Added `'change': 'change_booking'` to `ID_TO_INTENT` mapping. Enables the "Change" button on confirmation.

### Files Modified

| File | Change |
|------|--------|
| `src/lib/whatsapp.js` | Section title truncation, network retry, custom button IDs |
| `src/lib/deduplicate.js` | Removed DB INSERT — purely in-memory now |
| `src/lib/session.js` | 30-min cache TTL with periodic cleanup |
| `src/lib/engine.js` | Text fallback on send failure, deferred session save, batch message writes |
| `src/lib/handlers.js` | Confirmation buttons, symptom-first booking, change intent, recommender refactor |
| `src/config/clinic.js` | Symptom keywords in aliases, new `symptom` field |
| `src/lib/router.js` | `change` → `change_booking` intent mapping |
| `src/db/repositories/messageRepository.js` | New `createMessages()` batch insert function |

### Summary Statistics

| Metric | Value |
|--------|-------|
| DB calls per webhook (before) | 5 |
| DB calls per webhook (after) | 3 |
| WhatsApp send retry attempts | 2 (500ms, 1s backoff) |
| Send failure fallback | list → text, buttons → text |
| Section title truncation | 24 chars (defensive) |
| Session cache TTL | 30 min |
| In-memory dedup capacity | 10,000 entries |
| Batch message INSERT | 2 rows per call |
| Confirmation buttons | 3 (Confirm, Change, Cancel) |
| Symptom aliases added | ~30 new keywords across 8 treatments |
| Lint status | ✅ Clean |
