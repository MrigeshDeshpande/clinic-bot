# Dashboard UX Ideas — Filtered for 30-min Fixed Slots & No Overload

> **Constraint:** 30 min per patient, fixed. Goal is to reduce friction without adding more work for the doctor.
>
> **North Star:** Everything the doctor needs in 2–3 clicks. No full-page navigations. No long forms.

---

## Phase 1 — Instant Actions (biggest click savings)

### 1. One-click visit complete
From the appointments table, a single "Complete & Log Visit" button that opens a lightweight inline form (treatment + fees + next visit) right in a slideover, not a full page navigation. Saves 2-3 clicks per patient.

### 2. Quick-actions row on table rows
Each appointment row has persistent, always-visible buttons: [Arrived] [Complete] [No Show] [Send Reminder]. No hover-reveal, no dropdowns. The most common actions are always one tap away.

### 21. Priority flag toggle
A ⭐ button on each appointment row toggles `is_priority`. Prioritised patients float to the top of the queue.

**Use case:** An elderly patient or emergency case needs to be seen sooner. One tap to flag, one tap to unflag.

### 25. Undo status changes with reason
When completing or marking no-show, a 5-second "Undo" snackbar appears. If the user doesn't undo, prompt for an optional reason. Prevents accidental status changes.

**Use case:** Doctor accidentally taps "No Show" on the wrong patient. Taps Undo. Crisis averted.

### 4. Complete → Auto-next patient
After marking a patient as complete, show a "Call Next" button right there. One tap marks the next waiting patient as called. Keeps the flow moving without going back to the appointments page.

---

## Phase 2 — Surface Info Faster (zero-navigation awareness)

### 6. Daily snapshot header
Sticky bar at the top of every page: "8 today | 2 waiting | 1 in session | ₹3,200 earned". Always visible, always current. Built from the data already fetched.

### 7. Next 3 upcoming mini-list
Below the sticky bar, a compact row showing next 3 appointments: "10:00 Rajesh — Scaling | 10:30 Priya — RCT | 11:00 Walk-in". Tap any to jump to that row in the table.

### 5. Patient summary sidebar
On the appointments page, tapping a patient's row slides open a thin right panel showing: last visit diagnosis, total visits, outstanding balance, family links, last feedback. No page navigation.

### 8. Inline patient search
On any page, Cmd/Ctrl+K opens a search bar. Type name or phone → see matching patients + their next appointment + last visit date. Arrow-key navigate, Enter to open. Saves the full-page navigation to the patients tab.

---

## Phase 3 — Smart Defaults (zero typing)

### 3. Preset fee packages
"Scaling: ₹500", "Filling: ₹800", "RCT: ₹3000" as one-tap buttons on the visit form. The doctor taps once and consultation + treatment fees auto-fill. Zero typing.

### 12. Same-as-last-visit prefill
When opening the visit form for a returning patient, pre-fill treatment, consultation fee, and common medicines from their last visit. The doctor just confirms or tweaks. Especially useful for follow-ups.

### 14. Follow-up auto-suggest
During visit logging, when setting "Next visit", suggest a date based on treatment type (RCT → 7 days, cleaning → 6 months, filling → 1 year). One tap to accept.

---

## Phase 4 — Inline Edits (fix mistakes without navigation)

### 19. Inline appointment editing
Click any cell in the appointments table (time, patient name, phone, treatment) to edit it inline — like a spreadsheet. Press Enter to save, Escape to cancel. No modal, no page navigation.

**Use case:** Patient calls to reschedule from 10:00 to 11:00. Doctor edits the time inline. Patient gets auto-notified.

### 20. Inline fee editing
The consultation fee, treatment charges, and medicine charges columns are editable inline on the appointments table and the patient's visit history. Tap the fee → edit → Enter to save.

**Use case:** Doctor realises they forgot to add medicine charges. Tap the cell, type "200", Enter. Done.

### 24. Reschedule from appointments page
A "Reschedule" button on each appointment row opens a compact time-slot picker for the same day or a date picker for a different day. Patient gets auto-notified via WhatsApp.

**Use case:** "Patient called, can't make 10am, can come at 2pm." Two taps, done.

### 22. Partial payment tracking
New fields on each appointment: `payment_status` (paid / partial / unpaid), `amount_paid` (actual cash collected), `payment_method` (cash / UPI / card). Shown in the table and editable inline.

**Use case:** Patient pays ₹2000 now for a ₹3000 RCT. The remaining ₹1000 is visible as balance due. No mental accounting.

### 23. Cancellation reason
When marking no-show or cancelling, a lightweight prompt: "Reason? [No Show] [Emergency] [Rescheduled] [Other]" with optional text. Stored in `cancellation_reason`. Visible in visit history.

**Use case:** Doctor sees 3 no-shows this week → realises 2 were because of a holiday they forgot to block.

---

## Phase 5 — Real-Time Awareness (zero-click awareness)

### 15. Live queue counter in tab title
The browser tab shows "(2) Dashboard — Shri Balaji" when patients are waiting. The doctor sees it without switching tabs.

### 16. Auto-refresh with zero disruption
The appointments page silently refreshes every 30 seconds. If the doctor is mid-form, it doesn't re-render or steal focus. Only updates the queue counts and badge numbers.

### 17. Arrival chime
A subtle notification sound when a patient marks themselves as arrived via WhatsApp. The doctor knows without watching the screen.

### 18. End-of-day summary push
When the last appointment is completed, show a gentle snackbar: "All done for today. 8 patients, ₹6,400. Have a good evening!" Acknowledge and done.

---

## Phase 6 — Touch/Mobile Optimization

### 9. Swipeable appointment rows
On mobile, swipe left → "Complete", swipe right → "No Show". Same as email apps. Primary actions without precision tapping.

### 10. Large touch targets
All action buttons ≥ 44px tall. No tiny icon-only buttons. Padding on every tappable element.

### 11. Bottom action bar
On mobile, a fixed bottom bar: [Today's Count] [Call Next] [Quick Search]. Everything reachable with one thumb.

### 13. Auto-detect return patients
When typing the patient name in a walk-in visit, search-as-you-type with fuzzy matching. If found, pre-fill everything. If not, create new. No separate "search vs register" decision.

---

## Sample Flow (a day with these ideas)

```
09:25 — Doctor opens dashboard. Daily brief: "8 today. 2 waiting. Est end ~1PM."
09:30 — Rajesh arrives (auto-detected via WhatsApp). Chime plays. "1 waiting."
09:30 — Doctor taps Rajesh's row → sidebar shows "Last: Filling, 15 days ago. Paid."
09:31 — Doctor taps "Start Visit" from sidebar. Visit form pre-filled from last time.
09:33 — Treatment: one tap "Scaling". Fees auto-filled: ₹500. Taps "Send to WhatsApp".
09:34 — Back to appointments. Taps "Call Next" → next patient notified. Taps "Complete & Next".
```

Total clicks per patient: ~4. No full page navigations. No typing.
