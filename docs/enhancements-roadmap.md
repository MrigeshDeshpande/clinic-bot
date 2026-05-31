# Enhancements & Future Flow — Roadmap

> **Last updated:** May 31, 2026
> **Status:** Phase 1 ✅ complete — actively implementing

---

## Phase 1: Receptionist Role + Queue Management

These two are interconnected — the receptionist is the queue manager, and the doctor has a fallback queue view.

### 1.1 Receptionist Role

**Detection:** Add `receptionistWaId` to `clinic.js`. Three roles now: `patient`, `doctor`, `receptionist`.

**Receptionist's Main Menu:**
```
🏥 Reception Desk — Shri Balaji Dental Clinic
─────────────────────────────
Today's Queue: 8 patients
Waiting: 3 | With Doctor: 1 | Done: 4

[Register Walk-in]
[View Full Queue]
[Mark Patient Arrived]
[Search Patient]
[Today's Appointments]
```

**Registration flow (walk-in):**
Receptionist taps "Register Walk-in" → guided flow:
1. Patient name
2. Age
3. Sex (M/F/Other)
4. Phone number
5. WhatsApp number (optional — if provided, we link wa_id → patient gets summaries)
6. Walk-in or book appointment time

If patient already exists (matched by phone), show existing record and offer to book new appointment.

**Benefits this unlocks:**
- Walk-in patients get `wa_id` linked → `sendPatientSummary()` works for them too
- Receptionist handles all data entry — doctor only treats
- Phone captured for future SMS gateway

### 1.2 Queue Management

**New appointment column:**
```sql
arrival_status: 'scheduled' | 'arrived' | 'waiting' | 'called' | 'in_session' | 'done'
arrived_at: TIMESTAMPTZ
called_at: TIMESTAMPTZ
```

**Queue ordering:**
```
1. Emergency flagged patients → front
2. Booked patients → sorted by appointment time
3. Walk-ins → interleaved between booked slots (every 2 booked → 1 walk-in slot)
4. Arrival time breaks ties
```

**Receptionist queue view:**
```
📋 Full Queue — Today
─────────────────────────
🟢 Booked: Rajesh — 10:00 (Cleaning) — Arrived 9:45
⏳ Booked: Priya — 10:30 (Root Canal) — Not yet arrived
⏳ Walk-in: Amit — Cleaning — Arrived 10:15
✅ Done: Sunita — 09:00 (Scaling)

[Tap to manage] [Call Next →]
```

**Doctor queue view (same features, for fallback):**
When receptionist is unavailable, doctor sees:
```
⚠️ Receptionist offline — managing queue yourself

📋 Waiting: 2 patients
1. Rajesh — Cleaning (arrived 9:45, waited 20 min)
2. Amit — Walk-in, Cleaning (arrived 10:15)

[Call Next Patient →]
```

**Doctor calls next:**
- Taps "Call Next" → system picks the next patient per queue ordering
- Status → `called`, records `called_at`
- Optional: send WhatsApp notification "Doctor is ready for you. Please come in."
- Patient's name appears on doctor's "In Session" view

**Mark patient arrived (receptionist):**
- Tap "Mark Arrived" → select from today's appointments or search by name
- Status → `arrived`, records `arrived_at`
- If walk-in with no appointment → auto-create a walk-in appointment slot

**End of visit (doctor marks completed):**
- Existing visit logging flow runs unchanged
- On completion, status → `done`
- Doctor sees "Next in queue: Rajesh — [Call Now]"

---

## Phase 2: High Impact Enhancements

### 2.1 Auto-Suggest Next Available Slot

**Problem:** When a time slot is taken, the bot just says "slot taken" and the user has to guess again.

**Solution:** After detecting a conflict, scan forward and suggest the next 3 free slots:

```
Bot: 2:00 PM is already booked.
      Next available:
      • 2:30 PM
      • 3:00 PM
      • 3:30 PM
      Tap one or type a different time.
```

**Implementation:** `findNextAvailableSlots(date, afterTime, count=3)` in `appointmentRepository`. Called from `handleBookingCollection` when `countAppointmentsBySlot` > 0.

### 2.2 Bulk Actions for Doctor

**Problem:** After a busy day, doctor has to tap each appointment, tap "Mark Completed", log visit individually.

**Solution — two approaches:**

**A) Mark all completed today (no visit logging):**
```
[Mark All Completed Today]
→ "Mark all 8 appointments as completed without visit logging?"
  [Yes, Mark All] [No]
→ Sets all confirmed appointments to 'completed'
→ No patient summaries sent (doctor can log visits individually later)
```

**B) Quick-select from appointment list:**
```
📋 Today's Appointments
☐ 09:00 — Rajesh — Cleaning
☑ 10:00 — Priya — Root Canal  ← already logged
☐ 10:30 — Amit — Walk-in
☐ 11:00 — Sunita — Scaling

[Select All] [Log Selected (2)] [Mark No-Show Selected]
```

Implementation: Add checkbox-style interactive list with "Select All" / "Log Selected" buttons. Selected ones go through visit logging flow in sequence, or bulk-complete with minimal prompts.

### 2.3 Walk-in Visit Logging Shortcut

**Problem:** For walk-ins, the doctor currently must: register patient → create appointment → find appointment → tap detail → mark completed → log visit. Too many steps.

**Solution:** "Log Visit" shortcut from main menu:

```
Doctor: [Log Visit for Walk-in] →
Bot: Patient name?
Doctor: Ramesh →
Bot: Found: Ramesh S (28/M, 9198xxxx50)
     [Select This Patient] [Search Again] [Register New]
```

Then enters visit logging directly (treatment → fees → next visit → notes → media), creating an appointment record automatically with a walk-in time slot.

**Implementation:** New intent `doctor_log_visit` → `handleDoctorLogVisit()` → uses existing `LOG_*` states but creates appointment on the fly.

### 2.4 Block Date Warning

**Problem:** Doctor blocks a date that has confirmed appointments. Patients show up, doctor is off.

**Solution:**
```
Bot: ⚠️ You have 3 appointments on 15 June.
     Blocking will cancel them.
     [Block & Cancel All] [Block & Notify to Reschedule] [Cancel]
```

- "Block & Cancel All" → sets appointments to 'cancelled', notifies patients
- "Block & Notify to Reschedule" → sends message: "Doctor is unavailable on 15 June. Please pick a new date." with booking link
- "Cancel" → goes back

### 2.5 Family/Group Accounts

**Problem:** Family members share one WhatsApp number. Patient A books, then Patient B says "hi" — sees A's booking context.

**Solution:**
- Allow a patient record to have multiple linked `wa_id`s OR one `wa_id` with multiple patient profiles
- Session asks "Who is this for?" when multiple profiles exist under one number
- Booking flow includes "Which family member?" step for returning users

```
User: "book appointment"
Bot: Who is this appointment for?
     [Ramesh (Self)]
     [Priya (Wife)]
     [Aryan (Son)]
     [New Person]
```

**Implementation:** `patients` table already supports `wa_id`. Add a `family_group_id` column or a separate `patient_profiles` table. Session context stores `selectedPatientId`.

---

## Phase 3: Medium Impact Enhancements

### 3.1 Voice Note Transcription

**Problem:** Doctor sends voice notes during visit logging instead of typing notes.

**Solution:**
- When doctor sends audio during `LOG_NOTES` or `LOG_MEDIA` state:
  - Download from Meta (already works in `media.js`)
  - Send to speech-to-text API (Google Speech-to-Text, Whisper, or Azure)
  - Transcribe and save as text in `notes` field
  - Also store original audio in R2 for reference

**Flow:**
```
Doctor: [sends voice note — "Patient has sensitivity in lower right molar"]
Bot: ✅ Transcribed: "Patient has sensitivity in lower right molar"
     [Accept] [Edit] [Re-record]
```

### 3.2 Patient Feedback After Visit

**Problem:** No way to know if patients are satisfied.

**Solution:**
New cron: 24h after appointment end time, send feedback request:

```
Bot: How was your visit to Shri Balaji Dental Clinic?
     [😊 Great] [🙂 Okay] [😞 Poor]
```

If poor → "We're sorry. Would you like someone to call you?" → escalation.

**Implementation:**
- New table `feedback` (appointment_id, rating, comment, created_at)
- New cron `GET /api/cron/feedback` running every hour, checking for completed appointments older than 24h
- `reminder_sent_at`-style column: `feedback_sent_at` on appointments

### 3.3 Multi-Treatment Booking

**Problem:** Patient needs cleaning + root canal in same visit. Can only book one treatment.

**Solution:**
Allow selecting multiple treatments during booking:

```
Bot: Which treatments do you need?
     [☐ General Dentistry]
     [☑ Teeth Cleaning]
     [☑ Root Canal]
     [☐ Whitening]
     ...
     [Done Selecting (2)]
```

Creates one appointment with multiple treatments stored as an array.

### 3.4 Smart Sunday Warning

**Problem:** User picks Sunday → gets date accepted → then time validation says "We close at 14:00".

**Solution:** When date is parsed as Sunday AND time isn't provided yet, show hours upfront:

```
Bot: Sunday, 1 June 2026 is available.
     ⚠️ Sunday hours: 10:00 AM – 2:00 PM only.
     Slots: 10:00, 10:30, 11:00, 11:30, 12:00, 12:30, 13:00, 13:30
     What time works for you?
```

### 3.5 Doctor Dashboard (Web UI)

**Problem:** All interactions are via WhatsApp. Doctor can't see a big-picture view easily.

**Solution:** Simple protected web dashboard:
- Today's appointments with queue status
- Searchable patient records
- Quick visit logging
- Stats charts (weekly/monthly trends)
- Protected by simple auth or IP whitelist

Built with existing Next.js stack — new route at `/dashboard`.

---

## Phase 4: Nice-to-Have

### 4.1 Analytics
- Peak hours, most booked treatments, patient retention rates, no-show rates
- Exportable reports (CSV/PDF)
- Dashboard charts

### 4.2 PDF Prescription Generator
- From visit log data, generate a formatted PDF
- Include clinic header, patient info, treatment, fees, next visit, doctor signature
- Send to patient via WhatsApp as document

### 4.3 Inventory Tracking
- Track materials used per treatment (e.g., "RCT used: 1 file set, 1 rubber dam")
- Low stock alerts
- Monthly usage reports

### 4.4 Full Hindi Bot
- All 60+ prompts translated to Hindi
- Language detection → full Hindi mode (not just Hinglish mixed)
- Hindi numbers, Hindi date formats, Hindi treatment descriptions

### 4.5 WhatsApp Template Messages
- For reminders (higher reliability, can include rich media)
- Pre-approved templates for: appointment reminder, feedback, visit summary
- Bypasses 24-hour messaging window

---

## Implementation Priority Matrix

| Feature | Effort | Impact | Dependencies |
|---------|--------|--------|-------------|
| Receptionist role | Medium | High | None (reuses REGISTER_* states) |
| Queue management | Medium | High | Receptionist role |
| Auto-suggest next slot | Small | Medium | None |
| Walk-in visit shortcut | Small | High | Receptionist role optional |
| Block date warning | Small | Medium | None |
| Smart Sunday warning | Tiny | Small | None |
| Multi-treatment booking | Medium | Medium | None |
| Voice transcription | Medium | Medium | API key (Google/Whisper) |
| Patient feedback | Medium | Low | New cron + table |
| Family accounts | Medium | Medium | DB schema change |
| Bulk actions (doctor) | Medium | High | None |
| WhatsApp templates | Small | Medium | Meta business approval |
| Full Hindi bot | Large | Medium | Translation effort |
| Dashboard (web) | Large | Medium | None |
| Analytics | Large | Low | Dashboard first |
| PDF prescriptions | Medium | Low | None |
| Inventory | Large | Low | None |

---

## Recommended Order

1. **Phase 1:** Receptionist + Queue (foundation for everything else)
2. **Walk-in visit shortcut** + **Auto-suggest next slot** (quick wins)
3. **Bulk actions** + **Block date warning** + **Smart Sunday** (doctor quality-of-life)
4. **Family accounts** + **Multi-treatment** (patient quality-of-life)
5. **Voice transcription** + **Feedback** + **Templates** (medium features)
6. **Dashboard** + **Analytics** + **Rest** (long-term)
