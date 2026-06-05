# Web App vs WhatsApp Bot — Feature Gap Analysis

> **Date:** 2026-06-02
> **Scope:** Full end-to-end audit of the Shri Balaji Dental Clinic dashboard web app and WhatsApp bot
> **Conclusion:** The core clinical workflow is mirrored on both sides. Differences are primarily interface-driven (bot uses sequential wizards, web uses parallel form-based UIs) or automation-specific (CRON jobs are inherently server-side).

---

## Feature Comparison Matrix

| Feature | Web App | WhatsApp Bot |
|---------|---------|-------------|
| **Appointment Booking** | Quick book modal (single treatment) | Full wizard (treatment→date→time→name), multi-treatment, corrections, reschedule |
| **Appointment Reminders** | ❌ | ✅ 24h CRON reminder |
| **Post-visit Feedback** | View only (read feedback) | ✅ Auto-sent CRON + rating collection (great/okay/poor) |
| **Visit Summary to Patient** | Print from detail page | ✅ Auto-sent via WhatsApp with fee breakdown |
| **Prescription PDF** | ❌ (medicines captured but no PDF) | ✅ Generated via `prescription.js` + sent as document via WhatsApp |
| **Cancel / Reschedule** | Status change only (no-show) | ✅ Full cancel flow + reschedule with versioned superseding |
| **Language** | English only | ✅ English + Hindi (auto-detect, switchable) |
| **Emergency Handling** | ❌ (N/A for dashboard) | ✅ Emergency contact info, keyword-detectable (pain, bleeding, swelling) |
| **Human Escalation** | ❌ | ✅ Auto-detected frustration + escalation to clinic phone |
| **Correction System** | ❌ | ✅ Mid-booking corrections ("actually", "change it to", "wait") |
| **Progressive Field Fill** | ❌ | ✅ Partial info across multiple messages, re-checked on each field set |
| **Multi-treatment Booking** | Single treatment field | ✅ Add multiple treatments per booking with "Add Another" / "Done" |
| **Family Selection** | View only (family list in patient detail) | ✅ Select which family member to book for at booking start |
| **Queue Management** | Full kanban board (Waiting / In Session / Completed) | View queue + call next patient + mark arrived |
| **Visit Logging** | Full bento form (all fields at once: fees, diagnosis, medicines, attachments, follow-up, notes) | Sequential wizard (LOG_TREATMENT → LOG_CONSULTATION_FEE → ... → LOG_MEDIA) |
| **Stats / Analytics** | Charts (area, bar), trends, peak hours, day-of-week, treatment breakdown, demographics, CSV export | Simplified summary (daily/weekly/monthly: count, revenue, no-show rate, top treatment) |
| **Schedule (block dates)** | ✅ Monthly calendar + block/unblock with reason | ✅ Same + auto-cancel + notify affected patients |
| **Patient Search** | ✅ Typeahead in sidebar + detail page with visit history, messages, feedback | ✅ Name/phone search + visit history + message history + edit |
| **Register New Patient** | Auto-created on booking or walk-in (web creates implicitly) | ✅ Full wizard (name → age → sex → phone → walk-in/appointment) |
| **Chat Mode / Send Message** | ✅ Manual mode toggle + send message modal (bot goes silent) | ❌ (bot is the chat interface; manual mode pauses auto-reply) |
| **Real-time Message Stream** | ✅ SSE endpoint for live message updates | ❌ (N/A — bot is the message source) |
| **Media Upload / View** | ✅ Upload via visit form, view with lightbox gallery | ✅ Doctor sends/receives via chat, stored as `chit_media` on appointment |
| **Audio Transcription** | ❌ | ✅ Doctor's voice notes transcribed to text for visit notes |
| **Evening Check-in** | ❌ | ✅ CRON: "missed 11:30" marks no-show, "all good" confirms |
| **Daily Summary to Doctor** | ❌ | ✅ CRON: morning table of today's appointments with patient details |
| **Notification Panel** | ✅ Bell icon with today counts, pending callbacks, cancellations | ❌ (N/A — real-time WhatsApp is the notification channel) |
| **Dark Mode** | ✅ Sun/Moon toggle, persists to localStorage | ❌ (N/A) |
| **Feedback Callback Mgmt** | ✅ Mark callback as contacted (PATCH) | ✅ Auto-creates callback on "poor" + escalation |
| **Inline Patient Edit** | ✅ Name, age, sex, phone | ✅ Name, age, sex via wizard |
| **Message History** | ✅ Tab in patient detail, with SSE live updates | ✅ Last 30 messages with sender labels |
| **Bulk Actions** | ✅ Complete All / Cancel All for a date | ✅ Mark All Completed for today's appointments |
| **Print** | ✅ Visit summary + patient record | ❌ (N/A) |
| **Symptom-based Treatment Suggestion** | ✅ In visit form (`suggestTreatment`) | ✅ "help me choose" → symptom description → recommendation |

---

## Notable Gaps

### Bot has, Web lacks
1. **Prescription PDF generation** — `src/lib/prescription.js` exists but web app only captures medicines; no "Generate & Send PDF" button
2. **CRON automations** — reminders, feedback requests, daily summary, evening check-in (server-side by nature)
3. **Booking correction / reschedule** — web app has no UI for editing an existing booking's date/time/treatment mid-flow
4. **Audio transcription** — bot transcribes doctor voice notes; web has no audio upload → transcribe flow

### Web has, Bot lacks
1. **Rich analytics** — charts, CSV export, demographics (bot has simplified text KPIs)
2. **Real-time SSE streaming** — live message updates in dashboard (bot doesn't need it)
3. **Dark mode** — cosmetic, not applicable to WhatsApp
4. **Bulk actions** — complete/cancel all (bot can mark all completed for a date)
5. **Notification panel** — dashboard convenience, not applicable to WhatsApp

---

## Shared (Functionally Equivalent)

These features exist on both sides with equivalent functionality, differing only in UX:

| Feature | Web UX | Bot UX |
|---------|--------|--------|
| Appointment listing | Table with filters, calendar date picker | Text list with date picker |
| Status management | Buttons: Mark Arrived, Call Patient, Start Visit, No Show | Buttons: same actions via interactive lists |
| Fee entry | Number inputs (consultation, treatment, medicine) | Step-by-step: "Consultation fee?", "Treatment charges?" |
| Diagnosis/Notes | Textarea | Free-text prompt |
| Medicines | Dynamic add/remove form (name, dosage, frequency, duration) | Entered as part of notes (less structured) |
| Follow-up | Date picker + instructions | "Next visit date & time?" prompt |
| Patient history | Vertical timeline with visit details | Visit list with expandable details |
| Schedule blocking | Calendar click → reason → block | "Block a Date" → date → confirm |
| Feedback | KPI cards + entries + callback mgmt | Summary + per-entry actions |

---

## API Surface Overlap

All web API endpoints under `/api/dashboard/*` have corresponding bot-side database operations:

| Web API | Bot Equivalent |
|---------|---------------|
| `POST /api/dashboard/appointments` | `engine.js` → `handleBookingConfirmation` → `createAppointment` |
| `PATCH /api/dashboard/arrival` | `handleDoctorMarkArrived` / `doctorCallNext` |
| `POST /api/dashboard/visit` | Visit logging wizard (LOG_TREATMENT → ... → LOG_MEDIA) |
| `GET/PATCH /api/dashboard/patients/{id}` | Patient search → detail → edit wizard |
| `POST /api/dashboard/patients/{id}/send-message` | `sendText()` via WhatsApp API |
| `GET/PATCH /api/dashboard/patients/{id}/chat-mode` | Session `manualMode` flag |
| `GET /api/dashboard/patients/{id}/messages` | `getMessages()` from message repository |
| `GET /api/dashboard/stats` | `doctorStats()` — same queries, different presentation |
| `GET/POST/DELETE /api/dashboard/schedule` | Block/unblock date handlers |
| `GET /api/dashboard/feedback` | `doctorFeedback()` — same summary + entries |

---

## Recommendation

The two systems are **well aligned** for the core clinical workflow. The three actionable gaps to close are:

1. **Prescription PDF export on web** — reuse `src/lib/prescription.js` to add a download button on the visit page
2. **Audio transcription in web** — enable voice note uploads with transcription on the visit form
3. **Booking edit/reschedule on web** — add date/time/treatment change UI to appointment detail

Everything else is either automation (CRON) or platform-specific (Hindi, dark mode, SSE, etc.) and is appropriately placed.
