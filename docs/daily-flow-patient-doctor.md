# Daily Flow Guide (Patient + Doctor)

This is a simple day-to-day flow of how the bot works for patients and doctor.

---

## 1) Start of Day (Doctor)

1. A scheduled cron sends the doctor a morning summary at **9:20 AM IST**.
2. The summary includes today's appointments with patient name, time, phone, and treatment (or says no appointments).
3. Doctor can open the bot and use quick options:
   - Today's Appointments
   - View by Date
   - Manage Schedule
   - View Stats

---

## 2) Patient Main Flow

### Step A: Patient says "Hi"

Bot shows menu:
- Book Appointment
- Dental Services
- Clinic Location
- Clinic Timings

### Step B: Patient starts booking

Booking collection happens in this order:
1. Treatment
2. Date
3. Time
4. Patient Name
5. Confirmation

After confirmation, bot creates appointment and moves patient to booked state.

### Step C: After booking

Patient can:
- Book another
- Reschedule
- Cancel
- Go to main menu

---

## 3) Patient Side Cases During Booking

### Corrections (supported)

Patient can change details naturally, for example:
- "Actually Wednesday"
- "Change time"
- "No, not that treatment"

Bot updates the right field and continues.

### Interruptions (supported)

Patient can type:
- `menu` -> go to main menu
- `back` -> go one step back
- `cancel` -> stop current booking flow
- `help` -> get guidance

### Escalation and emergency

- If patient asks for human help (`agent`, `human`), bot moves to human escalation.
- If emergency words are detected (`severe pain`, `bleeding`, etc.), bot gives urgent guidance and clinic contact.

---

## 4) Reminder Flow (Patient)

1. A scheduled cron sends patients a night-before reminder at **11:00 PM IST** for the next day's appointments.
2. Message includes date, time, treatment, and clinic name.
3. Patient can reply:
   - `confirm` -> bot confirms appointment is still on
   - `cancel` -> bot starts cancellation confirmation flow

---

## 5) Doctor Main Flow

### A) Today's Appointments

1. Doctor taps "Today's Appointments".
2. Bot shows today's list sorted by time.
3. Doctor taps one appointment to open details.

### B) Appointment Detail

Doctor can mark:
- Completed
- No Show

If marked completed, bot sends feedback request to patient.

### C) View by Date

1. Doctor chooses "View by Date".
2. Doctor picks or types a date.
3. Bot shows appointments for that date.

### D) Manage Schedule

Doctor can:
- Block a date
- View blocked dates
- Unblock a date

### E) Stats

Doctor can view appointment counts from stats view.

---

## 6) End of Day (Evening Check-in)

1. A scheduled cron sends the doctor an **evening check-in** at **7:30 PM IST** (just before 8 PM close).
2. Message lists all of today's appointments with patient name, time, phone, and treatment.
3. Doctor can reply directly to the message:
   - `missed <time>` (e.g., `missed 11:30`) — marks that appointment as **No Show**
   - `all good` — acknowledges everyone showed up
4. Doctor can also use the bot menu normally to mark appointments as Completed or No Show from the appointment detail view.

## 7) End of Day Session Behavior

- Sessions expire after inactivity.
- If patient returns later, bot can resume or start fresh based on state.
- New messages continue through webhook pipeline as usual.

---

## 8) Reliability Notes

- Duplicate webhook events are handled safely.
- Booking state is protected with session/version logic.
- If interactive message send fails, text fallback is used.

---

## 9) Quick Summary

- Patient flow: menu -> booking fields -> confirm -> manage booking.
- Doctor flow: morning summary -> day ops (view/update/manage) -> evening check-in -> close.
- Automation: morning summary at 9:20 AM, evening check-in at 7:30 PM, patient reminders at 11 PM.
