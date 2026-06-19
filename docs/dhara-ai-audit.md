# Dhara AI — Architecture & Product Readiness Audit

> Evaluates whether Dhara can become the intelligence layer of Clinic Bot.
> Based on production code only (no hypothetical designs).

---

## 1. Data Accessibility Audit

| Entity | Source Table(s) | Repository / Access | Structured for AI? | Missing / Limitations |
|---|---|---|---|---|
| **Patients** | `patients` (`pool.js:256-267`) + 10 ALTER TABLE columns | `patientRepository.js` — `findPatientById`, `searchPatients`, `findPatientByPhone` | **Yes** — structured columns (name, age, sex, phone, location) + JSONB for `habits`, `patient_ratings` | No unified `patient_summary` view; dental_history/family_history are free-text (no structured diagnosis timeline) |
| **Appointments** | `appointments` (`pool.js:132-151` + ~40 ALTER TABLE columns) | `appointmentRepository.js` — 25 functions | **Yes** — includes date/time/status/treatment/treatments/payment/arrival | No appointment type/category; `treatment` is single VARCHAR, `treatments` is JSONB array of free-text — no FK to a master treatments table |
| **Visits** | `appointments WHERE status='completed'` | `patient/[id]/route.js:34-48` — inline SQL; `completeVisit.js` service | **Partially** — all visit data is in one wide row | No separate `visits` table; no visit-level metadata (visit number, duration, doctor notes); chief_complaint/general_examination/extra_oral_examination are free-text |
| **Treatments** | `appointments.treatment` (VARCHAR) + `appointments.treatments` (JSONB) + `appointments.treatment_fees` (JSONB) | No treatment repository | **No** — treatments are free-text strings | **No master treatments table** — cannot query "all RCT patients" without text pattern matching |
| **Tooth Diagnoses** | `appointments.tooth_diagnoses` (JSONB array, `pool.js:429-432`) | Inline in API routes | **Partially** — structured per-tooth JSONB objects | No separate `tooth_diagnoses` table; no tooth anatomy master; no historical tracking (only latest snapshot per appointment); no per-tooth media linkage |
| **Prescriptions** | R2 object store; `appointments.prescription_key` + `compiled_document_key` | `lib/prescription.js:38` — `generatePrescription()`; `visits/[id]/prescription/route.js` | **No** — only PDF blob keys, no structured prescription data | No medicines table per visit; no dosage/duration/instructions as structured data inside DB; cannot query "which patients were prescribed Amoxicillin" without PDF parsing |
| **Payments** | `payments` (`pool.js:371-385`) | `services/recordPayment.js:53` — atomic CTE INSERT | **Yes** — proper ledger (amount, direction, kind, method, idempotency_key, recorded_by, recorded_at) | No invoice/bill table; payment tied to appointment not visit; no line-item breakdown; outstanding balance not explicitly tracked on patients table |
| **Reviews** | `patient_reviews` (`pool.js:326-335`) | No dedicated repository — inline SQL in API | **Yes** — structured 1-5 numeric ratings across 7 categories + notes | No patient complaints or flags; no automated sentiment analysis on notes |
| **Attachments** | `appointments.chit_media` (TEXT[]) | Inline in API routes | **No** — just an array of R2 keys | No attachments table; no metadata (file type, upload date, description, tooth association); no per-tooth image mapping |

---

## 2. Patient Summary Readiness

**Can `generatePatientSummary(patientId)` be implemented today without schema changes?** — **Mostly yes**, with gaps.

### Required Queries (all exist today)

| Data Point | Existing Query/Access | Reference |
|---|---|---|
| Patient demographics | `patientRepository.findPatientById(id)` | `patientRepository.js` |
| Visit history | `GET /api/dashboard/patients/[id]` — inline SQL | `route.js:34-48` |
| Visit count + total spent | Calculated in same query | `route.js:27-29` |
| Tooth diagnoses per visit | `appointments.tooth_diagnoses` | `route.js:38` |
| Payment status per visit | `payment_status`, `paid_amount` | `route.js:41` |
| Latest follow-up | `follow_up_date`, `follow_up_instructions` | `route.js:37` |
| Reviews/ratings | `patient_ratings` on `patients` table | `route.js:25` |
| Habits | `patients.habits` JSONB | `route.js:25` |

### Missing Data (no schema change needed, just missing fields)

- **Treatment completion rate**: No treatment_plan_id linking multiple visits
- **Aggregate tooth health**: Would need to scan all `tooth_diagnoses` across all visits
- **Prescribed medicines history**: Only per-visit `medicines` JSONB on each appointment row
- **Outstanding balance**: No computed field on patients — requires summing payments minus charges across all appointments
- **No-show rate**: Computable but not currently exposed

### Implementation Complexity: **Low-Medium** (2-3 hours)

---

## 3. Morning Brief Readiness

| Brief Item | Queryable Today? | Exact Query / Table | Blocker |
|---|---|---|---|
| **Patients overdue for follow-up** | **Yes** | `appointments` WHERE `follow_up_date < CURRENT_DATE` AND `status = 'completed'` — `fetchAppointmentsForFollowUpReminder()` at `appointmentRepository.js:520-540` | No `overdue_follow_up` flag; must check `follow_up_date < today` (currently checks `<= tomorrow`) |
| **Pending payments** | **Yes** | `fetchAppointmentsForDueReminder()` at `appointmentRepository.js:480-501` | Uses `due_reminder_sent_at` as a sentinel — need a separate query without that filter |
| **Incomplete treatment plans** | **No** | N/A | **No treatment plan model exists.** No way to link multiple visits into a plan. |
| **Today's appointments** | **Yes** | `fetchAppointmentsByDate(today)` / `GET /api/dashboard/appointments?date=today` (`route.js:175-242`) | None |

### Blockers

1. **No treatment plan model** — cannot detect incomplete treatments.
2. **No explicit overdue follow-up concept** — `follow_up_date` exists but no automated "overdue by >7 days" query.
3. **Payment due query uses sentinel column** — `due_reminder_sent_at` gates the query; morning brief needs unfiltered access.

---

## 4. Observation Engine Readiness

| Observation | Detected Today? | Limitation |
|---|---|---|
| **Missed follow-ups** | **Manual only** — `follow_up_date` exists but no automated check if patient returned after that date. No `is_follow_up` flag or link back to parent visit. | Need to scan ALL appointments for a patient after a `follow_up_date` — expensive without index or flag. |
| **Treatment abandonment** | **No** — no treatment plan model. Cannot detect that a patient started RCT but never returned for crown. | Need `treatment_plans` table with `status, expected_visits, completed_visits`. |
| **Revenue leakage** | **Partially** — `recordPayment.js:53` computes net per appointment. No cross-appointment reconciliation. | No repository function for `SELECT p.id, SUM(changes) - SUM(payments) FROM patients p JOIN appointments ... GROUP BY p.id`. |
| **No-show patterns** | **Partially** — status='no_show' exists but no automated pattern analysis. Raw data exists but no aggregation query. | Would need aggregate queries by doctor/time/day-of-week — all computable from existing schema. |

### Schema Additions Required

```sql
CREATE TABLE treatment_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id),
  treatment_name VARCHAR(100) NOT NULL,
  total_visits_required INTEGER NOT NULL DEFAULT 1,
  completed_visits INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  abandoned_at TIMESTAMPTZ
);

ALTER TABLE appointments ADD COLUMN treatment_plan_id UUID REFERENCES treatment_plans(id);
ALTER TABLE appointments ADD COLUMN is_follow_up BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE appointments ADD COLUMN follow_up_for_appointment_id UUID REFERENCES appointments(id);
```

---

## 5. Natural Language Search Readiness

### "Show all RCT patients awaiting crown"

**Current ability**: Not reliably queryable. No treatment plan model linking RCT → crown. Would need:
```sql
SELECT DISTINCT p.id, p.name
FROM patients p
JOIN appointments a ON a.patient_id = p.id
WHERE (a.treatment ILIKE '%RCT%' OR a.treatments @> '["RCT"]')
  AND a.status = 'completed'
-- Cannot determine "awaiting crown" — no visit-to-visit link
```

### "Show patients with pending payments above ₹5000"

**Current ability**: Partially queryable with existing schema via aggregate JOIN but no repository function exists:
```sql
SELECT p.id, p.name,
  SUM(a.consultation_fee + a.treatment_charges + a.medicine_charges) - COALESCE(SUM(pay.amount), 0) AS outstanding
FROM patients p
JOIN appointments a ON a.patient_id = p.id AND a.status = 'completed'
LEFT JOIN payments pay ON pay.appointment_id = a.id
GROUP BY p.id
HAVING SUM(...) - COALESCE(SUM(pay.amount), 0) > 5000
```

### Existing Search APIs

| API | Endpoint | Capability |
|---|---|---|
| Patient search | `GET /api/dashboard/patients?q=<name or phone>` | ILIKE on name/phone, trigram indexes on both. Good. |
| Appointment by ID | `GET /api/dashboard/appointments?id=<uuid>` | Single appointment lookup |
| Appointment range | `GET /api/dashboard/appointments?from=<date>&to=<date>` | Date-range appointments |

### Missing Indexes & Relationships

1. **No `treatments` GIN index** — `appointments.treatments` (JSONB) has no GIN index. `appointments.treatment` (VARCHAR) has no index.
2. **No patient-level outstanding balance** — must compute via aggregate each time.
3. **No full-text search** — `patients.dental_history`, `patients.allergies`, `appointments.notes`, `appointments.diagnosis`, `appointments.chief_complaint` are all unindexed free-text. No `tsvector` or GIN trigram indexes.
4. **No cross-entity search** — cannot search "patients who had RCT by Dr. X in December with pending payment".

---

## 6. Dhara Capability Mapping

| Capability | Readiness (0-10) | Existing Code to Reuse | Missing Work |
|---|---|---|---|
| **`understand()`** — NLP intent classification | **8** | `router.js:classifyIntent()` (302 lines), `config/intents.js` (51 keywords), `config/states.js` (79 transitions), `entities.js`, `ai/gateway.js` (Kali integration), `ai/kali.js` (HTTP client), `ai-gateway/server.js`, `ai-classifications` DB table, `shadow_logs` table, `replay-compare.js` test harness | No production validation — currently in shadow mode; needs accuracy tuning; Qwen model selection just started |
| **`transcribe()`** — Audio transcription | **2** | `lib/transcriber.js` exists (basic); `ai-gateway/server.js` accepts `audioUrl` parameter | No STT provider integration; no whisper/ASR pipeline; no WhatsApp audio message handler |
| **`summarizePatient(patientId)`** — AI patient summary | **5** | `patient/[id]/route.js:22-48` fetches all required data; `patientRepository.js` has lookups; `lib/constants.js` has rating schema | No aggregation/formatting layer for AI consumption; no prompt template; no RAG context builder; no API endpoint |
| **`clinicSearch(query)`** — Natural language search | **3** | `patients/route.js:18-41` has ILIKE search with trigram indexes; Kali gateway exists | No cross-entity search; no query-to-SQL translation; no full-text search indexes on clinical notes; no medical entity recognition |
| **`morningBrief()`** — Daily clinic briefing | **5** | `fetchAppointmentsForFollowUpReminder()`, `fetchAppointmentsForDueReminder()`, `fetchAppointmentsByDate()`, `fetchTodayQueue()` exist; cron infrastructure running | No treatment plan model; no aggregate payment query without sentinel gate; no formatting/prompt layer; no delivery mechanism |
| **`observe()`** — Passive pattern detection | **2** | `shadow_logs` table; `ai_classifications` table; raw appointments/payments data exists | No aggregate query functions; no treatment plan model; no revenue reconciliation query; no alerting/scheduling infrastructure |

---

## 7. Top 5 Architectural Bottlenecks

### Bottleneck #1: No Treatment Plan Model (Critical)

**Problem**: The entire clinical workflow (RCT = 3+ visits, crown = 2 visits) has no schema representation. Every visit is independent. You cannot query incomplete treatments, detect abandonment, or calculate completion rates.

**Evidence**: No `treatment_plans` table in `pool.js`. Appointments have no `treatment_plan_id`. `fetchAppointmentsForFollowUpReminder()` at `appointmentRepository.js:520-540` only checks `follow_up_date IS NOT NULL` — no link back to originating treatment.

**Impact on Dhara**: Blocks treatment abandonment detection, morning brief (incomplete treatments), patient summary (completion rate).

**Fix**: New `treatment_plans` table + `appointments.treatment_plan_id` FK.

---

### Bottleneck #2: The `appointments` Table Is a God Table (High)

**Problem**: 40+ columns on one table serving as: booking record, clinical visit record, financial record, prescription cache, attachment store, queue item. Everything added to `appointments` via ALTER TABLE.

**Evidence**: `pool.js:165-545` — every new feature adds columns to `appointments`. `completeVisit.js` operates on a single wide row. JSONB fields (`tooth_diagnoses`, `medicines`, `treatment_fees`) lack GIN indexes.

**Impact on Dhara**: AI queries scan a denormalized wide table. Cross-entity queries are expensive. Schema extension is risky.

**Fix**: Extract `visit_details`, `prescriptions`, `attachments` into separate tables.

---

### Bottleneck #3: No Master Treatment Catalog (High)

**Problem**: Treatment names are free-text. "RCT", "Root Canal", "root canal treatment" are different strings. No standardized taxonomy.

**Evidence**: `appointmentRepository.js:480-501` — `fetchAppointmentsForDueReminder` selects `treatment` but never filters or groups by it. Settings has `checklists` with diagnosis/advice arrays (`pool.js:610`) but no standardized treatments.

**Impact on Dhara**: `clinicSearch("RCT patients")` must do `ILIKE '%RCT%'` — misses "Root Canal". `morningBrief()` cannot count "5 RCT patients scheduled". `observe()` cannot compute "RCT completion rate".

**Fix**: `treatments` master table with `id, name, category, default_fee` — data migration required.

---

### Bottleneck #4: No Full-Text Search Infrastructure (Medium)

**Problem**: Clinical notes, diagnoses, chief complaints are unindexed free-text. Only `ILIKE '%term%'` available.

**Evidence**: `patients/route.js:38` — trigram indexes exist on name and phone (`pool.js:289-290`) but NOT on `patients.dental_history`, `patients.allergies`, `patients.chronic_conditions`, `appointments.notes`, `appointments.diagnosis`, `appointments.chief_complaint`, `appointments.general_examination`, `appointments.extra_oral_examination`. Kali gateway (`ai-gateway/prompts.js`) has date/time entity extraction but no medical entity recognition.

**Impact on Dhara**: `clinicSearch("diabetes and gum bleeding")` cannot be answered. `summarizePatient()` dumps raw `notes` fields without structured extraction.

**Fix**: Add GIN trigram indexes on all free-text clinical fields + PostgreSQL `tsvector` for combined search.

---

### Bottleneck #5: No Audit/History for Tooth Diagnoses and Prescriptions (High)

**Problem**: Tooth diagnoses are a JSONB snapshot replaced entirely each visit — no per-tooth history. Same for `medicines` JSONB — no prescription history.

**Evidence**: `appointments.tooth_diagnoses` replaced wholesale in `completeVisit.js`. No `tooth_diagnosis_audit` table. `shadow_logs` (`pool.js:455-469`) and `ai_classifications` (`pool.js:653-679`) only track AI decisions, not clinical changes.

**Impact on Dhara**: `summarizePatient()` cannot answer "How has tooth 16 changed?" — must diff across all appointment rows. `observe()` cannot detect "patient developed 3 new caries since last visit". Prescription trends require scanning all `appointment.medicines` JSONB.

**Fix**: Create `tooth_diagnosis_audit` table (tooth_number, patient_id, visit_id, diagnosis, severity, surface, recorded_at) and `prescription_log` table (patient_id, visit_id, medicine_name, dosage, duration, prescribed_at).

---

### Bottleneck Summary

| # | Bottleneck | Impact on Dhara | Severity | Fix Effort |
|---|---|---|---|---|
| 1 | No treatment plan model | Blocks: abandonment detection, morning brief, completion rate | **Critical** | Medium |
| 2 | `appointments` is a god table | Slows cross-entity queries, hard to extend | **High** | Large |
| 3 | No master treatment catalog | Blocks: clinicSearch, treatment revenue tracking | **High** | Medium |
| 4 | No full-text search | Blocks: clinicSearch on clinical notes | **Medium** | Low-Medium |
| 5 | No tooth/prescription history | Blocks: tooth timeline, prescription trends, observe() | **High** | Medium |
