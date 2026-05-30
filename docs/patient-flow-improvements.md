# Patient-Facing Improvements

> **Date:** 2026-05-30
> **Scope:** 4 improvements to enhance patient experience

---

## 1. Reminder Reply Handling

**Problem:** The 24h reminder message said *"Reply confirm to keep it or cancel to cancel"* but the bot never handled those replies. Patients who replied were ignored.

**Changes:**

### `handleAffirm` (`src/lib/handlers.js`)
- Made async
- When user says "confirm" (or "ok"/"yes") in IDLE/MAIN_MENU/DONE state, looks up upcoming appointments via `findUpcomingByWaId`
- If an upcoming appointment exists, responds with:
  > "Great! Your appointment on [date] at [time] is confirmed. See you then! 😊"

### `handleCancel` (`src/lib/handlers.js`)
- Made async
- When user says "cancel" in IDLE/MAIN_MENU/DONE with no `appointmentId` in session context, looks up upcoming appointments from DB
- If found, loads the appointment into session context and starts the cancel flow (confirmation prompt)

---

## 2. Patient Name Collection

**Problem:** The booking flow collected date, time, and treatment but never asked for the patient's name. It silently used the WhatsApp profile name, which could be wrong (especially for pediatric visits or booking for someone else).

**Changes:**

### `computePendingFields` (`src/lib/entities.js`)
- After date, time, and treatment are all set, adds `patientName` as a pending field

### `buildFieldPrompt` (`src/lib/handlers.js`)
- Added optional `session` parameter (5th param)
- Added `patientName` case showing:
  > "What name should the appointment be under? (default: [WhatsApp name] — type "ok" to use this)"

### `buildFieldAck` (`src/lib/handlers.js`)
- Added `patientName` acknowledgments: "Thanks, [name]!" / "[name] — noted!"

### `handleBookingCollection` (`src/lib/handlers.js`)
- Added `patientName` validation: accepts any non-empty text
- Allows `unknown` intent to fall through to field processing when `patientName` is the current pending field

### `handleAffirm` (`src/lib/handlers.js`)
- When `patientName` is the pending field and user says "ok"/"yes", accepts the WhatsApp profile name as the patient name

### `buildConfirmationBody` (`src/lib/handlers.js`)
- Uses `booking.patientName` (collected name) first, falls back to WhatsApp profile name

### `createAppointment` call (`src/lib/handlers.js`)
- Passes `booking.patientName || session.profileName` to appointment creation

### Flow
```
Date → Time → Treatment → "What name?" → Confirmation (shows name) → Booked
```

---

## 3. Post-Appointment Feedback

**Problem:** After a completed appointment, there was no follow-up to the patient — no thank you, no feedback request, no aftercare.

**Changes:**

### `handleMarkAppointment` (`src/lib/handlers.js`)
- After marking an appointment as "completed", fires `sendFeedbackRequest` asynchronously

### `sendFeedbackRequest` (`src/lib/handlers.js`)
- New function (lines 2296-2300)
- Sends to patient's `waId`:
  > "Hi [name]! 👋 We hope your visit went well! We'd love to hear your feedback. Reply with a rating (1-5) or share your experience."

---

## 4. Time Quick-Pick Filters Past Times

**Problem:** When booking for today, the time quick-pick suggested slots (first, middle, last of the day) that had already passed, causing validation errors.

**Changes:**

### `timeQuickPickSections` (`src/lib/handlers.js`)
- Added `bookingDate` parameter
- If the booking date is today, filters out slots that have already passed (based on current time)
- Only shows future available slots in the 3 quick-pick suggestions

### `timeQuickPickSectionsWithBack` (`src/lib/handlers.js`)
- Passes `bookingDate` through to `timeQuickPickSections`

### Call sites updated
- `getTimeListReply` — passes `booking?.date`
- `handleGreeting` — passes `session.context?.booking?.date`
- `buildFieldPrompt` — passes `booking?.date`
