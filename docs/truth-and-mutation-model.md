# Truth-Type Model & Mutation Architecture

> **Date:** 2026-05-26
> **Status:** Architecture v1.1 — refinement based on production replay analysis

---

## Table of Contents

1. [Core Principle](#1-core-principle)
2. [The Four Truth Types](#2-the-four-truth-types)
3. [Mutation Regimes by Data Layer](#3-mutation-regimes-by-data-layer)
4. [Behavioral States vs Prompt Modalities](#4-behavioral-states-vs-prompt-modalities)
5. [Identity Continuity](#5-identity-continuity)
6. [Architecture Layers](#6-architecture-layers)
7. [Evolutionary Path](#7-evolutionary-path)
8. [Implications for Existing Code](#8-implications-for-existing-code)

---

## 1. Core Principle

> **Different kinds of truth require different consistency and mutation semantics.**

This is the central architectural principle. A system that models all data with the same mutation regime will eventually produce contradictions between what the data should represent and how it is allowed to change.

| Data | Truth type | Mutation regime | Current status |
|---|---|---|---|
| Raw messages | Historical | Append-only | ✅ Correct |
| Session state | Operational | Fully mutable | ✅ Correct |
| Booking data (in-progress) | Draft | Mutable (progressive accumulation) | ✅ Correct |
| Appointments (committed) | Committed business identity | Versioned supersession | ❌ Needs fix |

The decision about which regime applies is determined by answering:

> **What kind of truth does this data represent?**

Not:

> Which implementation pattern (CRUD, event sourcing, CQRS) should I use?

---

## 2. The Four Truth Types

### 2.1 Historical Truth — Messages

**Representation:** `messages` table

**Mutation regime:** Append-only. Once written, never modified.

**Rationale:** Messages are the raw transcript of what was said. They are the ground truth that everything else derives from. If you need to understand why the system took an action, you look at the messages.

- `INSERT` only — never `UPDATE` or `DELETE`
- `ON CONFLICT` is for deduplication (idempotent replay), not mutation
- No schema evolution for existing rows

**Example:**

```sql
INSERT INTO messages (msg_id, session_id, wa_id, role, content, intent, metadata)
VALUES ($1, $2, $3, $4, $5, $6, $7)
ON CONFLICT (msg_id) DO NOTHING;
```

The `ON CONFLICT` is a dedup guard, not an edit. The message, once written, is immutable.

### 2.2 Operational Truth — Sessions

**Representation:** `sessions` table (`state`, `context`, `metrics`)

**Mutation regime:** Fully mutable. Current state overwrites previous state.

**Rationale:** Session state represents "where the conversation is right now." It is volatile cursor data. Nobody needs to query what the frustration score was 17 transitions ago. Making this append-only would be pure overhead with zero value.

- Fields are overwritten freely during normal operation
- `version` column provides optimistic locking for concurrent write safety
- No audit history is needed for intermediate state values

**Example:**

```sql
UPDATE sessions
SET state = $1, context = $2, metrics = $3, version = version + 1
WHERE id = $4 AND version = $5;
```

The version column is for **concurrency control**, not audit. It prevents two concurrent webhook handlers from silently clobbering each other's work.

### 2.3 Draft Truth — Booking Data (In-Progress)

**Representation:** `session.context.booking` (JSONB within sessions)

**Mutation regime:** Mutable with progressive accumulation. Latest valid entity wins within a single collection phase.

**Rationale:** During the booking flow, the user is filling out a form. Their inputs are a draft. They can correct a field ("actually Wednesday"), provide multiple fields at once ("tomorrow at 2pm for cleaning"), or go back and change an earlier field.

- Entity values are overwritten by later valid inputs
- Corrections are treated as new values for the same field
- The `receivedEntities` accumulator tracks what was seen across fragmented messages
- `computePendingFields()` derives what's still missing


**Existing implementation:** This function already exists at `src/lib/entities.js:92`. It is called by `accumulateEntities()` (line 84 of the same file) to derive `pendingFields` from the accumulated received entities. The current code in `handlers.js` uses `session.context.pendingFields` (set during entity accumulation) to decide what field to prompt for next.

```js
// src/lib/entities.js — already live
function computePendingFields(context, accumulated) {
  const pending = [];
  if (!accumulated.date && !context.booking?.date) pending.push('date');
  if (!accumulated.time && !context.booking?.time) pending.push('time');
  if (!accumulated.treatment && !context.booking?.treatment) pending.push('treatment');
  return pending;
}
```

This is the **source of structural position** during booking. Not the state machine. The first element of `pending` IS the current field being collected. The function already accounts for both accumulated entities (fragmented messages within a single turn) and already-stored booking data.

### 2.4 Committed Business Identity — Appointments

**Representation:** `appointments` table

**Mutation regime:** Immutable after confirmation (BOOKED). Changes create a new version that supersedes the old one.

**Rationale:** Once an appointment is confirmed, it represents a **committed business transaction**. Editing it in-place destroys the audit trail. Rescheduling or cancelling should follow a **supersession** model: the old record is preserved, and a new record (or version) represents the current state.

#### The wrong approach: mutation in-place

```sql
-- ❌ Old values are lost forever
UPDATE appointments
SET date = '2026-05-28', time = '14:00'
WHERE id = 'apt_abc123';
```

Problems:
- No record that a change happened
- Clinic can't see what was originally requested
- Cannot undo
- If the API call fails mid-way, system state is ambiguous
- No accountability

#### The wrong approach: cancel-old + create-new

```
❌ Cancel appointment A (status = 'cancelled')
   Create appointment B with new data
```

Problem: The user-facing identity **breaks**. The patient thinks "I changed my appointment" but the system has created a new identity. Reminders, calendar entries, and the patient's mental model all reference a now-cancelled ID.

#### The correct approach: versioned identity

```sql
appointments
  logical_id       UUID         -- Stable identity, exposed to users/systems
  version          INTEGER      -- Monotonically increasing per logical_id
  status           VARCHAR(20)  -- 'confirmed' | 'cancelled' | 'completed'
  date             DATE
  time             TIME
  treatment        VARCHAR(100)
  superseded_at    TIMESTAMPTZ  -- When this version was replaced
  created_at       TIMESTAMPTZ
```

**Reschedule flow:**

```
1. Set old version: status = 'cancelled', superseded_at = NOW()
2. Insert new version: same logical_id, version + 1, new data
3. Current projection: WHERE logical_id = ? ORDER BY version DESC LIMIT 1
```

The user sees the same appointment with updated details. Reminders and calendars see the same `logical_id`. The full version chain preserves every state for audit.

**Current projection query:**

```sql
SELECT * FROM appointments
WHERE logical_id = $1
ORDER BY version DESC
LIMIT 1;
```

**Full history query:**

```sql
SELECT * FROM appointments
WHERE logical_id = $1
ORDER BY version ASC;
```

---

## 3. Mutation Regimes by Data Layer

| Layer | Truth type | Mutation rule | Optimized for |
|---|---|---|---|
| `messages` table | Historical | Append-only | Replayability, debugging, audit |
| `sessions` table | Operational | Fully mutable | Fast current-lookup, low latency |
| `session.context.booking` | Draft | Progressive accumulation | Conversation fluidity, corrections |
| `appointments` table | Committed identity | Versioned supersession | Audit trail, identity continuity |

### The boundary rule

> **Mutable until committed. Versioned after commit.**

The commit point is `BOOKED` status. Before that:
- Session state changes freely — mutable, volatile, no audit needed
- Booking context during collection gets overwritten — it's a draft
- Messages are *always* append-only — they're the raw transcript

After commit (BOOKED):
- The appointment record becomes immutable
- Changes create new versions (same `logical_id`, incremented `version`)
- The old version is preserved with its full data intact

---

## 4. Behavioral States vs Prompt Modalities

### The insight

The original architecture modeled these as separate states:

```
BOOKING_DATE
BOOKING_TIME
BOOKING_TREATMENT
```

But analysis revealed they are **not true behavioral states**. They are **prompt modalities** — derived from which field is next in the collection queue.

### The DB constraint caveat

The current `sessions` table has a `CHECK (state IN (...))` constraint that enumerates every state individually (see `src/db/pool.js:120`). Collapsing `BOOKING_DATE`, `BOOKING_TIME`, `BOOKING_TREATMENT` into `BOOKING_COLLECTION` requires a **multi-step migration** to avoid breaking in-flight conversations:

1. **Add** `BOOKING_COLLECTION` to the CHECK constraint list (allow both old and new values simultaneously)
2. **Backfill** existing sessions lazily — sessions with `state IN ('BOOKING_DATE', 'BOOKING_TIME', 'BOOKING_TREATMENT')` get mapped to `'BOOKING_COLLECTION'` on their next user activity (not as a bulk UPDATE)
3. **Update** all code paths (`handlers.js`, `transitions.js`, `states.js`) to write `BOOKING_COLLECTION` instead of the individual states
4. **Remove** `BOOKING_DATE`, `BOOKING_TIME`, `BOOKING_TREATMENT` from the CHECK constraint after confirming no active sessions still use them

| Concern | BOOKING_DATE | BOOKING_TIME | BOOKING_TREATMENT |
|---|---|---|---|
| Validation | `validateDate` | `validateTime` | `validateTreatment` |
| Reply UI | Date list | Time quick-pick | Treatment list |
| Error messages | Past/beyond/parse | Time suggestion | Treatment list |
| Entity extracted | `date` | `time` | `treatment` |
| Correction target | date | time | treatment |
| Next if filled | BOOKING_TIME or CONFIRMATION | BOOKING_TREATMENT or CONFIRMATION | BOOKING_CONFIRMATION |

**Does the system behave differently between them?**

- Same mutation rules (latest valid entity wins)
- Same escalation thresholds
- Same back-navigation handling
- Same global intents (emergency, main_menu, escalate)

**The only difference is what UI prompt is shown and what field is being validated.** These are not state-level differences. They are prompt-level differences.

### What defines a true behavioral state

A true behavioral state exists where **mutation policy changes**:

| State | Mutation rule | What changes |
|---|---|---|
| **COLLECTION** | Latest valid entity wins | System is still gathering data — fluid |
| **CONFIRMATION** | Corrections allowed, silent mutation blocked | User must explicitly authorize changes |
| **BOOKED** | All mutation blocked (must use reschedule flow) | Appointment is a committed transaction |

**The boundary is mutation policy.** Where the rules for how data can change differ, the state machine is real. Where the rules are identical and only the presentation changes, it's not a state — it's a prompt modality.

### The architectural consequence

The field-collection states should be collapsed into a single **BOOKING_COLLECTION** state. The "which field is next" becomes a derived property:

```js
const pending = computePendingFields(session.context.booking);
const currentField = pending[0]; // 'date', 'time', or 'treatment'
const prompt = buildPromptForField(currentField, session.context.booking);
```

This eliminates an entire class of problems:
- **Split-brain transitions** — no implicit progression when all fields are filled
- **Fragmented messages** — any field can arrive in any order
- **Corrections** — naturally handled by overwrite
- **Recovery** — state = `BOOKING_COLLECTION`, position derived from data

### The true state machine

```
IDLE → MAIN_MENU → BOOKING_COLLECTION → BOOKING_CONFIRMATION → BOOKED
                 → SERVICES / LOCATION / TIMINGS
                 → EMERGENCY / HUMAN_ESCALATION
                 → CALLBACK_REQUESTED
```

One state for field collection. Each of the remaining states represents a distinct **behavioral mode** with its own mutation policy.

### The two layers of the architecture

```
┌─────────────────────────────────────────┐
│          State Machine Layer            │
│                                         │
│  Behavioral modes with distinct rules:  │
│  - MAIN_MENU                            │
│  - BOOKING_CONFIRMATION                 │
│  - BOOKED                               │
│  - EMERGENCY / HUMAN_ESCALATION         │
│                                         │
│  Transitions: explicit, event-driven    │
│  (confirm, escalate, emergency, etc.)   │
└───────────┬─────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────┐
│      Constraint Resolution Layer        │
│                                         │
│  Data-driven progression during         │
│  BOOKING_COLLECTION:                    │
│  booking data → missing fields → prompt │
│                                         │
│  Pure, deterministic, testable          │
└─────────────────────────────────────────┘
```

- **State machine owns the edges** (entering and leaving behavioral modes)
- **Constraint engine owns the interior** (what happens inside BOOKING_COLLECTION)

This separation means:
- The state machine is simple (few states, explicit transitions)
- The constraint engine is testable (pure function of booking data)
- Neither leaks into the other's responsibility

---

## 5. Identity Continuity

### Identity vs Version

When the user says "I need to reschedule my appointment," they mean **this** appointment — not a new one. From their perspective:

- They received a confirmation message with the details
- They told someone "I have a dentist appointment on Thursday"
- It's in their calendar
- They expect a reminder before the new date

If the system creates a new ID on reschedule, every downstream system sees a discontinuity:

| Concern | New identity | Same identity |
|---|---|---|
| Reminder system | Cancel old, create new | Update existing reminder |
| Calendar integration | Duplicate entries possible | Single entry updates |
| Patient communication | "Your new appointment" — disconnected feeling | "Your appointment updated" — continuous |
| Clinic dashboard | Two separate records for one patient intent | Single lifecycle trace |
| Analytics | Need to correlate separate records | Natural grouping |

### The versioned identity model

```sql
appointments
  logical_id       UUID         -- Stable identity, exposed to users/systems
  version          INTEGER      -- Monotonically increasing
  status           VARCHAR(20)
  date             DATE
  time             TIME
  treatment        VARCHAR(100)
  -- Chain links
  superseded_at    TIMESTAMPTZ  -- When this version was replaced
  created_at       TIMESTAMPTZ
```

**Key distinction:** A reschedule does NOT create a new `logical_id`. It creates a new `version`:

```
logical_id = apt_abc123, version 1 → status = 'cancelled', superseded_at = NOW()
logical_id = apt_abc123, version 2 → status = 'confirmed', date = '2026-05-28'
```

The current projection is:
```sql
WHERE logical_id = ? ORDER BY version DESC LIMIT 1
```

The identity persists. The versions accumulate. The audit trail is intact. The user sees the same appointment with updated details.

### This is NOT event sourcing

It's just **versioned rows** within a single table:

- No event store
- No replay logic
- No separate read model
- Current projection is a simple `DESC LIMIT` query
- Old versions are cheap — they're just rows with a different version number

---

## 6. Architecture Layers

### 6.1 The Ownership Model

| Concern | Owner | 
|---|---|
| "What does this text mean?" | **Router** (intent classification) |
| "What data does this contain?" | **Entities** (extraction pipeline) |
| "Can this transition happen?" | **Transition table** (permission layer) |
| "What state comes next?" | **Handler** (progression authority) |
| "Is this transition safe?" | **Transition guard** (invariant enforcement) |

### 6.2 Router: Interpretation, Not Permission

The router classifies *what the user means*, not *what the system should allow*.

> **The router classifies meaning, not permission.**

This separation prevents the router from becoming state-dependent in ways that leak business logic into classification.

#### Nuance: Entity-derived intents are state-scoped

The router already does **state-guarded entity scoping**: entity-derived intents like `provide_phone` only match in `CALLBACK_REQUESTED`, and `provide_treatment` was recently scoped to fire during `BOOKING_TIME` (for fragmented messages). This is **correct** — entity-derived intents are field-targeted, and the scope reflects which fields are meaningful in which state.

The distinction:

| Intent type | Scope rule | Example |
|---|---|---|
| **Behavioral** (greeting, emergency, escalate) | Never scoped — fire from any state | `emergency` works during booking |
| **Entity-derived** (provide_date, provide_time) | Scoped by field relevance | `provide_phone` only in CALLBACK_REQUESTED |
| **State-specific** (confirm, edit_date) | Scoped by transition table | `confirm` only in BOOKING_CONFIRMATION |

So the principle is refined: **behavioral intents are never state-scoped; field-targeted intents are.** The router's scoping is limited to the minimum necessary to avoid extracting irrelevant entities.

### 6.3 Transition Table: Permission, Not Progression

The transition table's role shifts from *"what state comes next"* to *"is this combination valid at all."*

Three specific roles remain:

1. **Structural intent admissibility** — "Can intent X fire in state Y?"
2. **Global intent routing** — `emergency`, `main_menu`, `escalate` are structural overrides
3. **Default progression hint** — advisory only; handlers always have the final say

The engine's automatic state assignment (the root cause of the split-brain bug) is removed. The engine becomes an orchestrator: it calls the router for classification, calls the handler for decision-making, and the handler sets the next state explicitly.

### 6.4 Handler: Single Authority for Progression

The handler becomes the single authority for:

- Setting the next state
- Validating input
- Accumulating booking data
- Building the reply

But this centralization creates a new pressure: **handlers must not become god-functions**. The solution is to decompose each handler into a per-state pipeline:

```
handle(session, entities, normalized, intent) →
  1. validate(field, entities)         → validation concern
  2. setField(booking, field, value)   → mutation concern
  3. progressiveFill(booking, entities) → accumulation concern
  4. decideNextState(booking, state)   → progression concern
  5. buildReply(state, booking)        → presentation concern
```

Each step is a pure function or a separated module. The handler just wires them together.

### 6.5 Transition Guards: Invariant Enforcement

An entry guard function validates that a transition is **business-valid**. It is a **secondary safety net** — not the primary progression mechanism. The primary mechanism is: *handlers own state transitions, and the engine never overrides them.*

**Complete entry guard table:**

| Target state | Precondition | Rationale |
|---|---|---|
| `BOOKING_CONFIRMATION` | `booking.date`, `booking.time`, `booking.treatment` all set | Cannot confirm incomplete booking |
| `BOOKED` | Only from `BOOKING_CONFIRMATION` | Must go through explicit confirmation |
| `HUMAN_ESCALATION` | No precondition (can escalate from any state) | Always allowed |
| `EMERGENCY` | No precondition | Always allowed — highest priority |
| `CALLBACK_REQUESTED` | None — phone is collected inside the state | State handles its own collection |
| `MAIN_MENU` | No precondition | Always reachable |
| `BOOKING_COLLECTION` | No precondition | Can enter from menu or re-entry |

Most states **do not need guards**. Only states where an invariant must hold before entry (like `BOOKING_CONFIRMATION`) require explicit checks.

**Example implementation:**

```js
function isTransitionSafe(session, nextState) {
  if (nextState === 'BOOKING_CONFIRMATION') {
    const booking = session.context.booking;
    return booking.date && booking.time && booking.treatment;
  }
  if (nextState === 'BOOKED') {
    return session.state === 'BOOKING_CONFIRMATION';
  }
  return true; // Most states have no precondition
}
```

The guard is an assertion, not a flow controller. If it fires during development (e.g., in a replay test), it signals an architectural violation — the handler allowed a transition that should be impossible.

**Entry guard model** (preferred over exit guard):

> "Can enter target state?"

Not:

> "Can leave current state?"

Entry guards colocate with the **protected resource** (the state being entered), not with the **pathway** (the state being exited). This naturally handles multi-source transitions (progressive fills, corrections, back-nav) and remains correct when new routes are added.

---

## 7. Evolutionary Path

| Stage | Change | Value | Infrastructure needed |
|---|---|---|---|
| **1** | Avoid destructive mutation in reschedule flow | Data preservation, audit trail | Cancel + create (or version + supersede) |
| **2** | Versioned identity for appointments | Identity continuity, full history | `logical_id`, `version`, `superseded_at` columns |
| **3** | Collapse field-collection states | Simpler state machine, fewer transition bugs | Single BOOKING_COLLECTION handler, prompt derivation |
| **4** | Explicit event history (if needed) | Event-driven querying, projection rebuilds | Separate events table or event store |

### Stage 1: Now (prevent data destruction)

The one thing that should be fixed immediately is the reschedule flow. The current `updateAppointment` call overwrites old values in place. This is not about event sourcing purity; it's about not losing information.

The fix is small and cheap: **cancel old + create new** (with same logical_id when versioned identity is added).

### Stage 2: Near-term (versioned identity)

Add `logical_id`, `version`, `superseded_at` to the appointments table. Update the reschedule flow to create a new version instead of mutating in place. Add the `WHERE logical_id = ? ORDER BY version DESC LIMIT 1` query pattern for current projection.

### Stage 3: Medium-term (simplify state machine)

Collapse `BOOKING_DATE`, `BOOKING_TIME`, `BOOKING_TREATMENT` into `BOOKING_COLLECTION`. Make the prompt derivable from `computePendingFields(booking)`. This eliminates half the states and the associated transition table complexity.

### Stage 4: Future (only if needed)

Introduce explicit event history only when a concrete consumer demands it — e.g., a clinic dashboard that needs to show the full timeline of an appointment, or a notification system that needs to react to state changes.

**Do not build projection infrastructure (event bus, outbox pattern, CQRS) before a real consumer exists.** The versioned rows in Stage 2 will already provide a queryable history. Add infrastructure only under real pressure.

---

## 8. Implications for Existing Code

### 8.1 What's Already Correct

- **Messages table** — append-only by design. No changes needed.
- **Session table** — mutable operational state. `version` column for optimistic locking is already added.
- **Booking data accumulation** — progressive fill in handlers is the right pattern.
- **Router** — classifies meaning, not permission (with state-scoping for field-targeted entity intents). Correct separation with the nuance described in §6.2.

### 8.2 Immediate Fixes (Stage 1)

| Area | Current behavior | Correct behavior |
|---|---|---|
| `updateAppointment` in reschedule flow | Mutates old row in place | Cancel old + create new version |
| `appointmentRepository.updateAppointment` | Direct UPDATE | Remove or convert to versioned insert |

### 8.3 Near-term Changes (Stage 2)

- Add `logical_id`, `version`, `superseded_at` columns to appointments table
- Update `createAppointment` to accept `logical_id` (or generate if first version)
- Update `cancelAppointment` to set `superseded_at`
- Add `getCurrentAppointment(logical_id)` query
- Add `getAppointmentHistory(logical_id)` query

### 8.4 Medium-term Changes (Stage 3)

- Rename field-collection states to single `BOOKING_COLLECTION` (or alias in state enum)
- `computePendingFields()` already exists at `src/lib/entities.js:92` — reuse as the progression driver
- Create `buildPromptForField()` function — derives the UI prompt from the current missing field
- Refactor `handleBookingDate`, `handleBookingTime`, `handleBookingTreatment` into a single `handleBookingCollection` with field-dispatching helpers
- Update transition table to remove state-specific entries for field collection

### 8.5 Practices to Maintain

1. **No hidden progression** — Handlers explicitly set the next state; the engine never overrides
2. **Entry guards, not exit guards** — Invariants are properties of the target state
3. **Data completeness drives progression** — During collection, the system asks "what's missing?" not "what comes next?"
4. **Identity continuity** — User-facing entities keep stable identities across changes
5. **Evolutionary design** — Preserve truth correctly first; add infrastructure only under real pressure

---

### 8.6 Validation: The Replay Test Suite

The invariants, mutation policies, and progression rules described in this document are enforced by the **replay test suite** at `tests/replay/`.

The replay suite processes conversation fixtures through the real engine pipeline and asserts:
- Expected state transitions at each step
- Expected intent classification
- No unexpected state changes (e.g., implicit progression from engine override)

Every architectural change (collapse states, add guards, change mutation regime) should include:
1. A fixture that exercises the new behavior
2. A fixture that exercises the edge case (what should NOT happen)
3. Running the full suite: `node --experimental-loader ./tests/replay/path-loader.js tests/replay/runner.js`

The replay suite is the **validation mechanism** for the truth-type model. If a change violates an invariant (e.g., entering BOOKING_CONFIRMATION without a time), the test suite catches it immediately.

This is why the split-brain bug was found: the replay suite detected that the engine was applying a structural transition (`provide_treatment → BOOKING_CONFIRMATION`) that the handler had not explicitly authorized. The fixture captured the exact scenario — a fragmented message delivering a treatment entity while in BOOKING_TIME — and the assertion failure exposed the architectural violation.

---

*Derived from architecture review session — 2026-05-26. Validated by `tests/replay/runner.js`.*
