# User Flow Guide — Shri Balaji Dental Clinic WhatsApp Bot

> **Last updated:** May 31, 2026
> **Bot version:** Level 3 (doctor flows, registration, visit logging, chit media, Hinglish/Devanagari)

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
20. [Doctor Flows](#20-doctor-flows)

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
       5. My Appointments
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
| BOOKING_COLLECTION | "We were setting up your appointment — let's pick up where we left off." |
| BOOKING_CONFIRMATION | "Your appointment details are ready to confirm." |
| BOOKED | "You have an appointment coming up." |
| CANCEL_CONFIRM | "Were you looking to cancel your appointment?" |

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
              │ COLLECT.   │        │       │        │
              │   │        │        │       │        ▼
              │   ▼        └──┬─────┘  ┌───┘    HUMAN_ESCAL.
              │ BOOKING       │       │
              │ CONFIRMATION  └───┬───┘
              │   │               │
              │   ▼               ▼
              │  BOOKED       CALLBACK_
              │   │           REQUESTED
              │   │               │
              │   ▼               ▼
              │ CANCEL_          DONE
              │ CONFIRM
              │   │
              └───┘
```

### All patient states (14)

| State | Purpose |
|---|---|
| **IDLE** | Initial state before first interaction |
| **MAIN_MENU** | Shows the main navigation options |
| **BOOKING_COLLECTION** | Collecting date/time/treatment/patientName (unified) |
| **BOOKING_CONFIRMATION** | Confirming the full booking |
| **BOOKED** | Appointment successfully booked |
| **SERVICES** | Showing available dental services |
| **LOCATION** | Showing clinic address and phone |
| **TIMINGS** | Showing operating hours |
| **EMERGENCY** | Emergency response state |
| **HUMAN_ESCALATION** | User needs human assistance |
| **CALLBACK_REQUESTED** | Collecting phone for callback |
| **CANCEL_CONFIRM** | Confirm cancellation of booked appointment |
| **DONE** | Completed interaction |
| **ABANDONED** | Session expiry (timeout) |

### Doctor states (20+)

See [Section 20 — Doctor Flows](#20-doctor-flows).

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
│ • My Appointments   │
└─────────────────────┘
```

**Short text version** (returned within 5 minutes):
```
1. Book Appointment
2. Dental Services
3. Clinic Location
4. Clinic Timings
5. My Appointments
```

### What the user can do

| User types/taps | Intent | What happens |
|---|---|---|
| `"1"` or `"book"` or `"Book Appointment"` | **appointment** | Enters booking flow → BOOKING_COLLECTION |
| `"2"` or `"services"` or `"Dental Services"` | **services** | Shows treatment list → SERVICES |
| `"3"` or `"location"` or `"Clinic Location"` | **location** | Shows address & phone → LOCATION |
| `"4"` or `"timings"` or `"Clinic Timings"` | **timings** | Shows hours → TIMINGS |
| `"5"` or `"my appointments"` | **my_appointments** | Shows upcoming appointments |
| `"emergency"` "bleeding" "pain" | **emergency** | Emergency response → EMERGENCY |
| `"agent"` "talk to" "human" | **escalate** | Human handoff → ESCALATION |
| `"callback"` "call me back" | **callback** | Callback request → CALLBACK |
| `"help"` or `"?"` | **help** | Shows contextual help text |

---

## 4. Booking Flow (Full Walkthrough)

The booking flow uses a single unified state (`BOOKING_COLLECTION`) for collecting all fields. The bot tracks which fields are still needed (treatment, date, time, patient name) and prompts for them in order.

### Step 1: Start booking

```
User:  "1" or "book" or "I want to book an appointment"
Bot:   What problem are you facing? Pick the closest option.
       [Interactive List: Select treatment ▼]
```

### Step 2: Pick a Treatment

**Valid inputs:**

| User says | Extracted treatment |
|---|---|
| `"1"` (number from list) | General Dentistry |
| `"cleaning"` or `"Teeth Cleaning"` | Teeth Cleaning |
| `"root canal"` or `"rc"` or `"rct"` | Root Canal |
| `"braces"` or `"orthodontic"` | Braces |
| `"I need a checkup"` | General Dentistry |
| `"cleaning for my teeth"` | Teeth Cleaning |
| `"child dentist"` | Pediatric Dentistry |

**Bot response on success:**
```
Bot:   Which date works for you?
       Examples: "tomorrow", "next Monday", or "25 May".
```

### Step 3: Pick a Date

**Valid user inputs for date:**

| User says | Extracted date |
|---|---|
| `"tomorrow"` | Today + 1 day |
| `"kal"` | AMBIGUOUS — prompts to be explicit ("Did you mean tomorrow?") |
| `"aaj"` / आज | Today |
| `"parso"` / परसों | Day after tomorrow |
| `"2 din baad"` / "do din baad" | Today + 2 days |
| `"next Friday"` | Next week's Friday |
| `"this Monday"` | This week's Monday |
| `"Wednesday"` (bare) | This coming Wednesday |
| `"25 May"` or `"May 25th"` | 25 May 2026 |
| `"the 5th"` | 5th of current/next month |
| `"25/05/2026"` | 25 May 2026 |
| `"2026-05-25"` | 25 May 2026 |
| `"day after tomorrow"` | Today + 2 days |
| `"today"` or `"tonight"` | Today |
| `"agle Monday"` | Next Monday |

**Bot response on success:**
```
Bot:   Wednesday, 28 May 2026 is available.

       Hours: 10:00 – 20:00
       Which time works for you?
       Slots are every 30 minutes.

       [Interactive List: Quick-pick time ▼]
```

### Step 4: Pick a Time

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
| `"5 baje"` | 17:00 |
| `"saade 5"` (साढ़े 5) | 17:30 |
| `"shaam"` (शाम) | 17:00 |
| `"subah"` (सुबह) | 10:00 |
| `"10:45"` | ❌ Invalid slot → suggestion: "Try 10:30" |

**Bot response on success:**
```
Bot:   14:00 works. What name should I use for this appointment?
```

### Step 5: Patient Name

The bot now asks for the patient's name after all other fields are collected.

```
User:  "Rahul" or "Rahul Sharma"
Bot:   [Interactive List]
       Confirm your appointment
       ┌──────────────────────────┐
       │ Patient:  Rahul          │
       │ Date:     Wednesday, 28 May │
       │ Time:     14:00          │
       │ Treatment: Teeth Cleaning │
       │ Options:                 │
       │ • Confirm                │
       │ • Change Date            │
       │ • Change Time            │
       │ • Cancel                 │
       └──────────────────────────┘
```

### Step 6: Confirm Booking (BOOKING_CONFIRMATION)

**User valid inputs:**

| User types/taps | Intent | What happens |
|---|---|---|
| `"Confirm"` (list tap) | **confirm** | Booking saved → BOOKED |
| `"confirm"` (text) | **confirm** | Booking saved → BOOKED |
| `"book it"` or `"proceed"` | **confirm** | Booking saved → BOOKED |
| `"haan"` / हाँ / ठीक है | **confirm** | Booking saved → BOOKED |
| `"Change Date"` (list tap) | **edit_date** | Go back to date selection |
| `"Change Time"` (list tap) | **edit_time** | Go back to time selection |
| `"Cancel"` (list tap) | **cancel** | Cancel entire booking → MAIN_MENU |

**Bot response on confirmed booking:**
```
Bot:   Confirmed! Here's your appointment:

       Patient: Rahul
       Date: Wednesday, 28 May 2026
       Time: 14:00
       Treatment: Teeth Cleaning
       Doctor: Dr. Vishnu Vardhan
       Location: Shri Balaji Dental Clinic

       [Buttons: Book Another] [Menu]
```

### Step 7: After Booking (BOOKED)

**User options:**

| User taps | What happens |
|---|---|
| `"Book Another"` | → BOOKING_COLLECTION (starts a new booking) |
| `"Menu"` | → MAIN_MENU |
| `"cancel appointment"` | → CANCEL_CONFIRM (asks yes/no) |
| `"reschedule"` | → BOOKING_COLLECTION (creates new version) |

---

## 5. Quick Booking with Auto-Fill

Users can provide multiple booking fields in a single message. The entity extraction engine parses everything at once.

### Date + Time + Treatment + Name (skips all steps → confirmation)

```
User:  "next Friday at 2pm for cleaning, name Rahul"
Bot:   [Confirmation summary + Interactive List]
```

### Date + Time (skips date → goes to treatment selection)

```
User:  "tomorrow at 10am"
Bot:   Great, 10:00 on Tuesday, 26 May 2026 works.
       ...What problem are you facing?
       [Treatment list]
```

### Sentence examples that work with auto-fill:

| User says | What gets extracted |
|---|---|
| `"I want to come next Friday at 2:30 pm for a root canal"` | date=29-May, time=14:30, treatment=Root Canal |
| `"can you book me a cleaning on the 25th around 10am?"` | date=25-May, time=10:00, treatment=Teeth Cleaning |
| `"I need braces this Saturday"` | date=30-May, treatment=Braces |
| `"half past 2 on Tuesday for RCT please"` | date=next-Tue, time=14:30, treatment=Root Canal |
| `"my child needs a checkup tomorrow morning"` | date=tomorrow, time=10:00, treatment=Pediatric Dentistry |
| `"kal 5 baje cleaning ke liye"` | date=tomorrow, time=17:00, treatment=Teeth Cleaning |
| `"आज शाम ५ बजे"` | date=today, time=17:00 |

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

---

## 7. Location Flow

Triggered by: `"3"`, `"location"`, `"address"`, or tapping `"Clinic Location"` from the menu.

```
User:  "location" or "3"
Bot:   Shri Balaji Dental Clinic
       [address from config]
       Phone: +91 91833 74850
       📍 [Google Maps link]

       [Button: Main Menu]
```

---

## 8. Timings Flow

Triggered by: `"4"`, `"timings"`, `"hours"`, or tapping `"Clinic Timings"` from the menu.

```
User:  "timings" or "4"
Bot:   Shri Balaji Dental Clinic Hours

       Mon-Sat: 10:00 – 20:00
       Sunday: 10:00 – 14:00

       [Button: Main Menu]
```

---

## 9. Emergency Flow

Triggered by **any** message containing: `emergency`, `pain`, `bleeding`, `swelling`, `accident`, `hurts`, `urgent`, `broken tooth`, `severe`, `injury`, `toothache`, `abscess`, `fracture`, `knocked out`, and Hinglish/Hindi equivalents (`dard`, `khun`, `soojan`, `tez dard`, `खून`, `दर्द`, etc.).

```
User:  "I have severe tooth pain"
Bot:   If this is a medical emergency, please call +91 91833 74850 immediately
       or visit the nearest hospital.

       For urgent dental issues during clinic hours, call us and we will
       accommodate you as soon as possible.
```

**Important:** Emergency intent takes highest priority in the router — it fires even if the user is in the middle of booking or any other state.

---

## 10. Escalation / Human Handoff

Triggered by: `"agent"`, `"human"`, `"person"`, `"speak"`, `"talk to"`, `"representative"`, `"call me"`.

```
User:  "talk to a person"
Bot:   Let me connect you to our team. Please call +91 91833 74850
       or expect a call back shortly.
```

**Also triggers automatically** when a user fails to provide valid input 3+ times in a row (frustration score >= 4):

```
Bot:   I'm having trouble understanding. Let me connect you to our team
       at +91 91833 74850.
```

---

## 11. Callback Request Flow

Triggered by: `"callback"`, `"call back"`, `"call me back"`, `"ring me"`.

```
User:  "call me back"
Bot:   Please share your 10-digit phone number and we will call you back.
```

**Phone extraction works with:**

| User says | Extracted |
|---|---|
| `"9876543210"` | +919876543210 |
| `"98765 43210"` | +919876543210 |
| `"+91 98765 43210"` | +919876543210 |

```
User:  "9876543210"
Bot:   Thanks! We will call you back at +919876543210 during clinic hours.
       [Button: Main Menu]
```

---

## 12. Cancel & Start Over

Triggered by: `"cancel"`, `"forget it"`, `"nevermind"`, `"abort"`, `"stop"`, `"forget"`, `"radd karo"`, `रद्द`.

Available from: BOOKING_COLLECTION, BOOKING_CONFIRMATION, CALLBACK_REQUESTED.

```
User:  (in booking flow) "cancel"
Bot:   No problem. What would you like to do instead?
       [Main Menu list]
```

Cancelling resets all booking context (date, time, treatment, patientName) and returns to MAIN_MENU.

If the user has a confirmed appointment and says "cancel", the bot enters CANCEL_CONFIRM:
```
User:  "cancel appointment"
Bot:   Are you sure you want to cancel your appointment on Wed, 28 May at 14:00?

       [Yes, Cancel] [No, Keep]
```

---

## 13. Back Navigation

Triggered by: `"back"`, `"previous"`, `"go back"`, `"return"`.

Available from: Most states. Uses the transition table to determine the correct previous state.

If there's no valid previous state recorded, `"back"` returns to MAIN_MENU.

---

## 14. Interactive Messages (Lists & Buttons)

### List Messages (Dropdown)

Used when there are multiple options to choose from.

#### Main Menu List
```
┌──────────────────────────────┐
│ Shri Balaji Dental Clinic    │
│ How can I help you?          │
│                              │
│ [Select            ▼]        │
│ ──────────────────────────   │
│ Menu:                        │
│ • Book Appointment           │
│ • Dental Services            │
│ • Clinic Location            │
│ • Clinic Timings             │
│ • My Appointments            │
└──────────────────────────────┘
```

#### Treatment / Quick-pick Time / Confirmation lists

Same pattern — used throughout booking.

### Button Messages (Quick Reply)

Used for 1–3 options after completing an action.

#### After Booking (BOOKED)
```
┌──────────────────────────────┐
│ What would you like to do    │
│ next?                        │
│                              │
│ [Book Another]  [Menu]       │
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

---

## 15. All Intents the Bot Recognizes

| Intent | Triggers | Priority |
|---|---|---|
| **emergency** | contains: pain, bleeding, swelling, accident, urgent, toothache, Hinglish/Hindi equivalents | 🔴 Global (highest) |
| **cancel** | exact: cancel, forget it, abort, stop, never mind, radd karo, रद्द | 🟠 Global |
| **main_menu** | exact: 0, menu, home, start over, restart; contains: back to menu | 🟠 Global |
| **escalate** | contains: agent, human, talk to, representative, call me | 🟠 Global |
| **thanks** | exact: thanks, thank you, thx, ty, appreciate it | 🟠 Global |
| **greeting** | exact: hi, hello, hey, namaste, good morning; contains: greetings, नमस्ते | 🟠 Global |
| **help** | exact: help, ?, what can you do | 🟠 Global |
| **back** | exact: back, previous, go back, return | 🟠 Global (also state-scoped) |
| **affirm** | ok, okay, sure, right, fine, good, yep, yeah, haan, han, thik hai, हाँ, ठीक है, etc. | 🟠 Global |
| **appointment** | exact: 1, book; contains: appointment, booking, schedule, visit | 🟡 State-scoped |
| **services** | exact: 2; contains: services, treatments, procedures | 🟡 State-scoped |
| **location** | exact: 3; contains: location, address, directions, map | 🟡 State-scoped |
| **timings** | exact: 4; contains: timings, hours, open, close | 🟡 State-scoped |
| **my_appointments** | exact: 5; contains: my appointments, my bookings, upcoming | 🟡 State-scoped |
| **callback** | contains: callback, call back, call me back | 🟡 State-scoped |
| **confirm** | exact: confirm, correct, book it, done, proceed, yes, go ahead, haan, हाँ | 🟡 State-scoped |
| **edit_date** | contains: change date, different date, another date | 🟡 State-scoped |
| **edit_time** | contains: change time, different time, another time | 🟡 State-scoped |
| **correction_date** | actually, change date, different date (in booking states) | 🟡 State-scoped |
| **correction_time** | actually, change time, different time, morning/evening (in booking states) | 🟡 State-scoped |
| **correction_treatment** | not, actually, different treatment, not that (in booking states) | 🟡 State-scoped |
| **confirm_cancel** | yes, confirm, cancel it, haan, हाँ (in CANCEL_CONFIRM) | 🟡 State-scoped |
| **reschedule** | reschedule, change appointment, change date/time, rebook | 🟡 State-scoped |
| **provide_date** | Entity match (date extracted from message) | 🟢 Derived |
| **provide_time** | Entity match (time extracted from message) | 🟢 Derived |
| **provide_treatment** | Entity match (treatment extracted from message) | 🟢 Derived |
| **provide_phone** | Entity match (phone extracted from message) | 🟢 Derived |
| **unknown** | Fallback when nothing matches | ⚪ Fallback |

### Intent matching order

1. **Interactive ID** (list/button taps) — 60+ mapped IDs for dates, treatments, doctor actions, etc.
2. **Global intents** (emergency first, then all GLOBAL_INTENTS)
3. **Corrections** (booking states only, uses `detectCorrection()`)
4. **State-specific intents** (keywords per current state)
5. **Entity-derived intents** (date/time/treatment/phone found in message text)
6. **Number match** (treatment list selection by number)
7. **Fallback** → `unknown`

---

## 16. Entity Extraction Capabilities

The entity extraction engine processes natural language to extract structured data.

### Preprocessing

Before matching, conversational fluff is stripped:

| User says | After preprocessing |
|---|---|
| `"I want to book an appointment for tomorrow"` | `"book an appointment for tomorrow"` |
| `"can you tell me what time you are open"` | `"what time you are open"` |
| `"i would like to come in on Friday please"` | `"come in on Friday"` |
| `"I was wondering if you have a slot at 2pm"` | `"have a slot at 2pm"` |

Removes:
- Request prefixes: `i want to`, `i would like to`, `i need to`, `can i`, `could you`, `please`
- Polite suffixes: `please`, `thanks`, `thank you`
- Question prefixes: `can you tell me`, `do you have`, `is there`, `what about`

### Date Extraction

| Pattern | Example |
|---|---|
| Absolute references | `"today"`, `"tomorrow"`, `"day after tomorrow"` |
| Hinglish absolutes | `"aaj"` (today), `"kal"` (→AMBIGUOUS), `"parso"` (day after) |
| Relative offsets | `"2 din baad"`, `"do din baad"`, `"3 days later"` |
| Hinglish number words | `"do din baad"`, `"teen din baad"`, `"chaar din baad"` |
| Qualified weekday | `"next Friday"`, `"this Monday"`, `"coming Tuesday"`, `"agle Monday"` |
| Bare weekday | `"Friday"`, `"Monday"` |
| Spoken DMY | `"25 May"`, `"May 25th 2026"` |
| ISO format | `"2026-05-25"` |
| Numeric | `"25/05/2026"`, `"25/05"` |
| Devanagari | `"आज"` (today), `"कल"` (→AMBIGUOUS), `"परसों"` (day after) |
| Indic digits | `"२५/०५/२०२६"` normalized to `"25/05/2026"` |

**Ambiguity:** `"kal"` / `"कल"` returns AMBIGUOUS — bot asks user to be explicit ("Did you mean tomorrow?").

### Time Extraction

| Pattern | Example |
|---|---|
| HH:MM with am/pm | `"2:30 pm"`, `"14:30"` |
| Hour + am/pm only | `"2pm"`, `"10 am"` |
| After/before/by/around | `"after 3"`, `"around 5"`, `"by 2pm"` |
| Time-of-day words | `"morning"` → 10:00, `"afternoon"` → 14:00, `"evening"` → 17:00 |
| Hinglish "baje" | `"5 baje"`, `"7 bje"`, `"5 baje shaam"` |
| Hinglish "saade" | `"saade 5"` (साढ़े 5) → 17:30 |
| Half/quarter | `"half past 2"` → 14:30, `"quarter to 3"` → 14:45 |
| O'clock | `"2 o'clock"` → 14:00 |
| Devanagari | `"५ बजे शाम"` → 17:00, `"साढ़े 5"` → 17:30 |
| Indic digits | `"५:३०"` normalized to `"5:30"` |

### Treatment Extraction

Multi-word aliases matched first (sorted by length descending), then single-word with word boundaries.

| User says | Treatment |
|---|---|
| `"root canal"`, `"nerve treatment"`, `"rct"` | Root Canal |
| `"teeth cleaning"`, `"cleaning"`, `"clean"`, `"scaling"` | Teeth Cleaning |
| `"braces"`, `"orthodontic"` | Braces |
| `"whitening"`, `"white"`, `"bleaching"` | Whitening |
| `"implants"`, `"implant"` | Implants |
| `"crowns"`, `"crown"`, `"cap"` | Crowns |
| `"general dentistry"`, `"checkup"`, `"check up"`, `"consultation"`, `"cleaning general"` | General Dentistry |
| `"pediatric dentistry"`, `"child"`, `"children"`, `"kids"`, `"baby"` | Pediatric Dentistry |

No false positives — uses word boundaries and alias priority scoring.

### Phone Extraction

| User says | Extracted |
|---|---|
| `"9876543210"` | +919876543210 |
| `"98765 43210"` | +919876543210 |
| `"+91 98765 43210"` | +919876543210 |

Validates: exactly 10 digits, starts with 6-9 (Indian mobile).

---

## 17. Validation & Error Flows

### Date validation

| User says | Bot response |
|---|---|
| `"yesterday"` or past date | "That date has passed. Please choose a future date." |
| `"kal"` | "Did you mean tomorrow? Please type 'tomorrow' or an exact date." |
| A date 60 days away | "We only book up to 30 days ahead." |

### Time validation

| User says | Bot response |
|---|---|
| `"07:00"` (before opening) | "We open at 10:00." |
| `"21:00"` (after closing) | "We close at 20:00." |
| `"10:45"` (non-30-min slot) | "Slots are every 30 minutes. Try 10:30." |
| Time already passed (today) | "That time has already passed. Please choose a later time." |

### Treatment validation

| User says | Bot response |
|---|---|
| `"surgery"` (unknown) | "Available treatments: General Dentistry, Teeth Cleaning..." |

### Unknown intent / repeated failures

**1st failure:** prompt includes field-specific hint.
**2nd failure:** simpler re-prompt.
**3rd failure (frustration score >= 4):** auto-escalate to human.

---

## 18. Session Timeout & Abandoned State

When a session has been inactive for 30 minutes:
- The session state is set to `ABANDONED`
- On the next message (non-emergency), the bot redirects to MAIN_MENU
- Any booking context is preserved in `session.context`

---

## 19. Multi-Message Support

| Message type | What the bot does |
|---|---|
| **Text** | Normalized (NFKC), whitespace condensed, case-insensitive matching |
| **Interactive (button/list tap)** | Extracts the button/list title as text → standard intent matching |
| **Image** | Extracts caption text if present; in doctor flow, saves as chit media |
| **Audio** | Records the audio ID (voice transcription placeholder) |
| **Video** | Extracts caption text if present |
| **Document** | Extracts caption text if present |
| **Location** | Captures lat/lng and address name |
| **Contacts** | Captures name and phone numbers |

---

## 20. Doctor Flows

The bot automatically detects the doctor's WhatsApp number and provides a doctor-specific interface. See [`doctor-flow.md`](doctor-flow.md) for full details.

### Doctor capabilities

- Today's appointment list with patient details
- View appointments by date
- Mark completed / no-show
- Search patients by name or phone
- Register new patients
- View patient visit history
- Log visits (treatment, fees, notes)
- Manage X-ray/photo attachments (chit media)
- Block/unblock dates (holidays, days off)
- View appointment statistics
- Receive proactive notifications (new booking, cancellation, reschedule)
- Daily morning summary (9:20 AM IST)
- Evening check-in (7:30 PM IST, reply `missed <time>` or `all good`)
- Register walk-in patients with appointments

### Doctor cron jobs

| Cron | Time (IST) | Purpose |
|---|---|---|
| `/api/cron/daily-summary` | 9:20 AM | Morning schedule to doctor |
| `/api/cron/reminders` | 11:00 PM | 24h reminder to patients |
| `/api/cron/evening-checkin` | 7:30 PM | Evening check-in with no-show tracking |

---

## Quick Reference: Common Patient Journeys

### Journey A: Full booking (step by step)

```
hi → Main Menu → tap "Book Appointment" →
  "cleaning" → Treatment picked →
  "tomorrow" → Date picked →
  "2pm" → Time picked →
  "Rahul" → Name given →
  tap "Confirm" → Booked ✅
```

### Journey B: Quick booking (single message)

```
"next Friday at 2:30pm for root canal, name Rahul" →
  Auto-fills date + time + treatment + name →
  Confirmation → tap "Confirm" → Booked ✅
```

### Journey C: Info while booking

```
...in booking flow → "location" →
  Sees clinic address →
  bot returns to booking →
  "tomorrow" → continues booking
```

### Journey D: Cancel appointment

```
...in BOOKED → "cancel appointment" →
  "Are you sure?" Yes/No →
  tap "Yes, Cancel" → Cancelled ✅
  doctor notified of cancellation
```

### Journey E: Emergency

```
Any conversation → "severe tooth pain" →
  Emergency info displayed → call clinic
```
