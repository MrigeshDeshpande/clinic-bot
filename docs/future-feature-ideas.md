# Future Feature Ideas

## Short-term / High Impact

### 1. Appointment Calendar ✅ ALREADY EXISTS
Already implemented — monthly calendar with color-coded slots, slot grid (open/booked/past), quick-book modal, appointment list view, queue board, reschedule/cancel, arrival workflow, blocked dates, WhatsApp reminders. See `/dashboard` calendar + `/dashboard/appointments` table view + `/dashboard/queue` kanban board. Notable gaps: no **drag-to-reschedule**, no **appointment duration** (fixed 30-min slots), no **multi-doctor schedule**, and no **weekly/daily timeline view** (like Google Calendar).

### 2. Dashboard Analytics
Monthly revenue chart, new vs returning patients rate, treatment-type breakdown (pie/bar), collection efficiency (collected vs total billed), pending follow-ups heatmap. Filterable by date range.

### 3. Patient Search Drawer
Global search in the header across name, phone, address. Unified search drawer that pops open with a keyboard shortcut (e.g., `Cmd+K`). Show recent patients. Show "patients due for follow-up" when search is empty.

### 4. Treatment Cost Estimation / Consent
Share a printed estimate before starting work (separate from the post-treatment bill). Include digital acceptance / signature capture on tablet. Store signed consent PDF per patient.

### 5. Recall / Reminder Engine
Auto-detect patients due for 6-month checkups (or per-treatment recall interval). Send WhatsApp reminders using existing UPI link infra. Show "Overdue" / "Due Soon" badges on patient profile cards.

---

## Medium-term

### 6. Lab Case Tracker
Track cases sent to dental lab — crowns, bridges, dentures, cast partials, etc. Status: Sent → In Progress → Received → Fitted. Fields: lab name, due date, material type, cost. Link treatment to lab case. Show overdue cases on dashboard.

### 7. Inventory / Consumables Tracking
Stock levels for composites, bonding agent, anaesthetic, gloves, masks, sutures, etc. Low-stock alerts. Consumption auto-decremented against treatment (every composite filling → −1 composite). Generate purchase orders.

### 8. Clinical Notes & Prescription History
Dedicated free-text clinical notes field per visit (separate from structured diagnosis). Full prescription history view on patient profile — all past medications with date, dosage, duration. Show drug interaction warnings.

### 9. Multi-clinic / Multi-doctor Support
Role-based access: Admin, Doctor, Receptionist, Lab Tech. Separate dashboard per doctor. Shared patient pool with per-doctor assignments. Commission tracking per treatment.

### 10. Digital Radiograph (X-Ray) Integration
Upload/view intra-oral X-rays alongside tooth chart. Overlay X-ray with tooth grid. AI-assisted caries detection on X-ray (long-term). DICOM support for CBCT scans.

---

## Long-term / Stretch

### 11. Patient Portal / Mobile App
Patient-facing view: appointment history, past prescriptions, download PDFs, request refills, fill pre-consultation forms online. WhatsApp-based chatbot for automated booking and reminders.

### 12. Insurance / TPA Claim Management
Digitize insurance claims — store policy details, submit pre-authorization requests, track claim status. Generate insurance-friendly treatment reports (SOAP format, ICD/SNODENT codes).

### 13. Teledentistry / Video Consultation
In-app video call for remote triage. Store recording link. Write e-prescription with digital signature. Automated follow-up after tele-consult.

### 14. Treatment Plan Wizard
Multi-step wizard: diagnosis → recommended procedures → cost estimate → timeline (phases) → consent. Patient approves digitally. Track each phase completion. Show "treatment progress %" on dashboard.

### 15. Payment Gateway & EMI
Integrate Razorpay/Stripe for online payment. Partial / EMI payment plans embedded into treatment wizard. Auto-reconciliation with bank statement. Send payment receipt via WhatsApp.

### 16. Smart Tooth Chart
AI suggestion of common diagnoses based on tooth type and position. Highlight teeth that received treatment in previous visits. Show treatment timeline per tooth (e.g., 36 was filled 2024-03 → now needs crown).

### 17. Automated Case Presentation
Generate patient-friendly treatment explanation PDF: tooth diagram with highlighted problem, plain-language description of condition, treatment options with pros/cons, cost comparison. Print or WhatsApp share.

### 18. Regulatory Compliance (India)
Generate clinical records compliant with National Dental Commission / State Dental Council guidelines. Retention reports. Audit log for every data change. Consent forms in Hindi + English.

### 19. Custom Form Builder
Allow clinic to create custom intake forms (medical history, child patient form, COVID screening, etc.). Drag-and-drop field types. Responses stored per visit. Export to PDF.

### 20. Offline-first Mode
PWA with full offline support — service worker caches all API responses, IndexedDB for queuing mutations when offline. Sync when connectivity returns. Critical for areas with patchy internet.

---

## Quick Wins (1-2 day implementation)

- **Shareable treatment plan link** — Generate a short link to a patient-facing view of their treatment plan and cost estimate
- **Auto-generate next visit date** — Pre-fill follow-up field with smart defaults (3 months, 6 months, 1 year) based on treatment type
- **Treatment completion certificate** — One-click PDF certifying completed treatment for medico-legal / school purposes
- **WhatsApp invoice share** — "Share Bill on WhatsApp" button that sends a formatted invoice with payment link
- **Bulk patient import** — Upload patients via CSV/Excel (name, phone, address, age) for clinics migrating from another system
- **Smart defaults** — Populate common values (blood group, chronic conditions, allergies) from patient history into visit form on new patient creation
