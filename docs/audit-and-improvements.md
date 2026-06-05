# Shri Balaji Dental Clinic Bot — Conversation Flow Audit & Improvement Plan

> **Audit Date:** 2026-05-25
> **Scope:** Full trace through every major conversation path, both positive and negative
> **Methodology:** Line-by-line trace through the code for each scenario
>
> **Historical note (2026-05-31):** This document captures an earlier audit phase. Some "broken" flows here were addressed in later updates. Use `docs/user-flows.md` and `docs/patient-flow-improvements.md` as the current-state references.

---

## Table of Contents

1. [Positive Flows (What Works)](#1-positive-flows-what-works)
2. [Negative Flows (What's Broken)](#2-negative-flows-whats-broken)
3. [Bug Catalog](#3-bug-catalog)
4. [Root Causes: Why It Feels Robotic](#4-root-causes-why-it-feels-robotic)
5. [Improvement Recommendations](#5-improvement-recommendations)
6. [Implementation Priority Matrix](#6-implementation-priority-matrix)

---

## 1. Positive Flows (What Works)

The following conversation paths actually function correctly end-to-end:

### ✅ P1 — Happy Booking (Greeting → Booked)

```
User: "hi"
Bot: "Welcome to Shri Balaji Dental Clinic.
      1 - Book Appointment
      2 - Dental Services
      3 - Clinic Location
      4 - Clinic Timings"

User: "1"
Bot: "What date would you like to come in?
      Examples: "tomorrow", "next Monday", or "25 May".
      Or type "0" for the menu."

User: "tomorrow"
Bot: "Monday, 26 May 2026 is available.
      Hours: 09:00–20:00
      Slots: 09:00, 09:30, 10:00, 10:30, 11:00...
      What time works for you?"

User: "10am"
Bot: "10:00 works. Which treatment do you need?
      1. General Dentistry
      2. Teeth Cleaning
      3. Root Canal
      ..."

User: "cleaning"
Bot: "Confirm your appointment:
      Date: Monday, 26 May 2026
      Time: Teeth Cleaning
      Treatment: Teeth Cleaning
      Location: Shri Balaji Dental Clinic
      Reply "confirm" to book, "date" or "time" to change, or "cancel""

User: "confirm"
Bot: "Confirmed! Here is your appointment:
      Date: Monday, 26 May 2026
      Time: 10:00
      Treatment: Teeth Cleaning
      ..."
```

**Status: ✅ Works** — the core booking pipeline functions.

### ✅ P2 — Back Navigation During Booking
```
State: BOOKING_TIME
User: "back"
Bot: "Sure, going back to choose a different time."
→ Goes to BOOKING_DATE

State: BOOKING_TREATMENT
User: "back"
Bot: "Alright, going back to pick a different treatment."
→ Goes to BOOKING_TIME
```
**Status: ✅ Works** — `previousState` tracking is correct.

### ✅ P3 — Info Side-Quest During Booking (No State Change)
```
State: BOOKING_TIME
User: "services"
Bot: "Shri Balaji Dental Clinic offers:
      1. General Dentistry
      ...
      Back to your booking — What time would you prefer?"
→ Stays in BOOKING_TIME
```
**Status: ✅ Works** — interruption handler answers questions without losing state.

### ✅ P4 — Emergency Detection
```
Any state
User: "severe pain"
Bot: "If this is a medical emergency, please call +91 91115 94782..."
→ Transitions to EMERGENCY
```
**Status: ✅ Works** — global priority ensures emergency is always caught.

### ✅ P5 — Cancel From Any Booking State
```
State: BOOKING_DATE/TIME/TREATMENT/CONFIRMATION
User: "cancel"
Bot: "No problem. What would you like to do instead?"
→ Goes to MAIN_MENU
```
**Status: ✅ Works** — clears booking context, returns to menu.

### ✅ P6 — Number-Based Treatment Selection
```
State: BOOKING_TREATMENT
User: "2"
→ Matched as number → entities.treatment = "Teeth Cleaning"
→ Transition to BOOKING_CONFIRMATION
```
**Status: ✅ Works** — special handling in `processMessage` overrides cross-state intent.

### ✅ P7 — Menu Return From Any Non-Booking State
```
State: SERVICES/LOCATION/TIMINGS/BOOKED
User: "0" or "menu"
Bot: Shows menu options (full or compact based on 5-min cooldown)
→ Goes to MAIN_MENU
```
**Status: ✅ Works** — 5-minute cooldown avoids repeating full menu.

### ✅ P8 — Edit Date/Time During Confirmation
```
State: BOOKING_CONFIRMATION
User: "change date"
Bot: "What date would you like instead?"
→ Goes to BOOKING_DATE
```
**Status: ✅ Works** — specific edit handlers clear the right field.

### ✅ P9 — Contextual Greeting in Active State
```
State: BOOKING_TIME
User: "hi"
Bot: "Hello! We were choosing a time for your appointment.
      What time would you prefer?"
→ Stays in BOOKING_TIME
```
**Status: ✅ Works** — greeting detects active state and re-prompts.

### ✅ P10 — Date Extraction Variants
| Input | Parses? | Notes |
|---|---|---|
| "tomorrow" | ✅ | Relative date works |
| "next monday" | ✅ | Uses `next\s+(mon\|...)` regex |
| "25 May" | ✅ | Spoken date format |
| "25/05/2026" | ✅ | DMY format |
| "25-05-2026" | ✅ | Dash separator |

### ✅ P11 — Time Extraction Variants
| Input | Parses? | Result | Notes |
|---|---|---|---|
| "10:30" | ✅ | 10:30 | HH:MM |
| "10:30am" | ✅ | 10:30 | With meridiem |
| "2pm" | ✅ | 14:00 | Hour-only + pm |
| "14:00" | ✅ | 14:00 | 24-hour format |
| "2 30" | ✅ | 02:30 | Space separator |

### ✅ P12 — Pipeline Infrastructure
- Webhook handler returns 200 within milliseconds (retry-safe)
- Deduplication works (in-memory + DB)
- Structured JSON logging throughout
- Optimistic locking on sessions prevents concurrent write corruption
- Emoji stripping in message normalizer

---

## 2. Negative Flows (What's Broken)

### ❌ N1 — "yes", "ok", "sure" Hijacks Conversation (CRITICAL)

```
State: BOOKING_TIME
User: "ok"    (meaning "ok, I'm ready for the next step")
Bot: "Let us set up your appointment first. What date works for you?"
→ Ignores the user's progress! Resets the conversation.
```

**Root Cause:** The `confirm` intent has an overly broad exact-match list:
```js
exact: ['confirm', 'yes', 'ok', 'okay', 'sure', 'correct', 'book it', 'yeah', 'yep', 'done', 'proceed', 'go ahead']
```

When the router checks cross-state intents, "ok", "yes", "sure" match `confirm`. Then `routeStateIntent` calls `handleBookingConfirmation`, which checks `session.state !== 'BOOKING_CONFIRMATION'` and says "Let us set up your appointment first."

**Impact:** Users are constantly thrown out of their flow during booking.

### ❌ N2 — First Entry to Booking State Increments failedAttempts

```
State: MAIN_MENU
User: "1"     → intent: 'appointment'
→ routeStateIntent → handleBookingDate(session, {})
→ No entities.date → failedAttempts++ (from 0 to 1)
→ "What date would you like to come in?"
```

This means **the user's first legitimate interaction in BOOKING_DATE is counted as a failed attempt**. When they then provide a valid date, failedAttempts is reset to 0 in the success branch. But if they provide an INVALID date first:
- Initial prompt: failedAttempts = 1
- First invalid date: failedAttempts = 2 → shows SECOND attempt message, not first
- Second invalid date: failedAttempts ≥ 2 → ESCALATION

So the user only gets **ONE** proper retry before escalation instead of two.

**Same issue for BOOKING_TIME and BOOKING_TREATMENT.**

### ❌ N3 — Validation Feedback is Lost (CRITICAL)

```
State: BOOKING_TIME
User: "9pm"     → parsed as 21:00
→ isValidTime returns { valid: false, reason: 'AFTER_CLOSING',
                        suggestion: 'We close at 20:00.' }
→ findTransition returns { next: null, suggestion: 'We close at 20:00.' }
→ processMessage calls handleIntentUnknown(session)
→ Bot says: "I did not catch the time. Try "10am", "2:30pm", or "14:00"."
```

**The user never sees that the clinic closes at 20:00!** The specific error message is thrown away because `handleIntentUnknown` generates a generic reprompt.

Same for:
- **Sunday bookings:** "Sun 10AM–2PM only. Would you like to proceed?" → lost
- **Past dates:** "That date has already passed" → lost
- **Before opening:** "We open at 09:00." → lost
- **Invalid slots:** "Available slots are every 30 minutes, e.g., 10:30." → lost

### ❌ N4 — Bot Messages Lost From Database (DATA LOSS)

The `processMessage` function saves the bot reply using the **user's message ID**:
```js
await createMessage({
    msgId,         // ← THIS IS THE USER'S MSG ID!
    role: 'bot',   // role is 'bot'
    ...
});
```

The user's message was already saved in the pipeline with this `msgId`. Since `msg_id` has a UNIQUE constraint, the bot reply INSERT fails silently (`ON CONFLICT DO NOTHING`).

`sendTextMessage` returns a `sentMsgId` — but it's only logged, never stored in the DB.

**Impact:** No bot reply history in the database. Conversation history is incomplete.

### ❌ N5 — State Machine Not Enforced (ARCHITECTURAL FAILURE)

The `findTransition` function checks if a state+intent transition is valid, but its result is **almost never used to block invalid transitions**.

Example:
```
State: SERVICES
User: "location"    → classifies as 'location' (cross-state)
→ findTransition(SERVICES, 'location') → null (no transition defined)
→ But code falls through to routeStateIntent → handleLocation
→ State changes to LOCATION — even though transition table says no!
```

The transition table is supposed to be the source of truth, but it's bypassed by `routeStateIntent`, which routes by intent directly without consulting the state machine.

Allowed transitions from SERVICES according to the table: `main_menu`, `appointment`, `emergency`, `escalate`  
Actual reachable intents from SERVICES via `routeStateIntent`: **ALL intents** — `services`, `location`, `timings`, `back`, `callback`, `thanks`, `help`, etc.

### ❌ N6 — Slot Rounding Produces Garbage Text (BUG)

```js
// In validators.js
const rounded = `${String(Math.floor(timeMinutes / 30) * 30 / 60).padStart(2, '0')}:${...}`;
```

For 10:45 (timeMinutes = 645):
- Math.floor(645 / 30) * 30 / 60 = 21 * 30 / 60 = 10.5
- String(10.5).padStart(2, '0') → "10.5"
- Result: **"10.5:30"** — user sees a broken suggestion!

For 10:15 (timeMinutes = 615):
- Math.floor(615 / 30) * 30 / 60 = 20 * 30 / 60 = 10
- String(10).padStart(2, '0') → "10"
- Result: "10:00" — this one works by luck

### ❌ N7 — "Thanks" Doesn't Re-Prompt

```
State: BOOKING_DATE
User: "thanks"
Bot: "You're welcome! Let me know if you need anything else."
→ Stays in BOOKING_DATE, but NO prompt shown for what to do next
```

The user is left hanging. They don't know whether to proceed booking or not. Same for `help` intent — shows contextual help but doesn't re-prompt.

### ❌ N8 — "back" From Non-Booking States Gives Vague Message

```
State: SERVICES (entered from MAIN_MENU, previousState = 'MAIN_MENU')
User: "back"
Bot: "Going back."   ← message[target] is undefined for MAIN_MENU
→ Goes to MAIN_MENU but doesn't show the menu options
```

The `handleBack` messages object only has entries for BOOKING_DATE, BOOKING_TIME, BOOKING_TREATMENT. All other targets show "Going back." with no menu or prompt.

### ❌ N9 — "services" Intent From SERVICES Shows Duplicate Content

```
State: SERVICES (already viewing services)
User: "2"   → matches 'services' (exact: ['2'])
→ routeStateIntent → handleServices
Bot: "Shri Balaji Dental Clinic offers: 1. General Dentistry..." (again)
```

"2" is an exact match for `services`. If user types "2" in SERVICES state intending to select treatment #2, it instead shows the same services list again. The user never reaches `handleBookingTreatment`. Number-based treatment selection only works in BOOKING_TREATMENT state.

### ❌ N10 — `services` Intent Prevents `appointment` From Non-Booking States

```
State: MAIN_MENU
User: "I want to book an appointment at your clinic"
→ textLower = "i want to book an appointment at your clinic"
→ Cross-state check: 'services' has contains: ['services', 'treatment', ..., 'procedures']
→ "i want to book an appointment..." does NOT include 'services' — OK, no problem

BUT:
User: "What services do you offer?"
→ State-specific for MAIN_MENU: checks 'appointment' (contains 'services'? no),
  'services' (contains 'services'? YES)
→ Matches services, not appointment
```

Actually this one is fine since "what services do you offer" should indeed match `services`, and the exact routing handles it. Let me check a subtler case:

```
State: MAIN_MENU
User: "I need a treatment"   → textLower includes 'treatment'
→ State-specific: 'appointment' contains: ['appointment', 'booking', 'schedule', ...]
  — "i need a treatment" doesn't include any of those
→ State-specific: 'services' contains: ['services', 'treatment', 'service', ...]
  — YES, "i need a treatment" includes 'treatment'
→ Matches services, not appointment
```

The word "treatment" (singular) is in the services contains list but not in the appointment contains list. So someone saying "I need a treatment" gets routed to services instead of booking. This is debatable but could cause confusion.

### ❌ N11 — `confirm` Blocks Legitimate Responses (Related to N1)

```
State: BOOKING_DATE
User: "ok"    → means "ok, the date is set"
→ Classified as 'confirm' (cross-state)
→ routeStateIntent → handleBookingConfirmation
→ State is not BOOKING_CONFIRMATION
→ "Let us set up your appointment first. What date works for you?"
```

The user already set a date! They're saying "ok, I've told you the date". The bot should either:
1. Re-prompt for the date (if no date in session)
2. Move to the time step
3. Acknowledge the date and ask for time

Instead it resets the conversation.

### ❌ N12 — Active-State Greeting Doesn't Acknowledge Return

```
State: BOOKING_TIME
User: "hi"
Bot: "Hello! We were choosing a time for your appointment. What time would you prefer?"
```

This is actually OK (P9), but there's no differentiation between a "welcome back after timeout" and a casual "hi" during active flow. Both show the same greeting. Minor UX issue.

### ❌ N13 — Escalation is Terminal With No Recovery

```
State: HUMAN_ESCALATION
User: "Let me try again"
Bot: tries to match intent → only valid transitions are: main_menu, done
→ If classified as main_menu, goes to MAIN_MENU
→ If classified as 'done' (NOT in any intent map!), goes to DONE
→ Otherwise → unknown → handleIntentUnknown → escalation again!
```

The transition table allows `main_menu` from HUMAN_ESCALATION, which does work. But the error messages in this state say "call us", not "or type 0 to go back". So users may not know they can recover.

### ❌ N14 — HUMAN_ESCALATION State Allows Undocumented Transitions

The transition table says:
```js
[State.HUMAN_ESCALATION]: [
    { intent: 'main_menu', next: State.MAIN_MENU },
    { intent: 'done', next: State.DONE },
],
```

But `routeStateIntent` handles ALL intents from any state. So a user in HUMAN_ESCALATION could say "services", "location", "timings" and the bot would route those handlers. The transition table is bypassed.

### ❌ N15 — `handleProvidePhone` Uses Unvalidated Input

```js
function handleProvidePhone(session, entities) {
  session.state = State.DONE;
  return {
    session,
    reply: `Thanks! We will call you back at ${entities.phone || 'your number'}...`,
  };
}
```

If `entities.phone` is null (no phone extracted), it says "your number" — the user shared a number but the bot couldn't parse it, yet it proceeds without validation.

### ❌ N16 — `edit_date` and `edit_time` Don't Work During BOOKING_DATE/BOOKING_TIME

If the user is in BOOKING_DATE and says "change date" → it's classified as `edit_date` via cross-state. Then:
- `processMessage`: isBookingState('BOOKING_DATE') && INFO_INTENTS.includes('edit_date') → false (edit_date not in INFO_INTENTS)
- source is 'cross_state'
- Then: `!isBookingState(session.state)` → false, so cross-state handler doesn't apply
- Falls to `routeStateIntent` → `handleEditDate`
- This sets `booking.date = null` and state to BOOKING_DATE

The user was already in BOOKING_DATE, so clearing the date and staying in the same state is a no-op. They just lose their entered date. Not a crash but confusing.

### ❌ N17 — `configure_flow` Always Sets flowId to Current Timestamp

```js
flowId: `flow_${Date.now()}`,
```

Every new session gets a unique flowId, but when loading an existing session:
```js
flowId: `flow_${dbSession.created_at}`,
```

The flowId is different from the original session creation. Minor but means flow tracking is inconsistent.

### ❌ N18 — `phoneNumberId` Not Stored in Session During Re-creation

When a session is expired and re-created:
```js
const created = await createSession({
    waId: session.waId,
    phoneNumberId: session.phoneNumberId,
    profileName: session.profileName,
});
```
But in the existing-session load path:
```js
phoneNumberId: dbSession.phone_number_id,
```
No update from the new message. If the phone_number_id changes (Meta changes the endpoint), the session would have stale data.

---

## 3. Bug Catalog

| ID | Severity | Category | File | Line(s) | Description |
|---|---|---|---|---|---|
| B1 | **Critical** | Intent | `intents.js` | 47-52 | `confirm` matches "yes", "ok", "sure" — hijacks booking flow |
| B2 | **Critical** | State Machine | `handlers.js` | 611-625 | `findTransition` never blocks invalid transitions; `routeStateIntent` bypasses it |
| B3 | **Critical** | Data Loss | `handlers.js` | 703-712 | Bot reply saved with user's `msgId` → UNIQUE violation → silent data loss |
| B4 | **High** | Validation | `validators.js` | 54-55 | Slot rounding produces "10.5:30" instead of "10:30" |
| B5 | **High** | Validation | `handlers.js` | 626-628 | Validation feedback (e.g., "We close at 20:00") thrown away; generic reprompt shown |
| B6 | **Medium** | Metrics | `handlers.js` | 98-103 | Initial prompt in booking states increments `failedAttempts` |
| B7 | **Medium** | Dead Code | `handlers.js` | 550 | `State.GREETING` doesn't exist in state enum |
| B8 | **Medium** | Session | `session.js` | 50 | `isExpired` checks `session.expiresAt` but nothing ever updates it server-side |
| B9 | **Medium** | Session | everywhere | — | `touchSession`/`extendSessionTTL` never called — sessions never actually expire |
| B10 | **Medium** | State | everywhere | — | `ABANDONED` state never set — recovery is dead code |
| B11 | **Medium** | Routing | `handlers.js` | 633-638 | `ABANDONED` check happens before transition validation — order of operations bug |
| B12 | **Low** | UX | `handlers.js` | 483-487 | "Going back." shown without re-prompting when navigating to non-booking states |
| B13 | **Low** | UX | `handlers.js` | 206, 210 | "Thanks" and "Help" don't re-prompt — user left hanging |
| B14 | **Low** | Duplicate | `handlers.js` | 534-544 | `formatDate`/`formatDisplayDate` duplicated in `formatters.js` (unused imports) |
| B15 | **Low** | Config | `intents.js` | 89-90 | `edit_time` includes "different hour" — overly broad, matches unrelated text |
| B16 | **Low** | Routing | `handlers.js` | 629-631 | `handleBookingConfirmation` called for `confirm` intent from any state — context-less reset |

---

## 4. Root Causes: Why It Feels Robotic

### 4.1 The State Machine Is Decorative, Not Enforceable

The architecture document describes a beautiful state machine with explicit transitions. But the actual code routes **by intent**, not **by state**. The `routeStateIntent` function is a flat switch statement that dispatches to handlers regardless of whether the current state allows that intent.

**Result:** Users feel like the bot is "confused" because it processes commands that shouldn't be valid in the current context.

### 4.2 Validation Errors Are Swallowed

The architecture defines per-field validators with detailed error messages ("We close at 20:00", "We only book up to 30 days ahead", "Available slots are every 30 minutes"). But the engine ignores these error messages and shows a generic "I did not catch that" response.

**Result:** When the bot rejects input, it can't explain WHY. User feels like they're talking to a broken machine.

### 4.3 Broad Keywords Hijack Intent

"yes", "ok", "sure", "done" are natural responses during any conversation step. By matching these to `confirm` globally, the bot treats casual affirmations as booking confirmations. This is the single biggest source of "the bot is not listening to me" sentiment.

### 4.4 No Memory of What It Said

Because bot replies are never stored in the database (B3), there's no conversation history. The bot can't:
- Reference previous responses
- Help debug issues
- Provide context during human handoff

### 4.5 Sessions Never Actually Expire

Despite having an `expiresAt` field and `ABANDONED` state, the server never:
- Updates session activity times
- Runs a cleanup job
- Transitions stale sessions to ABANDONED

This means sessions sit forever with stale data, and the "abandonment recovery" flow (which should say "Welcome back! You were booking an appointment...") never triggers.

### 4.6 Inconsistent Voice and Tone

Some replies use `—` (em dash), some use `-`. Some use `\\n\\n` double newlines, some don't. The `handleBack` messages object only covers 3 of 15 states. The escalation message says "call us" but the main menu offers "1 - Book Appointment" with numbers. The bot swings between polite formality ("I did not catch the date") and casual ("Still tricky."). This inconsistency makes it feel less polished.

### 4.7 Metrics Tracking Is Wrong

`failedAttempts` counts the initial prompt as a failure. `messagesInState` is incremented in `getOrCreateSession` but reset in handlers. These metrics drive the escalation logic, so incorrect metrics mean incorrect escalation timing.

---

## 5. Improvement Recommendations

### 5.1 Fix the State Machine Enforcement (P0)

**Problem:** `findTransition` is decorative — it returns information but the engine doesn't act on it.

**Solution:** In `processMessage`, after `findTransition`, check if the transition is valid for the current state+intent pair. If not, either:
- Show a contextual message: "You can't do that right now. Would you like to go back to [previous step]?"
- Or auto-route to the closest valid state

**Implementation sketch:**
```js
const transition = findTransition(session.state, intentResult.intent, entities);

if (!transition) {
    // Intent not allowed in current state
    return handleInvalidTransition(session, intentResult.intent);
}
```

### 5.2 Fix `confirm` Intent Matching (P0)

**Problem:** "yes", "ok", "sure", "done", "yep", "yeah" match `confirm` globally.

**Solution:** Narrow `confirm` matching:
- Remove "yes", "ok", "okay", "sure", "yeah", "yep", "done" from exact list
- Only match "confirm", "book it", "proceed", "go ahead"
- For casual affirmations, rely on the state context (e.g., user in BOOKING_TIME saying "ok" should confirm the time, not the booking)

Better approach: **Remove `confirm` from the global intent router entirely.** Only match it when in `BOOKING_CONFIRMATION` state. Use a dedicated `affirmative` intent for casual yes/ok/sure that re-prompts contextually.

### 5.3 Pass Validation Feedback to User (P0)

**Problem:** `findTransition` returns `suggestion` but `handleIntentUnknown` ignores it.

**Solution:** Instead of calling `handleIntentUnknown` when validation fails, pass the validation result through:

```js
if (transition.next === null && transition.transition?.validate) {
    const { suggestion, reason } = transition;
    // Show the specific validation error, not the generic reprompt
    return {
        session,
        reply: suggestion || getFallbackMessage(session.state),
    };
}
```

### 5.4 Fix Bot Message DB Storage (P1)

**Problem:** Bot messages saved with user's msgId → silent failure.

**Solution:** Use the WhatsApp message ID returned by `sendTextMessage`:
```js
const sentMsgId = await sendTextMessage(waId, result.reply);

await createMessage({
    msgId: sentMsgId,  // ← use the sent message ID
    sessionId: session.id,
    waId,
    role: 'bot',
    ...
});
```

### 5.5 Fix Slot Rounding Display (P1)

**Problem:** `"10".padStart(2, '0')` works but `"10.5".padStart(2, '0')` doesn't because `10.5` is a float.

**Fix the calculation:**
```js
const roundedHour = Math.floor(timeMinutes / 60);
const roundedMin = timeMinutes >= Math.floor(timeMinutes / 30) * 30
    ? 0
    : 30;
// Or simpler:
const nearestSlot = Math.round(timeMinutes / 30) * 30;
const roundedHour = Math.floor(nearestSlot / 60);
const roundedMin = nearestSlot % 60;
const rounded = `${String(roundedHour).padStart(2, '0')}:${String(roundedMin).padStart(2, '0')}`;
```

### 5.6 Fix `failedAttempts` Counting (P1)

**Problem:** Initial prompt in booking states counts as a failed attempt.

**Solution:** Don't increment `failedAttempts` when no entity is found during the FIRST prompt (i.e., when transitioning INTO the state, differentiate from actually receiving invalid input).

A cleaner approach: track `promptsInState` separately from `failedAttempts`. Only increment `failedAttempts` when the user actively provided invalid input, not when the bot entered the state and asked for the first time.

### 5.7 Implement Session Timeout (P2)

**Problem:** Sessions never expire server-side; `ABANDONED` state is never set.

**Solution:**
1. In `processMessage`, check if the session is expired before processing
2. If expired, transition to `ABANDONED` and send a recovery message
3. Add a cron job to periodically expire stale sessions
4. Implement the `touchSession` / `extendSessionTTL` calls in the pipeline

### 5.8 Re-prompt After "help" and "thanks" (P2)

**Problem:** Showing help/thanks leaves user hanging.

**Solution:** Append the state's reprompt to these responses:
```js
function handleHelp(session) {
    const helpText = getContextualHelp(session.state);
    const reprompt = getStateReprompt(session.state, session);
    return {
        session,
        reply: `${helpText}\n\n${reprompt}`,
    };
}
```

### 5.9 Fix "back" Navigation UX (P2)

**Problem:** "Going back." is vague and doesn't re-prompt.

**Solution:** After navigating back, always show the state's prompt:
```js
function handleBack(session) {
    if (!session.previousState) return handleMainMenu(session);
    const target = session.previousState;
    session.state = target;
    session.metrics.failedAttempts = 0;
    const reprompt = getStateReprompt(target, session);
    return { session, reply: `Going back. ${reprompt}` };
}
```

### 5.10 Add Re-Entry From HUMAN_ESCALATION (P2)

**Problem:** Once escalated, users can only go to menu or done.

**Solution:** Add more transitions from HUMAN_ESCALATION:
```js
[State.HUMAN_ESCALATION]: [
    { intent: 'main_menu',     next: State.MAIN_MENU },
    { intent: 'done',          next: State.DONE },
    { intent: 'emergency',     next: State.EMERGENCY },
    { intent: 'services',      next: State.SERVICES },
    { intent: 'help',          next: State.HUMAN_ESCALATION },  // show help without changing
],
```

And update the escalation message to mention recovery options:
```
"Let me connect you to our team. Please call +91 91115 94782 or expect a callback shortly.
Or reply "0" for the main menu."
```

### 5.11 Add Phone Validation for Callbacks (P3)

**Problem:** `handleProvidePhone` accepts unparsed input.

**Solution:** Add validation to `CALLBACK_REQUESTED` state transitions:
```js
[State.CALLBACK_REQUESTED]: [
    { intent: 'provide_phone', next: State.DONE, validate: 'isValidPhone' },
    ...
],
```

And implement `isValidPhone` that checks for a valid 10-digit Indian phone number.

### 5.12 Consistent Voice & Formatting (P3)

- Use consistent newline patterns (`\\n\\n` for paragraph breaks, `\\n` for list items)
- Standardize on either em-dash or hyphen for separators
- Use consistent character for bullet points
- Remove "Still tricky." — the casual tone clashes with "I did not catch the date"

### 5.13 Fix Number Routing in SERVICES State (P3)

**Problem:** "2" matches `services` even when user means to select treatment #2.

**Solution:** When in SERVICES state and user types a single number, route it to `appointment` instead of re-showing services. Or better, add a treatment detail flow to SERVICES.

### 5.14 Remove Dead Code (P3)

- Remove `State.GREETING` from `STATE_HANDLERS` (M3)
- Remove unused `touchSession` import from engine.js
- Remove duplicate `formatDate`/`formatDisplayDate` from handlers.js (import from formatters.js instead)
- Remove `VALIDATORS` from `intents.js` (unused — validation is in transitions.js)

---

## 6. Implementation Priority Matrix

| Priority | Fix | Difficulty | Impact | Dependencies |
|---|---|---|---|---|
| **P0** | State machine enforcement | Medium | **Conversation coherence** | None |
| **P0** | Fix `confirm` intent hijacking | Easy | **Booking flow reliability** | None |
| **P0** | Pass validation feedback to user | Easy | **Error quality** | None |
| **P1** | Fix bot message DB storage | Easy | **Conversation history** | None |
| **P1** | Fix slot rounding display | Easy (1 line) | **User-facing text quality** | None |
| **P1** | Fix `failedAttempts` counting | Easy | **Escalation accuracy** | None |
| **P2** | Implement session timeout | Medium | **Session hygiene** | DB schema ready |
| **P2** | Re-prompt after help/thanks | Easy | **Flow smoothness** | None |
| **P2** | Fix "back" navigation UX | Easy | **Navigation clarity** | None |
| **P2** | Add re-entry from escalation | Easy | **Recovery UX** | None |
| **P3** | Add phone validation | Easy | **Data quality** | None |
| **P3** | Consistent formatting | Easy | **Polish** | None |
| **P3** | Remove dead code | Easy | **Maintainability** | None |

### Recommended Execution Order

**Phase 1 (Fix the broken bot):**
1. Fix `confirm` intent matching (P0)
2. Pass validation feedback to user (P0)
3. Fix slot rounding display (P1)
4. Fix bot message DB storage (P1)

**Phase 2 (Make it coherent):**
5. Enforce state machine transitions (P0)
6. Fix `failedAttempts` counting (P1)
7. Fix "back" navigation (P2)
8. Re-prompt after help/thanks (P2)

**Phase 3 (Make it reliable):**
9. Implement session timeout (P2)
10. Add re-entry from escalation (P2)
11. Add phone validation (P3)

**Phase 4 (Polish):**
12. Consistent formatting (P3)
13. Remove dead code (P3)

---

*Document generated from full code trace — every flow verified against actual code paths, not just architecture doc.*
