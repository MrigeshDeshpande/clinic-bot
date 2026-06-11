# Regression Suite

**Scope:** Complete visit, payment, reschedule, cancel, concurrency, financial integrity
**Usage:** Run before every deployment. Every applicable checkbox must be green.
**Phases:** Some checks are tagged `[Phase 2]` (post-payments table) and will be added once the payments ledger exists.

---

## 1. Basic Paths

### WI-001: Walk-in with phone (new patient)

**Preconditions**
- No patient exists for phone `+919999999991`
- No appointments today

**Action**
- Open Rapid Walk-In
- Name = `Ravi Kumar`, Phone = `9999999991`, Fee = 500, Paid = 500, Method = Cash
- Submit

**Expected API**
- HTTP 200
- `appointment.status` = `completed`
- `appointment.patient_name` = `Ravi Kumar`
- `appointment.treatment_charges` = 500

**Expected DB — patients**
- 1 row, phone = `+919999999991`, name = `Ravi Kumar`

**Expected DB — appointments**
- 1 row, status = `completed`, paid_amount = 500, payment_status = `paid`
- No `consultation_fee` or `medicine_charges` (omitted in payload → defaults to 0)

**Expected Dashboard**
- `totalRevenue` += 500 *(gross billing)*
- `totalVisits` += 1

**Expected Patient Profile**
- `total_spent` = 500
- `visit_count` = 1
- Timeline contains the visit with `paid_amount` = 500

**Pass/Fail**
- [ ] Pass
- [ ] Fail
- Notes:

---

### WI-002: Walk-in with phone (existing patient)

**Preconditions**
- Patient exists: phone `+919999999992`, name = `Priya Sharma`, not yet visited today

**Action**
- Open Rapid Walk-In
- Name = `Priya`, Phone = `9999999992`, Fee = 1000, Paid = 0, Method = *(none)*
- Submit

**Expected API**
- HTTP 200
- Patient record reused (no duplicate patient created)

**Expected DB — patients**
- Still 1 row for phone `+919999999992`

**Expected DB — appointments**
- 1 row, status = `completed`, paid_amount = 0, payment_status = `pending`

**Expected Dashboard**
- `totalRevenue` += 1000
- `totalVisits` += 1

**Expected Patient Profile**
- `total_spent` = previous total + 1000
- `visit_count` = previous count + 1

**Pass/Fail**
- [ ] Pass
- [ ] Fail
- Notes:

---

### WI-003: Walk-in without phone

**Preconditions**
- *(none)*

**Action**
- Open Rapid Walk-In
- Name = `Cash Patient`, Phone = *(empty)*, Fee = 300, Paid = 300, Method = Cash
- Submit

**Expected API**
- HTTP 200

**Expected DB — patients**
- No patient record created *(no phone → findPatientByPhone skipped)*

**Expected DB — appointments**
- 1 row, patient_name = `Cash Patient`, patient_id = *null*, patient_phone = *null*
- paid_amount = 300, payment_status = `paid`

**Expected Dashboard**
- `totalRevenue` += 300

**Pass/Fail**
- [ ] Pass
- [ ] Fail
- Notes:

---

### QC-001: Quick Checkout — Full Payment

**Preconditions**
- Appointment exists: id = `A-001`, status = `confirmed`
- consultation_fee = 0, treatment_charges = 5000, medicine_charges = 0
- paid_amount = 0, payment_status = `pending`

**Action**
- Open Quick Checkout for A-001
- Keep Fee = 5000, Paid = 5000, Method = UPI
- Submit

**Expected API**
- HTTP 200

**Expected DB**
- status = `completed`
- treatment_charges = 5000 *(sent as treatmentCharges)*
- paid_amount = 5000
- payment_status = `paid`
- paid_at IS NOT NULL
- payment_method = `upi`

**Expected Dashboard**
- `totalRevenue` += 5000
- `totalVisits` += 1
- `[Phase 2] Collected += 5000`

**Expected Patient Profile**
- Visit with `paid_amount` = 5000, `payment_status` = `paid`

**Pass/Fail**
- [ ] Pass
- [ ] Fail
- Notes:

---

### QC-002: Quick Checkout — Partial Payment

**Preconditions**
- Appointment exists: id = `A-002`, status = `confirmed`
- consultation_fee = 0, treatment_charges = 5000, medicine_charges = 0
- paid_amount = 0

**Action**
- Open Quick Checkout for A-002
- Keep Fee = 5000, Paid = 2000, Method = Cash
- Submit

**Expected API**
- HTTP 200

**Expected DB**
- status = `completed`
- paid_amount = 2000
- payment_status = `partial`
- paid_at IS NOT NULL
- payment_method = `cash`

**Expected Dashboard**
- `totalRevenue` += 5000
- `[Phase 2] Collected += 2000`
- `[Phase 2] Outstanding += 3000`

**Expected Patient Profile**
- Visit shows `paid_amount` = 2000
- `[Phase 2] Due = 3000`

**Pass/Fail**
- [ ] Pass
- [ ] Fail
- Notes:

---

### QC-003: Quick Checkout — Zero Payment (Free Visit)

**Preconditions**
- Appointment exists: id = `A-003`, status = `confirmed`
- consultation_fee = 0, treatment_charges = 0, medicine_charges = 0
- paid_amount = 0

**Action**
- Open Quick Checkout for A-003
- Fee = 0, Paid = 0, Method = *(not shown — paid=0 disables chips)*
- Submit

**Expected API**
- HTTP 200

**Expected DB**
- status = `completed`
- paid_amount = 0
- payment_status = `pending`
- paid_at = *null*
- payment_method = *null*

**Expected Dashboard**
- `totalRevenue` += 0
- `totalVisits` += 1

**Pass/Fail**
- [ ] Pass
- [ ] Fail
- Notes:

---

### QC-004: Quick Checkout — Fee Different from Original treatment_charges

**Preconditions**
- Appointment exists: id = `A-004`, status = `confirmed`
- consultation_fee = 0, treatment_charges = 5000 *(original)*, medicine_charges = 0

**Action**
- Open Quick Checkout for A-004
- Change Fee to **4500** (discount), Paid = 4500, Method = Card
- Submit

**Expected DB**
- treatment_charges = 4500 *(overwritten by Fee input)*
- paid_amount = 4500
- payment_status = `paid`

**Rationale:** Quick Checkout sends `treatmentCharges: total` which maps to `treatment_charges`. The original value is replaced. This is intended — the receptionist sets the final fee at checkout.

**Pass/Fail**
- [ ] Pass
- [ ] Fail
- Notes:

---

### EV-001: Edit Visit → Save (Clinical Fields)

**Preconditions**
- Appointment exists: id = `A-005`, status = `confirmed`
- No clinical data yet

**Action**
- Open `/dashboard/visit?appointmentId=A-005`
- Set diagnosis = `Caries`, treatment = `Filling`, tooth_diagnoses = `[{tooth:16,diagnosis:["Caries"]}]`
- Save (POST /api/dashboard/visit with status=`confirmed`, not `completed`)

**Expected DB**
- status = `confirmed` *(still confirmed, not completed)*
- diagnosis = `Caries`
- treatment = `Filling`
- tooth_diagnoses = `[{tooth:16,diagnosis:["Caries"]}]`
- paid_amount unchanged
- payment_status unchanged
- paid_at unchanged *(no COALESCE since paymentStatus not sent)*

**Expected Patient Profile**
- Visit appears with clinical data
- Tooth diagnosis chips visible

**Pass/Fail**
- [ ] Pass
- [ ] Fail
- Notes:

---

### RS-001: Reschedule

**Preconditions**
- Appointment exists: logical_id = `L-001`, version = 1, status = `confirmed`
- date = `2026-06-10`, time = `10:00`
- Target slot `2026-06-11 14:00` is free

**Action**
- Drag appointment to `2026-06-11 14:00`

**Expected DB — old appointment**
- status = `superseded`
- superseded_at IS NOT NULL
- version = 1 *(unchanged)*

**Expected DB — new appointment**
- logical_id = `L-001` *(same chain)*
- version = 2
- status = `confirmed`
- date = `2026-06-11`, time = `14:00`
- All clinical fields preserved (diagnosis, treatment, tooth_diagnoses, etc.)

**Expected DB**
- No duplicate confirmed appointment for same logical_id

**Pass/Fail**
- [ ] Pass
- [ ] Fail
- Notes:

---

### CN-001: Cancel with Reason

**Preconditions**
- Appointment exists: id = `A-006`, status = `confirmed`, time slot = `2026-06-10 11:00`

**Action**
- Click Cancel in AppointmentDetailsModal
- Confirm

**Expected DB**
- status = `cancelled`
- cancelled_at IS NOT NULL
- cancellation_reason = *null* *(current modal doesn't set reason — `[Phase 2]` to add reason picker)*

**Expected DB**
- Slot `2026-06-10 11:00` is bookable (no `confirmed` appointment at that slot)

**Expected Dashboard**
- `totalCancelled` += 1

**Pass/Fail**
- [ ] Pass
- [ ] Fail
- Notes:

---

### RB-001: Rebook Cancelled Slot

**Preconditions**
- Slot `2026-06-10 11:00` was cancelled in CN-001 (no confirmed appt at this slot)
- Patient name = `New Patient`

**Action**
- Book appointment at `2026-06-10 11:00`

**Expected API**
- HTTP 200
- Appointment created

**Expected DB**
- 1 row, date = `2026-06-10`, time = `11:00`, status = `confirmed`

**Pass/Fail**
- [ ] Pass
- [ ] Fail
- Notes:

---

## 2. Duplicate Submission

### DUP-001: Double-Click Quick Checkout

**Preconditions**
- Appointment exists: id = `A-010`, status = `confirmed`, treatment_charges = 3000, paid_amount = 0

**Action**
- Submit Quick Checkout (Fee = 3000, Paid = 3000, Method = Cash)
- Immediately click Submit again (before server responds)
- *(Simulate by sending two concurrent POST requests)*

**Expected API — first request**
- HTTP 200

**Expected API — second request**
- HTTP 400 (or 409)
- `[After Phase 1 Fix]` error = `Appointment not found or cannot be edited` *(status=confirmed guard)*

**Expected DB**
- paid_amount = 3000 *(not 6000)*
- payment_status = `paid`
- Only 1 payment row `[Phase 2]`
- status = `completed`

**Expected Dashboard**
- `totalRevenue` += 3000 *(not 6000)*

**Pass/Fail**
- [ ] Pass
- [ ] Fail
- Notes:

---

### DUP-002: Double-Click Walk-In

**Preconditions**
- *(none)*

**Action**
- Submit Rapid Walk-In (Name = `Dup Patient`, Phone = *empty*, Fee = 500, Paid = 500)
- Immediately click Submit again

**Expected API — first request**
- HTTP 200

**Expected API — second request**
- `[After Phase 1 Fix]` HTTP 400 or 409

**Expected DB — appointments**
- Exactly 1 row for `Dup Patient` *(not 2)*

**Pass/Fail**
- [ ] Pass
- [ ] Fail
- Notes:

---

### DUP-003: Network Timeout After Server Commit

**Preconditions**
- Appointment exists: id = `A-011`, status = `confirmed`, treatment_charges = 2000, paid_amount = 0

**Action**
- Submit Quick Checkout (Paid = 2000)
- Server commits (status → completed, paid_amount → 2000)
- Network drops the response (client sees `Network error`)
- User retries with same form data *(no idempotency key — current behavior)*

**Expected DB — after retry**
- `[Before Phase 1 Fix]` Second request re-updates: status stays `completed`, paid_amount stays 2000
- But `[Phase 2: Without idempotency_key]` second request creates a duplicate payment row
- `[After Phase 2: With idempotency_key]` second payment blocked — exactly 1 payment row

**`[After Phase 1 Fix]` Expected API — retry**
- HTTP 400 — `Appointment not found or cannot be edited`

**Pass/Fail**
- [ ] Pass
- [ ] Fail
- Notes:

---

### DUP-004: Browser Refresh During Walk-In Submit

**Preconditions**
- *(none)*

**Action**
- Fill Walk-In form (Name = `Refresh Patient`, Fee = 1000)
- Click Submit
- Browser refreshes/reloads before response

**Expected DB**
- `[After Phase 1/3 Fix]` At most 1 appointment created for `Refresh Patient`
- *(Browser refresh is not a second request — no duplicate. But if the browser re-sends on reload, it is.)*

**Pass/Fail**
- [ ] Pass
- [ ] Fail
- Notes: (Needs discussion on whether the browser actually re-POSTs on refresh)

---

### DUP-005: Browser Back + Resubmit

**Preconditions**
- Appointment exists: id = `A-012`, status = `confirmed`

**Action**
- Quick Checkout A-012 (Paid = 1500)
- Navigate away
- Browser Back → form re-submits via browser re-POST

**Expected DB**
- paid_amount = 1500 *(not 3000)*
- `[After Phase 1 Fix]` Second attempt returns 400

**Pass/Fail**
- [ ] Pass
- [ ] Fail
- Notes:

---

### DUP-006: Double-Click Log Visit Save

**Preconditions**
- Appointment exists: id = `A-013`, status = `confirmed`

**Action**
- Open Log Visit page
- Fill clinical data (diagnosis, tooth_diagnoses)
- Click Save twice

**Expected DB**
- Tooth diagnoses saved once (not duplicated)
- Diagnosis field matches the submission
- No duplicate entries in tooth_diagnoses array

**Pass/Fail**
- [ ] Pass
- [ ] Fail
- Notes:

---

## 3. Concurrency

### CCR-001: Two Receptionists Complete Same Appointment

**Preconditions**
- Appointment exists: id = `A-020`, status = `confirmed`, treatment_charges = 5000, paid_amount = 0

**Action**
- Receptionist A and B both submit Quick Checkout for A-020 simultaneously

**Expected DB**
- status = `completed`
- paid_amount = 5000 *(not 10000)*
- `[After Phase 3: Transaction]` Exactly 1 payment row
- Exactly 1 completion effect on dashboard stats

**`[After Phase 1 Fix]` Expected — second completion**
- Second UPDATE matches 0 rows (status≠confirmed), returns error

**Pass/Fail**
- [ ] Pass
- [ ] Fail
- Notes:

---

### CCR-002: Two Receptionists Reschedule Same Appointment

**Preconditions**
- Appointment exists: logical_id = `L-020`, version = 3, status = `confirmed`
- Two distinct target slots: `2026-06-12 09:00` and `2026-06-12 10:00`

**Action**
- Receptionist A drags to slot 1, B drags to slot 2 — concurrent

**Expected DB**
- Appointment ends up at exactly one of the target slots
- Old appointment: status = `superseded`
- New appointment: version = 4
- The other reschedule fails with slot conflict or version conflict
- Exactly one active confirmed appointment for logical_id L-020

**Pass/Fail**
- [ ] Pass
- [ ] Fail
- Notes: (Current retry loop + UNIQUE constraint should handle this)

---

### CCR-003: Two Receptionists Cancel Same Appointment

**Preconditions**
- Appointment exists: id = `A-021`, status = `confirmed`

**Action**
- Receptionist A and B both click Cancel simultaneously

**Expected DB**
- status = `cancelled`
- Only one UPDATE takes effect (second UPDATE matches same row, overwrites with same status — harmless)
- cancelled_at set once
- `cancellation_reason` = first cancellation's reason (or second if both pass null)

**Expected Dashboard**
- `totalCancelled` += 1 *(not 2)*

**Pass/Fail**
- [ ] Pass
- [ ] Fail
- Notes: (Cancelling an already-cancelled appointment is idempotent; no harm)

---

### CCR-004: Two Receptionists Book Same Slot

**Preconditions**
- Slot `2026-06-12 14:00` is free

**Action**
- Receptionist A and B both book `2026-06-12 14:00` simultaneously

**Expected DB**
- Exactly 1 confirmed appointment at this slot
- `WHERE NOT EXISTS` + UNIQUE partial index prevents the second

**Expected API — second request**
- HTTP 409 — `This slot is already booked`

**Pass/Fail**
- [ ] Pass
- [ ] Fail
- Notes: (Existing slot guard is correct — atomic INSERT + unique index)

---

### CCR-005: Walk-In Same Phone Simultaneously

**Preconditions**
- No patient exists for phone `+919999999995`

**Action**
- Receptionist A and B both submit walk-in with phone `+919999999995`, different names

**Expected DB — patients**
- Exactly 1 patient row for `+919999999995`
- Name = first patient created *(A or B, whichever wins)*
- UNIQUE constraint on `patients.phone` prevents duplicate

**Expected DB — appointments**
- Exactly 2 appointment rows *(both walk-ins complete successfully, both reference same patient)*

**Pass/Fail**
- [ ] Pass
- [ ] Fail
- Notes: (Two walk-ins for same phone is valid — patient arrives twice. Patient dedup is correct.)

---

### CCR-006: Quick Checkout + Edit Visit Simultaneous

**Preconditions**
- Appointment exists: id = `A-022`, status = `confirmed`, treatment_charges = 3000, paid_amount = 0

**Action**
- Receptionist A submits Quick Checkout (Paid = 3000)
- Receptionist B submits Edit Visit (diagnosis = `Gingivitis`) — at same moment

**Expected DB — final state**
- Either status = `completed` with diagnosis = `Gingivitis` (B wins, then A completes)
- Or status = `confirmed` with diagnosis = `Gingivitis` (A completes first, B reverts status? — No, B doesn't send status)

*Analysis: Edit Visit sends fields without status. It does NOT send `status='confirmed'` or `status='completed'`. So if A completes first (status→completed), B's update still succeeds because the WHERE clause only excludes cancelled/no_show/superseded — NOT completed.*

**Expected DB — after Phase 1 Fix**
- A completes: status → `completed`, paid → 3000
- B edits: status NOT IN (`cancelled`,`no_show`,`superseded`) — `completed` is NOT in this list pre-fix
- `[After Phase 1 Fix]` B's edit: the fix only changes the completion query, not the edit visit query. Edit Visit still has `NOT IN ('cancelled','no_show','superseded')` — `completed` still editable!

**Expected DB — after adding `status = ANY('confirmed','completed')` to Edit Visit as well?**
- *(Suggested: Edit Visit should allow editing completed visits too — e.g., correcting a diagnosis. But it should NOT be able to change payment fields on completed visits.)*

**Pass/Fail**
- [ ] Pass
- [ ] Fail
- Notes: (Requires discussion — should Edit Visit work on completed appointments?)

---

### CCR-007: Receptionist A Completes While B Cancels

**Preconditions**
- Appointment exists: id = `A-023`, status = `confirmed`

**Action**
- A submits Quick Checkout (Paid = 2000)
- B submits Cancel — concurrently

**Expected DB**
- Exactly one terminal state: either `completed` OR `cancelled`
- If A wins: status = `completed`, paid = 2000, B's cancel matches 0 rows (status≠confirmed) → error
- If B wins: status = `cancelled`, A's completion matches 0 rows (status≠confirmed) → error

**Expected API — the loser**
- HTTP 400/409 — `Appointment not found or cannot be edited`

**Pass/Fail**
- [ ] Pass
- [ ] Fail
- Notes: (This test requires both the completion fix AND ensuring Cancel also uses `status = 'confirmed'`)

---

## 4. Payment Edge Cases

### PAY-001: Multiple Partial Payments `[Phase 2]`

**Preconditions**
- Appointment exists: id = `A-030`, status = `confirmed`, treatment_charges = 10000
- Payments table exists

**Action 1**
- Quick Checkout: Paid = 4000, Method = Cash
- Submit

**Expected DB — after Action 1**
- status = `completed`
- paid_amount = 4000
- payment_status = `partial`
- 1 payment row: amount=4000, direction=`credit`, kind=`payment`

**Action 2**
- *(Subsequent payment received)*
- Record another payment of 3000 via UPI

**Expected DB — after Action 2**
- paid_amount = 7000
- payment_status = `partial`
- 2 payment rows: 4000+3000
- paid_at unchanged from first payment *(COALESCE keeps earliest)*

**Action 3**
- Remaining 3000 paid via Card

**Expected DB — after Action 3**
- paid_amount = 10000
- payment_status = `paid`
- 3 payment rows

**Pass/Fail**
- [ ] Pass
- [ ] Fail
- Notes:

---

### PAY-002: Payment After Completion `[Phase 2]`

**Preconditions**
- Appointment exists: id = `A-031`, status = `completed`, paid_amount = 3000, payment_status = `partial`
- Outstanding = 2000

**Action**
- Attempt to record additional payment of 2000 via `recordPayment` endpoint

**Expected API**
- HTTP 200 *(recordPayment accepts any valid payment for any appointment — ledger is independent)*

**Expected DB**
- paid_amount = 5000
- payment_status = `paid`
- New payment row created

**Expected Dashboard**
- `[Phase 2] Collected += 2000`
- `[Phase 2] Outstanding = 0`

**Pass/Fail**
- [ ] Pass
- [ ] Fail
- Notes: (Payments after completion are valid — patient settles later. RecordPayment should not check status.)

---

### PAY-003: Zero-Fee Visit

**Preconditions**
- Appointment exists: id = `A-032`, status = `confirmed`, treatment_charges = 0

**Action**
- Quick Checkout: Fee = 0, Paid = 0

**Expected DB**
- status = `completed`
- paid_amount = 0
- payment_status = `pending`
- No payment row `[Phase 2]`

**Pass/Fail**
- [ ] Pass
- [ ] Fail
- Notes:

---

### PAY-004: Refund `[Phase 2]`

**Preconditions**
- Appointment exists: id = `A-033`, status = `completed`, paid_amount = 5000, payment_status = `paid`
- Payments table: 1 row credit 5000

**Action**
- Record refund of 2000 via card

**Expected DB — payments**
- New row: amount=2000, direction=`debit`, kind=`refund`, method=`card`

**Expected DB — appointment**
- paid_amount = 3000 *(5000 - 2000)*
- payment_status = `partial`

**Expected Dashboard**
- `[Phase 2] Collected -= 2000`

**Pass/Fail**
- [ ] Pass
- [ ] Fail
- Notes: (Refunds are a Phase 2 addition — schema supports them, UI will come later)

---

### PAY-005: Editing Completed Visit

**Preconditions**
- Appointment exists: id = `A-034`, status = `completed`, diagnosis = `Caries`

**Action**
- Open Log Visit page for A-034
- Change diagnosis to `Pulpitis`
- Save

**Expected API — current behavior**
- HTTP 200 *(no status guard on PATCH path — Edit Visit uses POST /api/dashboard/visit with NO status field)*
- The POST /api/dashboard/visit UPDATE has `WHERE status NOT IN ('cancelled','no_show','superseded')` — `completed` passes

**Expected DB**
- diagnosis = `Pulpitis` *(edits succeed)*
- status stays `completed`
- payment fields unchanged *(not sent in Edit Visit payload)*

**Expected Behavior (Recommended)**
- Edit Visit should allow editing clinical fields on completed visits
- But should NOT allow changing treatment_charges or payment fields on completed visits
- *(This is a product decision, not a bug)*

**Pass/Fail**
- [ ] Pass
- [ ] Fail
- Notes: (Not a bug per se — clinical correction is valid. Document the behavior.)

---

## 5. Financial Integrity

### FI-001: Negative Payment Rejected

**Preconditions**
- Appointment exists: id = `A-040`, status = `confirmed`

**Action**
- Quick Checkout: Paid = `-500`

**Expected Client-Side**
- Input with `min="0"` clamps to 0
- Paid = 0

**Expected API**
- HTTP 200 *(not triggered — client clamps)*

**If submitted directly via curl**
- `parseInt(-500)` = -500
- `paid_amount` = -500
- `[Phase 2]` CHECK(amount > 0) on payments table would reject
- `[Phase 2]` Should add client-side validation: reject negative paidAmount in POST

**Pass/Fail**
- [ ] Pass
- [ ] Fail
- Notes: (Add server-side guard: if paidAmount < 0 → 400)

---

### FI-002: Payment Larger Than Bill

**Preconditions**
- Appointment exists: id = `A-041`, status = `confirmed`, treatment_charges = 5000

**Action**
- Quick Checkout: Paid = 10000 *(twice the bill)*

**Expected API**
- HTTP 200 *(accepted — overpayment allowed?)*

**Expected DB**
- paid_amount = 10000
- payment_status = `paid` *(10000 >= 5000)*
- outstanding = 0 *(capped at 0 in client, but DB doesn't compute it)*

**Expected Client**
- Outstanding shows 0 *(capped at Math.max(0, total - paid))*
- Button text: `Complete & Collect ₹10,000`

**Recommended Behavior**
- Accept overpayment (patient may choose to prepay for future visit)
- In Phase 2 with `advance` payment kind, excess can be tagged separately

**Pass/Fail**
- [ ] Pass
- [ ] Fail
- Notes: (Document that overpayment is currently accepted. Phase 2 can add advance tracking.)

---

### FI-003: Invalid Payment Method Rejected

**Preconditions**
- Appointment exists: id = `A-042`, status = `confirmed`

**Action**
- Submit via curl: `paymentMethod = "bitcoin"`

**Expected API — current**
- `payment_method` = `bitcoin` *(no validation)*

**Expected API — `[Phase 2]`**
- Should validate against allowed methods: `cash, upi, card, bank, other`
- Return 400 if not in list

**Pass/Fail**
- [ ] Pass
- [ ] Fail
- Notes: (Add payment_method CHECK constraint or server validation)

---

### FI-004: Decimal Values Rejected

**Preconditions**
- Appointment exists: id = `A-043`, status = `confirmed`

**Action**
- Submit via curl: `paidAmount = 500.50`, `treatmentCharges = 1000.75`

**Expected API — current**
- `parseInt(500.50)` = 500 *(parseInt truncates)*
- `parseInt(1000.75)` = 1000
- Silently truncates decimal — **data silently corrupted**

**Expected Behavior**
- Reject with 400 if paidAmount is not an integer
- Or at minimum: return rounded value in response, log warning

**Pass/Fail**
- [ ] Pass
- [ ] Fail
- Notes: (Add validation: `if (paidAmount !== parseInt(paidAmount))` → 400. Paise not supported.)

---

### FI-005: Absurd Amount Rejected

**Preconditions**
- Appointment exists: id = `A-044`, status = `confirmed`

**Action**
- Submit via curl: `treatmentCharges = 999999999` (1B rupees)

**Expected API — current**
- HTTP 200 — accepted *(no max bounds check)*

**Expected Behavior**
- Not critical to fix now (DB stores INTEGER, max ~2B)
- But consider adding reasonable max (e.g., ₹10,00,000) as a Phase 2 guard

**Pass/Fail**
- [ ] Pass
- [ ] Fail
- Notes: (Low priority — the receptionist sees the absurd number and can correct)

---

## 6. Idempotency `[Phase 2]`

### ID-001: Same idempotency_key Submitted Twice

**Preconditions**
- Appointment exists: id = `A-050`, status = `confirmed`
- Payments table has `idempotency_key VARCHAR(100) UNIQUE`

**Action 1**
- Submit Quick Checkout with `idempotency_key = "qc_A-050_abc123"`, Paid = 3000

**Expected — Action 1**
- HTTP 200
- 1 payment row created

**Action 2**
- Same key, same body, submitted again

**Expected — Action 2**
- HTTP 200 *(idempotent — same result returned)*
- Exactly 1 payment row *(no duplicate)*

**Pass/Fail**
- [ ] Pass
- [ ] Fail
- Notes:

---

### ID-002: Same Body, Different Key

**Preconditions**
- Appointment exists: id = `A-051`, status = `confirmed`

**Action 1**
- Submit with `idempotency_key = "key_A"`, Paid = 3000

**Action 2**
- Same body, `idempotency_key = "key_B"`

**Expected — Action 2**
- HTTP 200 *(different key = different intent)*
- But status is already `completed` from Action 1 — second request returns 400 *(status=confirmed guard)*

**Pass/Fail**
- [ ] Pass
- [ ] Fail
- Notes: (Different key doesn't bypass the status guard. This is correct — once completed, no more completions.)

---

### ID-003: Retry After 500 With Same Key

**Preconditions**
- Appointment exists: id = `A-052`, status = `confirmed`

**Action 1**
- Server encounters 500 error *after* writing the payment row but *before* responding
- Client sees HTTP 500

**Action 2**
- Client retries with same `idempotency_key`

**Expected**
- Server finds existing payment row with this key
- Returns success — does not create duplicate payment
- Updates appointment if not already done

**Pass/Fail**
- [ ] Pass
- [ ] Fail
- Notes: (Critical for correctness. Needs careful implementation — the idempotency check must happen BEFORE the status check.)

---

## 7. Reschedule Integrity

### RSI-001: logical_id Unchanged After Reschedule

**Preconditions**
- Appointment exists: logical_id = `L-030`, version = 1, status = `confirmed`

**Action**
- Reschedule to new slot

**Expected DB — new row**
- logical_id = `L-030`
- version = 2

**Pass/Fail**
- [ ] Pass
- [ ] Fail
- Notes:

---

### RSI-002: version Incremented After Reschedule

**Preconditions**
- Appointment exists: logical_id = `L-030`, version = 1

**Action**
- Reschedule → new row version = 2
- Reschedule again → version = 3

**Expected DB**
- Versions: 1 (superseded), 2 (superseded), 3 (confirmed)
- No gaps in version sequence

**Pass/Fail**
- [ ] Pass
- [ ] Fail
- Notes:

---

### RSI-003: Clinical Data Preserved on Reschedule

**Preconditions**
- Appointment exists: id = `A-060`, logical_id = `L-031`, version = 3, status = `confirmed`
- Has: tooth_diagnoses, diagnosis, treatment, medicines, notes, follow_up_date

**Action**
- Reschedule to new slot

**Expected DB — new row**
- All clinical fields identical to source row
- tooth_diagnoses preserved
- medicines preserved
- notes preserved

**Pass/Fail**
- [ ] Pass
- [ ] Fail
- Notes:

---

### RSI-004: No Duplicate Active Appointment

**Preconditions**
- Appointment exists: logical_id = `L-032`, version = 1, status = `confirmed`

**Action**
- Reschedule
- Verify no other row with same logical_id and `status = 'confirmed'`

**Expected DB**
- Exactly 1 row with logical_id = L-032 and status = `confirmed`

**Pass/Fail**
- [ ] Pass
- [ ] Fail
- Notes: (The CTE-based supersedeAppointment should ensure this)

---

## 8. Cancellation Integrity

### CNI-001: Cancelled Slot Becomes Bookable

**Preconditions**
- Appointment at slot `2026-06-15 09:00` is cancelled

**Action**
- Try to book `2026-06-15 09:00`

**Expected API**
- HTTP 200 — booking succeeds

**Expected DB**
- 1 confirmed appointment at this slot (the new one)
- The cancelled appointment is still present with status = `cancelled`

**Pass/Fail**
- [ ] Pass
- [ ] Fail
- Notes:

---

### CNI-002: Cancelled Appointment Not in Active Schedule

**Preconditions**
- Appointment: id = `A-070`, status = `cancelled`, date = today

**Action**
- Fetch today's appointments

**Expected API — appointments list**
- Appointment A-070 NOT returned (status is `cancelled`, which is typically filtered out by `status IN ('confirmed','completed','no_show')` in the queue view)
- *(Verify the specific query used by `appointments/route.js`)*

**Pass/Fail**
- [ ] Pass
- [ ] Fail
- Notes:

---

### CNI-003: Cancellation Reason Persisted

**Preconditions**
- *(none — feature to be added)*

**`[Phase 2]` Action**
- Cancel appointment with reason = `patient-cancelled`

**Expected DB**
- cancellation_reason = `patient-cancelled`

**Pass/Fail**
- [ ] Pass
- [ ] Fail
- Notes: (Current modal uses `confirm()` + PATCH without reason. Phase 2 will add reason picker.)

---

### CNI-004: Dashboard Counts Updated After Cancellation

**Preconditions**
- Appointment at slot today is first cancellation of the day

**Action**
- Cancel the appointment

**Expected Dashboard**
- `totalCancelled` += 1
- *(Stats API counts `status = 'cancelled'` in the period)*

**Pass/Fail**
- [ ] Pass
- [ ] Fail
- Notes:

---

## 9. Complex Concurrency (Hard)

### CPLX-001: Complete While Cancel Simultaneous

**Preconditions**
- Appointment exists: id = `A-080`, status = `confirmed`

**Action**
- Thread A: POST /api/dashboard/visit with appointmentId=A-080, paid=5000
- Thread B: PATCH /api/dashboard/appointments/A-080 with status=cancelled
- Both threads fire concurrently

**Expected DB**
- Exactly one terminal state: `completed` or `cancelled`
- If `completed`: paid=5000, paid_amount=5000, no cancellation fields
- If `cancelled`: cancelled_at set, paid_amount=0, no payment

**Guarantee**
- The loser's UPDATE returns rowCount=0
- No partial state (e.g., paid set but status=cancelled)

**`[Before Phase 1 Fix]`** Both could succeed: A sets status=completed, B sets status=cancelled — **RACE CONDITION: double terminal state**

**`[After Phase 1 Fix + Cancel Fix]`**: Both UPDATEs have `WHERE status='confirmed'` — exactly one wins

**Pass/Fail**
- [ ] Pass
- [ ] Fail
- Notes: (URGENT: This is a real race condition. Before Phase 1, completing and cancelling simultaneously produces TWO terminal states.)

---

### CPLX-002: Partial Payment While Debt Collector Reads Outstanding

**Preconditions**
- Appointment: A-081, paid_amount = 0, treatment_charges = 10000

**Action**
- Thread A: Record partial payment of 5000
- Thread B: Read `paid_amount` from appointment (for outstanding report)

**Expected**
- Thread B either sees 0 or 5000, never a partial-state (e.g., payment row committed but appointment cache not yet synced)
- `[Phase 3: Transaction]` The READ is outside the write transaction, so it might see 0 if it reads before COMMIT
- This is acceptable — eventual consistency within ~100ms

**Pass/Fail**
- [ ] Pass
- [ ] Fail
- Notes: (Not a bug — the payment ledger is source of truth. Appointment cache is eventually consistent.)

---

## Summary

| Domain | Total | Manual | Auto-ready |
|--------|-------|--------|------------|
| Basic Paths | 10 | 5 | 5 |
| Duplicate Submission | 6 | 2 | 4 |
| Concurrency | 7 | 1 | 6 |
| Payment Edge Cases | 5 | 1 | 4 |
| Financial Integrity | 5 | 1 | 4 |
| Idempotency `[Phase2]` | 3 | 0 | 3 |
| Reschedule Integrity | 4 | 0 | 4 |
| Cancellation Integrity | 4 | 2 | 2 |
| Complex Concurrency | 2 | 0 | 2 |
| **Total** | **46** | **12** | **34** |

## Phase Gate Checklist

Before each deployment:

- [ ] All applicable Basic Paths green
- [ ] All Duplicate Submission tests green
- [ ] Concurrency — CPLX-001 verified (complete vs cancel race)
- [ ] Reschedule integrity checks green
- [ ] Cancellation integrity checks green
- [ ] Payment edge cases green (if Phase 2+)
- [ ] Idempotency tests green (if Phase 2+)
- [ ] No regressions on previously passing tests
