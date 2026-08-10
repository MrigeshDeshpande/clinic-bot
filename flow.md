# DHARA Reality Map — Clinic-Bot Workflow Audit

> Secrets were removed from this file. All credentials live in `.env` (see `.env.example`).

## 1. Entry Points

### 1A. WhatsApp Booking (New Patient)
- **Trigger:** Patient sends WhatsApp message → bot responds with welcome menu → taps "Book Appointment"
- **Starting screen:** WhatsApp chat → greeting → booking flow (date → time → treatment → confirm)
- **API route:** `POST /api/webhook/whatsapp` → `engine.js:processEvent()` → `handlers.js:handleBookingConfirmation()`
- **Tables touched:** `patients` (SELECT + INSERT/UPDATE `ON CONFLICT phone`), `appointments` (INSERT, `status='confirmed'`)
- **Outcome:** Patient created (if new) + Appointment created with `status='confirmed'`

### 1B. WhatsApp Family Booking (Existing Patient)
- **Trigger:** Multi-patient WhatsApp ID → bot shows family member selector → booking flow
- **Starting screen:** WhatsApp → family list selection → booking flow
- **API route:** Same webhook → `handleFamilySelection()`
- **Tables touched:** `patients` (SELECT, possibly UPDATE demographics), `appointments` (INSERT)
- **Outcome:** No new patient. Appointment created. Family links from `patient_relationships` table.

### 1C. WhatsApp Walk-In (QR scan / "arrival" keyword)
- **Trigger:** Patient at clinic scans QR or sends "arrival" → bot starts walk-in registration
- **Starting screen:** WhatsApp → walk-in name → age → sex → treatment
- **API route:** Same webhook → `handleArrival()` → `handleWalkinTreatment()`
- **Tables touched:** `patients` (SELECT + INSERT/UPDATE), `appointments` (INSERT + `arrival_status='arrived'`)
- **Outcome:** Patient created/updated + Appointment created for today + arrival marked

### 1D. WhatsApp Reschedule
- **Trigger:** Patient in `BOOKED` state taps "Reschedule" from post-booking menu
- **Starting screen:** WhatsApp → post-booking menu → reschedule flow
- **API route:** Same webhook → `handleBooked()` → booking collection → `handleBookingConfirmation()`
- **Tables touched:** `appointments` (UPDATE superseded + INSERT new version of same `logical_id`)
- **Outcome:** Old appointment `status='superseded'`, new appointment created with updated date/time

### 1E. Dashboard Quick Book (Calendar slot click)
- **Trigger:** Receptionist clicks empty time slot on Month/Week/Day calendar view
- **Starting screen:** `/dashboard` → `QuickBookForm` modal
- **API route:** `POST /api/dashboard/appointments`
- **Tables touched:** `patients` (SELECT + INSERT/UPDATE), `appointments` (INSERT with slot-conflict guard)
- **Outcome:** Patient created/updated + Appointment created with `status='confirmed'`

### 1F. Dashboard Rapid Walk-In (FAB menu)
- **Trigger:** Receptionist clicks FAB → "Quick Walk-In" → fills Name + Phone + Fee + Paid
- **Starting screen:** `/dashboard` → FAB dropdown → `RapidWalkInModal`
- **API route:** `POST /api/dashboard/visit` with `mode: 'create_walk_in'` → `createWalkIn()`
- **Tables touched:** `patients` (SELECT + INSERT/UPDATE), `appointments` (INSERT, `status='completed'`), `payments` (INSERT), `patient_timeline_events` (INSERT), optionally `treatment_plans` + `treatment_plan_steps` (INSERT)
- **Outcome:** Patient created/updated + Visit completed + Payment recorded + Optional treatment plan created

### 1G. Dashboard Full Visit (Walk-in mode, no appointmentId)
- **Trigger:** Receptionist opens `/dashboard/visit` directly without `?appointmentId=`
- **Starting screen:** `/dashboard/visit` → full clinical form with ToothGrid, diagnosis, prescriptions, billing
- **API route:** `POST /api/dashboard/visit` with `mode: 'create_walk_in'` → `createWalkIn()`
- **Tables touched:** Same as 1F. Includes `tooth_diagnoses` JSONB on appointment.
- **Outcome:** Full clinical walk-in visit completed. Same as 1F but with comprehensive clinical data.

### 1H. Dashboard Full Visit (Complete Appointment mode)
- **Trigger:** Receptionist clicks "Edit Visit" in AppointmentDetailsModal or "Open Visit" from Quick Book
- **Starting screen:** `/dashboard/visit?appointmentId=xxx&mode=completeAppointment`
- **API route:** `POST /api/dashboard/visit` with `mode: 'complete_appointment'` → `completeVisit()`
- **Tables touched:** `appointments` (UPDATE to `status='completed'`), `payments` (INSERT via CTE), `patient_timeline_events` (INSERT), optionally `treatment_plan_steps` (UPDATE if `stepIds[]`)
- **Outcome:** Existing appointment updated to completed + payment + timeline + optional step advance

### 1I. Dashboard Quick Checkout (from AppointmentDetailsModal)
- **Trigger:** Receptionist clicks calendar slot → AppointmentDetailsModal → "Quick Checkout"
- **Starting screen:** `/dashboard` → `AppointmentDetailsModal` → `QuickCheckoutModal`
- **API route:** `POST /api/dashboard/visit` with `mode: 'complete_appointment'` → `completeVisit()`
- **Tables touched:** Same as 1H. Follow-up fields set on appointment.
- **Outcome:** Same as 1H. Minimal checkout (fee + paid + method + optional follow-up).

### 1J. Dashboard Patients API (Manual patient creation)
- **Trigger:** Direct API call (UI not seen in codebase)
- **Starting screen:** N/A (API-only)
- **API route:** `POST /api/dashboard/patients`
- **Tables touched:** `patients` (SELECT + INSERT `ON CONFLICT phone`) — **no appointment created**
- **Outcome:** Patient record created. No appointment.

### 1K. WhatsApp Doctor Media (Indirect patient reference)
- **Trigger:** Doctor sends photo/audio via WhatsApp while in media-saving flow
- **Starting screen:** WhatsApp → Doctor menu → send media → bot asks "Which patient?"
- **API route:** Same webhook → `handleDoctorMediaPatientLookup()`
- **Tables touched:** `patients` (SELECT only), `media_assets` (INSERT), `appointments` (UPDATE `chit_media`)
- **Outcome:** Media attached to patient. No new patient or appointment created.

---

## 2. Doctor Workflow

### 2A. Open Dashboard
- **Screen:** `/dashboard/login` → enters password → `POST /api/dashboard/login` → JWT cookie → redirect to `/dashboard`
- **DB writes:** None (read-only login check)
- **Result:** Dashboard loaded with KPI strip + calendar + attention panel

### 2B. View Appointments
- **Screen:** Main dashboard calendar (Month/Week/Day views)
- **API:** `GET /api/dashboard/appointments?date=YYYY-MM-DD`
- **DB reads:** `appointments` (JOIN `patients`), filtered by date + status IN ('confirmed','completed','no_show')
- **DB writes:** None
- **Result:** List of appointments with patient name, time, treatment, status

### 2C. View Queue / Call Next Patient
- **Screen:** `/dashboard/queue` → Queue Board with Waiting / In Session / Completed columns
- **API:** `PATCH /api/dashboard/arrival` with `{ appointmentId, arrivalStatus: 'arrived' | 'called' }`
- **DB writes:** `appointments.arrival_status`, `appointments.arrived_at` / `appointments.called_at`
- **Result:** Patient moves from Waiting → Arrived → In Session → "Start Visit" button appears

### 2D. Start Treatment (Open Visit Page)
- **Screen:** Click "Start Visit" in queue → `/dashboard/visit?appointmentId=X&mode=completeAppointment`
- **API:** `GET /api/dashboard/appointments?id=X` (preloads appointment data)
- **DB writes:** None at this stage
- **Result:** Full clinical form opens: ToothGrid, diagnosis panel, prescriptions, billing

### 2E. Add Tooth Diagnosis
- **Screen:** `/dashboard/visit` → ToothGrid → click tooth → PerToothDiagnosisPanel
- **Actions:** Select surface (O/M/B/D/L) → select diagnosis → select treatment → set severity → set status → set outcome → add notes
- **API:** None yet (stored client-side in `toothDiagnoses` state)
- **DB writes:** None (saved on visit completion only)
- **Result:** Tooth highlighted in grid with diagnosis color, treatment label

### 2F. Right-Click Quick Diagnosis
- **Screen:** ToothGrid → right-click tooth → context menu
- **Actions:** Click Caries / Pocket / Mobility / Fractured / Missing / Clear
- **API:** None (client-side state update)
- **Result:** Tooth colorized by diagnosis type immediately

### 2G. Bulk Select & Diagnose
- **Screen:** ToothGrid → toggle "Multi" → click multiple teeth → bulk action bar
- **Actions:** Apply Caries / Pocket / Mobility / Fractured / Missing / Clear to all selected teeth
- **API:** None (client-side)
- **Result:** Multiple teeth updated simultaneously

### 2H. Add Prescription Medicines
- **Screen:** Visit page → PrescriptionCard → search/add medicine → dose/duration/frequency
- **API:** None (stored in `medicines` state)
- **DB writes:** None until visit save
- **Result:** Medicines list displayed in prescription card

### 2I. Upload Intra-Oral Photos
- **Screen:** Visit page → MediaCard → camera capture or file upload
- **API:** `POST /api/dashboard/media` (multipart form with file + appointmentId)
- **DB writes:** `media_assets` (INSERT), `appointments.chit_media` (UPDATE)
- **Note:** Does NOT enqueue OCR job — photos uploaded via dashboard bypass extraction pipeline
- **Result:** Images shown in gallery, stored in R2

### 2J. Send WhatsApp Message to Patient
- **Screen:** Patient profile → Messages section OR dashboard appointments → WhatsApp button
- **API:** `POST /api/dashboard/send-whatsapp` or `POST /api/dashboard/patients/[id]/send-message`
- **DB writes:** `messages` (INSERT)
- **Result:** Text message sent via Meta Cloud API

### 2K. Generate Prescription PDF
- **Screen:** `/dashboard/visit` → "Print Prescription" button → OR patient profile → Rx button
- **API:** `GET /api/dashboard/visits/[id]/prescription` → `generatePrescription()` (PDFKit)
- **DB writes:** None (R2 cached via `prescription_key`)
- **Result:** Returns PDF with 4-column tooth table (Tooth | Surf. | Plan | Diagnosis)

### 2L. Generate Dental Chart PDF
- **Screen:** Patient profile → "Printable Dental Chart" button
- **API:** `POST /api/dashboard/visits/[id]/chart` → `generateDentalChart()` (PDFKit)
- **DB writes:** None (R2 cached)
- **Result:** Returns A4 landscape PDF with all 32 teeth colored by diagnosis + legend

### 2M. Compile & Send Visit Summary
- **Screen:** Patient profile or visit page → "Compile & Send" button
- **API:** `POST /api/dashboard/visits/[id]/compile` → `POST /api/dashboard/visits/[id]/compile/send`
- **DB writes:** None (generates combined PDF, sends via WhatsApp document)
- **Result:** WhatsApp message with PDF attachment sent to patient

### 2N. Complete Visit (Full form)
- **Screen:** `/dashboard/visit` → "Save & Complete" button
- **API:** `POST /api/dashboard/visit` with `mode: 'complete_appointment'` → `completeVisit()`
- **DB writes:** `appointments` (UPDATE status='completed', tooth_diagnoses, fees, medicines, advice, examination fields), `payments` (INSERT via CTE), `patient_timeline_events` (INSERT: VISIT_COMPLETED, PAYMENT_RECEIVED, FOLLOWUP_CREATED), optionally `treatment_plan_steps` (UPDATE via best-effort `completeVisitSteps()`)
- **Result:** Appointment marked completed, payment recorded, timeline events created

### 2O. Quick Checkout (Minimal form)
- **Screen:** AppointmentDetailsModal → QuickCheckoutModal → Enter Fee + Paid + Method + optional Follow-up
- **API:** Same as 2N
- **DB writes:** Same as 2N
- **Clicks:** ~5 clicks (open modal → enter 3 fields → submit)
- **Result:** Same as 2N

### 2P. Cancel Appointment
- **Screen:** AppointmentDetailsModal → "Cancel Appointment"
- **API:** `PATCH /api/dashboard/appointments/[id]` with `{ status: 'cancelled', cancellation_reason }`
- **DB writes:** `appointments` (UPDATE status='cancelled', cancellation_reason, prescription_key=NULL)
- **Result:** Appointment cancelled, R2 cached PDFs invalidated

### 2Q. Reschedule Appointment
- **Screen:** WeekView/DayTimeline → drag appointment block to new time slot
- **API:** `POST /api/dashboard/appointments/[id]/reschedule`
- **DB writes:** `appointments` (UPDATE old: status='superseded'; INSERT new: same logical_id, version+1)
- **Result:** Appointment moved to new slot. Old version superseded.

### 2R. View/Edit Patient Profile
- **Screen:** `/dashboard/patients/[id]` → Visit history, per-tooth timeline, medical history, feedback, messages
- **API:** `GET /api/dashboard/patients/[id]`
- **DB writes:** None (read-only view)
- **Result:** Full patient record displayed

### 2S. Send Prescription Photo (WhatsApp → OCR)
- **Screen:** WhatsApp → Doctor sends photo to bot → bot extracts
- **API:** `POST /api/webhook/whatsapp` → `processAndStoreMedia()` → R2 → `media_processing_jobs` → worker → OCR → AI extraction
- **DB writes:** `media_assets`, `prescription_extractions`, `media_processing_jobs`
- **Note:** Requires background worker (`dhara-worker.mjs`) running separately
- **Result:** Structured JSON in `prescription_extractions` table, status='extraction_completed'

### 2T. Review & Approve Extraction
- **Screen:** `/dashboard/extractions/[id]` → Review structured data → Approve/Reject
- **API:** `PATCH /api/dashboard/extractions/[id]` with `action: 'approve'` or `'reject'`
- **DB writes:** `prescription_extractions` (UPDATE status='approved'/'rejected'), `patient_timeline_events` (INSERT: EXTRACTION_APPROVED + per-diagnosis DIAGNOSIS_RECORDED + per-treatment TREATMENT_RECOMMENDED + per-estimate TREATMENT_ESTIMATED)
- **Result:** Extraction approved, timeline populated with diagnoses/treatments/estimates

### 2U. Acknowledge/Resolve Attention Items
- **Screen:** Dashboard → AttentionPanel → Acknowledge / Resolve / Re-open buttons
- **API:** `PATCH /api/dashboard/attention/[id]` with `{ status: 'acknowledged' | 'resolved' | 'new' }`
- **DB writes:** `treatment_plans.attention_status` (UPDATE), `patient_timeline_events` (INSERT: ATTENTION_ACKNOWLEDGED/RESOLVED/REOPENED)
- **Result:** Attention item moves between sections in panel

### 2V. View Stats / Analytics
- **Screen:** `/dashboard/stats`
- **API:** `GET /api/dashboard/stats`
- **DB writes:** None
- **Result:** Charts: revenue, patient counts, treatment breakdowns

### 2W. View/Manage Schedule (Blocked dates)
- **Screen:** `/dashboard/schedule`
- **API:** `GET/POST/DELETE /api/dashboard/schedule`
- **DB writes:** `blocked_dates` (INSERT/DELETE)
- **Result:** Doctor's availability managed

### 2X. View Due Reminders & Trigger Manually
- **Screen:** `/dashboard/due-reminders`
- **API:** `GET /api/dashboard/due-reminders` (list logs), `POST /api/dashboard/due-reminders` (manual trigger)
- **DB writes:** `due_reminder_log` (INSERT)
- **Result:** Payment reminder WhatsApp sent

### 2Y. View/Manage Settings
- **Screen:** `/dashboard/settings`
- **API:** `GET/PATCH /api/dashboard/settings`
- **DB writes:** `settings` (UPDATE)
- **Result:** Clinic info, prescription design, checklists, medicines, treatments updated

---

## 3. Reception Workflow

### 3A. Login
- **Screen:** `/dashboard/login` → Password auth → Same as doctor
- **DB writes:** None
- **Note:** No role-based distinction. Receptionist shares same login as doctor.

### 3B. Quick Book Appointment
- **Screen:** Dashboard calendar → click empty slot → QuickBookForm → enter name, phone, age, sex, treatment
- **API:** `POST /api/dashboard/appointments`
- **Tables affected:** `patients` (SELECT + possible INSERT/UPDATE), `appointments` (INSERT)
- **Clicks:** ~8 (click slot → fill 4-5 fields → submit)

### 3C. Rapid Walk-In
- **Screen:** FAB → "Quick Walk-In" → RapidWalkInModal → name + phone + fee + paid + method
- **API:** `POST /api/dashboard/visit` with `mode: 'create_walk_in'`
- **Tables affected:** `patients`, `appointments`, `payments`, `patient_timeline_events`, optional `treatment_plans`
- **Clicks:** ~6 (open modal → name → phone → fee → paid → submit)
- **Note:** No tooth diagnosis, no prescription. Pure financial walk-in.

### 3D. Mark Patient Arrival
- **Screen:** `/dashboard/queue` → Click "Mark Arrived" → "Call Patient"
- **API:** `PATCH /api/dashboard/arrival`
- **Tables affected:** `appointments` (UPDATE arrival_status, arrived_at, called_at)
- **Clicks:** 2 per patient (arrived → call)

### 3E. Quick Checkout
- **Screen:** Calendar → click appointment → AppointmentDetailsModal → "Quick Checkout" → fill fee + paid + method
- **API:** `POST /api/dashboard/visit` with `mode: 'complete_appointment'`
- **Tables affected:** `appointments`, `payments`, `patient_timeline_events`
- **Clicks:** ~7 (open modal → open checkout → enter 3 fields → submit)

### 3F. Open Full Visit Form (for detailed checkout)
- **Screen:** Select appointment in calendar/drop → AppointmentDetailsModal → "Edit Visit"
- **API:** `GET /api/dashboard/appointments?id=X` (preload) → `POST /api/dashboard/visit` (save)
- **Tables affected:** Same as 3E plus tooth_diagnoses, medicines, etc.
- **Clicks:** Many (full clinical form with ~12 sections)

### 3G. Mark No-Show
- **Screen:** `/dashboard/appointments` → click "✕ No Show" on appointment row
- **API:** `PATCH /api/dashboard/appointments/[id]` with `{ status: 'no_show' }` (via appointments page API) or inline in appointments table
- **Tables affected:** `appointments` (UPDATE status)
- **Note:** Has undo within 10 seconds

### 3H. Cancel Appointment
- **Screen:** AppointmentDetailsModal → "Cancel Appointment" → enter reason
- **API:** `PATCH /api/dashboard/appointments/[id]` with `{ status: 'cancelled', cancellation_reason }` → `cancelAppointment()`
- **Tables affected:** `appointments` (UPDATE status)

### 3I. Search Patients
- **Screen:** `/dashboard/patients` → type name/phone
- **API:** `GET /api/dashboard/patients?q=searchterm`
- **Tables affected:** `patients` only (SELECT)

### 3J. View Patient Profile
- **Screen:** Click patient record → `/dashboard/patients/[id]`
- **API:** `GET /api/dashboard/patients/[id]`
- **Tables affected:** `patients` + `appointments` (SELECT)

### 3K. Send WhatsApp Message
- **Screen:** Patient profile → Messages → type message → send
- **API:** `POST /api/dashboard/patients/[id]/send-message`
- **Tables affected:** `messages` (INSERT)

### 3L. View Extractions Queue
- **Screen:** `/dashboard/extractions` → list of pending/approved/rejected extractions
- **API:** `GET /api/dashboard/extractions?status=pending|approved|rejected|all`
- **Tables affected:** `prescription_extractions` + `media_assets` + `patients` (SELECT)

### 3M. Trigger Due Reminders (Manual)
- **Screen:** `/dashboard/due-reminders`
- **API:** `POST /api/dashboard/due-reminders`
- **Tables affected:** `due_reminder_log` (INSERT), WhatsApp sends via Meta API

### 3N. Manage Schedule / Block Dates
- **Screen:** `/dashboard/schedule`
- **API:** `POST/DELETE /api/dashboard/schedule`
- **Tables affected:** `blocked_dates`

### 3O. Send Document via WhatsApp
- **Screen:** Patient profile → Visit card → "Compile & Send" button
- **API:** `POST /api/dashboard/visits/[id]/compile` + `POST /api/dashboard/visits/[id]/compile/send`
- **Tables affected:** None (generates PDF, sends as WhatsApp document)

### 3P. View/Print Prescription
- **Screen:** Patient profile → Visit card → "Rx" button
- **API:** `GET /api/dashboard/visits/[id]/prescription`
- **Tables affected:** None (R2-cached PDF served)

---

## 4. Patient Workflow

### 4A. Book Appointment via WhatsApp
- **Trigger:** Patient sends any message to clinic WhatsApp number
- **Flow:** Bot sends welcome → patient taps "Book Appointment" → enters date → time → treatment → confirms
- **API:** `POST /api/webhook/whatsapp` (entirely within engine pipeline)
- **Outcome:** Patient receives confirmation message with date, time, treatment

### 4B. Cancel/Reschedule via WhatsApp
- **Trigger:** After booking, patient sees post-booking menu → taps "Cancel" or "Reschedule"
- **Flow:** Cancel: confirm → reason → bot cancels. Reschedule: new date/time → confirm.
- **Outcome:** Cancellation: status='cancelled'. Reschedule: appointment superseded + new version.

### 4C. Walk-In via WhatsApp (QR scan)
- **Trigger:** At clinic, patient scans QR code → sends "arrival" or follows prompts
- **Flow:** Bot collects name → age → sex → treatment → creates appointment for today
- **Outcome:** Appointment created with `arrival_status='arrived'`. Patient in queue.

### 4D. Receive Appointment Reminder (Cron)
- **Trigger:** 24h before appointment → `GET /api/cron/reminders` (Vercel Cron Job)
- **Flow:** `fetchAppointmentsForReminder()` → `sendTemplate(wa_id, 'appointment_reminder', [name, date, time, treatment, clinic])`
- **Template:** `appointment_reminder` (Meta template)
- **Outcome:** WhatsApp reminder sent with appointment details

### 4E. Receive Post-Visit Feedback Request (Cron)
- **Trigger:** After visit completion → `GET /api/cron/feedback`
- **Flow:** `fetchCompletedAppointmentsForFeedback()` → `sendTemplate(wa_id, 'feedback_request', [name, clinic])`
- **Template:** `feedback_request` (Meta template)
- **Outcome:** WhatsApp message asking for feedback

### 4F. Receive Payment Due Reminder (Cron)
- **Trigger:** Daily → `GET /api/cron/due-reminders`
- **Flow:** `fetchAppointmentsForDueReminder()` → `sendTemplate(wa_id, 'due_reminder', [name, clinic, amount, UPI_ID])`
- **Template:** `due_reminder` (Meta template)
- **Outcome:** WhatsApp message with due amount + UPI ID for payment

### 4G. Receive Follow-Up Reminder (Cron)
- **Trigger:** Daily → `GET /api/cron/follow-up-reminders`
- **Flow:** `fetchAppointmentsForFollowUpReminder()` → `sendText()` (plain text, no template)
- **Note:** Uses `sendText` NOT `sendTemplate`. Falls outside 24h window limits on Meta.
- **Outcome:** Plain text WhatsApp with follow-up reminder

### 4H. Receive Evening Check-In Summary (Cron)
- **Trigger:** End of day → `GET /api/cron/evening-checkin`
- **Flow:** `fetchTodayAppointments()` → `sendText()` to doctor's WA ID
- **Note:** Doctor-facing only. Patient not involved.

### 4I. Receive Prescription/Document via WhatsApp
- **Trigger:** Doctor clicks "Send" on compiled document
- **Flow:** `POST /api/dashboard/visits/[id]/compile/send` → `sendDocument()` (WhatsApp document message)
- **Outcome:** Patient receives PDF via WhatsApp

### 4J. Receive WhatsApp Message from Clinic
- **Trigger:** Doctor/receptionist sends message via dashboard
- **Flow:** `POST /api/dashboard/send-whatsapp` or `send-message` → `sendText()` or `sendTemplate()`
- **Outcome:** Patient receives custom message

### 4K. Provide Feedback (Rating)
- **Trigger:** After feedback request, patient responds with rating
- **Flow:** WhatsApp → feedback handler → `insertFeedback()`
- **Tables touched:** `patient_reviews` (INSERT with ratings JSONB)
- **Outcome:** Ratings stored (behaviour, cooperative_treatment, timely_appointment, payment_time, oral_hygiene, pain_tolerance, treatment_compliance) — but **NOT recorded as timeline event**

### 4L. View/Download Prescription
- **Trigger:** Patient clicks link or receives PDF document via WhatsApp
- **API:** `GET /api/dashboard/visits/[id]/prescription` (R2 presigned URL)
- **Flow:** Prescription PDF served from R2 cache or generated on-demand
- **Outcome:** Patient views/prints prescription

### 4M. Patient Cannot:
- View own visit history
- View own treatment plan
- View own payment history / outstanding balance
- View own dental chart
- Book via web/app (WhatsApp only)
- Make online payment (UPI ID sent as text only — no payment gateway integration)
- See appointment availability (bot suggests slots)
- Cancel without human interaction
- Request reschedule without human interaction (except via bot flow)

---

## 5. Visit Lifecycle

### Full Trace:

```
1. PATIENT ARRIVES AT CLINIC
   └─ Via: Pre-booked appointment (WhatsApp/Dashboard) OR Walk-in (QR/Reception)
   └─ Marked by: Reception clicks "Mark Arrived" on Queue Board (PATCH /arrival)
   └─ DB: appointments.arrival_status = 'arrived', arrived_at = NOW()
   └─ Timeline: ❌ NO timeline event for arrival

2. RECEPTION CALLS PATIENT
   └─ Action: Reception clicks "Call Patient" on Queue Board
   └─ DB: appointments.arrival_status = 'called', called_at = NOW()
   └─ Timeline: ❌ NO timeline event for being called

3. DOCTOR STARTS VISIT
   └─ Action: Click "Start Visit" → /dashboard/visit?appointmentId=X
   └─ DB: None yet (read-only load)
   └─ Screen shows: ToothGrid, diagnosis panel, prescription, billing

4. CONSULTATION & EXAMINATION
   └─ Doctor fills:
       ├─ Chief complaint (free text)
       ├─ General examination (free text)
       ├─ Extra-oral examination (free text)
       ├─ Clinical notes (free text)
       ├─ Diagnosis checklist (global diagnosis_selected TEXT[])
       ├─ Provisional diagnosis
       ├─ Medical history alerts (read-only, from patients table)
   └─ DB writes: None yet (all client-side state)
   └─ Timeline: ❌ NO timeline event for consultation start

5. PER-TOOTH DIAGNOSIS (Dental-specific)
   └─ Actions: Click tooth → select surface → select diagnosis → select treatment
       ├─ Optionally: Set severity, status, outcome
       ├─ Optionally: Add per-tooth notes
       ├─ Optionally: Right-click quick diagnosis
       ├─ Optionally: Bulk-select multiple teeth
   └─ DB writes: None yet (stored in toothDiagnoses state)
   └─ Timeline: ❌ NO timeline event for diagnosis recording

6. TREATMENT PLANNING
   └─ Actions:
       ├─ Select treatment category & specific treatment
       ├─ Set treatment fees (line items in BillingProjectionCard)
       ├─ Optionally: Link to procedure codes (Dhara treatment plan)
   └─ DB writes: treatment_plans + treatment_plan_steps IF procedureCodeId provided
   └─ Timeline: ✅ PLAN_CREATED event (if plan created)
   ❌ NO timeline event for treatment selection without plan

7. PRESCRIPTION
   └─ Actions:
       ├─ Search/add medicines (name, dose, frequency, duration)
       ├─ Add advice (checklist from settings)
   └─ DB writes: None yet

8. INTAKE PHOTOS
   └─ Actions:
       ├─ Capture intra-oral photos (CameraViewfinder)
       ├─ Upload existing files
       ├─ View in MediaViewer
   └─ API: POST /api/dashboard/media
   └─ DB writes: media_assets, appointments.chit_media
   └─ Timeline: ❌ NO timeline event for media upload
   ⚠️ NOTE: Dashboard-uploaded photos do NOT trigger OCR

9. BILLING & PAYMENT
   └─ Actions:
       ├─ View total: consultation + treatment + medicine fees
       ├─ Enter paid amount
       ├─ Select payment method (Cash/UPI/Card/Other)
       ├─ Enter optional notes
       ├─ See outstanding balance
   └─ DB writes: payments (INSERT), appointments.paid_amount/payment_status/payment_method
   └─ Timeline: ✅ PAYMENT_RECEIVED event (if amount > 0)

10. FOLLOW-UP
    └─ Actions:
        ├─ Check "Schedule follow-up" checkbox (default OFF in QuickCheckout)
        ├─ Select follow-up date (default +7 days)
        ├─ Select reason (Review / Extraction Check / Crown Fitting / RCT Checkup / Scaling Review / Other)
    └─ DB writes: appointments.follow_up_date, follow_up_status, follow_up_reason, follow_up_created_by
    └─ Timeline: ✅ FOLLOWUP_CREATED or FOLLOWUP_CANCELLED

11. VISIT COMPLETION
    └─ Action: Click "Save & Complete" or "Complete & Collect ₹X"
    └─ API: POST /api/dashboard/visit with mode='complete_appointment' or 'create_walk_in'
    └─ Transactional DB writes (sql.begin()):
        ├─ UPDATE appointments SET status='completed', all clinical fields, fees, payment, follow-up
        ├─ INSERT INTO payments (if paid)
        ├─ INSERT INTO patient_timeline_events (VISIT_COMPLETED, PAYMENT_RECEIVED, FOLLOWUP_CREATED)
    └─ Post-transaction (best-effort):
        ├─ UPDATE treatment_plan_steps (if stepIds provided)
        ├─ UPDATE settings (medicine usage tracking)
    └─ Timeline: ✅ VISIT_COMPLETED, ✅ PAYMENT_RECEIVED, ✅ FOLLOWUP_CREATED

12. POST-VISIT
    └─ Doctor may:
        ├─ Generate & print prescription PDF
        ├─ Generate & print dental chart PDF
        ├─ Compile & send PDF via WhatsApp
        ├─ View patient profile with visit history
    └─ Automated (cron jobs):
        ├─ Next day: feedback request via WhatsApp
        ├─ If outstanding: due reminder via WhatsApp
        ├─ When follow-up date passes: follow-up reminder (plain text)
        ├─ Evening: daily summary to doctor
```

### Missing Stages:
| Stage | Missing? | Impact |
|-------|----------|--------|
| Patient arrival recorded in timeline | ❌ Not recorded | No "patient entered clinic" fact |
| Patient called in recorded in timeline | ❌ Not recorded | No "patient called for session" fact |
| Treatment start recorded in timeline | ❌ Not recorded | No "examination began" fact |
| Diagnosis recording as timeline event | ❌ Not recorded (unless via extraction approval) | Diagnoses made during visit are invisible in timeline |
| Photo upload as timeline event | ❌ Not recorded | MEDIA_UPLOADED event type exists but unused |
| Procedure code linking in visit flow | ⚠️ Optional | Only linked if stepIds or procedureCodeId provided |
| Treatment step advancement during visit | ⚠️ Optional | Only if stepIds[] sent with visit completion |
| Receipt generation | ❌ Missing entirely | No receipt PDF, no receipt WhatsApp |
| Invoice generation | ❌ Missing entirely | No invoice PDF |
| Patient signs/consent | ❌ Missing entirely | No digital consent |
| Waiting time tracking | ❌ Missing | No arrival→called duration tracked |
| Treatment chair assignment | ❌ Missing | No chair/slot resource tracking |

---

## 6. Prescription Photo Flow

### Complete Trace:

```
1. DOCTOR SENDS PHOTO VIA WHATSAPP
   └─ Code: src/app/api/webhook/whatsapp/route.js
   └─ Engine: engine.js → normalizeMessage() extracts mediaId, mimeType
   └─ Handler: handlers.js → processAndStoreMedia()
   └─ Status: ✅ WORKING

2. MEDIA DOWNLOAD FROM META
   └─ Code: src/lib/media.js → downloadMediaFromMeta(mediaId)
   └─ Calls: Meta Graph API GET /v19.0/{mediaId} → download binary
   └─ Status: ✅ WORKING

3. STORE IN CLOUDFLARE R2
   └─ Code: src/lib/r2.js → uploadToR2(key, body)
   └─ Key pattern: {patientId}/{appointmentId}/{timestamp}_{type}.{ext}
   └─ Status: ✅ WORKING

4. RECORD IN DATABASE (dual write)
   └─ Code: src/lib/media.js lines 106-137
   └─ Tables:
       ├── appointments.chit_media = array_append(...)
       ├── INSERT INTO media_assets (...)
       └── INSERT INTO media_processing_jobs (..., 'ocr', 'queued')
   └─ Status: ✅ WORKING
   ⚠️ GAP: Does NOT create MEDIA_UPLOADED timeline event

5. BACKGROUND WORKER PICKS UP JOB
   └─ Code: scripts/dhara-worker.mjs (standalone Node process, polls every 10s)
   └─ SELECT ... FROM media_processing_jobs FOR UPDATE SKIP LOCKED
   └─ Status: ✅ WORKING (requires separate process running)

6. OCR PROCESSING (MiniCPM-V via Ollama)
   └─ Code: src/lib/ai/ocrClient.js → performOcr(imageBuffer)
   └─ API: Ollama localhost:11434 with minicpm-v:latest
   └─ Prompt: "Read all text from this dental prescription image..."
   └─ Status: ✅ WORKING (requires Ollama running locally)
   ⚠️ GAP: Does NOT create OCR_ATTEMPTED/COMPLETED/FAILED timeline events

7. STORE OCR RESULT
   └─ Code: dhara-worker.mjs → handleOcrJob()
   └─ INSERT INTO prescription_extractions (raw_text, extraction_status='ocr_completed')
   └─ INSERT INTO media_processing_jobs ('extraction', 'queued')
   └─ Status: ✅ WORKING

8. AI EXTRACTION (Qwen via Kali Gateway)
   └─ Code: src/lib/ai/extractionClient.js → extractPrescription(raw_text)
   └─ Client calls: Kali AI Gateway at KALI_AI_URL/extract
   └─ Gateway: ai-gateway/server.js → providers/qwen.js → Ollama qwen2.5-coder
   └─ Status: ✅ WORKING (requires Kali + Ollama)

9. UPDATE EXTRACTION RECORD
   └─ Code: dhara-worker.mjs → handleExtractionJob()
   └─ UPDATE prescription_extractions SET structured_json, extraction_status='extraction_completed'
   └─ Status: ✅ WORKING
   ⚠️ GAP: No automatic transition to 'review_pending'
   ⚠️ GAP: Dual extraction paths (worker handleExtractionJob + service performExtraction run independently)

10. DASHBOARD LIST
    └─ Code: src/app/dashboard/extractions/page.js
    └─ API: GET /api/dashboard/extractions?status=pending|approved|rejected|all
    └─ Status: ✅ WORKING

11. REVIEW & EDIT
    └─ Code: src/app/dashboard/extractions/[id]/page.js
    └─ Shows: structured_json as editable sections (patient, diagnoses, observations, treatments, medications, estimates, follow-ups)
    └─ API: PATCH /api/dashboard/extractions/[id] with save_section / approve / reject
    └─ Status: ✅ WORKING

12. APPROVE EXTRACTION
    └─ Code: src/services/extractionApprovalService.js
    └─ Transaction: sql.begin()
        ├── recordExtractionApproved() → patient_timeline_events
        ├── recordDiagnosisRecorded() → per diagnosis
        ├── recordTreatmentRecommended() → per treatment
        ├── recordTreatmentEstimated() → per estimate
        └── approveExtraction() → prescription_extractions.status='approved'
    └─ Status: ✅ WORKING

13. DASHBOARD UPLOAD PATH (ALTERNATE)
    └─ Code: src/app/api/dashboard/media/route.js (POST handler)
    └─ Uploads to R2, creates media_assets record
    ⚠️ BROKEN: Does NOT enqueue media_processing_jobs → No OCR pipeline triggered
    ⚠️ GAP: Photos uploaded via dashboard web UI never get extracted
```

### Current Status Summary:
| Stage | Status |
|-------|--------|
| WhatsApp image ingestion | ✅ Working |
| Meta API download | ✅ Working |
| R2 storage | ✅ Working |
| media_assets + job queue | ✅ Working |
| MEDIA_UPLOADED timeline event | ❌ Missing (event type exists but never created) |
| Worker polls & claims jobs | ✅ Working |
| OCR (MiniCPM-V) | ✅ Working (requires Ollama) |
| OCR_ATTEMPTED/COMPLETED/FAILED timeline events | ❌ Missing (event types exist but never created) |
| AI extraction (Qwen) | ✅ Working (requires Kali Gateway + Ollama) |
| Extraction result storage | ✅ Working |
| Auto-transition to review_pending | ❌ Missing |
| Dashboard list UI | ✅ Working |
| Dashboard review/approve UI | ✅ Working |
| Timeline events on approval | ✅ Working |
| Dashboard upload → OCR pipeline | ❌ Broken (no job enqueued) |

---

## 7. Payment Flow

### 7A. How Payment Is Collected

| Screen | What Happens | Payment Fields |
|--------|-------------|----------------|
| **QuickCheckoutModal** | Reception enters Treatment Fee + Medicine Fee (Consultation read-only) → Paid Amount → Payment Mode | fee inputs, paid amount, method selector (Cash/UPI/Card/Other), outstanding display |
| **RapidWalkInModal** | Reception enters Treatment Fee + Medicine Fee → Paid Amount → Payment Mode | fee inputs, paid amount, method selector |
| **Full Visit Page** | Doctor/reception sets treatment charges, consultation fee, medicine charges, paid amount, payment method | fee inputs in BillingProjectionCard, payment fields in visit form |
| **VisitCompleteModal** (legacy) | Sets fees only — ⚠️ does NOT collect payment (no paidAmount input) | Fee inputs only, no payment collection |

### 7B. How Payment Is Recorded

**API Route:** `POST /api/dashboard/visit` (both `complete_appointment` and `create_walk_in` modes)

**Database Tables:**

| Table | Columns | Notes |
|-------|---------|-------|
| `payments` | `id, appointment_id, patient_id, amount, direction(credit/debit), kind(payment/refund/adjustment), method(cash/upi/card/other), idempotency_key, notes, recorded_by, created_at` | INSERT via CTE in `recordPayment()` or inline in `completeVisit()` CTE |
| `appointments` | `consultation_fee, treatment_charges, medicine_charges, paid_amount, payment_status(pending/partial/paid), payment_method, transaction_id, paid_at` | Updated via CTE sync step |

**Payment Recording Flow:**
```
completeVisit() (completeVisit.js):
  ├─ sql.begin():
  │   ├─ CTE chain:
  │   │   ├─ UPDATE appointments SET fees, status, payment fields
  │   │   ├─ INSERT INTO payments (appointment_id, patient_id, amount, direction='credit', kind='payment', method)
  │   │   ├─ CTE net: SUM payments for this appointment
  │   │   └─ CTE sync: UPDATE appointments.paid_amount = net.amount, payment_status = 'paid'|'partial'|'pending'
  │   └─ INSERT INTO patient_timeline_events (PAYMENT_RECEIVED)
  └─ Best-effort: advance treatment steps if stepIds provided
```

**`recordPayment()` standalone function** (recordPayment.js):
- Same CTE pattern used by `createWalkIn()`
- Single atomic query: INSERT payment → compute net → sync appointment
- Idempotent via `idempotency_key`

### 7C. Payment-Related Timeline Events

| Event Type | When Created | Metadata |
|-----------|-------------|----------|
| `PAYMENT_RECEIVED` | Visit completion (paidAmount > 0) OR walk-in creation | `amount`, `method`, `outstanding_after` |

### 7D. Outstanding Balance Tracking

- **Storage:** Computed on-the-fly: `total = consultation_fee + treatment_charges + medicine_charges; outstanding = total - paid_amount`
- **Displayed in:**
  - QuickCheckoutModal: amber "Outstanding ₹X" banner
  - Attention Panel: "Pending Payments" tab lists patients with outstanding > 0
  - Patient profile: visit cards show payment status chips
- **NOT stored as a column.** Always computed via `SUM` on `payments` table or `total - paid_amount` on `appointments`.

### 7E. Payment Reminders

| Type | Trigger | Method | Template? | Logged? |
|------|---------|--------|-----------|---------|
| Cron due reminders | `GET /api/cron/due-reminders` daily | `sendTemplate(wa_id, 'due_reminder', [name, clinic, amount, UPI_ID])` | ✅ Yes | `due_reminder_log` table |
| Manual trigger | Dashboard `/dashboard/due-reminders` → "Send" button | Same as cron | ✅ Yes | `due_reminder_log` table |
| Attention Panel WhatsApp | Click WhatsApp button on Pending Payments tab | `sendText()` — plain text, **NOT template** | ❌ No | None |

### 7F. What Does NOT Exist

| Feature | Exists? | Evidence |
|---------|---------|----------|
| Payment receipt PDF | ❌ No | Zero grep hits for "receipt" in codebase |
| Payment invoice PDF | ❌ No | Zero grep hits for "invoice" in codebase |
| Online payment gateway | ❌ No | Only UPI ID sent as text in WhatsApp messages |
| Payment links | ❌ No | `payment_reminder` template expects `payment_link` param but no code generates or sends payment links |
| Payment reconciliation UI | ❌ No | No UI for refunds/adjustments despite `payments.kind` supporting 'refund' |
| Installment/EMI tracking | ❌ No | Single payment per visit model |
| Partial payment history per visit | ⚠️ Partial | `payments` table supports multiple payments per appointment via CTE net sum, but UI always sends as one payment |
| Balance carry-forward between visits | ❌ No | Each visit has its own fee/billing/payment independent of other visits |

### 7G. Payment Tables & Columns (Complete)

**`payments` table:**
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | gen_random_uuid() |
| appointment_id | UUID FK | → appointments(id) |
| patient_id | UUID | |
| amount | INTEGER | |
| direction | VARCHAR(20) | CHECK: credit/debit |
| kind | VARCHAR(50) | CHECK: payment/refund/adjustment |
| method | VARCHAR(50) | cash/upi/card/other |
| idempotency_key | TEXT UNIQUE | Prevents double-charge |
| notes | TEXT | |
| recorded_by | VARCHAR(50) | usually 'reception' |
| created_at | TIMESTAMPTZ | |

**`appointments` payment columns:**
| Column | Type | Notes |
|--------|------|-------|
| consultation_fee | INTEGER | |
| treatment_charges | INTEGER | |
| medicine_charges | INTEGER | |
| treatment_fees | JSONB | Line items |
| paid_amount | INTEGER | Computed/cached |
| payment_status | VARCHAR(20) | pending/partial/paid |
| payment_method | VARCHAR(50) | |
| transaction_id | VARCHAR(255) | |
| paid_at | TIMESTAMPTZ | |

---

## 8. Timeline / Memory Flow

### 8A. What Creates Timeline Events

| # | Trigger | Service | Function | Event Type | Actor Type |
|---|---------|---------|----------|------------|------------|
| 1 | Treatment plan created | `treatmentPlanService.js` | `createPlanWithSteps()` | `PLAN_CREATED` | doctor |
| 2 | Treatment step completed | `treatmentPlanService.js` | `completeVisitSteps()` | `STEP_COMPLETED` | doctor |
| 3 | Treatment plan completed | `treatmentPlanService.js` | `completeVisitSteps()` | `PLAN_COMPLETED` | doctor |
| 4 | Visit completed (appointment) | `completeVisit.js` | `completeVisit()` | `VISIT_COMPLETED` | followupCreatedBy or doctor |
| 5 | Follow-up scheduled | `completeVisit.js` | `completeVisit()` | `FOLLOWUP_CREATED` | followupCreatedBy or doctor |
| 6 | Follow-up cancelled | `completeVisit.js` | `completeVisit()` | `FOLLOWUP_CANCELLED` | followupCreatedBy or doctor |
| 7 | Payment received (appointment) | `completeVisit.js` | `completeVisit()` | `PAYMENT_RECEIVED` | doctor |
| 8 | Walk-in visit completed | `createWalkIn.js` | `createWalkIn()` | `VISIT_COMPLETED` | reception |
| 9 | Walk-in payment received | `createWalkIn.js` | `createWalkIn()` | `PAYMENT_RECEIVED` | reception |
| 10 | Attention acknowledged | `attentionEngine.js` | `setAttentionStatus()` | `ATTENTION_ACKNOWLEDGED` | (parameterized) |
| 11 | Attention resolved (manual) | `attentionEngine.js` | `setAttentionStatus()` | `ATTENTION_RESOLVED` | (parameterized) |
| 12 | Attention re-opened | `attentionEngine.js` | `setAttentionStatus()` | `ATTENTION_REOPENED` | (parameterized) |
| 13 | Extraction approved | `extractionApprovalService.js` | `approveExtractionAndCreateTimeline()` | `EXTRACTION_APPROVED` | doctor (hardcoded) |
| 14 | Diagnosis from photo | `extractionApprovalService.js` | (loop) | `DIAGNOSIS_RECORDED` | doctor (hardcoded) |
| 15 | Treatment from photo | `extractionApprovalService.js` | (loop) | `TREATMENT_RECOMMENDED` | doctor (hardcoded) |
| 16 | Financial estimate from photo | `extractionApprovalService.js` | (loop) | `TREATMENT_ESTIMATED` | doctor (hardcoded) |

### 8B. All 18 Event Types (from `eventTypes.js`)

| # | Event Type | Category | Recording Function? | Called Anywhere? |
|---|-----------|----------|-------------------|------------------|
| 1 | `PLAN_CREATED` | Treatment Plan | ✅ Yes | ✅ Yes |
| 2 | `STEP_COMPLETED` | Treatment Plan | ✅ Yes | ✅ Yes |
| 3 | `PLAN_COMPLETED` | Treatment Plan | ✅ Yes | ✅ Yes |
| 4 | `FOLLOWUP_CREATED` | Follow-up | ✅ Yes | ✅ Yes |
| 5 | `FOLLOWUP_CANCELLED` | Follow-up | ✅ Yes | ✅ Yes |
| 6 | `PAYMENT_RECEIVED` | Payment | ✅ Yes | ✅ Yes |
| 7 | `VISIT_COMPLETED` | Visit | ✅ Yes | ✅ Yes |
| 8 | `ATTENTION_ACKNOWLEDGED` | Attention | ✅ Yes | ✅ Yes |
| 9 | `ATTENTION_RESOLVED` | Attention | ✅ Yes | ✅ Yes |
| 10 | `ATTENTION_REOPENED` | Attention | ✅ Yes | ✅ Yes |
| 11 | `EXTRACTION_APPROVED` | Extraction | ✅ Yes | ✅ Yes |
| 12 | `DIAGNOSIS_RECORDED` | Extraction | ✅ Yes | ✅ Yes |
| 13 | `TREATMENT_RECOMMENDED` | Extraction | ✅ Yes | ✅ Yes |
| 14 | `TREATMENT_ESTIMATED` | Extraction | ✅ Yes | ✅ Yes |
| 15 | `MEDIA_UPLOADED` | Media/OCR | ❌ No | ❌ Never |
| 16 | `OCR_ATTEMPTED` | Media/OCR | ❌ No | ❌ Never |
| 17 | `OCR_COMPLETED` | Media/OCR | ❌ No | ❌ Never |
| 18 | `OCR_FAILED` | Media/OCR | ❌ No | ❌ Never |

### 8C. How Dhara Reason Consumes Timeline

`dharaReason.js` runs 5 parallel queries in `getReason()`:
1. **Patient query:** `SELECT * FROM patients WHERE id = ${patientId}`
2. **Plans query:** `SELECT * FROM treatment_plans WHERE patient_id = ${patientId} AND status = 'active'`
3. **Last visit query:** `SELECT * FROM appointments WHERE patient_id = ${patientId} AND status = 'completed' ORDER BY date DESC LIMIT 1`
4. **Timeline query:** `SELECT * FROM patient_timeline_events WHERE patient_id = ${patientId} ORDER BY event_time DESC LIMIT 20`
5. **Recent treatment check:** Checks if a completed visit exists within last 90 days

**Important finding:** The timeline query results (`timeline_event_count`, `last_event_type`, `last_event_time`) are collected into the `analysis` output object but are **NOT used for any decision-making**. They are:
- Not used in `determinePriority()` (uses active plan + follow-up date + outstanding balance)
- Not used in `computeConfidence()` (uses signal count)
- Not used in `buildEvidence()` (uses plan, visit, balance data)
- Not used in `buildReason()` or `buildRecommendation()`

**Timeline data is output-only metadata in Dhara Reason v1.** No rules reference timeline events.

### 8D. Which Facts Become Memory

| Category | Facts Recorded | Event Type |
|----------|---------------|------------|
| Treatment | Plan created, step completed, plan completed | `PLAN_CREATED`, `STEP_COMPLETED`, `PLAN_COMPLETED` |
| Visit | Visit completed | `VISIT_COMPLETED` |
| Payment | Payment received with amount/method/outstanding | `PAYMENT_RECEIVED` |
| Follow-up | Follow-up scheduled/cancelled | `FOLLOWUP_CREATED`, `FOLLOWUP_CANCELLED` |
| Attention | Acknowledged/resolved/reopened | `ATTENTION_ACKNOWLEDGED/RESOLVED/REOPENED` |
| Extraction | Extraction approved with diagnoses/treatments/estimates | `EXTRACTION_APPROVED`, `DIAGNOSIS_RECORDED`, `TREATMENT_RECOMMENDED`, `TREATMENT_ESTIMATED` |

### 8E. Which Facts Do NOT Become Memory

| Fact Category | Specific Facts | Why Missing |
|--------------|---------------|------------|
| Arrival | Patient arrived at clinic | No event type |
| Queue | Patient called to chair | No event type |
| Consultation | Examination began | No event type |
| Diagnosis | Doctor recorded a diagnosis during visit (unless via photo extraction) | No recording function for visit-based diagnosis |
| Treatment selected | Treatment was selected for visit | No event type |
| Photo uploaded | Media uploaded during visit | Event types exist (`MEDIA_UPLOADED`) but unused |
| OCR lifecycle | OCR attempted/completed/failed | Event types exist (`OCR_ATTEMPTED`, `OCR_COMPLETED`, `OCR_FAILED`) but unused |
| Appointment created | Patient booked an appointment | No event type |
| Appointment rescheduled | Appointment date/time changed | No event type |
| Appointment cancelled | Patient/dector cancelled | No event type (except follow-up cancellation) |
| Appointment no-show | Patient didn't show | No event type |
| Patient data edited | Name/age/sex/phone changed | No event type |
| WhatsApp messages | Messages sent/received | Separate `messages` table, no timeline integration |
| Feedback/ratings | Patient submitted review | `patient_reviews` table, no timeline integration |
| Family changes | Family member linked/unlinked | `patient_relationships` table, no timeline integration |
| Treatment plan abandoned | Plan set to abandoned/on_hold | No event type |
| Step skipped | Treatment step skipped | No event type (`recordStepSkipped` doesn't exist) |
| PDF generated | Prescription/chart PDF generated | No event type |
| Attention auto-resolved | Plan completed auto-sets attention to resolved | `recalculatePlan()` skips timeline for auto-resolve |

### 8F. Timeline Storage & Retrieval

- **Table:** `patient_timeline_events` (18 columns including patient_id, event_type, actor_type, metadata JSONB)
- **Indexes:** patient_id+event_time DESC, event_type, source_type+source_id, event_type+actor_type
- **Record function:** `recordEvent(sql, { patient_id, event_type, actor_type, ... })` in `timelineService.js`
- **Read function:** `getPatientTimeline(sql, patientId, limit=50)` — returns raw rows
- **Renderer:** `timelineRenderer.js` — `describeEvent()`, `getEventSeverity()`, `getEventColor()`, `getEventIcon()`
- **UI display:** Patient profile page uses its own inline rendering (NOT `timelineRenderer`). The `PerToothHistory` section builds a separate visual timeline by aggregating `tooth_diagnoses` from completed visits — this is NOT using the `patient_timeline_events` table at all.

---

## 9. Current Friction Report

### 9A. Doctor Friction Points

| Friction | Severity | Details |
|----------|----------|---------|
| No role-based login | **HIGH** | Doctor and reception share same login. No distinction. |
| Timeline events are invisible to doctor | **MEDIUM** | `patient_timeline_events` populated but NOT displayed on patient profile (profile uses visit-based inline rendering instead). `timelineRenderer.js` exists but is never used by the UI. |
| Diagnoses recorded during visit don't go to timeline | **MEDIUM** | Only photo-extraced diagnoses create `DIAGNOSIS_RECORDED` events. Diagnoses entered via PerToothDiagnosisPanel during a live visit are invisible in timeline. |
| Photo uploads from dashboard bypass OCR | **MEDIUM** | `POST /api/dashboard/media` does not enqueue OCR jobs. Photos uploaded via dashboard web UI never get extracted. |
| Prescription photo flow requires 2 separate services (worker + AI gateway + Ollama) | **HIGH** | Requires: dhara-worker.mjs (running), Kali Gateway server (port 3002), Ollama (port 11434) with 2 models (MiniCPM-V + Qwen). Any one missing breaks the pipeline. |
| Attention Panel WhatsApp sends plain text | **MEDIUM** | Follow-up reminders use `sendText()` instead of `sendTemplate()`. Unreliable outside 24h window. Meta templates listed as "Next Up" in AGENTS.md but not implemented. |
| No receipt/invoice for patient | **LOW** | Patient pays but gets no formal receipt or invoice, only WhatsApp message confirmation. |
| Outstanding balance computed, never stored | **LOW** | Every payment query recomputes net. No running balance. |
| No chair/operator/room tracking | **LOW** | Can't track which chair or operator a patient is assigned to. |
| Waiting time not tracked | **LOW** | No analytics for arrival→called→completed duration. |
| Data entry is high in full visit form | **HIGH** | Full clinical form has ~12 sections (chief complaint, exam notes, tooth grid, diagnosis, prescription, advice, billing, follow-up, media, etc.) — many fields for routine visits. |
| Dhara Reason output not shown to doctor | **MEDIUM** | `GET /api/dashboard/patients/[id]/reason` route exists but no UI consumes it. The "Dhara Reason Modal" is listed as "Next Up". |

### 9B. Reception Friction Points

| Friction | Severity | Details |
|----------|----------|---------|
| Quick Checkout requires entering fee/paid manually | **MEDIUM** | Reception must enter treatment fee (₹500 default in RapidWalkInModal) and paid amount manually. No preset fees per treatment type. |
| No quick search in RapidWalkInModal | **MEDIUM** | Walk-in modal has debounced search (250ms, 2-char min), but if no match, must type full name + phone manually. |
| No role separation | **HIGH** | Reception and doctor share same UI. Reception sees clinical tooth grid, diagnosis panel. No restricted reception view. |
| Queue page auto-refresh every 30s | **LOW** | Tab must be visible. Background tab pauses. |
| No SMS/email fallback for reminders | **MEDIUM** | All reminders are WhatsApp-only. No SMS, no email. If patient doesn't have WhatsApp, no reminders. |
| Outstanding shown but no quick "Mark as Paid" in queue | **LOW** | Attention Panel has "Collect" button for payments, but from Queue Board you must open visit page to handle payment. |

### 9C. Patient Friction Points

| Friction | Severity | Details |
|----------|----------|---------|
| No patient portal/web app | **HIGH** | Patient can only interact via WhatsApp. No web portal to view history, invoices, treatment plan, upcoming appointments. |
| No online payment | **HIGH** | Payment reminders include UPI ID as text. Patient must manually open UPI app and pay. No payment link. No payment gateway. |
| No receipt/invoice | **MEDIUM** | Patient pays but receives no formal document. Only WhatsApp confirmation. |
| No treatment plan visibility | **MEDIUM** | Patient can't see their treatment plan (steps, progress, next appointment). No WhatsApp message summarizing plan. |
| No appointment availability browsing | **MEDIUM** | Patient can't see open slots. Bot suggests times. Cannot self-serve. |
| **Follow-up reminders are plain text** | **MEDIUM** | `GET /api/cron/follow-up-reminders` uses `sendText()` — unreliable outside 24h WhatsApp window. |
| No ability to reschedule via WhatsApp after booking confirmed | **LOW** | Can reschedule from post-booking menu but must go through full booking flow again. |
| Hindi language support is partial | **LOW** | `translations.js` has Hindi strings but bot primarily responds in English. Language detection is basic keyword-matching. |

### 9D. Click Count Summary (Critical Workflows)

| Workflow | Screens Visited | Clicks/Taps | API Calls | WhatsApp Messages |
|----------|----------------|-------------|-----------|-------------------|
| Quick Book (dashboard) | 2 (calendar → modal) | ~8 | 1 POST | 0 |
| Full Visit Complete | 4 (dashboard → visit → panels → submit) | ~30-50+ | 1 POST | 0 |
| Quick Checkout | 3 (dashboard → details → checkout modal) | ~7 | 1 POST | 0 |
| Rapid Walk-In | 2 (dashboard → FAB → modal) | ~6 | 1 POST | 0 |
| WhatsApp Booking (patient) | 1 (WhatsApp chat) | ~8-12 taps | 10-15 engine turns | 0 (patient-initiated) |
| Prescription Photo OCR | 2 (WhatsApp → extraction review) | ~5 (doctor sends) + ~15 (review/edit) | ~4 (webhook → worker → worker → approve) | 1 (doctor sends photo) |
| Generate Prescription | 2 (profile/visit → Rx button) | ~3 | 1 GET | 0 |
| Send Document to Patient | 2 (profile → Compile & Send) | ~4 | 2 POSTs (compile + send) | 1 |
| Acknowledge Attention Item | 2 (dashboard → attention panel) | ~3 | 1 PATCH | 0 |
| Send WhatsApp via Dashboard | 2 (profile → messages) | ~5-8 | 1 POST | 1 |

---

## 10. Final Reality Map

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                            PATIENT ENTERS CLINIC                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
                                    │
            ┌───────────────────────┴───────────────────────┐
            ▼                                               ▼
    ┌───────────────┐                               ┌───────────────┐
    │ PRE-BOOKED    │                               │ WALK-IN       │
    │ (WhatsApp or  │                               │ (QR scan or   │
    │  Dashboard)   │                               │  reception)   │
    └───────┬───────┘                               └───────┬───────┘
            │                                               │
            ▼                                               ▼
    ┌───────────────┐                               ┌───────────────┐
    │ RECEPTIONIST  │                               │ RECEPTIONIST  │
    │ marks Arrived │                               │ creates via   │
    │ (Queue Board) │                               │ Rapid Walk-In │
    │ API: /arrival │                               │ or Visit Page │
    │ DB: appts     │                               │ API: /visit   │
    └───────┬───────┘                               └───────┬───────┘
            │                                               │
            │        TIMELINE: ❌ No arrival event           │
            ▼                                               ▼
    ┌───────────────┐                               ┌───────────────┐
    │ RECEPTIONIST  │                               │ PATIENT IN    │
    │ "Call Patient"│                               │ QUEUE         │
    │ API: /arrival │                               │               │
    │ DB: appts     │                               │               │
    └───────┬───────┘                               └───────┬───────┘
            │                                               │
            │        TIMELINE: ❌ No called event            │
            ▼                                               ▼
    ┌───────────────────────────────────────────────────────────────┐
    │                     DOCTOR STARTS VISIT                        │
    │              Queue Board → "Start Visit" → /visit             │
    └───────────────────────────────────────────────────────────────┘
                                    │
            ┌───────────────────────┴───────────────────────┐
            │                                               │
            ▼                                               ▼
    ┌───────────────────┐                           ┌───────────────────┐
    │ CONSULTATION      │                           │ DIAGNOSIS         │
    │ - Chief Complaint │                           │ - ToothGrid       │
    │ - Exam fields     │                           │ - Per-tooth panel │
    │ - Clinical notes  │                           │ - Surface/severity│
    │ - Diagnosis       │                           │ - Treatment/status│
    │ DB: (unsaved)     │                           │ - Outcome/notes   │
    └───────────────────┘                           └────────┬──────────┘
            │                                               │
            │     TIMELINE: ❌ No diagnosis event            │
            ▼                                               ▼
    ┌───────────────────────────────────────────────────────────────┐
    │                     TREATMENT & PRESCRIPTION                   │
    │ - Select treatment / procedure code                           │
    │ - Add medicines (name, dose, frequency, duration)             │
    │ - Add advice checklist                                        │
    │ - Upload intra-oral photos (dashboard media)                  │
    │   API: /media → R2 → media_assets → ❌ NO OCR                 │
    │ TIMELINE: ✅ PLAN_CREATED (if procedureCodeId)                 │
    │            ❌ No MEDIA_UPLOADED event                          │
    └───────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
    ┌───────────────────────────────────────────────────────────────┐
    │                     BILLING & PAYMENT                          │
    │ - Consultation fee + Treatment fee + Medicine fee             │
    │ - Paid amount + Payment method (Cash/UPI/Card/Other)          │
    │ - Outstanding = total - paid (computed, not stored)           │
    │ API: /visit → CTE: INSERT payments + UPDATE appointments       │
    │ DB: payments, appointments.paid_amount/payment_status         │
    │ TIMELINE: ✅ PAYMENT_RECEIVED (amount, method, outstanding)    │
    │ ❌ No receipt                                                 │
    │ ❌ No invoice                                                 │
    │ ❌ No payment link                                            │
    └───────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
    ┌───────────────────────────────────────────────────────────────┐
    │                     FOLLOW-UP (Optional)                       │
    │ - Checkbox (default OFF in QuickCheckout)                     │
    │ - Date (default +7 days)                                      │
    │ - Reason (Review/Extraction Check/Crown/RCT/Scaling/Other)    │
    │ DB: appointments.follow_up_date, follow_up_status='pending'   │
    │ TIMELINE: ✅ FOLLOWUP_CREATED                                  │
    └───────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
    ┌───────────────────────────────────────────────────────────────┐
    │                     VISIT COMPLETION                           │
    │ API: POST /api/dashboard/visit (single completion path)       │
    │ TRANSACTION (sql.begin):                                      │
    │   1. UPDATE appointments SET status='completed', ALL fields   │
    │   2. INSERT INTO payments (CTE with net calculation)          │
    │   3. INSERT INTO patient_timeline_events                      │
    │ POST-TRANSACTION (best-effort):                               │
    │   4. UPDATE treatment_plan_steps (if stepIds provided)        │
    │   5. UPDATE settings (medicine usage tracking)                │
    └───────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
    ┌───────────────────────────────────────────────────────────────┐
    │                     POST-VISIT ACTIONS                         │
    │                                                                │
    │  Generate Prescription PDF                                     │
    │  GET /visits/[id]/prescription → PDFKit → R2 cache             │
    │  TIMELINE: ❌ No event                                          │
    │                                                                │
    │  Generate Dental Chart PDF                                     │
    │  POST /visits/[id]/chart → PDFKit → R2 cache                   │
    │  TIMELINE: ❌ No event                                          │
    │                                                                │
    │  Compile & Send to Patient                                     │
    │  POST /visits/[id]/compile → POST /compile/send                │
    │  → WhatsApp document to patient                                │
    │                                                                │
    │  Send WhatsApp Message                                         │
    │  /send-whatsapp or /patients/[id]/send-message                 │
    │  → Meta Cloud API                                              │
    │                                                                │
    │  View Patient Profile                                          │
    │  /patients/[id] — visit history, per-tooth timeline             │
    │  (uses inline rendering, NOT patient_timeline_events)          │
    └───────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
    ┌───────────────────────────────────────────────────────────────┐
    │                     AUTOMATED (CRON JOBS)                      │
    │                                                                │
    │  ⏰ 24h before: Appointment Reminder                           │
    │     /cron/reminders → sendTemplate('appointment_reminder')     │
    │                                                                │
    │  ☀️ Post-visit: Feedback Request                               │
    │     /cron/feedback → sendTemplate('feedback_request')          │
    │                                                                │
    │  💰 Daily: Due Payment Reminder                                │
    │     /cron/due-reminders → sendTemplate('due_reminder', UPI)    │
    │     + due_reminder_log table                                   │
    │                                                                │
    │  📅 Daily: Follow-up Reminder                                  │
    │     /cron/follow-up-reminders → sendText() (NOT template!)     │
    │     ⚠️ Plain text — unreliable outside 24h window              │
    │                                                                │
    │  🌆 Evening: Daily Summary to Doctor                           │
    │     /cron/evening-checkin → sendText() to doctor's WA          │
    └───────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
    ┌───────────────────────────────────────────────────────────────┐
    │                     DHARA ENGINE (BACKGROUND)                  │
    │                                                                │
    │  ATTENTION ENGINE (attentionEngine.js)                         │
    │  ┌──────────────────────────────────────────────────────┐      │
    │  │ Overdue Followups │ Incomplete Treatments │ Payments │      │
    │  └──────────────────────────────────────────────────────┘      │
    │  API: GET /api/dashboard/attention                             │
    │  UI: AttentionPanel on dashboard                               │
    │  Actions: WhatsApp / Acknowledge / Resolve / Re-open           │
    │  TIMELINE: ✅ ATTENTION_ACKNOWLEDGED/RESOLVED/REOPENED         │
    │                                                                │
    │  DHARA REASON (dharaReason.js)                                 │
    │  ┌──────────────────────────────────────────────┐              │
    │  │ 5 parallel queries: patient, plans,          │              │
    │  │ last visit, timeline (20 events),            │              │
    │  │ recent treatment check                       │              │
    │  │ → Priority (HIGH/MEDIUM/LOW)                 │              │
    │  │ → Confidence (1.0/0.8/0.6/0.4)              │              │
    │  │ → Reason narrative                           │              │
    │  │ → Evidence[] (machine-readable)              │              │
    │  └──────────────────────────────────────────────┘              │
    │  API: GET /api/dashboard/patients/[id]/reason                  │
    │  UI: ❌ No UI yet (Next Up: Dhara Reason Modal)                │
    │  NOTE: Timeline data in reason is OUTPUT-ONLY.                 │
    │        Not used for priority/confidence/evidence.              │
    │                                                                │
    │  DHARA WORKER (dhara-worker.mjs)                               │
    │  ┌──────────────────────────────────────────────┐              │
    │  │ Polls media_processing_jobs every 10s        │              │
    │  │ → OCR (MiniCPM-V via Ollama)                 │              │
    │  │ → Extraction (Qwen via Kali Gateway)         │              │
    │  │ TIMELINE: ❌ No OCR/extraction events          │              │
    │  └──────────────────────────────────────────────┘              │
    │                                                                │
    │  TREATMENT PLAN ENGINE (treatmentPlanService.js)               │
    │  ┌──────────────────────────────────────────────┐              │
    │  │ createPlanWithSteps() → PLAN_CREATED ✓       │              │
    │  │ completeVisitSteps() → STEP_COMPLETED ✓      │              │
    │  │ recalculatePlan() → PLAN_COMPLETED ✓         │              │
    │  └──────────────────────────────────────────────┘              │
    │  NOTE: StepIds must be explicitly passed in visit              │
    │  completion. Auto-advance on visit complete is                 │
    │  best-effort — failure is logged, not blocking.               │
    └───────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
    ┌───────────────────────────────────────────────────────────────┐
    │                     PATIENT LEAVES CLINIC                      │
    └───────────────────────────────────────────────────────────────┘

                    ──── KEY GAPS IN THE REALITY MAP ────

    TIMELINE:
    ● 18 event types defined, only 14 have recording functions
    ● 4 event types (MEDIA_UPLOADED, OCR_ATTEMPTED/COMPLETED/FAILED) exist but are NEVER created
    ● Timeline data feeds Dhara Reason but is NOT used for decision-making
    ● Patient profile uses inline rendering, NOT the timeline events table
    ● Per-tooth history is built from tooth_diagnoses JSONB, not from timeline events
    ● Visit-based diagnosis events (DIAGNOSIS_RECORDED) only created via photo extraction approval

    PAYMENTS:
    ● No receipts, invoices, or payment links
    ● Outstanding is computed, never stored as running balance
    ● Single-payment-per-visit model (no installments)
    ● No payment gateway integration (UPI ID sent as text)
    ● No balance carry-forward between visits

    OCR PIPELINE:
    ● Dashboard media upload bypasses OCR (no job enqueued)
    ● Worker and service layer have duplicate extraction paths (race condition risk)
    ● No automatic review_pending flag
    ● Requires 3 separate services: worker + Kali Gateway + Ollama

    PATIENT:
    ● No patient portal or web app
    ● WhatsApp-only communication
    ● Follow-up reminders use plain text (not template) — unreliable
    ● No online payment capability
    ● No treatment plan visibility
```
