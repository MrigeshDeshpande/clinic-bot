# Doctor Flow — Dr. Vishnu Vardhan

> **Last updated:** May 31, 2026
> **Bot version:** Level 3 (full doctor interface, registration, visit logging, chit media, evening check-in)
> **Single-doctor clinic:** Shri Balaji Dental Clinic
> **Doctor:** Dr. Vishnu Vardhan
> **Approach:** Hardcoded WhatsApp number → automatic role detection → doctor-specific interface

---

## 1. Role Detection

Dr. Vishnu Vardhan's WhatsApp number is stored in `src/config/clinic.js`:

```js
doctor: {
  name: 'Dr. Vishnu Vardhan',
  waId: process.env.DOCTOR_WA_ID,
}
```

When ANY message arrives:
1. `getOrCreate(waId)` in `session.js` loads the session
2. After load, checks `if (waId === clinic.doctor.waId)` → sets `session.role = 'doctor'`
3. Default role (anyone else) → `session.role = 'patient'`
4. `session.role` is persisted in the session DB row under `context.role`

The doctor never types a keyword to "enter doctor mode". It's automatic.

---

## 2. State Machine — Doctor States

22 states total (all doctor-specific):

| State | When | What doctor sees |
|-------|------|-----------------|
| `IDLE` | First message or after session expiry | Doctor greeting + main menu |
| `DOCTOR_MAIN_MENU` | Default state between actions | Dashboard: today's count + 6 options |
| `DOCTOR_VIEW_DATE` | After picking "View by Date" | Date picker (quick-pick or custom) |
| `DOCTOR_APPOINTMENT_LIST` | After selecting a date | All appointments for that date |
| `DOCTOR_APPOINTMENT_DETAIL` | After tapping a specific appointment | Patient info + action buttons |
| `DOCTOR_MANAGE_SCHEDULE` | After tapping "Manage Schedule" | Block/unblock dates |
| `DOCTOR_STATS` | After tapping "Stats" | Summary counts (today, week, month) |
| `DOCTOR_SEARCH_PATIENT` | After tapping "Search Patient" | Text prompt for name/phone |
| `DOCTOR_PATIENT_VISITS` | After selecting a patient | Patient profile + visit history |
| `DOCTOR_VIEW_CHIT` | After tapping "View Chit" | List of chit media items |
| `REGISTER_NAME` | During patient registration | Prompt for patient name |
| `REGISTER_AGE` | During patient registration | Prompt for age |
| `REGISTER_SEX` | During patient registration | Prompt for sex (M/F/Other) |
| `REGISTER_PHONE` | During patient registration | Prompt for phone number |
| `REGISTER_APPOINTMENT` | During patient registration | Walk-in or appointment time |
| `LOG_TREATMENT` | During visit logging | Prompt for treatment performed |
| `LOG_CONSULTATION_FEE` | During visit logging | Prompt for consultation fee |
| `LOG_TREATMENT_CHARGES` | During visit logging | Prompt for treatment charges |
| `LOG_MEDICINE_CHARGES` | During visit logging | Prompt for medicine charges |
| `LOG_NEXT_VISIT` | During visit logging | Prompt for next visit date |
| `LOG_NOTES` | During visit logging | Prompt for notes |
| `LOG_MEDIA` | During visit logging | Prompt to attach media (X-rays, photos) |

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

        [View Today's Appointments]
        [View by Date / Calendar]
        [Search Patient]
        [Register New Patient]
        [Manage Schedule]
        [View Stats]
```

**Reply type:** Interactive list with 6 rows. If no appointments today, shows "No appointments today" instead.

**Doctor state:** `DOCTOR_MAIN_MENU`

### 3.2 Doctor taps "View Today's Appointments"

```
Bot:    "Today's Appointments — Mon 27 May

        1️⃣  09:00 — Patient A — Root Canal
              📞 +91-XXXXXXXXX

        2️⃣  10:30 — Patient B — Teeth Cleaning

        3️⃣  14:00 — Patient C — General Checkup

        Tap an appointment to view details."

        [Appointment 1] [Appointment 2]
        [Appointment 3] ...
        [← Back]
```

**Doctor state:** `DOCTOR_APPOINTMENT_LIST`

### 3.3 Doctor taps an appointment

```
Bot:    "📋 Appointment Details
        ─────────────────────
        Patient:   Patient A
        Time:      09:00 — 09:30
        Treatment: Root Canal
        Phone:     +91-XXXXXXXXX
        Status:    ✅ Confirmed
        Chit Media: 0 attachments"

        [Mark Completed] [No Show] [View Chit]
        [Add Chit] [← Back]
```

**Reply type:** Up to 5 buttons (sent as 2 messages of 3 + 2, or list).

**Doctor state:** `DOCTOR_APPOINTMENT_DETAIL`

### 3.4 Doctor taps "Mark Completed"

Triggers a visit logging flow:
```
Bot:    "What treatment was performed?"
```
Then proceeds through: `LOG_TREATMENT` → `LOG_CONSULTATION_FEE` → `LOG_TREATMENT_CHARGES` → `LOG_MEDICINE_CHARGES` → `LOG_NEXT_VISIT` → `LOG_NOTES` → `LOG_MEDIA`.

At each step the doctor can type a value or "none" to skip.

```
Bot:    "✅ Visit logged successfully!
        Patient A — Root Canal at 09:00 is done.

        [Today's List] [Main Menu] [Next Appointment]
```

**Patient also receives an automated WhatsApp summary** of the completed visit.

### 3.5 Doctor taps "No Show"

```
Bot:    "✗ Marked as No Show.
        Patient A — Root Canal at 09:00.

        [Today's List] [Main Menu] [Next Appointment]
```

**DB action:** Updates appointment status to `'no_show'`. No visit logging flow.

### 3.6 Doctor taps "View Chit"

```
Bot:    "Chit Media — Patient A
        ─────────────────────
        1. X-ray (uploaded 27 May 14:30)
        2. Photo (uploaded 27 May 14:35)

        Tap a number to view the image or document."
```

### 3.7 Doctor taps "Add Chit"

The bot prompts the doctor to send an image/document. When received, it downloads from Meta, uploads to Cloudflare R2, and links to the appointment.

### 3.8 Doctor taps "View by Date / Calendar" from main menu

```
Bot:    "Which date would you like to check?"

        [Today] [Tomorrow] [Next Monday]
        [Pick a date…] [← Back]
```

**Doctor state:** `DOCTOR_VIEW_DATE`

After selecting a date → transitions to `DOCTOR_APPOINTMENT_LIST` for that date.

### 3.9 Doctor taps "Search Patient"

```
Bot:    "Enter a patient name or phone number to search."
```

Doctor types a name or partial phone number → bot searches via ILIKE on `patients.name` and `patients.phone` → shows up to 10 matches.

Single match → shows patient profile + visit history.
Multiple matches → shows a list to pick from.

### 3.10 Doctor taps "Register New Patient"

Starts registration flow:
1. `REGISTER_NAME` — "What is the patient's name?"
2. `REGISTER_AGE` — "What is the patient's age?" (0-150)
3. `REGISTER_SEX` — "Sex: M / F / Other"
4. `REGISTER_PHONE` — "Phone number?" (10-digit Indian mobile)
5. `REGISTER_APPOINTMENT` — "Walk-in now or book a time?"

At end: patient created in DB, optionally with an appointment. Returns to DOCTOR_MAIN_MENU.

### 3.11 Doctor taps "Manage Schedule" from main menu

```
Bot:    "Manage Schedule
        ────────────────
        Blocked dates:  15 June (Vacation)

        [Block a Date] [View Blocked Dates] [← Back]
```

**Block a Date:** Doctor types a date → blocks it → no appointments can be booked.
**View Blocked Dates:** Shows list with `[Unblock]` button per entry.

### 3.12 Doctor taps "Stats" from main menu

```
Bot:    "📊 Appointment Statistics
        ─────────────────────
        Today:     4 appointments (2 pending)
        This week: 18 appointments
        This month: 72 appointments

        [Today's List] [Main Menu] [← Back]
```

### 3.13 Evening Check-in (7:30 PM IST — automated)

The bot sends an automated evening summary. The doctor can reply:
- `missed 10:00` → marks the 10:00 appointment as no-show
- `missed 2:30` → marks the 2:30 appointment as no-show
- `all good` → acknowledges, no action needed

---

## 4. Transitions Table

```
DOCTOR_MAIN_MENU:
  doctor_view_today, doctor_view_by_date, doctor_manage_schedule,
  doctor_view_stats, doctor_register_patient, doctor_search_patient,
  back, emergency, escalate, greeting

DOCTOR_APPOINTMENT_LIST:
  doctor_appt_detail, back, emergency, escalate

DOCTOR_APPOINTMENT_DETAIL:
  doctor_mark_completed, doctor_mark_noshow, doctor_view_chit,
  doctor_add_chit, back, emergency, escalate

DOCTOR_VIEW_DATE:
  provide_date, date_custom, back, emergency, escalate

DOCTOR_MANAGE_SCHEDULE:
  doctor_block_date, doctor_view_blocked, back, emergency, escalate

DOCTOR_STATS:
  back, emergency, escalate

DOCTOR_SEARCH_PATIENT:
  provide_search_query, select_patient, back, emergency, escalate

DOCTOR_PATIENT_VISITS:
  doctor_appt_detail, back, emergency, escalate

DOCTOR_VIEW_CHIT:
  view_media, back, emergency, escalate

REGISTER_NAME:
  provide_name, back, emergency, escalate

REGISTER_AGE:
  provide_age, back, emergency, escalate

REGISTER_SEX:
  provide_sex, back, emergency, escalate

REGISTER_PHONE:
  provide_phone, back, emergency, escalate

REGISTER_APPOINTMENT:
  provide_appointment_time, walk_in, back, emergency, escalate

LOG_TREATMENT:
  provide_log_treatment, back, emergency, escalate

LOG_CONSULTATION_FEE:
  provide_fee, back, emergency, escalate

LOG_TREATMENT_CHARGES:
  provide_fee, back, emergency, escalate

LOG_MEDICINE_CHARGES:
  provide_fee, back, emergency, escalate

LOG_NEXT_VISIT:
  provide_next_visit, no_next_visit, back, emergency, escalate

LOG_NOTES:
  provide_notes, no_notes, back, emergency, escalate

LOG_MEDIA:
  provide_media, skip_media, back, emergency, escalate
```

---

## 5. Intent Mapping

### Interactive IDs (in `ID_TO_INTENT` in router.js)

| Row ID | Intent |
|--------|--------|
| `doc_today` | `doctor_view_today` |
| `doc_by_date` | `doctor_view_by_date` |
| `doc_search` | `doctor_search_patient` |
| `doc_register` | `doctor_register_patient` |
| `doc_schedule` | `doctor_manage_schedule` |
| `doc_stats` | `doctor_view_stats` |
| `doc_back` | `back` |
| `mark_done` | `doctor_mark_completed` |
| `mark_noshow` | `doctor_mark_noshow` |
| `view_chit` | `doctor_view_chit` |
| `add_chit` | `doctor_add_chit` |
| `unblock_<date>` | `doctor_unblock_date` |
| `block_date` | `doctor_block_date` |
| `view_blocked` | `doctor_view_blocked` |
| `select_patient_<id>` | `select_patient` |
| `walk_in` | `walk_in` |

---

## 6. Proactive Notifications (Doctor is Never Polled)

The bot pushes notifications to the doctor in real-time. The doctor never polls or pings to check status.

### Notification Events

| Event | When | Message to Doctor |
|-------|------|-------------------|
| **New booking** | Patient confirms appointment | `"🆕 New Booking!\nPatient A — Root Canal\nTomorrow at 10:00 AM\n📞 +91-XXXXXXXXX"` |
| **Cancellation** | Patient cancels appointment | `"❌ Cancellation\nPatient A — Root Canal\nMon 27 May at 10:00 AM"` |
| **Reschedule** | Patient changes date/time | `"🔄 Rescheduled\nPatient A — Root Canal\nFROM: Mon 27 May 10:00\nTO: Tue 28 May 14:00"` |
| **Daily summary** | 9:20 AM IST via cron | `"☀️ Good morning!\nToday's Schedule\n─────────────────\n09:00 — Patient A — Root Canal\n...\nTotal: 4 appointments"` |
| **Evening check-in** | 7:30 PM IST via cron | `"🌆 Evening check-in\nPatients seen today: X\nReply 'missed <time>' for no-shows or 'all good'"` |

### Implementation

All notifications are **fire-and-forget** — the patient-facing reply is sent first, then the notification `.catch()` logs errors without blocking the response.

---

## 7. DB Schema

### `appointments` table (key columns)

| Column | Type | Notes |
|--------|------|-------|
| `status` | VARCHAR(20) | confirmed, cancelled, completed, no_show |
| `logical_id` | UUID | Stable identity across reschedules |
| `version` | INTEGER | Monotonically increasing |
| `superseded_at` | TIMESTAMPTZ | When this version was replaced |
| `patient_id` | UUID | FK → patients(id) |
| `chit_media` | TEXT[] | Array of R2 keys |
| `consultation_fee`, `treatment_charges`, `medicine_charges` | INTEGER | From visit logging |
| `notes` | TEXT | Visit notes |
| `reminder_sent_at` | TIMESTAMPTZ | When reminder was sent |

### `blocked_dates` table

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `date` | DATE | UNIQUE, NOT NULL |
| `reason` | VARCHAR(100) | Optional |
| `created_at` | TIMESTAMPTZ | |

### `patients` table

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `wa_id` | VARCHAR(50) | |
| `name` | VARCHAR(100) | NOT NULL |
| `age` | INTEGER | |
| `sex` | VARCHAR(10) | |
| `phone` | VARCHAR(20) | UNIQUE, NOT NULL |

---

## 8. Cron Jobs

| Endpoint | Schedule (UTC) | IST | Purpose |
|---|---|---|---|
| `/api/cron/daily-summary` | `50 3 * * *` | 9:20 AM | Morning schedule to doctor |
| `/api/cron/reminders` | `30 17 * * *` | 11:00 PM | 24h reminders to patients |
| `/api/cron/evening-checkin` | `0 14 * * *` | 7:30 PM | Evening check-in with no-show tracking |

All cron endpoints require `Authorization: Bearer <CRON_SECRET>`.

---

## 9. Edge Cases

| Scenario | Handling |
|----------|----------|
| No appointments today | "You have no appointments today. Would you like to check another date?" |
| Date has no appointments | "No appointments on [date]. [Try another date] [← Back]" |
| Appointment already completed | Shows status as completed with timestamp |
| Doctor sends media outside appt detail | Asks "Which patient is this for?" and searches by name |
| Doctor messages outside clinic hours | Same interface — no special handling needed |
| Session expires | 30-min cache, then ABANDONED → greeting on re-engagement |
| Evening check-in with no appointments | Shows "No appointments today. Have a good evening!" |

---

## 10. Example Conversation (Full)

```
Dr:    "Hi"
Bot:   "Good morning! You have 4 appointments today. [6-option list]"

Dr:    taps "View Today's Appointments"
Bot:   "Today's Appointments [list of 4]"

Dr:    taps "10:30 — Patient B — Cleaning"
Bot:   "Patient B | 10:30 | Cleaning | +91-XXXXXXXXX
        [Mark Completed] [No Show] [View Chit] [Add Chit] [← Back]"

Dr:    taps "Mark Completed"
Bot:   "What treatment was performed?"
  → ...visit logging flow...
Bot:   "✅ Visit logged! Patient notified."

Dr:    taps "Main Menu"
Bot:   "Good afternoon. You have 3 appointments remaining today. [6-option list]"
```
