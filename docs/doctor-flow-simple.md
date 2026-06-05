# Dr. Vishnu Vardhan — WhatsApp Bot Guide

> This document explains how the clinic's WhatsApp bot works for you, the doctor.

---

## How It Works for You

Your WhatsApp number is registered with the bot. When you message the clinic number, the bot instantly recognizes you as Dr. Vishnu Vardhan and shows you a **doctor dashboard** — not the patient booking flow.

Patients using the bot never see this dashboard. They only see the booking flow.

---

## What You See When You Message

### First message of the day

```
You: "Hi"
Bot: Good morning, Dr. Vishnu Vardhan! ☀️
     You have 4 appointments today.

     📋 Today's Summary
     ─────────────────────
     09:00 — Rajesh Kumar — Root Canal
     10:30 — Priya Sharma — Teeth Cleaning
     14:00 — Anand Rao — General Checkup
     16:30 — Sneha Patel — Whitening

     Tap an option below:
     [View Details] [By Date] [Schedule] [Stats]
```

The bot shows you:
- A greeting
- How many patients you have today
- A quick list of all appointments with time, patient name, and treatment
- 4 options to choose from

---

## The 4 Main Options

### 1. View Today's Details

Tap this to see each appointment as a separate item:

```
Bot: Today's Appointments — Mon 27 May

     1️⃣  09:00 — Rajesh Kumar — Root Canal
           📞 +91-9876543210

     2️⃣  10:30 — Priya Sharma — Teeth Cleaning

     3️⃣  14:00 — Anand Rao — General Checkup

     4️⃣  16:30 — Sneha Patel — Whitening

     Tap an appointment to see full details.
     [Appointment 1] [Appointment 2]
     [Appointment 3] [Appointment 4]
     [← Back]
```

Tap any appointment to see patient details and take action.

### 2. View by Date

Want to check another day? Tap this and pick a date:

```
Bot: Which date would you like to check?
     [Today] [Tomorrow] [Next Monday]
     [Pick a date…] [← Back]
```

- Tap **Today**, **Tomorrow**, or **Next Monday** for quick access
- Tap **Pick a date…** to type any date (e.g., "15 June")
- The bot then shows all appointments for that date

### 3. Manage Schedule

Block dates when the clinic is closed or you're on leave:

```
Bot: Manage Schedule
     ────────────────
     Blocked dates:  None

     [Block a Date] [View Blocked Dates] [← Back]
```

**To block a date:**
- Tap "Block a Date"
- Type the date (e.g., "15 June")
- The bot confirms: ✅ Blocked 15 June

**To check blocked dates:**
- Tap "View Blocked Dates"
- Shows all blocked dates
- Tap any date to unblock it

> When a date is blocked, patients cannot book appointments on that day.

### 4. Stats

See your numbers at a glance:

```
Bot: 📊 Appointment Statistics
     ─────────────────────
     Today:     4 appointments (2 pending)
     This week: 18 appointments
     Next week: 22 appointments
     Total upcoming: 40

     [Today's List] [Main Menu] [← Back]
```

---

## What Happens When You Tap an Appointment

When you tap a specific appointment from the list, you see:

```
Bot: 📋 Appointment Details
     ─────────────────────
     Patient:   Rajesh Kumar
     Time:      09:00 — 09:30
     Treatment: Root Canal
     Phone:     +91-9876543210
     Status:    ✅ Confirmed

     [Mark Completed ✓] [No Show ✗] [← Back]
```

### Your 3 options:

| Button | When to use | What happens |
|--------|-------------|-------------|
| **Mark Completed ✓** | Patient showed up and treatment is done | Appointment marked as done |
| **No Show ✗** | Patient didn't arrive | Appointment marked as missed |
| **← Back** | Go back to the appointment list | Nothing changes |

After marking an appointment, you'll see:

```
✅ Appointment marked as completed.
Rajesh Kumar — Root Canal at 09:00 is done.

[Today's List] [Main Menu] [Next Appointment]
```

---

## Notifications You Receive Automatically

**You never need to keep checking the bot. The bot messages you when something happens.**

### New Booking

When a patient books an appointment, you get:

```
🆕 New Booking!
Rajesh Kumar — Root Canal
Tomorrow at 10:00 AM
📞 +91-9876543210
```

### Cancellation

When a patient cancels:

```
❌ Cancellation
Rajesh Kumar — Root Canal
Mon 27 May at 10:00 AM
```

### Reschedule

When a patient changes their date or time:

```
🔄 Rescheduled
Rajesh Kumar — Root Canal
FROM: Mon 27 May 10:00
TO: Tue 28 May 14:00
```

### Daily Morning Summary

Every morning at 8:00 AM, the bot sends you your full schedule for the day:

```
☀️ Good morning!
Today's Schedule (27 May)
─────────────────
09:00 — Rajesh Kumar — Root Canal
10:30 — Priya Sharma — Teeth Cleaning
14:00 — Anand Rao — General Checkup
16:30 — Sneha Patel — Whitening

Total: 4 appointments
```

> If there are no appointments, the bot says: "☀️ Good morning! No appointments scheduled today."

---

## Example: Your Full Day

Here's how a typical day looks from your side:

```
8:00 AM — Daily schedule arrives automatically
9:00 AM — Patient arrives → you check details → Mark Completed
10:30 AM — Patient arrives → Mark Completed
11:00 AM — New booking notification (patient booked online)
11:30 AM — Patient arrives → Mark Completed
12:00 PM — Cancellation notification
2:00 PM — Reschedule notification
2:30 PM — You message the bot to check remaining appointments
       Bot shows updated list with 2 remaining
```

---

## What Patients See

Patients don't see any of the doctor interface. They see:

1. Welcome message with menu
2. Pick a symptom → Pick date → Pick time → Confirm
3. Confirmation: "Your appointment is booked with Dr. Vishnu Vardhan"

You appear in their confirmation as:

```
📋 Appointment Summary
━━━━━━━━━━━━━━━━
Date: Monday, 27 May 2026
Time: 10:00 AM
Treatment: Root Canal
Doctor: Dr. Vishnu Vardhan
```

---

## Quick Reference

| You want to… | Do this |
|-------------|---------|
| See today's appointments | Message the bot → tap "View Details" |
| Mark a patient as done | Tap the appointment → tap "Mark Completed ✓" |
| Mark a no-show | Tap the appointment → tap "No Show ✗" |
| Check another date | Tap "By Date" → pick a date |
| Block a holiday | Tap "Schedule" → "Block a Date" |
| See your stats | Tap "Stats" |
| See new bookings | Wait — the bot messages you automatically |
| Know if someone cancelled | Wait — the bot messages you automatically |
