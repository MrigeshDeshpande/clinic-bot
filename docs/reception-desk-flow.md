# Reception Desk Flow — Dashboard + WhatsApp

## Overview

The clinic runs on **two parallel channels** — the WhatsApp bot handles patient self-service, while the Dashboard serves as the **reception desk** for walk-ins and in-person management. Both channels write to the same database, so they stay in sync automatically.

```
Patient via WhatsApp ──────► Bot ──► Appointments DB
Walk-in at reception  ─────► Dashboard ──► Appointments DB
```

---

## Flow: Walk-in Patient Registration

### 1. Check Availability
- Open the **Dashboard** → **Overview** tab
- The **calendar** shows available dates (green dots), booked dates (blue dots), and closed dates (red dots)
- Click any date to view its **slot grid** (right panel)
- The slot grid shows morning / afternoon time slots:
  - **Green tiles** → Available — click to book
  - **Blue tiles** → Booked — shows patient name, click to view patient

### 2. Book a Slot
- Click any green **"Book"** slot tile
- The **Quick Booking Modal** opens with the date & time pre-filled
- **Type patient name** — the modal searches existing patients (2+ chars) and shows matching records. Select an existing patient to auto-fill name + phone
- **Enter phone** (optional, but recommended for future WhatsApp notifications)
- **Select treatment** from the dropdown (General Dentistry, Root Canal, etc.)
- Click **"Book Appointment"**
- On success, the slot grid refreshes immediately — the booked slot turns blue with the patient name

### 3. Walk-in with No Advance Booking
- If a patient walks in without a prior appointment, use the **"Book"** button at the top-right of the slot grid
- Or find any available time slot and click it — same booking modal opens

### 4. After Booking
- The booked slot shows in the **Upcoming** list below
- Receptionist can use the **Queue Board** sidebar to manage arrivals
- When the patient arrives, click **"Mark Arrived"** in either:
  - The **Upcoming** list on the Overview
  - The **Queue Board** page (3-column Kanban view)

---

## Flow: Arrival & Session Management

```
 Walk-in arrives
      │
      ▼
 Slot Grid: Click booked slot → View patient details
      │
 Queue Board: Mark "Arrived"
      │
      ▼
 Appointment status changes to "Arrived" (amber dot on slot)
      │
      ▼
 Doctor notified via WhatsApp
      │
      ▼
 Queue Board: Mark "In Session" (or directly start Visit Log)
      │
      ▼
 Log Visit page: Record diagnosis, medicines, fees
      │
      ▼
 Appointment marked "Completed"
```

---

## Parallelism with WhatsApp

| Action | WhatsApp Bot | Dashboard |
|---|---|---|
| Book appointment | Patient texts bot | Receptionist clicks a slot |
| Cancel booking | Patient texts "cancel" | — (planned) |
| Block a date | Doctor texts "block 25 Mar" | Schedule page → Click date → Block |
| Log a visit | Doctor shares diagnosis via chat | Visit Log form |
| View feedback | — (patient rates via bot) | Feedback page |
| Search patients | — | Patients page / Search bar |
| Mark arrival | — | Queue Board / Overview |

**No conflicts:** The booking API checks for double-booking before creating an appointment. If a WhatsApp patient books a slot moments before a receptionist tries to book it manually, the API returns a 409 conflict error.

---

## Slot Grid Interactions

| State | Appearance | Click Action |
|---|---|---|
| **Available** | Green tile, "Book" label | Opens Quick Booking modal |
| **Booked** (confirmed) | Blue tile, patient name | Navigates to patient detail |
| **Booked + Arrived** | Blue tile + amber dot | Navigates to patient detail |
| **Booked + In Session** | Blue tile + blue dot | Navigates to patient detail |
| **Clinic Closed** | Red banner with reason | "Manage schedule →" link |
| **Past date** | Gray, "Past date — no data" | No action |

---

## Booking Modal Fields

| Field | Required | Behavior |
|---|---|---|
| Patient Name | ✅ | Search-as-you-type finds existing patients |
| Phone Number | Optional | Auto-filled from selected patient; used for patient dedup |
| Treatment | Optional | Dropdown from clinic treatments config |
| Date & Time | Pre-filled | From the slot tile clicked (read-only in modal) |
