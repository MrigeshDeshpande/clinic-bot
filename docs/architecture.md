# Architecture

## 1. Appointment Versioning

Appointments use a versioned chain model for reschedule support:

```
logical_id  — stable identity across versions (same UUID for all reschedules)
version     — monotonically increasing, starts at 1
id          — unique PK per version (changes on reschedule)
status      — superseded for old versions, confirmed for the active one
```

**Reschedule flow:**
1. UPDATE old row: `status = 'superseded'`, `superseded_at = NOW()`
2. INSERT new row: same `logical_id`, `version + 1`, new date/time
3. CTE chain ensures atomicity — if the UPDATE fails, the INSERT never runs
4. Retry loop handles concurrent reschedules (3 attempts, UNIQUE constraint on `(logical_id, version)`)

**Invariants:**
- Exactly one `confirmed` row per `logical_id` at any time
- `version` increases monotonically, no gaps
- Clinical data (diagnosis, treatment, tooth_diagnoses) is preserved across reschedules

---

## 2. Payment Ledger

The `payments` table is the **append-only source of truth** for all money movement.

```sql
direction   — 'credit' (money in) or 'debit' (money out)
kind        — payment | refund | adjustment | migration | waiver | advance
method      — cash | upi | card | bank | other
```

**Design rules:**
- Every financial event is a row. No UPDATEs on existing payment rows — only INSERTs.
- `direction` + `kind` covers all scenarios: payments in, refunds out, adjustments, legacy migration, prepayments.
- `idempotency_key VARCHAR(100) UNIQUE` prevents duplicate rows on retry.

**Supported `kind` values:**

| kind | direction | When |
|------|-----------|------|
| payment | credit | Patient pays at/after visit |
| refund | debit | Money returned to patient |
| adjustment | credit/debit | Correction or write-off |
| migration | credit | Legacy data import (method=NULL) |
| waiver | debit | Discount applied after billing |
| advance | credit | Prepayment for future visit |

---

## 3. Why `paid_amount` on Appointments Is a Cache

`appointments.paid_amount` is a **denormalized cache** — always derived from the `payments` table.

```
Source of truth:      payments table
Performance cache:    appointments.paid_amount, payment_status, paid_at
```

**Why it exists:**
- Avoids a JOIN on every dashboard query (appointment list, patient profile, stats)
- Updated atomically by `recordPayment()` via the `sync` CTE in the same transaction

**Invariant:**
- `paid_amount` can be stale by at most one query (within the same transaction it's always in sync)
- If `payments` and `appointments.paid_amount` ever diverge, `payments` wins

**Reading financial data:**
- Gross billing: `appointments.consultation_fee + treatment_charges + medicine_charges` (unchanged)
- Collections: `payments` table, `SUM(amount)` WHERE `direction = 'credit' AND kind = 'payment'`
- Outstanding: gross billing minus collections (computed, not stored)

---

## 4. Completion Idempotency

The completion UPDATE uses an explicit `status = 'confirmed'` guard:

```sql
UPDATE appointments SET ...
WHERE id = $1 AND status = 'confirmed'
       ^^^^^^^^^^^^^^^^^^^^^^^^
```

**Why this works:**
- Only `confirmed` appointments can be completed
- Once completed, `status = 'completed'` — the WHERE clause fails to match
- Double-click, network retry, or concurrent completion all hit 0 rows → 400 error

**Same guard on cancel:**
```sql
WHERE id = $1 AND status = 'confirmed'
```
Prevents `complete` and `cancel` from both succeeding simultaneously (race → exactly one terminal state).

**Edit visits** (non-completion) use a looser WHERE clause:
```sql
WHERE id = $1 AND status NOT IN ('cancelled', 'no_show', 'superseded')
```
This allows editing clinical fields on completed appointments while preventing edits on cancelled ones.

---

## 5. Core Invariants

| Invariant | Enforced by |
|-----------|-------------|
| No double-terminal-state | `status = 'confirmed'` on both completion and cancel |
| No duplicate payment rows | `idempotency_key UNIQUE` (or ON CONFLICT DO NOTHING) |
| Payment + cache always in sync | CTE chain in `recordPayment()` (single statement) |
| Only one confirmed appointment per slot | Partial unique index `idx_appointments_unique_slot` |
| Only one active version per logical_id | CTE chain in `supersedeAppointment()` |
| No orphan payments | `appointment_id` FK + payment INSERT checks appointment exists |
| No negative amounts in ledger | `CHECK (amount > 0)` on payments table |
| Invalid payment methods rejected | `CHECK (method IN (...))` on payments table |

---

## 6. Services Architecture

```
src/services/
  recordPayment.js        — Insert payment row + sync appointment cache (CTE, atomic)
  completeVisit.js         — Update appointment fields + optionally record payment (transaction)
  createWalkIn.js          — Find/create patient + insert appointment + optionally record payment
  cancelAppointment.js     — Set status = cancelled with reason (guarded)

src/app/api/dashboard/
  visit/route.js           — Thin POST wrapper: validate → call completeVisit or createWalkIn → respond
  appointments/[id]/route.js — Thin PATCH wrapper: cancel → cancelAppointment, else direct UPDATE
```

**Call pattern:**
```
HTTP request
    ↓
route (validation, auth, rate limit)
    ↓
service (business logic, DB writes)
    ↓
route (serialize, respond)
```

Routes must NOT contain business logic. Services must NOT handle HTTP concerns.

---

## 7. One Completion Path

Quick Checkout, Log Visit (Save), and Rapid Walk-In all flow through the same endpoint:

```
POST /api/dashboard/visit
    ├── appointmentId exists → completeVisit()
    └── no appointmentId   → createWalkIn()
```

Three UIs, one completion engine. No duplicate business logic.
