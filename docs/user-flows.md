# Complete User Flow Catalog — Shri Balaji Dental Clinic Bot

> **Audience:** Developers and maintainers  
> **Purpose:** Document every conversational path — positive, negative, and edge case — with exact bot responses.  
> **Source:** Derived from `src/lib/*.js`, `src/config/*.js`, and `tests/replay/fixtures.js`.  
> **Date:** 2026-05-29 (updated — conversational tone improvements)

---

## Table of Contents

1. [State Map](#1-state-map)
2. [Complete Intent Map](#2-complete-intent-map)
3. [Positive Flows](#3-positive-flows)
4. [Negative / Edge Case Flows](#4-negative--edge-case-flows)
5. [State Transition Table](#5-state-transition-table-complete)
6. [Validation Rules](#6-validation-rules)
7. [Escape Hatches](#7-escape-hatches)
8. [Notable Edge Case Design Decisions](#8-notable-edge-case-design-decisions)

---

## 1. State Map

| State | Purpose |
|---|---|
| `IDLE` | New session, first message |
| `MAIN_MENU` | Hub — all navigation starts here |
| `BOOKING_COLLECTION` | Collecting date/time/treatment (unified state) |
| `BOOKING_CONFIRMATION` | Reviewing before final confirm |
| `BOOKED` | Appointment confirmed, management options |
| `CANCEL_CONFIRM` | Confirming cancellation intent |
| `EMERGENCY` | Emergency mode — urgent info only |
| `HUMAN_ESCALATION` | Repeated failures or user requested agent |
| `CALLBACK_REQUESTED` | Collecting phone for callback |
| `SERVICES` / `LOCATION` / `TIMINGS` | Info display (stay in current state) |
| `DONE` / `ABANDONED` | Terminal / expired |

---

## 2. Complete Intent Map

### Global Intents (match from any state)

| Intent | Keywords | Behavior |
|---|---|---|
| `emergency` | `pain`, `bleeding`, `swelling`, `accident`, `urgent`, `toothache`, `abscess`, `fracture`, `knocked out`, `severe`, `hurts`, `broken tooth`, `injury` | → `MAIN_MENU` (emergency info + menu shown in same message) |
| `cancel` | `cancel`, `forget it`, `abort`, `nevermind`, `never mind` | → `MAIN_MENU` (or cancel flow if booked) |
| `main_menu` | `0`, `menu`, `home`, `start over`, `restart`, `main menu`, `back to menu` | → `MAIN_MENU` |
| `escalate` | `agent`, `human`, `talk to`, `representative`, `speak to`, `person` | → `HUMAN_ESCALATION` |
| `back` | `back`, `previous`, `go back`, `return` | Context-dependent navigation |
| `affirm` | `ok`, `okay`, `sure`, `right`, `fine`, `good`, `yep`, `yeah`, `alright`, `that works`, `perfect`, `great`, `got it`, `cool`, `done with this` | Re-prompt or confirm |
| `greeting` | `hi`, `hello`, `hey`, `namaste`, `good morning`, `good afternoon`, `good evening` | State-appropriate greeting |
| `thanks` | `thanks`, `thank you`, `thx`, `ty`, `appreciate` | Replies `"You're welcome! Let me know if you need anything else."` |
| `help` | `help`, `?`, `what can you do` | State-appropriate help text |
| `small_talk` | `how are you`, `how r u`, `what's up`, `wassup`, `sup`, `you there`, `anyone there` | Warm one-liner reply, then shows menu |

### State-Specific Intents

| Intent | State | Keywords |
|---|---|---|
| `appointment` | `MAIN_MENU`, `BOOKED` | `1`, `book`, `appointment`, `book appointment`, `schedule a visit`, `booking`, `schedule` |
| `services` | `MAIN_MENU` | `2`, `services`, `dental services`, `treatment`, `procedures`, `what we offer`, `what do you do` |
| `location` | `MAIN_MENU` | `3`, `location`, `clinic location`, `address`, `directions`, `where` |
| `timings` | `MAIN_MENU` | `4`, `timings`, `clinic timings`, `hours`, `open`, `close`, `schedule` |
| `my_appointments` | `MAIN_MENU` | `5`, `my appointments`, `my bookings`, `upcoming appointments`, `appointments` |
| `callback` | `MAIN_MENU` | `callback`, `call back`, `call me back`, `ring me` |
| `confirm` | `BOOKING_CONFIRMATION` | `confirm`, `correct`, `book it`, `done`, `proceed`, `yes`, `go ahead`, `book` |
| `edit_date` | `BOOKING_CONFIRMATION` | `change date`, `different date`, `date` |
| `edit_time` | `BOOKING_CONFIRMATION` | `change time`, `different time`, `time` |
| `cancel_appointment` | `BOOKED` | `cancel appointment`, `cancel this`, `cancel my appointment` |
| `reschedule` | `BOOKED` | `reschedule`, `change appointment`, `change date`, `change time`, `rebook` |
| `confirm_cancel` | `CANCEL_CONFIRM` | `yes`, `confirm`, `cancel it`, `yes cancel` |
| `back` | `CANCEL_CONFIRM` | `no`, `keep`, `back`, `don't cancel` |

### Entity-Derived Intents (state-guarded)

Fire from `BOOKING_COLLECTION`, `BOOKING_CONFIRMATION`, `MAIN_MENU`, and `HUMAN_ESCALATION`:

| Intent | Trigger |
|---|---|
| `provide_date` | Any text containing a parsable date (tomorrow, next Monday, 25 May, etc.) |
| `provide_time` | Any text containing a parsable time (10am, 14:30, afternoon, half past 2, etc.) |
| `provide_treatment` | Any text matching a treatment alias (cleaning, rct, braces, whitening, etc.) |
| `provide_phone` | 10-digit number (only in `CALLBACK_REQUESTED`) |

### Correction Intents

Detected via correction markers + existing booking context. Fires at Priority 1b (after global intents, before state-specific).

| Intent | Trigger Examples |
|---|---|
| `correction_date` | `"Actually tomorrow"`, `"No, next Monday"`, `"Change date to Wednesday"` |
| `correction_time` | `"No evening"`, `"Make it 2pm instead"`, `"Actually 3pm"` |
| `correction_treatment` | `"Not root canal, cleaning"`, `"Different treatment"` |

### Interactive ID Intents (list/button tap)

| List ID | Intent | Notes |
|---|---|---|
| `date_today` / `date_tomorrow` / `date_next_mon` / `date_YYYY-MM-DD` | `provide_date` | Date entity resolved from ID |
| `date_other` | `date_custom` | Prompts free-text date entry |
| `time_other` | `time_custom` | Prompts free-text time entry |
| `apt` | `appointment` | |
| `svc` | `services` | |
| `loc` | `location` | |
| `tim` | `timings` | |
| `my_appts` | `my_appointments` | |
| `confirm` | `confirm` | |
| `edit_date` | `edit_date` | |
| `edit_time` | `edit_time` | |
| `cancel` | `cancel` | |
| `back` | `back` | |
| `main_menu` | `main_menu` | |
| `book_another` | `appointment` | |
| `resched` | `reschedule` | |
| `cancel_appt` | `cancel_appointment` | |
| `confirm_cancel_yes` | `confirm_cancel` | |
| `confirm_cancel_no` | `back` | |
| `treatment_help` | `treatment_help` | Opens symptom-based treatment recommendation |

---

## 3. Positive Flows

### Flow A: Happy Path Booking

```
User: "Hi"                              → greeting      → MAIN_MENU
Bot: Hi Priya! 👋 Welcome to Shri Balaji Dental Clinic.
     How can we help you today?
     [Book Appointment] [Dental Services] [Clinic Location] [Clinic Timings]

User: "1" / "Book"                      → appointment   → BOOKING_COLLECTION
Bot: When would you like to come in? 😊
     You can tell me everything at once — e.g. "tomorrow at 3pm for a root canal"
     — or just pick a date below.
     [Today] [Tomorrow] [Next Monday] + upcoming dates + [Type a different date]

User: "Tomorrow"                        → provide_date
Bot: Wednesday 28 May — perfect! 📅
     What time works for you?
     Slots available every 30 minutes.
     [09:00] [14:00] [19:30] [Type a different time]

User: "10am"                            → provide_time
Bot: 10:00 AM it is! ⏰
     What seems to be the problem? Pick the symptom that fits best.
     [Tooth pain when chewing] [Stained or yellow teeth] ... [Child's dental visit]
     [I'm not sure — help me choose]

User: "Root Canal" / "1"               → provide_treatment
Bot: Root Canal — got it. 🦷

     📋 Priya, here's your booking:

     📅 Wednesday, 28 May 2026
     ⏰ 10:00 AM
     🦷 Root Canal with Dr. Vishnu Vardhan
     [Confirm ✓] [Change] [Cancel]

User: "Confirm"                         → confirm       → BOOKED
Bot: ✅ You're all set, Priya!

     📅 Wed, 28 May at 10:00 AM
     🦷 Root Canal with Dr. Vishnu Vardhan

     See you then! If anything changes, just message us here.
     [Book Another] [Reschedule] [Cancel] [Main Menu]
```

### Flow B: Reschedule Existing Appointment

```
User (in BOOKED): "Reschedule"          → reschedule  → BOOKING_COLLECTION
Bot: Sure! Let's reschedule your current appointment:
     📋 Wed 27 May · 10:00 AM · Root Canal

     What date would you like instead?

User: "Next Monday"                     → provide_date
User: "2pm"                             → provide_time
User: "Root Canal"                      → provide_treatment
User: "Confirm"                         → confirm
Bot: ✅ Rescheduled!
     [summary, same sections as BOOKED]
```

**ℹ️** Reschedule uses the **supersession model** — old appointment is preserved (not mutated in place), a new version is created with `version + 1` under the same `logical_id`. The DB constraint `UNIQUE (logical_id, version)` prevents race conditions.

### Flow C: Services → Continue Booking

```
User: "Book"                            → BOOKING_COLLECTION
User: "Tomorrow"                        → date set
User: "2"                               → services  → stays in BOOKING_COLLECTION
Bot: 🦷 Our Services:
     • Root Canal
     • Whitening
     • ...
     [Book Appointment] [Main Menu]

User: "Back" / "1"                      → back / appointment → BOOKING_COLLECTION
User: "2pm"                             → provide_time
User: "Root Canal" / "1"               → provide_treatment
User: "Confirm"                         → confirm  → BOOKED
```

**ℹ️** `services`, `location`, and `timings` are info-only intents — they do **not** change state. The bot displays information as a list with navigation options, and the user's current state (including partially filled booking data) is preserved.

### Flow D: Menu Interruption → Rebook

```
User: "Book"                            → BOOKING_COLLECTION
User: "Tomorrow"                        → date set
User: "Menu" / "0"                      → main_menu → MAIN_MENU (context reset)
Bot: Welcome to Shri Balaji Dental Clinic 🦷
     How can I help today?

User: "Book"                            → BOOKING_COLLECTION (fresh start)
User: "Next Monday"                     → date
User: "10am"                            → time
User: "Root Canal"                      → treatment
User: "Confirm"                         → confirm → BOOKED
```

### Flow E: Back Navigation Through Booking

```
User: "Hi"                              → greeting    → MAIN_MENU
User: "Book"                            → BOOKING_COLLECTION
User: "Tomorrow"                        → date set
User: "10am"                            → time set
User: "Back"                            → back       → MAIN_MENU
Bot: What would you like to do? [Menu]

User: "2pm"                             → provide_time → BOOKING_COLLECTION (entity-derived from MAIN_MENU)
User: "Braces"                          → provide_treatment
User: "Confirm"                         → confirm   → BOOKED
```

**ℹ️** The router returns `provide_time` even from `MAIN_MENU` because `MAIN_MENU` is in the `entityStates` list in `router.js`. The handler auto-transitions to `BOOKING_COLLECTION`.

### Flow F: Correction During Booking

```
User: "Hi"
User: "Book"
User: "Tomorrow"                        → date = 2026-05-27
User: "Actually Wednesday"              → correction_date
Bot: Sure! What date would you like instead? [Date list]

User: "2pm"                             → time
User: "Root Canal"                      → treatment
User: "Confirm"                         → confirm
```

**ℹ️** `"Actually Wednesday"` triggers the correction detector: marker `^(actually|no)` + weekday entity → `correction_date` intent. The handler clears the old date and prompts for the new one.

### Flow G: Phone Callback

```
User: "Callback" / "Call me back"       → callback  → CALLBACK_REQUESTED
Bot: Please share your 10-digit phone number for the callback.

User: "9876543210"                      → provide_phone → MAIN_MENU
Bot: Thanks! We will call you back at +91 9876543210 during clinic hours.
     Is there anything else I can help with? [Menu]
```

### Flow H: Fragmented Messages (Progressive Fill)

```
User: "Hi"                              → greeting    → MAIN_MENU
User: "Book"                            → BOOKING_COLLECTION
User: "Tomorrow"                        → provide_date → date set
User: "after 5"                         → provide_time → time = 17:00
User: "RCT"                             → provide_treatment → treatment = "Root Canal"
                                        → all fields filled → BOOKING_CONFIRMATION
Bot: 📋 Appointment Summary [Confirm] [Change Date] [Change Time] [Cancel] [← Back]
```

**ℹ️** **Progressive field fill** (`progressiveFieldFill()` in `handlers.js`): After setting a field, the handler checks accumulated entities from subsequent messages sent before the bot replies. If entities for the next field exist, it auto-fills them. This handles users who send multiple messages in succession without waiting.

### Flow I: Greeting with Existing Booking Context

```
User: "Hi" (while in BOOKING_COLLECTION with partial booking)
Bot: We were setting up your appointment — let's pick up where we left off.
     [Date list / Time list / Treatment list based on computePendingFields()]

User: "Hi" (while in BOOKING_CONFIRMATION with all fields set)
Bot: Your appointment details are ready to confirm.
     [Confirm ✓] [Change] [Cancel]

User: "Hi" (while in BOOKED)
Bot: You have an appointment coming up.
     [Book Another] [Reschedule] [Cancel] [Main Menu]
```

**ℹ️** The greeting uses `firstName()` to personalise the message when a profile name is available. Returning users in active states see a context-aware prompt rather than the generic welcome.

### Flow I-B: 24h Appointment Reminder (Proactive — Cron)

This flow is **outbound only** — triggered by the cron job at 10:00 AM, not by a patient message.

```
[Cron fires at 10:00 AM]
→ fetchAppointmentsForReminder() — confirmed, tomorrow, reminder_sent_at IS NULL
→ For each appointment:

Bot → Patient:
  Hi Priya! 👋 Just a reminder:

  📅 Tomorrow — Tuesday, 28 May at 10:00 AM
  🦷 Root Canal with Dr. Vishnu Vardhan
  📍 Shri Balaji Dental Clinic, Bhilai

  Reply confirm to keep it or cancel to cancel.

→ markReminderSent(appt.id) — stamps reminder_sent_at to prevent duplicate

Patient: "confirm"                      → affirm intent → no state change needed
Patient: "cancel"                       → cancel intent → cancel flow (if BOOKED) or MAIN_MENU
```

**ℹ️** Patient replies re-enter the normal webhook pipeline. No new state or intent needed — `confirm` maps to `affirm`, `cancel` maps to `cancel`. The `reminder_sent_at` column prevents the cron from re-sending if it runs again on the same day.

### Flow I-C: Doctor Daily Summary (Proactive — Cron)

Outbound only — triggered at 08:00 AM daily.

```
[Cron fires at 08:00 AM]
→ fetchTodayAppointments()

Bot → Doctor:
  ☀️ Good morning, Dr. Vishnu Vardhan!

  Today — Monday, 27 May
  09:00  Rajesh Kumar        Root Canal
  10:30  Priya Sharma        Whitening
  14:00  Anand Rao           Braces

  Total: 3 appointments

[If no appointments]
  ☀️ Good morning, Dr. Vishnu Vardhan!
  No appointments today (Monday, 27 May).
```

**ℹ️** Always sent even when empty — confirms the bot is alive. Doctor can reply with any intent to open the dashboard.

### Flow J: Treatment Number Selection

```
User (on treatment prompt): "3"
Bot: [CLINIC.treatments[2] = "Root Canal"]
     → provide_treatment with "Root Canal"
```

**ℹ️** Number matching is a Priority 4 fallback in the router, only active in `BOOKING_COLLECTION`. The number is 1-indexed (`"1"` = first treatment in the list).

### Flow K: Treatment Help (Symptom Recommendation)

```
User: "I'm not sure — help me choose"   → treatment_help
Bot: No problem! Tell me a bit about what you're experiencing:
     • Tooth pain or sensitivity?
     • Need a routine checkup?
     • Looking for cosmetic treatment (whitening, braces)?
     • Something else?
     Just describe your symptoms and I'll recommend the right treatment.

User: "My teeth hurt when I eat cold things"
Bot: [keyword matching] → matches "pain", "sensitive", "cavity", "root", "nerve"
     → auto-fills treatment = "Root Canal"
     → progresses to next field or confirmation
```

**ℹ️** Symptom matching is keyword-based (`recommendTreatment()` in handlers.js) using word-boundary matching to avoid false positives (e.g. "cap" no longer matches "caption"):

| Keywords | Treatment |
|---|---|
| `pain`, `ache`, `hurt`, `sensitive`, `cavity`, `decay`, `root`, `nerve`, `throbbing` | Root Canal |
| `white`, `whiten`, `discolored`, `bright`, `smile`, `cosmetic` | Whitening |
| `missing`, `gap`, `lost`, `broken`, `chip`, `crack`, `fracture`, `damage` | Crowns |
| `child`, `kid`, `baby`, `children`, `pediatric`, `kids` | Pediatric Dentistry |
| `straight`, `align`, `crooked`, `overbite`, `underbite`, `orthodontic`, `braces`, `aligner` | Braces |
| `implant`, `implants`, `dental implant`, `false tooth`, `replacement`, `missing tooth` | Implants |

If no keywords match, the bot shows the full treatment list again.

---

## 4. Negative / Edge Case Flows

### Flow L: Invalid Input — No Escalation (Non-Field Intents)

```
User: "Book"                            → BOOKING_COLLECTION
User: "Banana"                          → unknown → no field match
Bot: [re-prompt: "What date works for you?" — no penalty]

User: "Tomorrow"                        → provide_date → ✓
User: "O'clock"                         → unknown → no time parsable
Bot: [re-prompt time — no penalty, failedAttempts stays 0]

User: "10am"                            → provide_time → ✓
User: "Zebra"                           → unknown → no treatment match
Bot: [re-prompt treatment — no penalty]

User: "Cleaning"                        → provide_treatment → ✓
User: "Confirm"                         → confirm → BOOKED
```

**⚠️ Key design:** `unknown` intents do **not** increment `failedAttempts`. The handler detects non-field intents and just re-prompts. This prevents users who type irrelevant words from being wrongly escalated.

**Implementation location:** `handleBookingCollection()` in `handlers.js`, lines ~182-204:
```js
if (!['provide_date', 'provide_time', 'provide_treatment', ...].includes(intent)) {
    // Just re-prompt without penalty
    return { session, ...buildFieldPrompt(noFieldCurrent, session.context.booking) };
}
```

### Flow M: 3× Invalid Field Values → Escalation

```
User: "Book" + "Tomorrow"               → date ✓
User: "1am"                             → provide_time → BEFORE_OPENING (clinic opens at 09:00)
Bot: "We open at 09:00."                → [failedAttempts = 1]

User: "2am"                             → BEFORE_OPENING
Bot: "We open at 09:00."                → [failedAttempts = 2]

User: "3am"                             → BEFORE_OPENING
Bot: "Having trouble finding a time that works? Let me get someone to help."
     → HUMAN_ESCALATION                  → [failedAttempts = 3]
```

**ℹ️** Only **recognizable-but-invalid** field values count as failures. The counter resets to 0 whenever a valid value is accepted or the user provides an `affirm` intent.

### Flow N: Contradictory Rapid Messages

```
User: "Book"                            → BOOKING_COLLECTION
User: "Tomorrow"                        → date = 2026-05-27
User: "10am"                            → time = 10:00
User: "2pm"                             → time = 14:00 (overwrites — latest valid entity wins)
User: "Root Canal"                      → treatment = Root Canal
```

**ℹ️** When the user sends `"10am"` then immediately `"2pm"` without waiting for a bot reply, both messages are processed in sequence. The second `provide_time` overwrites the first via `applyFieldOverwrite()` — latest valid entity wins during active collection.

### Flow O: Emergency

```
User: "Emergency" / "Pain" / "Bleeding" (from ANY state) → MAIN_MENU
Bot: ⚠️ DENTAL EMERGENCY
     If this is a dental emergency, please call +91 91833 74850 immediately
     or visit the nearest hospital.

     For any urgent dental concern, call us anytime and we will guide you
     on the next steps.
     ──────────────────────────────────
     How can I help you today?
     [Book Appointment] [Dental Services] [Clinic Location] [Clinic Timings]

User: "Book"                            → BOOKING_COLLECTION (normal flow continues)
```

**ℹ️** Priority 1 global intent — fires before any state-specific logic. The handler transitions directly to `MAIN_MENU` and includes the interactive menu in the same message as the emergency info. The user can immediately take action (book, services, etc.) without being stuck in a separate emergency state. The `isEscalated` flag is set for audit purposes.

### Flow P: User Requests Human Agent

```
User: "Talk to agent" (from ANY state)  → escalate → HUMAN_ESCALATION
Bot: Let me connect you to our team. Please call +91 91833 74850
     or expect a call back shortly.

User: "Tomorrow" / "2pm"               → provide_date/time (recovery)
Bot: [auto-transitions to BOOKING_COLLECTION]

User: "Menu" / "0"                     → main_menu → MAIN_MENU
```

**⚠️** Once in `HUMAN_ESCALATION`, the user can still provide booking data to recover. Entity-derived intents (`provide_date/time/treatment`) are recognized and route to `BOOKING_COLLECTION`. `unknown` intents keep re-prompting the escalation message.

### Flow Q: Cancel an Existing Appointment

```
User (in BOOKED): "Cancel" / "cancel appointment" → CANCEL_CONFIRM
Bot: Are you sure you want to cancel this appointment?
     [Yes, Cancel It] [No, Keep It]

User: "Yes, Cancel It"                  → confirm_cancel → MAIN_MENU
Bot: ✅ Your appointment has been cancelled.
     We understand plans change. If there's anything we can help
     with, we're here for you.
     [after 1.5s delay: "What would you like to do next?" with menu]

User: "No, Keep It" / "No"             → back → BOOKED
Bot: 📋 Your Appointment [summary + management options]
```

**ℹ️** The cancellation is performed asynchronously with a 1.5s delay on the follow-up menu message, allowing the empathetic cancellation message to land first.

### Flow R: Cancel Without an Appointment

```
User (in BOOKING_COLLECTION): "Nevermind" → cancel → MAIN_MENU
Bot: No problem. What would you like to do instead? [Menu]

User (any non-BOOKED state): "Cancel"
Bot: No problem. What would you like to do instead? [Menu]
```

### Flow S: Past Date / Beyond Booking Horizon

```
User: "Book" + "Tomorrow"               → date ✓
User: "1 January 2023"                  → provide_date → PAST_DATE ❌
Bot: "That date has passed. Please choose a future date."
     [failedAttempts = 1]

User: "1 January 2027"                  → provide_date → BEYOND_HORIZON ❌
Bot: "We only book up to 30 days ahead. Please choose a closer date."
     [failedAttempts = 1]
```

**ℹ️** Past date and beyond-horizon are separate validation failures with distinct suggestions. Both increment `failedAttempts` but neither triggers a full parse failure (the date was recognized, just invalid).

### Flow T: Invalid Time

```
User: "Book" + date set
User: "Midnight"                        → unknown (no matching time pattern)
Bot: [re-prompt time — no penalty]

User: "9pm"                             → provide_time → AFTER_CLOSING (21:00 > 20:00)
Bot: "We close at 20:00."              [failedAttempts = 1]

User: "11:15am"                         → provide_time → INVALID_SLOT (not 30-min aligned)
Bot: "Slots are every 30 minutes. Try 11:00."
                                         [failedAttempts = 1]
```

### Flow U: Time Already Passed (Today)

```
User: "Book" + "Today" (date set)       → provide_date
User: "7:30pm"                          → provide_time
     [But current time is 7:45pm — time has passed]
Bot: "That time has already passed. Please choose a later time."
                                          [failedAttempts = 1]
```

**ℹ️** If booking for today, `validateTime()` compares the parsed time against `now()`. Times at or before the current moment are rejected with `TIME_PASSED`.

### Flow W: Unknown Treatment

```
User: "Book" + date + time set
User: "Plutonium"                       → unknown (no alias match)
Bot: [re-prompt treatment — no penalty]

User: "Dental implant"                  → provide_treatment → "Implants" ✓
```

**ℹ️** Treatment matching is alias-based, not AI. `CLINIC.treatments` has explicit aliases per treatment. If the alias doesn't match, it returns `unknown`, which no longer increments `failedAttempts`.

### Flow X: Correction at Confirmation

```
User: [all fields set → BOOKING_CONFIRMATION]
Bot: 📋 Appointment Summary [Confirm] [Change] [Cancel]

User: "Change"                          → change_booking
Bot: What would you like to change?
     [Change Date] [Change Time] [Change Treatment] [← Back]

User: "Change Date" / "Date"            → edit_date → BOOKING_COLLECTION
Bot: What date would you like instead? [Date list]
     (booking.date cleared; booking.time and booking.treatment preserved)

User: "Next Monday"                     → provide_date → new date
User: "Confirm"                         → confirm → BOOKED
```

**⚠️** `edit_date` only clears `date` — it no longer clears `time`. The time is re-validated against the new date's day type automatically. `edit_treatment` is also available from the change menu.

### Flow Y: Correction in BOOKED State

```
User (in BOOKED): "Change date"         → correction intent detected
Bot: But since state is BOOKED → requiresEditFlow = true
     → routes to reschedule flow instead
Bot: Your appointment is already confirmed. Would you like to reschedule instead?
```

**ℹ️** The correction detector sets `requiresEditFlow: true` when the session is in `BOOKED` or `BOOKING_CONFIRMATION`. The router then maps to `edit_date` / `edit_time` / `reschedule` intents instead of `correction_*` intents.

### Flow Z: Affirm During Collection

```
User (in BOOKING_COLLECTION, partially filled): "Okay" → affirm
Bot: [re-prompts current pending field — no penalty]
     failedAttempts reset to 0

User (in BOOKING_COLLECTION, ALL fields filled): "Okay" → affirm
Bot: [auto-advances to BOOKING_CONFIRMATION]
     📋 Appointment Summary [Confirm] [Change] [Cancel]

User (in BOOKING_CONFIRMATION): "Yes" / "Okay" → affirm → confirm
Bot: ✅ Confirmed! [BOOKED]
```

**⚠️** `affirm` in `BOOKING_CONFIRMATION` delegates to `confirm` — saying "yes" at the summary screen books the appointment.

### Flow AA: Escalation from Frustration (Unknown State)

```
User (in any state, frustrated): "This is stupid" / "You're useless" → unknown
Bot: [calculateFrustration() detects keywords]
     If score ≥ 4:
     "I'm sorry you're having trouble. Would you like me to connect you
     with our team? Call +91 91833 74850 or type 'agent' to speak with someone."
```

**Frustration scoring** (`calculateFrustration()` in handlers.js) — uses word-boundary regex `\b(?:no|stop|wrong|ugh|stupid|bad)\b` to prevent false positives (e.g. "November" no longer triggers):

| Signal | Score added |
|---|---|
| Text matches `\b(?:no|stop|wrong|ugh|stupid|bad)\b` | +2 |
| `messagesInState > 4` | +1 |
| Text < 3 chars AND `messagesInState > 2` | +1 |
| `failedAttempts >= 2` | +2 |
| **Threshold to offer escalation** | **≥ 4** |

### Flow AB: Session Expiry → Abandoned

```
User returns after session expires:
→ Bot detects `expires_at < now` → state set to `ABANDONED`
User: "Hi"                              → greeting → MAIN_MENU (fresh start)
Bot: Welcome to Shri Balaji Dental Clinic 🦷
     How can I help today? [Menu]
```

### Flow AC: Repeated Greetings

```
User: "Hi"                              → greeting → MAIN_MENU
User: "Hello"                           → greeting → MAIN_MENU (stays)
User: "Hey"                             → greeting → MAIN_MENU (stays)
User: "Book"                            → BOOKING_COLLECTION
```

**ℹ️** Greetings from `MAIN_MENU` just re-show the main menu. Repeated greetings are harmless — no state progression, no penalties.

### Flow AD: Back Navigation Transitions

```
From BOOKING_COLLECTION       → back → MAIN_MENU (context preserved, but if
                                         previous was CONFIRMATION, treatment cleared)
From BOOKING_CONFIRMATION     → back → BOOKING_COLLECTION (treatment cleared)
From BOOKED                   → back → BOOKING_CONFIRMATION
From CANCEL_CONFIRM           → back → BOOKED (if previous was BOOKED) or MAIN_MENU
```

The transition table (`transitions.js`):

```js
case 'back':
  switch (state) {
    case 'BOOKING_COLLECTION':   return 'MAIN_MENU';
    case 'BOOKING_CONFIRMATION': return 'BOOKING_COLLECTION';
    case 'BOOKED':               return 'BOOKING_CONFIRMATION';
    default:                     return 'MAIN_MENU';
  }
```

**⚠️** Going back from `BOOKING_CONFIRMATION` clears treatment to avoid a bounce-back loop where all 3 fields are filled and any input re-triggers confirmation.

### Flow AE: Empty / Whitespace Messages

```
User sends blank text → type='text', body=''
→ textTrimmed = ''
→ extractEntities('') → {} → unknown intent
→ re-prompt with current state's hint
```

### Flow AF: Interactive ID Tap for Date

```
User taps "Tomorrow" from date list     → interactiveId='date_tomorrow'
→ Priority 0 → provide_date with Date entity resolved
→ Same as typing "tomorrow" but deterministic (no NLP needed)
```

### Flow AG: Irrelevant / Off-Topic Input

```
User: "What's the weather?"             → unknown (no intent matches)

Bot (in BOOKING_COLLECTION): [re-prompt current field — no penalty]
     "Hmm, I didn't quite get that. What date works for you?"
Bot (in MAIN_MENU): "I didn't catch that — tap an option or type what you need."
Bot (in BOOKING_CONFIRMATION): [Re-shows confirmation summary — unrecognized input no longer cancels the booking]
Bot (in CANCEL_CONFIRM): "I didn't catch that. Tap 'Yes, Cancel It' or 'No, Keep It'."
Bot (in any state): "I didn't catch that. Type '0' for the menu or tell me what you need."
```

**ℹ️** All unknown-input re-prompts are prefixed with a "didn't catch that" phrase to acknowledge the user's message before re-asking. This avoids the bot appearing to silently ignore input.

### Flow AH: Contradictory Date → Time Sequence

```
User: "10am" before setting a date      → no date set yet
Bot: provide_time intent detected, but date is pending
     → currentField = 'date' (from computePendingFields), not 'time'
     → "10am" validated as date → parse fails → re-prompt date
```

**ℹ️** The handler respects `computePendingFields()` order for field priority. If date hasn't been set, any text is first validated as a date attempt, even if it contains time-like patterns. The `intentField` override only applies when the intent's target field matches a pending field.

---

## 5. State Transition Table (Complete)

| Current State | Intent | Next State | Notes |
|---|---|---|---|
| `IDLE` | `greeting` | `MAIN_MENU` | Handler sets it |
| `IDLE` | any global | varies | Global intents fire immediately |
| `MAIN_MENU` | `appointment` | `BOOKING_COLLECTION` | Context reset |
| `MAIN_MENU` | `services` / `location` / `timings` | stays `MAIN_MENU` | Info shown inline via list |
| `MAIN_MENU` | `callback` | `CALLBACK_REQUESTED` | |
| `MAIN_MENU` | `provide_date` / `provide_time` / `provide_treatment` | `BOOKING_COLLECTION` | Entity-derived auto-route via handler |
| `MAIN_MENU` | `my_appointments` | `MAIN_MENU` | Info shown, state unchanged |
| `BOOKING_COLLECTION` | `provide_date` / `provide_time` / `provide_treatment` | stays → auto to `BOOKING_CONFIRMATION` when all fields filled | Handler manages internal progression |
| `BOOKING_COLLECTION` | `correction_date` / `correction_time` / `correction_treatment` | stays | Handler manages internally |
| `BOOKING_COLLECTION` | `back` | `MAIN_MENU` | Context preserved |
| `BOOKING_COLLECTION` | `cancel` | `MAIN_MENU` | Context reset |
| `BOOKING_COLLECTION` | `affirm` | stays (or `BOOKING_CONFIRMATION` if all filled) | |
| `BOOKING_COLLECTION` | `date_custom` / `time_custom` / `treatment_help` | stays | Sub-prompts within collection |
| `BOOKING_CONFIRMATION` | `confirm` | `BOOKED` | DB create or supersede |
| `BOOKING_CONFIRMATION` | `edit_date` | `BOOKING_COLLECTION` | Date cleared, time/treatment preserved |
| `BOOKING_CONFIRMATION` | `edit_time` | `BOOKING_COLLECTION` | Time cleared |
| `BOOKING_CONFIRMATION` | `edit_treatment` | `BOOKING_COLLECTION` | Treatment cleared, date/time preserved |
| `BOOKING_CONFIRMATION` | `back` | `BOOKING_COLLECTION` | Treatment cleared (bounce-back prevention) |
| `BOOKING_CONFIRMATION` | `cancel` | `MAIN_MENU` | Context reset |
| `BOOKING_CONFIRMATION` | `affirm` | `BOOKED` | Affirm → confirm delegation |
| `BOOKING_CONFIRMATION` | `correction_date` / `correction_time` / `correction_treatment` | `BOOKING_COLLECTION` | Correction → edit flow (requiresEditFlow = true) |
| `BOOKED` | `reschedule` | `BOOKING_COLLECTION` | Sets `reschedulingLogicalId` |
| `BOOKED` | `cancel_appointment` | `CANCEL_CONFIRM` | |
| `BOOKED` | `appointment` / `book_another` | `BOOKING_COLLECTION` | New booking (fresh context) |
| `BOOKED` | `main_menu` | `MAIN_MENU` | |
| `BOOKED` | `back` | `BOOKING_CONFIRMATION` | |
| `CANCEL_CONFIRM` | `confirm_cancel` | `MAIN_MENU` | Async DB cancel |
| `CANCEL_CONFIRM` | `back` | `BOOKED` (or `MAIN_MENU`) | Depends on `previousState` |
| `CALLBACK_REQUESTED` | `provide_phone` | `MAIN_MENU` | |
| `CALLBACK_REQUESTED` | `cancel` | `MAIN_MENU` | |
| `HUMAN_ESCALATION` | `main_menu` | `MAIN_MENU` | |
| `HUMAN_ESCALATION` | `provide_date` / `provide_time` / `provide_treatment` | `BOOKING_COLLECTION` | Recovery route via handler |
| `EMERGENCY` | any | `MAIN_MENU` | Safety net — `handleEmergency` already transitions to MAIN_MENU |
| `SERVICES` / `LOCATION` / `TIMINGS` | `appointment` | `BOOKING_COLLECTION` | |
| `SERVICES` / `LOCATION` / `TIMINGS` | `main_menu` | `MAIN_MENU` | |
| `ABANDONED` / `DONE` | `greeting` | `MAIN_MENU` | Fresh start |

---

## 6. Validation Rules

### Date Validation (`validateDate()` in `validators.js`)

| Criteria | Rule |
|---|---|
| **Must be future** | `parsedDate >= today` (past dates rejected with `PAST_DATE`) |
| **Max horizon** | ≤ `CLINIC.bookingHorizonDays` (30 days). Rejected with `BEYOND_HORIZON` |
| **Day of week** | Must be a clinic day (Mon–Sat regular hours, Sun limited hours) |

**Parsing patterns** (in priority order):

| Pattern | Example |
|---|---|
| `today` / `tonight` | → today |
| `tomorrow` / `tmrw` | → today + 1 |
| `day after tomorrow` | → today + 2 |
| `this Monday` / `next Monday` / `Monday` | → next occurrence (next prefix = +7 days) |
| `25 May` / `25th May 2026` | → date from day + month + optional year |
| `May 25` / `May 25th, 2026` | → date from month + day + optional year |
| `YYYY-MM-DD` | ISO format |
| `DD/MM/YYYY` | Numeric date with year |
| `DD/MM` | Numeric date without year (defaults to current year) |

### Time Validation (`validateTime()` in `validators.js`)

| Criteria | Rule |
|---|---|
| **Within hours** | Mon–Sat: 09:00–20:00, Sun: 10:00–14:00 |
| **Not in the past** | If booking for today, time must not have already passed (rejected with `TIME_PASSED`) |
| **Slot alignment** | Must be on 30-min boundary (`:00` or `:30`) |
| **Slot availability** | Must be in `CLINIC.slots[dayType]` array |

**Parsing patterns** (in priority order):

| Pattern | Example |
|---|---|
| `HH:MM am/pm` | `10:30 am`, `14:30` |
| `2pm` / `2 pm` | Hour + meridiem |
| `after 5` / `before 2pm` / `around 3` | Relative time (hours 1-6 default to PM) |
| `morning` / `breakfast` | → 10:00 |
| `afternoon` / `lunch` | → 14:00 |
| `evening` / `night` / `dinner` | → 17:00 |
| `half past 2` | → 14:30 (hours 1-6 default to PM) |
| `quarter past 2` | → 14:15 (hours 1-6 default to PM) |
| `quarter to 3` | → 14:45 (hours 1-6 default to PM) |
| `2 o'clock` | → 14:00 (hours 1-6 default to PM) |

### Treatment Validation (`validateTreatment()` in `validators.js`)

| Treatment | Aliases |
|---|---|
| Root Canal | `root canal`, `rct`, `rc`, `nerve treatment` |
| Whitening | `whitening`, `teeth whitening`, `bleaching` |
| Implants | `implant`, `implants`, `dental implant` |
| Braces | `braces`, `orthodontic`, `aligners`, `invisalign` |
| Crowns | `crown`, `crowns`, `cap`, `bridge` |
| Pediatric Dentistry | `pediatric`, `child`, `children`, `kids`, `baby teeth` |

### Phone Validation (`validatePhone()` in `validators.js`)

| Criteria | Rule |
|---|---|
| Format | 10-digit Indian mobile, optionally prefixed with `91` or `0` |
| Validation | `CALLBACK_REQUESTED` state only |

---

## 7. Escape Hatches

| Mechanism | Trigger | Result |
|---|---|---|
| **"0" / "Menu"** | Any state | → `MAIN_MENU` with fresh context |
| **"Cancel" / "Nevermind"** | Any state | → `MAIN_MENU` (or cancel flow if booked) |
| **"Agent" / "Talk to person"** | Any state | → `HUMAN_ESCALATION` |
| **Emergency keywords** | Any state | → `MAIN_MENU` with emergency info + interactive menu |
| **3 failed validation attempts** | Same field during booking | → `HUMAN_ESCALATION` |
| **Frustration ≥ 4** | `handleUnknown` fallback | Offers escalation to human |
| **"Back"** | Booking states | One level up in navigation hierarchy |

---

## 8. Notable Edge Case Design Decisions

1. **Unknown intents do not increment `failedAttempts`** — Prevents innocuous nonsense (typos, irrelevant questions) from triggering escalation. Only *recognizable-but-invalid* field values count as failures.

2. **Services/Location/Timings are non-state-changing** — User stays in their current state (even during booking with partially filled context) and sees info as a list with navigation options.

3. **Back from `BOOKING_CONFIRMATION` clears treatment** — Prevents a bounce-back loop where all 3 fields are filled and any input immediately re-triggers the confirmation prompt.

4. **`edit_date` only clears date** — Time and treatment are preserved. User doesn't need to re-enter what they didn't want to change.

5. **`affirm` delegates to `confirm` in `BOOKING_CONFIRMATION`** — Saying "yes", "okay", or "sure" at the summary screen books the appointment rather than just re-prompting.

6. **Corrections checked at Priority 1b** — Correction detector runs before state-specific intents. This prevents "No evening" from being caught by generic state keywords.

7. **Entity-derived intents fire from `MAIN_MENU` and `HUMAN_ESCALATION`** — Enables recovery from both "Back from booking" and escalation scenarios. The `entityStates` array in the router includes both states.

8. **Symptom matching is keyword-based, not AI** — Uses a simple rules matrix in `recommendTreatment()`. No external API calls. No NLP dependency.

9. **Reschedule uses supersession, not in-place mutation** — Old appointment version is preserved with `superseded_at` timestamp. New version is created with `version + 1`. The `UNIQUE (logical_id, version)` constraint prevents race conditions.

10. **Session save before message persistence** — In the engine pipeline, `save(handlerResult.session)` runs **before** `createMessage()`. Message persistence is fire-and-forget with `.catch(() => {})`. This ensures session state is never lost due to DB message errors.

11. **Emergency exits to MAIN_MENU immediately** — After showing emergency info + phone number, the bot transitions to `MAIN_MENU` and attaches an interactive menu. The user is never stuck — they can book, check services, or do anything else in the same turn. The `isEscalated` flag is set for audit trail.

12. **Unrecognized input at confirmation re-prompts instead of cancelling** — Previously, any unrecognized intent at `BOOKING_CONFIRMATION` silently cancelled the booking. Now only explicit `cancel` or `cancel_appointment` intents cancel; everything else re-shows the confirmation summary.

---

## 9. Conversational Tone Improvements (2026-05-29)

These changes reduce the robotic feel without altering any state machine logic.

### Greeting — personalised and context-aware

| Scenario | Before | After |
|---|---|---|
| First visit | `Welcome to Shri Balaji Dental Clinic 🦷\nHow can I help you today?` | `Hi {name}! 👋 Welcome to Shri Balaji Dental Clinic.\nHow can we help you today?` |
| Returning, in `BOOKING_COLLECTION` | `Hi! We were setting up your appointment. What works for you?` | `We were setting up your appointment — let's pick up where we left off.` |
| Returning, in `BOOKED` | `Hi! You have an appointment booked.` | `You have an appointment coming up.` |

`firstName()` helper extracts the first word of `session.profileName`. Falls back gracefully to no name if unavailable.

### Field acknowledgments — varied, not robotic

`buildFieldAck()` now rotates through 2–3 variants per field using `pick()`:

| Field | Variants |
|---|---|
| Date | `"{date} — perfect! 📅"` / `"{date} works great."` / `"Got it — {date}. 📅"` |
| Time | `"{time} it is! ⏰"` / `"{time} — noted."` / `"Great, {time}. ⏰"` |
| Treatment | `"{treatment} — got it. 🦷"` / `"{treatment}, noted!"` |

### Booking prompt — invites full request upfront

The opening booking prompt (when user taps "Book Appointment") now reads:

> When would you like to come in? 😊
> You can tell me everything at once — e.g. *"tomorrow at 3pm for a root canal"* — or just pick a date below.

This reduces back-and-forth for users who already know what they want.

### Confirmation message — personal, not a data dump

`buildConfirmationBody()` now accepts `session` and uses `firstName()`:

```
📋 Priya, here's your booking:

📅 Wednesday, 28 May 2026
⏰ 10:00 AM
🦷 Root Canal with Dr. Vishnu Vardhan
```

Booked success message:

```
✅ You're all set, Priya!

📅 Wed, 28 May at 10:00 AM
🦷 Root Canal with Dr. Vishnu Vardhan

See you then! If anything changes, just message us here.
```

### Softer error messages

| Scenario | Before | After |
|---|---|---|
| Slot already taken | `Sorry, that time slot is already booked. Please choose a different time.` | `That slot just got taken 😅 — pick another time?` |
| Tech error saving appointment | `Sorry, we couldn't save your appointment due to a technical issue. Please try again.` | `Something went wrong on our end. Give it a moment and try again, or type 'help' to reach us.` |
| Escalation after 3 failures | `I'm having trouble understanding. Let me connect you to our team at...` | `Having trouble finding a time that works? Let me get someone to help.` |

### "Didn't catch that" prefix on re-prompts

`handleUnknown()` now prefixes all re-prompts with a brief acknowledgment:

| State | Before | After |
|---|---|---|
| `MAIN_MENU` | `Sorry, I didn't catch that. Tap an option...` | `I didn't catch that — tap an option or type what you need.` |
| `BOOKING_COLLECTION` | *(silent re-prompt)* | `Hmm, I didn't quite get that. {field prompt}` |
| `CANCEL_CONFIRM` | `... Tap 'Yes, Cancel It'...` | `I didn't catch that. Tap 'Yes, Cancel It' or 'No, Keep It'.` |

### Context-aware main menu when user has a booking

When the user is in `BOOKED` state and returns to the main menu, the menu body surfaces their appointment first:

```
Your next appointment: Wed 28 May, 10:00 AM
─────────────────────
[Reschedule] [Cancel appointment] [Book another] [Clinic info]
```

### Small talk intent

New `small_talk` global intent handles casual openers that previously fell through to `unknown`:

| Keywords | Response |
|---|---|
| `how are you`, `how r u`, `what's up`, `wassup`, `sup`, `you there`, `anyone there` | Warm one-liner (e.g. `"Doing great, thanks for asking! 😊 How can I help?"`) + main menu |


13. **DB persistence failure no longer creates phantom bookings** — `createAppointment()` / `supersedeAppointment()` returning `null` aborts the transition to `BOOKED` and returns an error message instead of falsely saying "Confirmed!".

14. **Time re-validated when date changes** — If a time was set (e.g. 14:00) and the date is later changed to Sunday, the time is re-validated against Sunday's hours (which close at 14:00) and cleared if invalid.

15. **Blocked-date and overbooking checks** — Before confirming, the handler checks `isDateBlocked()` and `countAppointmentsBySlot()`. Blocked dates or double-booked slots are rejected with a message prompting a different choice.

16. **Oral time patterns default to PM** — "half past 2", "quarter to 3", "2 o'clock" etc. default hours 1-6 to PM (14:30, 14:45, 14:00) instead of AM, matching clinic operating hours.

---

*Documentation derived from code review session — 2026-05-26.*  
*Validated by `tests/replay/runner.js` — 13 active fixtures covering all major flows.*

---

## 10. Planned Enhancements Backlog (2026-05-29)

Prioritised by impact. "Very High" items should be tackled first.

---

### 🔴 Very High Impact

#### #14 — Daily Morning Summary (Doctor) ✅ IMPLEMENTED 2026-05-29
**What:** Every morning at 8:00 AM the bot proactively sends the doctor their full day schedule.
**Route:** `GET /api/cron/daily-summary` — scheduled via `vercel.json` at `30 2 * * *` (08:00 IST). Secured with `CRON_SECRET`.
**Implementation notes:**
- Add a scheduled job (cron, Vercel cron, or external scheduler) that calls a `/api/cron/daily-summary` route at 08:00 IST.
- Route fetches today's appointments via `fetchAppointmentsByDate(today)` and calls `notifyDoctor(body)`.
- If no appointments: `"☀️ Good morning! No appointments today."` — still send so the doctor knows the bot is alive.
- Sample message:
  ```
  ☀️ Good morning, Dr. Vishnu Vardhan!
  Today — Mon 27 May — 4 appointments:

  09:00  Rajesh Kumar       Root Canal
  10:30  Priya Sharma       Whitening
  14:00  Anand Rao          Braces
  16:30  Sneha Patel        Implants

  Reply "today" to open the dashboard.
  ```

---

#### #1 — Appointment Reminder 24h Before (Patient) ✅ IMPLEMENTED 2026-05-29
**What:** Patient receives a WhatsApp reminder the day before their appointment.
**Route:** `GET /api/cron/reminders` — scheduled via `vercel.json` at `30 4 * * *` (10:00 IST). Secured with `CRON_SECRET`. Stamps `reminder_sent_at` after send to prevent duplicates.
**Implementation notes:**
- Scheduled job runs daily (e.g. 10:00 AM) and queries appointments for `tomorrow`.
- Sends via `sendText(appointment.wa_id, body)` — no session state needed.
- Sample message:
  ```
  Hi Priya! 👋 Just a reminder:

  📅 Tomorrow — Tue 28 May at 10:00 AM
  🦷 Root Canal with Dr. Vishnu Vardhan
  📍 Shri Balaji Dental Clinic, Bhilai

  Reply *confirm* to keep it or *cancel* to cancel.
  ```
- Replies to this message re-enter the normal webhook pipeline — `confirm` → `affirm` intent, `cancel` → `cancel` intent. No new state needed.
- Track `reminder_sent_at` on the appointment row to avoid duplicate sends.

---

### 🟠 High Impact

#### #4 — "My Appointments" with Inline Actions
**What:** `my_appointments` currently shows a read-only list. After a session expires the user loses `BOOKED` state and can't manage their booking.
**Fix:** Show each appointment as a tappable list row → tap → detail view with Reschedule / Cancel buttons. Reuse `DOCTOR_APPOINTMENT_DETAIL`-style pattern on the patient side.
**Implementation notes:**
- `handleMyAppointments` already fetches `findUpcomingByWaId`. Change rows to use `id: appt_${a.id}` and add an `appt_detail` intent handler.
- New state: `PATIENT_APPOINTMENT_DETAIL` (or reuse `BOOKED` with `appointmentId` set from the list tap).
- Simpler alternative: after showing the list, if there's exactly one upcoming appointment, auto-set `session.context.appointmentId` and transition to `BOOKED` so existing reschedule/cancel flows work immediately.

---

#### #7 — Filter Already-Booked Slots from Time Picker
**What:** Time quick-pick shows slots regardless of availability. Patient picks a taken slot, gets rejected, picks again.
**Fix:** Call `countAppointmentsBySlot(date, slot)` for each slot before building the list and omit full slots.
**Implementation notes:**
- `countAppointmentsBySlot` already exists in `appointmentRepository.js`.
- In `getTimeListReply(session)`, fetch slot counts for the selected date and filter `CLINIC.slots[dayType]` before passing to `timeQuickPickSections`.
- Cap DB calls: fetch all appointments for the date in one query, then filter in-memory.
- Fallback: if all slots are full, show "No slots available on this date — please pick another day" and return to date picker.

---

#### #9 — "Next Appointment" Quick Action (Doctor)
**What:** Doctor's most common need is "who's next?" — currently requires 2 taps.
**Fix:** Add a "⏭ Next Patient" row to `getDoctorMenuSections()`.
**Implementation notes:**
- On tap, fetch today's appointments, find the first one with `status = 'confirmed'` and `time > now`.
- If found: jump straight to `DOCTOR_APPOINTMENT_DETAIL` with that appointment pre-loaded.
- If none: `"No more patients today. 🎉"` with back button.
- Zero new states needed — reuses existing detail handler.

---

### 🟡 Medium Impact

#### #2 — Post-Appointment Feedback (Patient)
**What:** After doctor marks `completed`, patient gets a 1–5 star rating prompt.
**Implementation notes:**
- In `handleMarkAppointment`, after successful `updateAppointmentStatus('completed')`, fire-and-forget:
  ```js
  sendText(appt.wa_id, `Hi ${appt.patient_name}! Hope your visit went well 😊\nHow was your experience?\n\nReply with a number:\n1 ⭐ – 2 ⭐⭐ – 3 ⭐⭐⭐ – 4 ⭐⭐⭐⭐ – 5 ⭐⭐⭐⭐⭐`);
  ```
- Rating reply (1–5) hits the webhook → `provide_rating` intent → store on appointment row.
- Needs a `rating` column on `appointments` table and a `provide_rating` intent in the router.

#### #11 — Forward-Looking Stats (Doctor)
**What:** Stats currently show past counts only. Add next 7 days and open slots.
**Implementation notes:**
- In `handleDoctorStats`, add two more `countAppointmentsByDateRange` calls: `[today+1, today+7]` and `[today+8, today+14]`.
- Show open slots: `(days × slotsPerDay) - booked`.

#### #5 — Booking for Someone Else (Patient)
**What:** No way to book for a family member. `patientName` field exists in context but is never collected.
**Implementation notes:**
- After treatment is confirmed and before showing the summary, add an optional prompt:
  `"Who is this appointment for? (Type a name, or tap 'Myself')"`.
- Store in `session.context.booking.patientName`. Pass to `createAppointment`.
- New intent: `provide_name` (entity: any non-keyword text after the prompt).

#### #6 — Notes / Special Requests (Patient)
**What:** No way for patients to communicate special needs.
**Implementation notes:**
- Optional final step after all 3 fields collected, before confirmation:
  `"Anything we should know before your visit? (e.g. anxiety, mobility, allergies) — or tap 'Skip'"`.
- Store in `session.context.booking.notes`. Pass to `createAppointment` and include in doctor notification.

---

### 🟢 Low Impact / Quick Wins

#### #15 — Show Time Range in Appointment Detail (Doctor)
`slotIntervalMinutes = 30` is constant. Change `Time: 09:00` → `Time: 09:00 – 09:30` in `handleDoctorAppointmentDetail`. One-liner.

#### #13 — Block Date Reason (Doctor)
After doctor picks a date to block, prompt: `"Reason? (optional — e.g. holiday, leave)"`. Pass to `blockDate(dateStr, reason)`. The `reason` column already exists in the schema.

#### #12 — Note on Mark Action (Doctor)
After tapping "Mark Completed" or "No Show", optionally prompt: `"Add a note? (optional)"`. Store on appointment. Useful for "treatment incomplete — follow-up needed".

#### #16 — Patient Contact Shortcut (Doctor)
In appointment detail, format phone as a WhatsApp deep link: `wa.me/91XXXXXXXXXX`. Patients can be contacted directly from the detail view.

---

### 🔵 Large Effort / Future

#### #3 — Waitlist When Slot Is Taken
When a slot is full, offer: `"Want me to add you to the waitlist? I'll message you if it opens up."` Needs a `waitlist` table and a trigger in `handleCancelConfirm` to notify the next person on the list.

#### #8 — Hindi / Regional Language Support
Add Hindi transliterations to intent keyword lists (`"kal"` → tomorrow, `"dard"` → pain, `"doctor"` → doctor). Partial support — greetings and treatment names — would cover most cases without a full translation layer.
