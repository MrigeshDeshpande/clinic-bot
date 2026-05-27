# Doctor Flow — Dr. Vishnu Vardhan

> **Date:** 2026-05-27
> **Single-doctor clinic:** Shri Balaji Dental Clinic
> **Doctor:** Dr. Vishnu Vardhan
> **Approach:** Hardcoded WhatsApp number → automatic role detection → doctor-specific interface

---

## 1. Role Detection

Dr. Vishnu Vardhan's WhatsApp number is stored in `src/config/clinic.js`:

```js
doctor: {
  name: 'Dr. Vishnu Vardhan',
  waId: '919XXXXXXXXX',
}
```

When ANY message arrives:
1. `getOrCreate(waId)` in `session.js` loads the session
2. After load, check `if (waId === clinic.doctor.waId)` → set `session.role = 'doctor'`
3. Default role (anyone else) → `session.role = 'patient'`
4. `session.role` is persisted in the session DB row under `context.role`

The doctor never types a keyword to "enter doctor mode". It's automatic.

---

## 2. State Machine — Doctor States

9 states total (4 new, 5 shared with patient flow but never reached by doctor):

| State | When | What doctor sees |
|-------|------|-----------------|
| `IDLE` | First message or after session expiry | Doctor greeting + main menu |
| `DOCTOR_MAIN_MENU` | Default state between actions | Dashboard: today's count + options |
| `DOCTOR_VIEW_DATE` | After picking "View by Date" | Calendar/list of dates |
| `DOCTOR_APPOINTMENT_LIST` | After selecting a date | All appointments for that date |
| `DOCTOR_APPOINTMENT_DETAIL` | After tapping a specific appointment | Patient info + action buttons |
| `DOCTOR_MANAGE_SCHEDULE` | After tapping "Manage Schedule" | Block/unblock dates |
| `DOCTOR_STATS` | After tapping "Stats" | Summary counts |
| `DONE` | Terminal | (same as patient) |
| `ABANDONED` | Session expired | Same greeting as IDLE |

**States the doctor never enters:** `MAIN_MENU`, `BOOKING_COLLECTION`, `BOOKING_CONFIRMATION`, `BOOKED`, `SERVICES`, `LOCATION`, `TIMINGS`, `EMERGENCY`, `HUMAN_ESCALATION`, `CALLBACK_REQUESTED`, `CANCEL_CONFIRM`

---

## 3. Complete Flow Walkthrough

### 3.1 First interaction — Doctor says "Hi"

```
Doctor: "Hi"
Bot:    "Good morning, Dr. Vishnu Vardhan! ☀️
        You have 4 appointments today.

        📋 Today's Summary
        ─────────────────────
        09:00 — Patient name — Root Canal
        10:30 — Patient name — Cleaning
        14:00 — Patient name — Checkup
        16:30 — Patient name — Whitening"

        [View Details] [By Date] [Schedule] [Stats]
```

**Reply type:** Interactive list with 1 section, 4 rows.

| Row ID | Title | Description |
|--------|-------|-------------|
| `doc_today` | View Today's Details | See full details for each appointment |
| `doc_by_date` | View by Date | Pick another date |
| `doc_schedule` | Manage Schedule | Block/unblock dates |
| `doc_stats` | Stats | Appointment counts |

**Doctor state:** `DOCTOR_MAIN_MENU`

---

### 3.2 Doctor taps "View Today's Details"

```
Bot:    "Today's Appointments — Mon 27 May

        1️⃣  09:00 — Patient A — Root Canal
              📞 +91-XXXXXXXXX

        2️⃣  10:30 — Patient B — Teeth Cleaning

        3️⃣  14:00 — Patient C — General Checkup

        4️⃣  16:30 — Patient D — Whitening

        Tap an appointment to view details."

        [Appointment 1] [Appointment 2]
        [Appointment 3] [Appointment 4]
        [← Back]
```

**Reply type:** Interactive list with patient names as row titles, time+treatment as description.

**Doctor state:** `DOCTOR_APPOINTMENT_LIST`

**Limits:** WhatsApp allows max 10 rows. If >10 appointments, truncate with "And X more…" row.

---

### 3.3 Doctor taps appointment #1

```
Bot:    "📋 Appointment Details
        ─────────────────────
        Patient:   Patient A
        Time:      09:00 — 09:30
        Treatment: Root Canal
        Phone:     +91-XXXXXXXXX
        Status:    ✅ Confirmed"

        [Mark Completed] [No Show] [← Back]
```

**Reply type:** 3 buttons (max allowed by WhatsApp).

| Button ID | Title |
|-----------|-------|
| `mark_done` | Mark Completed ✓ |
| `mark_noshow` | No Show ✗ |
| `doc_back` | ← Back |

**Doctor state:** `DOCTOR_APPOINTMENT_DETAIL`

---

### 3.4 Doctor taps "Mark Completed"

```
Bot:    "✅ Appointment marked as completed.
        Patient A — Root Canal at 09:00 is done.

        [Today's List] [Main Menu] [Next Appointment]
```

**Reply type:** 3 buttons.

**DB action:** Updates appointment status to `'completed'`.

---

### 3.5 Doctor taps "No Show"

```
Bot:    "✗ Marked as No Show.
        Patient A — Root Canal at 09:00.

        [Today's List] [Main Menu] [Next Appointment]
```

**Reply type:** 3 buttons.

**DB action:** Updates appointment status to `'no_show'`.

---

### 3.6 Doctor taps "View by Date" from main menu

```
Bot:    "Which date would you like to check?"

        [Today] [Tomorrow] [Next Monday]
        [Pick a date…] [← Back]
```

**Reply type:** Interactive list — reuses the existing date picker infrastructure (`getDateQuickPickSections`).

When tapped "Pick a date…" → `date_custom` intent → doctor types a date → validates → shows that date's appointments.

**Doctor state:** `DOCTOR_VIEW_DATE`

After selecting a date → transitions to `DOCTOR_APPOINTMENT_LIST` for that date.

---

### 3.7 Doctor taps "Manage Schedule" from main menu

```
Bot:    "Manage Schedule
        ────────────────
        Blocked dates:  None

        [Block a Date] [View Blocked Dates] [← Back]
```

**Reply type:** 3 buttons or interactive list.

**Block a Date flow:**
1. Doctor taps "Block a Date"
2. Bot: "Which date would you like to block? (e.g., 15 June)"
3. Doctor types a date
4. Bot: "✅ Blocked 15 June. No appointments will be scheduled."
5. DB: Inserts into a `blocked_dates` table (or a `doctor_schedule` table)

**View Blocked Dates flow:**
1. Doctor taps "View Blocked Dates"
2. Bot shows list of blocked dates
3. Option to unblock: "Tap a date to unblock"

---

### 3.8 Doctor taps "Stats" from main menu

```
Bot:    "📊 Appointment Statistics
        ─────────────────────
        Today:     4 appointments (2 pending)
        This week: 18 appointments
        Next week: 22 appointments
        Total confirmed: 40

        [Today's List] [Main Menu] [← Back]
```

**Reply type:** 3 buttons or interactive list.

---

## 4. Transitions Table

```
DOCTOR_MAIN_MENU:
  doc_today, doc_by_date, doc_schedule, doc_stats, main_menu, emergency, escalate

DOCTOR_APPOINTMENT_LIST:
  doc_appt_<id>, back, main_menu, emergency, escalate

DOCTOR_APPOINTMENT_DETAIL:
  mark_done, mark_noshow, doc_back, back, main_menu, emergency, escalate

DOCTOR_VIEW_DATE:
  provide_date, date_custom, back, main_menu, emergency, escalate

DOCTOR_MANAGE_SCHEDULE:
  block_date, view_blocked, back, main_menu, emergency, escalate
```

---

## 5. Intent Mapping

### Interactive IDs (in `ID_TO_INTENT` in router.js)

| Row ID | Intent |
|--------|--------|
| `doc_today` | `doctor_view_today` |
| `doc_by_date` | `doctor_view_by_date` |
| `doc_schedule` | `doctor_manage_schedule` |
| `doc_stats` | `doctor_view_stats` |
| `doc_back` | `back` |
| `mark_done` | `doctor_mark_completed` |
| `mark_noshow` | `doctor_mark_noshow` |
| `block_date` | `doctor_block_date` |
| `view_blocked` | `doctor_view_blocked` |

### State intents for DOCTOR_APPOINTMENT_DETAIL

| Intent | Keywords |
|--------|----------|
| `doctor_mark_completed` | done, complete, finished, mark done, completed |
| `doctor_mark_noshow` | no show, didn't come, missed, noshow |

---

## 6. Routing Logic (in `handle()` dispatch)

```js
if (session.context?.role === 'doctor') {
  return handleDoctorDispatch(session, normalized, entities, intent);
}
// else: existing patient flow
```

`handleDoctorDispatch` follows the same pattern as the patient dispatcher:
1. Global intents first (emergency, escalate, cancel, main_menu, back, greeting)
2. Doctor-specific intents for the current state
3. Entity-derived intents (provide_date for "View by Date" flow)
4. Fallback → re-prompt current doctor state

---

## 7. Session Model Extension

```js
// New field in session.context:
{
  role: 'doctor',          // 'patient' | 'doctor'
  // ... existing fields unchanged
}
```

No changes to `booking` fields — the doctor never uses them.

---

## 8. DB Changes

### New table: `blocked_dates`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `date` | DATE | NOT NULL, UNIQUE |
| `reason` | VARCHAR(100) | Optional — e.g., "Vacation" |
| `created_at` | TIMESTAMPTZ | |

### No changes to `appointments` table.

The appointment schema already has `status` (`confirmed`, `cancelled`, `completed`, `no_show`) — all doctor actions map neatly onto existing statuses.

---

## 9. Display Summary for Patient

In the patient confirmation and booking summary, append "with Dr. Vishnu Vardhan":

```js
// In buildConfirmationBody and showBookedSummary
body += `Doctor: Dr. Vishnu Vardhan\n`;
```

No DB lookup needed — single doctor is hardcoded.

---

## 10. Files to Change

| File | Change |
|------|--------|
| `src/config/clinic.js` | Add `doctor` object with name + waId |
| `src/config/states.js` | Add doctor states + transitions |
| `src/config/intents.js` | Add doctor-specific intents |
| `src/lib/router.js` | Add doctor interactive IDs + doctor state intents |
| `src/lib/handlers.js` | New `handleDoctorDispatch()` + 7 doctor handler functions |
| `src/lib/session.js` | Add `role` detection on `getOrCreate()` |
| `src/lib/engine.js` | Route by role after `classifyIntent()` |
| `src/lib/transitions.js` | Add doctor state transitions |
| `src/db/pool.js` | Migration for `blocked_dates` table |
| `src/db/repositories/appointmentRepository.js` | Add `fetchAppointmentsByDate(waId, date)` and `updateAppointmentStatus(id, status)` |

---

## 11. Doctor Handler Functions

| Function | Handles |
|----------|---------|
| `handleDoctorDispatch(session, normalized, entities, intent)` | Route to correct doctor handler |
| `handleDoctorGreeting(session)` | Dashboard: today's count + mini list + main menu |
| `handleDoctorMainMenu(session)` | Main menu list (Today, By Date, Schedule, Stats) |
| `handleDoctorViewToday(session)` | Fetch today's appointments → list |
| `handleDoctorViewByDate(session, entities)` | Date picker → fetch → list |
| `handleDoctorAppointmentList(session, date)` | Show appointment list for a date |
| `handleDoctorAppointmentDetail(session, appointmentId)` | Show single appointment + action buttons |
| `handleDoctorMarkCompleted(session, appointmentId)` | Set status = 'completed' |
| `handleDoctorMarkNoshow(session, appointmentId)` | Set status = 'no_show' |
| `handleDoctorManageSchedule(session)` | Block/unblock dates interface |
| `handleDoctorBlockDate(session, date)` | INSERT blocked_date |
| `handleDoctorViewBlocked(session)` | List blocked dates with unblock option |
| `handleDoctorStats(session)` | Count query grouped by status |

---

## 12. Example Conversation (Full)

```
Dr:    "Hi"
Bot:   "Good morning, Dr. Vishnu Vardhan! ☀️
        You have 4 appointments today. [list with 4 slots]
        [View Details] [By Date] [Schedule] [Stats]"

Dr:    taps "View Details"
Bot:   "Today's Appointments — Mon 27 May [list of 4]"

Dr:    taps "10:30 — Patient B — Cleaning"
Bot:   "Patient B | 10:30 | Cleaning | +91-XXXXXXXXX
        [Mark Completed] [No Show] [← Back]"

Dr:    taps "Mark Completed"
Bot:   "✅ Marked as completed.
        [Today's List] [Main Menu]"

Dr:    taps "Main Menu"
Bot:   "Good afternoon. You have 3 appointments remaining today.
        [View Details] [By Date] [Schedule] [Stats]"
```

---

## 13. Proactive Notifications (Doctor is Never Polled)

The bot must push notifications to the doctor. The doctor never polls or pings to check status.

### Notification Events

| Event | When | Message to Doctor |
|-------|------|-------------------|
| **New booking** | Patient confirms appointment | `"🆕 New Booking!\nPatient A — Root Canal\nTomorrow at 10:00 AM\n📞 +91-XXXXXXXXX"` |
| **Cancellation** | Patient cancels appointment | `"❌ Cancellation\nPatient A — Root Canal\nMon 27 May at 10:00 AM\nReason: Patient cancelled"` |
| **Reschedule** | Patient changes date/time | `"🔄 Rescheduled\nPatient A — Root Canal\nFROM: Mon 27 May 10:00\nTO: Tue 28 May 14:00"` |
| **Daily summary** | Every morning at 8:00 AM | `"☀️ Good morning!\nToday's Schedule (8 May)\n─────────────────\n09:00 — Patient A — Root Canal\n10:30 — Patient B — Cleaning\n...\nTotal: 4 appointments"` |
| **No-show alert** | Doctor marks no-show | No notification needed (doctor triggered it) |

### Implementation

**Outgoing notifications** use the same WhatsApp API as patient replies — a simple `sendText()` call:

```js
import { sendText } from '@/lib/whatsapp';

async function notifyDoctor(body) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const to = CLINIC.doctor.waId;
  return sendText(phoneNumberId, to, body);
}
```

### Where notifications fire

| File | Location | Event |
|------|----------|-------|
| `src/lib/handlers.js` | In `handleBookingConfirmation`, after `createAppointment()` succeeds | New booking |
| `src/lib/handlers.js` | In `handleCancelConfirm`, after `cancelAppointment()` succeeds | Cancellation |
| `src/lib/handlers.js` | In `handleBookingConfirmation`, after `supersedeAppointment()` succeeds | Reschedule |
| New scheduled job | `src/lib/dailySummary.js` — runs on cron at 8 AM | Daily summary |

### Non-blocking

All notifications are **fire-and-forget** — the patient-facing reply is sent first, then the notification `.catch()` logs errors without blocking the response:

```js
// In handler, after successful booking:
notifyDoctor(`🆕 New Booking!\n${patientName} — ${treatment}\n${date} at ${time}`)
  .catch(err => logger.error('DOCTOR_NOTIFY_FAILED', err));
```

### Daily Summary

A separate module (`src/lib/dailySummary.js`) runs on a cron schedule:

```js
// Wrapped in a lightweight cron — runs once daily at 8 AM
import { cron } from 'some-lightweight-scheduler';

cron.schedule('0 8 * * *', async () => {
  const appointments = await fetchAppointmentsByDate(today);
  if (appointments.length === 0) {
    await notifyDoctor('☀️ Good morning! No appointments scheduled today.');
    return;
  }
  let body = `☀️ Good morning!\nToday's Schedule (${formattedDate})\n`;
  body += `─────────────────\n`;
  for (const apt of appointments) {
    body += `${apt.time} — ${apt.patientName} — ${apt.treatment}\n`;
  }
  body += `\nTotal: ${appointments.length} appointment${appointments.length > 1 ? 's' : ''}`;
  await notifyDoctor(body);
});
```

If no cron library is desired, an alternative is to send the daily summary **on the doctor's first message of the day** — when he messages the bot, the greeting includes the full schedule. This avoids adding any scheduled infrastructure.

### Doctor never needs to ask "What's my schedule?"

The first message of the day (or the daily push at 8 AM) answers that before he asks. Throughout the day, every booking/cancellation/reschedule is pushed in real-time.

---

## 14. Edge Cases

| Scenario | Handling |
|----------|----------|
| No appointments today | "You have no appointments today. Would you like to check another date?" |
| Date has no appointments | "No appointments on [date]. [Try another date] [← Back]" |
| Doctor blocks a date that has appointments | "⚠️ You have 2 appointments on 15 June. Blocking will cancel them. [Confirm Block] [Cancel]" |
| Appointment already completed | "This appointment was already marked completed at 09:15." |
| Doctor messages outside clinic hours | Same interface — no special handling needed |
| Patient messages doctor's number | Can't happen — doctor's waId is a different WhatsApp number |
| Doctor's session expires | Same as patient — cached for 30 min, then ABANDONED → greeting on re-engagement |

---

## 15. Implementation Order

1. **Config**: Add doctor waId to `clinic.js`, add states to `states.js`, add intents to `intents.js`
2. **Session**: Add `role` detection in `getOrCreate()`
3. **Router**: Add doctor interactive IDs and state intents
4. **Transitions**: Add doctor state transitions
5. **Handlers**: Write `handleDoctorDispatch()` and all 12 doctor handler functions
6. **Engine**: Add role-based routing
7. **DB**: Migration for `blocked_dates`, add appointment query functions
8. **Display**: Add "with Dr. Vishnu Vardhan" to patient confirmation
