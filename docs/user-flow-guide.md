# User Flow Guide — Shri Balaji Dental Clinic WhatsApp Bot

> **Last updated:** May 25, 2026
> **Bot version:** Level 2 (interactive messages, entity extraction, state machine)

---

## Table of Contents

1. [Entry Point — User says "hi"](#1-entry-point--user-says-hi)
2. [State Machine Overview](#2-state-machine-overview)
3. [The Main Menu](#3-the-main-menu)
4. [Booking Flow (Full Walkthrough)](#4-booking-flow-full-walkthrough)
5. [Quick Booking with Auto-Fill](#5-quick-booking-with-auto-fill)
6. [Services Flow](#6-services-flow)
7. [Location Flow](#7-location-flow)
8. [Timings Flow](#8-timings-flow)
9. [Emergency Flow](#9-emergency-flow)
10. [Escalation / Human Handoff](#10-escalation--human-handoff)
11. [Callback Request Flow](#11-callback-request-flow)
12. [Cancel & Start Over](#12-cancel--start-over)
13. [Back Navigation](#13-back-navigation)
14. [Interactive Messages (Lists & Buttons)](#14-interactive-messages-lists--buttons)
15. [All Intents the Bot Recognizes](#15-all-intents-the-bot-recognizes)
16. [Entity Extraction Capabilities](#16-entity-extraction-capabilities)
17. [Validation & Error Flows](#17-validation--error-flows)
18. [Session Timeout & Abandoned State](#18-session-timeout--abandoned-state)
19. [Multi-Message Support](#19-multi-message-support)

---

## 1. Entry Point — User says "hi"

### New session (IDLE or DONE state)

```
User:  hi
Bot:   [Interactive List]
       How can I help you?
       1. Book Appointment
       2. Dental Services
       3. Clinic Location
       4. Clinic Timings
```

### Returning session (any active state)

The bot acknowledges the active state and reprompts:

```
User:  hi
Bot:   Hi! We were just picking a date for your appointment.
       What date works for you?
```

State-aware greetings:

| Active State | Greeting |
|---|---|
| BOOKING_DATE | "Hi! We were just picking a date for your appointment." |
| BOOKING_TIME | "Hello! We were choosing a time for your appointment." |
| BOOKING_TREATMENT | "Hi! We were discussing which treatment you need." |
| BOOKING_CONFIRMATION | "Hello! We were about to confirm your appointment." |
| SERVICES | "Hi! You were looking at our services." |
| LOCATION | "Hi! You were checking our location." |
| TIMINGS | "Hi! You were checking our hours." |
| BOOKED | "Hi! You have an appointment booked." |
| EMERGENCY | "Hello, are you still in need of urgent assistance?" |

---

## 2. State Machine Overview

```
                 ┌─────────────────────────────────────────┐
                 │                  IDLE                    │
                 └─────────┬───────────────────────────────┘
                           │ "hi", "book", "services",
                           │ "location", "timings", etc.
                           ▼
                   ┌───────────────┐
              ┌───►│   MAIN_MENU   │◄──────────────┐
              │    └───────┬───────┘               │
              │            │                       │
              │   ┌────────┼────────┬──────┬───────┤
              │   │        │        │      │       │
              │   ▼        ▼        ▼      ▼       ▼
              │ BOOKING  SERVICES LOCATION TIMINGS EMERGENCY
              │  DATE      │        │       │        │
              │   │        │        │       │        ▼
              │   ▼        └──┬─────┘  ┌───┘    HUMAN_ESCAL.
              │ BOOKING       │       │
              │  TIME         └───┬───┘
              │   │               │
              │   ▼               ▼
              │ BOOKING      CALLBACK_
              │ TREATMENT    REQUESTED
              │   │               │
              │   ▼               ▼
              │ BOOKING          DONE
              │ CONFIRMATION      │
              │   │               │
              │   ▼               │
              │  BOOKED ◄─────────┘
              │   │
              └───┘
```

### All possible states

| State | Purpose |
|---|---|
| **IDLE** | Initial state before first interaction |
| **MAIN_MENU** | Shows the main navigation options |
| **BOOKING_DATE** | Collecting appointment date |
| **BOOKING_TIME** | Collecting appointment time |
| **BOOKING_TREATMENT** | Collecting treatment selection |
| **BOOKING_CONFIRMATION** | Confirming the full booking |
| **BOOKED** | Appointment successfully booked |
| **SERVICES** | Showing available dental services |
| **LOCATION** | Showing clinic address and phone |
| **TIMINGS** | Showing operating hours |
| **EMERGENCY** | Emergency response state |
| **HUMAN_ESCALATION** | User needs human assistance |
| **CALLBACK_REQUESTED** | Collecting phone for callback |
| **DONE** | Completed interaction |
| **ABANDONED** | Session expiry (timeout) |

---

## 3. The Main Menu

Triggered by: `"0"`, `"menu"`, `"home"`, `"start over"`, `"restart"`, or tapping `"Main Menu"` from any info/button flow.

### What the user sees

**Interactive List** (first time or after 5 minutes idle):
```
Shri Balaji Dental Clinic
How can I help you?
┌─────────────────────┐
│ Select ▼            │
│─────────────────────│
│ Menu:               │
│ • Book Appointment  │
│ • Dental Services   │
│ • Clinic Location   │
│ • Clinic Timings    │
└─────────────────────┘
```

**Short text version** (returned within 5 minutes):
```
1. Book Appointment
2. Dental Services
3. Clinic Location
4. Clinic Timings
```

### What the user can do

| User types/taps | Intent | What happens |
|---|---|---|
| `"1"` or `"book"` or `"Book Appointment"` | **appointment** | Enters booking flow → BOOKING_DATE |
| `"2"` or `"services"` or `"Dental Services"` | **services** | Shows treatment list → SERVICES |
| `"3"` or `"location"` or `"Clinic Location"` | **location** | Shows address & phone → LOCATION |
| `"4"` or `"timings"` or `"Clinic Timings"` | **timings** | Shows hours → TIMINGS |
| `"emergency"` "bleeding" "pain" | **emergency** | Emergency response → EMERGENCY |
| `"agent"` "talk to" "human" | **escalate** | Human handoff → ESCALATION |
| `"callback"` "call me back" | **callback** | Callback request → CALLBACK |
| `"help"` or `"?"` | **help** | Shows contextual help text |

---

## 4. Booking Flow (Full Walkthrough)

### Step 1: Pick a Date (BOOKING_DATE)

**User starts:**
```
User:  "1" or "book" or "I want to book an appointment"
Bot:   What date would you like to come in?

       Examples: "tomorrow", "next Monday", or "25 May".
       Or type "0" for the menu.

       [Also accepts: "Book Appointment" from list]
```

**Valid user inputs for date:**

| User says | Extracted date |
|---|---|
| `"tomorrow"` | Today + 1 day |
| `"next Friday"` | Next week's Friday |
| `"this Monday"` | This week's Monday |
| `"Wednesday"` (bare) | This coming Wednesday |
| `"25 May"` or `"May 25th"` | 25 May 2026 |
| `"the 5th"` | 5th of current/next month |
| `"25/05/2026"` | 25 May 2026 |
| `"2026-05-25"` | 25 May 2026 |
| `"day after tomorrow"` | Today + 2 days |
| `"today"` or `"tonight"` | Today |

**Bot response on success:**
```
Bot:   Wednesday, 28 May 2026 is available.

       Hours: 09:00 – 20:00
       Slots: 09:00, 09:30, 10:00, 10:30, 11:00...
       [Interactive List: Select treatment ▼]
       What time works for you?
```

### Step 2: Pick a Time (BOOKING_TIME)

**User valid inputs:**

| User says | Extracted time |
|---|---|
| `"2pm"` or `"2 pm"` | 14:00 |
| `"2:30 pm"` or `"2:30pm"` | 14:30 |
| `"14:00"` | 14:00 |
| `"half past 2"` | 14:30 |
| `"quarter to 3"` | 14:45 |
| `"quarter past 2"` | 14:15 |
| `"2 o'clock"` | 14:00 |
| `"at 3"` (with time context) | 15:00 |
| `"10am"` or `"10 am"` | 10:00 |
| `"10:45"` | ❌ Invalid slot → suggestion: "Try 10:30" |

**Time-of-day context boosting:**
- `"morning"` → times between 05:00–12:00 get score boost
- `"afternoon"` → times between 12:00–17:00 get score boost
- `"evening"` → times between 17:00–21:00 get score boost
- `"night"` → times between 20:00–24:00 get score boost

**Bot response on success:**
```
Bot:   14:00 works. Which treatment do you need?
       [Interactive List: Select treatment ▼]
       1. General Dentistry
       2. Teeth Cleaning
       3. Root Canal
       4. Whitening
       5. Implants
       6. Braces
       7. Crowns
       8. Pediatric Dentistry
```

### Step 3: Pick a Treatment (BOOKING_TREATMENT)

**User valid inputs:**

| User says | Extracted treatment |
|---|---|
| `"1"` (number from list) | General Dentistry |
| `"cleaning"` or `"Teeth Cleaning"` | Teeth Cleaning |
| `"root canal"` or `"rc"` or `"rct"` | Root Canal |
| `"braces"` or `"orthodontic"` | Braces |
| `"I need a checkup"` | General Dentistry |
| `"cleaning for my teeth"` | Teeth Cleaning |
| `"child dentist"` | Pediatric Dentistry |

**Anti-false-positive examples:**

| User says | Result | Why |
|---|---|---|
| `"I have a general question"` | ❌ NOT General Dentistry | "general" + "question" → non-dental context penalty |
| `"I like white color"` | ❌ NOT Whitening | "white" + "color" → non-dental context penalty |
| `"children play area"` | ❌ NOT Pediatric Dentistry | Non-dental context |
| `"crown jewel"` | ❌ NOT Crowns | Non-dental context |
| `"I need a cleaning"` | ✅ Teeth Cleaning | "need" + "cleaning" → action context bonus |
| `"root canal treatment"` | ✅ Root Canal | Multi-word alias phrase match |

**Bot response on success:**
```
Bot:   [Interactive List]
       Confirm your appointment
       ┌──────────────────────────┐
       │ Date: Wednesday, 28 May  │
       │ Time: 14:00              │
       │ Treatment: Teeth Cleaning │
       │ Options:                 │
       │ • Confirm                │
       │ • Change Date            │
       │ • Change Time            │
       │ • Cancel                 │
       └──────────────────────────┘
```

### Step 4: Confirm Booking (BOOKING_CONFIRMATION)

**User valid inputs:**

| User types/taps | Intent | What happens |
|---|---|---|
| `"Confirm"` (list tap) | **confirm** | Booking saved → BOOKED |
| `"confirm"` (text) | **confirm** | Booking saved → BOOKED |
| `"book it"` or `"proceed"` | **confirm** | Booking saved → BOOKED |
| `"Change Date"` (list tap) | **edit_date** | Go back to date selection |
| `"Change Time"` (list tap) | **edit_time** | Go back to time selection |
| `"Cancel"` (list tap) | **cancel** | Cancel entire booking → MAIN_MENU |
| `"cancel"` (text) | **cancel** | Cancel entire booking → MAIN_MENU |
| `"date"` or `"change date"` | **edit_date** | Re-pick date |
| `"time"` or `"change time"` | **edit_time** | Re-pick time |

**Bot response on confirmed booking:**
```
Bot:   Confirmed! Here's your appointment:

       Date: Wednesday, 28 May 2026
       Time: 14:00
       Treatment: Teeth Cleaning
       Location: Shri Balaji Dental Clinic
       Phone: +91 91115 94782

       We look forward to seeing you!

       [Buttons: Book Another] [Menu]
```

### Step 5: After Booking (BOOKED)

**User options:**

| User taps | What happens |
|---|---|
| `"Book Another"` | → BOOKING_DATE (starts a new booking) |
| `"Menu"` | → MAIN_MENU |
| Text: `"1"`, `"book"`, `"services"`, etc. | Routes to appropriate state per transition table |

---

## 5. Quick Booking with Auto-Fill

Users can provide multiple booking fields in a single message. The entity extraction engine (see Section 16) parses everything at once.

### Date + Time + Treatment (skips all steps → confirmation)

```
User:  "next Friday at 2pm for cleaning"
Bot:   [Confirmation summary + Interactive List]
       Confirm your appointment:
       Date: Friday, 29 May 2026
       Time: 14:00
       Treatment: Teeth Cleaning
       Location: Shri Balaji Dental Clinic

       ...with Confirm / Change Date / Change Time / Cancel
```

### Date + Time (skips date → goes to treatment selection)

```
User:  "tomorrow at 10am"
Bot:   Great, 10:00 on Tuesday, 26 May 2026 works.
       ...Which treatment do you need?
       [Treatment list]
```

### Time + Treatment (during time selection, skips treatment → confirmation)

```
User:  (in BOOKING_TIME) "2:30pm for root canal"
Bot:   [Confirmation summary]
```

### Sentence examples that work with auto-fill:

| User says | What gets extracted |
|---|---|
| `"I want to come next Friday at 2:30 pm for a root canal"` | date=29-May, time=14:30, treatment=Root Canal |
| `"can you book me a cleaning on the 25th around 10am?"` | date=25-May, time=10:00, treatment=Teeth Cleaning |
| `"I need braces this Saturday"` | date=30-May, treatment=Braces |
| `"half past 2 on Tuesday for RCT please"` | date=next-Tue, time=14:30, treatment=Root Canal |
| `"my child needs a checkup tomorrow morning"` | date=tomorrow, time=10:00*, treatment=Pediatric Dentistry |

---

## 6. Services Flow

Triggered by: `"2"`, `"services"`, `"what do you do"`, or tapping `"Dental Services"` from the menu.

```
User:  "services" or "2"
Bot:   Shri Balaji Dental Clinic offers:

       General Dentistry
       Teeth Cleaning
       Root Canal
       Whitening
       Implants
       Braces
       Crowns
       Pediatric Dentistry

       [Buttons: Book Appointment] [Menu]
```

### From SERVICES state

| User taps/types | What happens |
|---|---|
| `"Book Appointment"` | → BOOKING_DATE |
| `"Menu"` | → MAIN_MENU |
| `"1"`, `"book"`, `"appointment"` | → BOOKING_DATE |
| `"0"`, `"menu"`, `"home"` | → MAIN_MENU |

---

## 7. Location Flow

Triggered by: `"3"`, `"location"`, `"address"`, or tapping `"Clinic Location"` from the menu.

```
User:  "location" or "3"
Bot:   Shri Balaji Dental Clinic
       [address from config]
       Phone: +91 91115 94782

       [Button: Main Menu]
```

---

## 8. Timings Flow

Triggered by: `"4"`, `"timings"`, `"hours"`, or tapping `"Clinic Timings"` from the menu.

```
User:  "timings" or "4"
Bot:   Shri Balaji Dental Clinic Hours

       Mon-Sat: 09:00 – 20:00
       Sunday: 10:00 – 14:00

       [Button: Main Menu]
```

---

## 9. Emergency Flow

Triggered by **any** message containing: `emergency`, `pain`, `bleeding`, `swelling`, `accident`, `hurts`, `urgent`, `broken tooth`, `severe`, `injury`, `toothache`, `abscess`, `fracture`, `knocked out`.

```
User:  "I have severe tooth pain"
Bot:   If this is a medical emergency, please call +91 91115 94782 immediately
       or visit the nearest hospital.

       For urgent dental issues during clinic hours, call us and we will
       accommodate you as soon as possible.
```

**Important:** Emergency intent takes highest priority in the router — it fires even if the user is in the middle of booking or any other state. The only exception is the ABANDONED state, where emergency is checked before the auto-redirect to MAIN_MENU.

---

## 10. Escalation / Human Handoff

Triggered by: `"agent"`, `"human"`, `"person"`, `"speak"`, `"talk to"`, `"representative"`, `"call me"`.

```
User:  "talk to a person"
Bot:   Let me connect you to our team. Please call +91 91115 94782
       or expect a call back shortly.
```

**Also triggers automatically** when a user fails to provide valid input 3+ times in a row:

```
Bot:   I'm having trouble understanding. Let me connect you to our team
       at +91 91115 94782.
```

---

## 11. Callback Request Flow

Triggered by: `"callback"`, `"call back"`, `"call me back"`, `"ring me"`.

```
User:  "call me back"
Bot:   Please share your phone number and preferred time for a callback.
```

**Phone extraction works with:**

| User says | Extracted |
|---|---|
| `"9876543210"` | +919876543210 |
| `"98765 43210"` | +919876543210 |
| `"022-12345678"` | 02212345678 (landline) |

```
User:  "9876543210"
Bot:   Thanks! We will call you back at +919876543210 during clinic hours.
       [Button: Main Menu]
```

---

## 12. Cancel & Start Over

Triggered by: `"cancel"`, `"forget it"`, `"nevermind"`, `"abort"`, `"stop"`, `"forget"`.

Available from: BOOKING_DATE, BOOKING_TIME, BOOKING_TREATMENT, BOOKING_CONFIRMATION, CALLBACK_REQUESTED.

```
User:  (in booking flow) "cancel"
Bot:   No problem. What would you like to do instead?
       [Main Menu list]

User:  (in booking) "start over"
Bot:   No problem. What would you like to do instead?
       [Main Menu list]
```

Cancelling resets all booking context (`date`, `time`, `treatment`, `patientName`, `patientPhone`, `notes`) and returns to MAIN_MENU.

---

## 13. Back Navigation

Triggered by: `"back"`, `"previous"`, `"go back"`, `"return"`.

Available from: BOOKING_TIME, BOOKING_TREATMENT, BOOKING_CONFIRMATION.

| From | Goes back to | Bot says |
|---|---|---|
| BOOKING_TIME | BOOKING_DATE | "Okay, going back to pick a different date." |
| BOOKING_TREATMENT | BOOKING_TIME | "Sure, going back to choose a different time." |
| BOOKING_CONFIRMATION | BOOKING_TREATMENT | "Alright, going back to pick a different treatment." |

If there's no `previousState` recorded, `"back"` returns to MAIN_MENU.

---

## 14. Interactive Messages (Lists & Buttons)

### List Messages (Dropdown)

Used when there are multiple options to choose from.

#### Main Menu List
```
┌──────────────────────────────┐
│ Shri Balaji Dental Clinic    │
│ How can I help you?          │
│ Tap an option below          │
│                              │
│ [Select            ▼]        │
│ ──────────────────────────   │
│ Menu:                        │
│ • Book Appointment           │
│ • Dental Services            │
│ • Clinic Location            │
│ • Clinic Timings             │
└──────────────────────────────┘
```

#### Treatment List
```
┌──────────────────────────────┐
│ Which treatment do you need? │
│ Select a treatment           │
│                              │
│ [Select treatment   ▼]       │
│ ──────────────────────────   │
│ Available Treatments:        │
│ • General Dentistry          │
│ • Teeth Cleaning             │
│ • Root Canal                 │
│ • Whitening                  │
│ • Implants                   │
│ • Braces                     │
│ • Crowns                     │
│ • Pediatric Dentistry        │
└──────────────────────────────┘
```

#### Confirmation List
```
┌──────────────────────────────┐
│ Confirm your appointment     │
│                              │
│ Date: Wed, 28 May 2026      │
│ Time: 14:00                  │
│ Treatment: Teeth Cleaning     │
│                              │
│ [Choose             ▼]       │
│ ──────────────────────────   │
│ Options:                     │
│ • Confirm                    │
│ • Change Date                │
│ • Change Time                │
│ • Cancel                     │
└──────────────────────────────┘
```

### Button Messages (Quick Reply)

Used for 1–2 options after completing an action.

#### After Booking (BOOKED)
```
┌──────────────────────────────┐
│ What would you like to do    │
│ next?                        │
│                              │
│ [Book Another]  [Menu]       │
└──────────────────────────────┘
```

#### After Info (SERVICES)
```
┌──────────────────────────────┐
│ What would you like to do?   │
│                              │
│ [Book Appointment]  [Menu]   │
└──────────────────────────────┘
```

#### Single Button (LOCATION / TIMINGS)
```
┌──────────────────────────────┐
│ Tap below to return          │
│                              │
│ [Main Menu]                  │
└──────────────────────────────┘
```

### How button/list taps work

When a user taps an interactive element, WhatsApp sends a callback with the **title text** of the tapped item (not the ID). The bot's `normalizeMessage` function extracts this title and passes it through the same intent matching pipeline as text messages.

| Tapped title | Becomes | Intent |
|---|---|---|
| `"Book Appointment"` | `"book appointment"` (lowercased) | appointment |
| `"Dental Services"` | `"dental services"` | services |
| `"Confirm"` | `"confirm"` | confirm |
| `"Change Date"` | `"change date"` | edit_date |
| `"Main Menu"` | `"main menu"` | main_menu |

---

## 15. All Intents the Bot Recognizes

| Intent | Triggers | Priority |
|---|---|---|
| **emergency** | contains: pain, bleeding, swelling, accident, urgent, toothache, etc. | 🔴 Global (highest) |
| **cancel** | exact: cancel, forget it, abort, stop, never mind | 🟠 Global |
| **main_menu** | exact: 0, menu, home, start over, restart; contains: back to menu | 🟠 Global |
| **escalate** | contains: agent, human, talk to, representative, call me | 🟠 Global |
| **thanks** | exact: thanks, thank you, thx, ty, appreciate it | 🟠 Global |
| **greeting** | exact: hi, hello, hey, namaste, good morning; contains: greetings | 🟠 Global |
| **help** | exact: help, ?, what can you do | 🟠 Global |
| **appointment** | exact: 1, book; contains: appointment, booking, schedule, visit | 🟡 State-scoped |
| **services** | exact: 2; contains: services, treatments, procedures | 🟡 State-scoped |
| **location** | exact: 3; contains: location, address, directions, map | 🟡 State-scoped |
| **timings** | exact: 4; contains: timings, hours, open, close | 🟡 State-scoped |
| **callback** | contains: callback, call back, call me back | 🟡 State-scoped |
| **confirm** | exact: confirm, correct, book it, done, proceed, go ahead | 🟡 State-scoped |
| **back** | exact: back, previous, go back, return | 🟡 State-scoped |
| **edit_date** | contains: change date, different date, another date | 🟡 State-scoped |
| **edit_time** | contains: change time, different time, another time | 🟡 State-scoped |
| **provide_date** | Entity match (date extracted from message) | 🟢 Derived |
| **provide_time** | Entity match (time extracted from message) | 🟢 Derived |
| **provide_treatment** | Entity match (treatment extracted from message) | 🟢 Derived |
| **provide_phone** | Entity match (phone extracted from message) | 🟢 Derived |
| **unknown** | Fallback when nothing matches | ⚪ Fallback |

### Intent matching order

1. **Global priority** (8 intents checked first, regardless of state)
2. **State-allowed intents** (intents valid for current state, per transition table)
3. **Cross-state intents** (intents that are valid elsewhere but not here → lower confidence = 0.7)
4. **Entity-derived intents** (date/time/treatment/phone found in message text)
5. **Fallback** → `unknown`

---

## 16. Entity Extraction Capabilities

The entity extraction engine (`src/lib/entities.js`) processes natural language to extract structured data.

### Preprocessing (Layer 1)

Before matching, conversational fluff is stripped:

| User says | After preprocessing |
|---|---|
| `"I want to book an appointment for tomorrow"` | `"book an appointment for tomorrow"` |
| `"can you tell me what time you are open"` | `"what time you are open"` |
| `"i would like to come in on Friday please"` | `"come in on Friday"` |
| `"I was wondering if you have a slot at 2pm"` | `"have a slot at 2pm"` |

Removes:
- Request prefixes: `i want to`, `i would like to`, `can i`, `could you`, `please`
- Polite suffixes: `please`, `thanks`, `kindly`
- Question prefixes: `can you tell me`, `do you have`, `i was wondering`
- Filler words: `i mean`, `you know`, `like`, `actually`, `basically`

### Date Extraction (Layer 2)

| Pattern | Score | Example |
|---|---|---|
| Spoken DMY (month day) | 15 | `"25 May"`, `"May 25th 2026"` |
| ISO format | 14 | `"2026-05-25"` |
| Numeric full | 13 | `"25/05/2026"` |
| Numeric short | 11 | `"25/05"` |
| Absolute reference | 10 | `"today"`, `"tomorrow"`, `"day after tomorrow"` |
| Qualified weekday | 9 | `"next Friday"`, `"this Monday"`, `"coming Tuesday"` |
| Bare weekday | 7 | `"Friday"`, `"Monday"` |
| Ordinal-only | 4–5 | `"the 5th"` (tries this month, then next month) |

When multiple dates are found, the system scores them and picks the best. If scores are close (within 5 points), it's marked as **ambiguous** and the bot asks for clarification.

### Time Extraction (Layer 3)

| Pattern | Score | Example |
|---|---|---|
| HH:MM with am/pm | 15 | `"2:30 pm"`, `"14:30"` |
| Hour + am/pm only | 13 | `"2pm"`, `"10 am"` |
| 24h format | 12 | `"14:00"`, `"23:45"` |
| "half past X" | 10 | `"half past 2"` → 2:30 |
| "quarter past X" | 10 | `"quarter past 2"` → 2:15 |
| "quarter to X" | 10 | `"quarter to 3"` → 2:45 |
| "X o'clock" | 9 | `"2 o'clock"` → 2:00 |
| Standalone (at/by X) | 5 | `"at 3"` (requires time-of-day context) |

**Time-of-day context boosting:**
- `"morning"` → +3 to times 5–12
- `"afternoon"` → +3 to times 12–17
- `"evening"` → +3 to times 17–21
- `"night"` → +2 to times 20–24

### Treatment Extraction (Layer 4)

**Multi-word aliases** (phrase match, context score must be ≥ 0):

| User says | Treatment | Matched alias |
|---|---|---|
| `"root canal"` | Root Canal | "root canal" |
| `"teeth whitening"` | Whitening | "teeth whitening" |
| `"nerve treatment"` | Root Canal | "nerve treatment" |

**Single-word aliases** (word boundary match, context score must be ≥ 5, or ≥ 0 if no other results):

| User says | Treatment | Context bonus |
|---|---|---|
| `"I need a cleaning"` | Teeth Cleaning | "need" + "cleaning" → +10 |
| `"consultation for teeth"` | General Dentistry | "teeth" near "consultation" → +8 |
| `"checkup"` (standalone) | General Dentistry | No context → ctxScore = 0, accepted as fallback |

**False positive prevention:**

| User says | NOT matched as | Why |
|---|---|---|
| `"general question"` | General Dentistry | "general" + non-dental context → -25 penalty |
| `"white color"` | Whitening | "white" + non-dental context → -25 penalty |
| `"children playground"` | Pediatric Dentistry | Non-dental context → -25 penalty |

### Phone Extraction (Layer 5)

| User says | Extracted |
|---|---|
| `"9876543210"` | +919876543210 |
| `"98765 43210"` | +919876543210 |
| `"+91 98765 43210"` | +919876543210 |
| `"022-12345678"` | 02212345678 (landline) |

---

## 17. Validation & Error Flows

### Date validation

| User says | Bot response |
|---|---|
| `"yesterday"` or past date | "Please pick a future date." |
| `"25/05/2025"` (past) | "Please pick a future date." |
| A Sunday | "Sun 10AM–2PM only. Would you like to proceed?" (accepts Sunday time) |
| A date 60 days away | "We only book up to 30 days ahead." |

### Time validation

| User says | Bot response |
|---|---|
| `"07:00"` (before opening) | "We open at 09:00." |
| `"21:00"` (after closing) | "We close at 20:00." |
| `"10:45"` (non-30-min slot) | "Available slots are every 30 minutes, e.g., 10:30." |
| `"14:45"` (not in slot list) | "Try: 14:00, 14:30, 15:00..." |

### Treatment validation

| User says | Bot response |
|---|---|
| `"surgery"` (unknown) | "Available: General Dentistry, Teeth Cleaning, Root Canal..." |

### Unknown intent / repeated failures

**1st failure:**
```
Bot:   I did not catch the time. Try "10am", "2:30pm", or "14:00".
       Type "back" to change the date.
```

**2nd failure:**
```
Bot:   Try saying a time like "10am" or "2:30pm".
       Type "back" to change the date.
```

**3rd failure → Escalation:**
```
Bot:   I'm having trouble understanding. Let me connect you to our team
       at +91 91115 94782.
```

---

## 18. Session Timeout & Abandoned State

When a session has been inactive for a configurable period:

- The session state is set to `ABANDONED`
- On the next message (non-emergency), the bot redirects to MAIN_MENU
- Any booking context is preserved in `session.context` but the user starts fresh from the menu

---

## 19. Multi-Message Support

The bot handles more than just text messages:

| Message type | What the bot does |
|---|---|
| **Text** | Normalized (NFKC), whitespace condensed, case-insensitive matching |
| **Interactive (button/list tap)** | Extracts the button/list title as text → standard intent matching |
| **Image** | Extracts caption text if present |
| **Audio** | Records the audio ID (future voice transcription) |
| **Video** | Extracts caption text if present |
| **Document** | Extracts caption text if present |
| **Location** | Captures lat/lng and address name |
| **Contacts** | Captures name and phone numbers |

---

## Quick Reference: Common User Journeys

### Journey A: Full booking (step by step)

```
hi → Main Menu → tap "Book Appointment" →
  "tomorrow" → Date picked →
  "2pm" → Time picked →
  "cleaning" → Treatment picked →
  tap "Confirm" → Booked ✅
```

### Journey B: Quick booking (single message)

```
"next Friday at 2:30pm for root canal" →
  Auto-fills date + time + treatment →
  Confirmation → tap "Confirm" → Booked ✅
```

### Journey C: Info while booking

```
...in booking flow → "location" →
  Sees clinic address →
  "I did not catch that" (back to booking) →
  "tomorrow" → continues booking
```

### Journey D: Change mind

```
...in booking flow → "cancel" →
  Main Menu → "book" → starts fresh
```

### Journey E: Emergency

```
Any conversation → "severe tooth pain" →
  Emergency info displayed → call clinic
```
