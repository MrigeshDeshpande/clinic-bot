# Blank Tooth Chart — Root Cause & Fix

## Problem
After saving a visit with tooth diagnoses, returning to the same patient shows an empty tooth chart.

## Root Cause: Double-encoded JSONB via tagged template

`createWalkIn.js` used `JSON.stringify` inside `postgres.js` tagged template SQL for JSONB columns. `postgres.js` v3 **already auto-serializes JSONB**, so this caused double-encoding:

| Step | Value | Type |
|------|-------|------|
| Original | `[{tooth:18, diagnoses:["Deep caries"]}]` | JS array |
| After `JSON.stringify` | `'[{"tooth":18,...}]'` | JS string |
| postgres.js JSONB serializer | wraps string in quotes | `"\"[...]\""` |
| Stored in PG JSONB | `"[{\"tooth\":18,...}]"` | JSON string (not array) |
| Read by postgres.js | `'[{"tooth":18,...}]'` | JS **string** |
| `Array.isArray` check | `false` ❌ | silently skipped |

**Confirmed by DB query** — `jsonb_typeof(tooth_diagnoses)` returned `'string'` instead of `'array'`.

## Files Changed

### 1. `src/services/createWalkIn.js` (lines 89, 91, 92, 95)
Removed `JSON.stringify` from 4 tagged template params. postgres.js auto-serializes correctly:

| Column | Before | After |
|--------|--------|-------|
| `treatments` | `${JSON.stringify(treatments \|\| [])}` | `${treatments \|\| []}` |
| `treatment_fees` | `${JSON.stringify(treatmentFees \|\| {})}` | `${treatmentFees \|\| {}}` |
| `medicines` | `${JSON.stringify(medicines \|\| [])}` | `${medicines \|\| []}` |
| `tooth_diagnoses` | `${JSON.stringify(tooth_diagnoses \|\| [])}` | `${tooth_diagnoses \|\| []}` |

### 2. `src/app/dashboard/visit/page.js`
- Added `parseToothDiagnoses()` helper — handles both new (array) and legacy double-encoded (string) formats
- `mergeToothDiagnoses()` now uses it instead of bare `Array.isArray`
- Added `invalidateFetchCache` import + call after `handleSubmit` saves a visit (invalidates client-side cache)

### 3. `src/app/api/dashboard/visit/route.js`
- Added `invalidateCache` import from `@/lib/dataCache`
- Invalidates `patient_detail:{id}` after both `createWalkIn` and `completeVisit` (fixes server-side cache staleness)

## Note on other `JSON.stringify` usages
`completeVisit.js` uses `sql.unsafe()` (not tagged template), where `JSON.stringify` **is required** — kept unchanged. Other files (`appointmentRepository.js`, `patientRepository.js`, `appointments/route.js`) also have the same tagged-template double-encoding pattern for `treatments`/`medicines`, but their read paths have fallbacks that mask the issue.

## DB cleanup for existing corrupted data

Run once in Neon:
```sql
UPDATE appointments 
SET tooth_diagnoses = (tooth_diagnoses #>> '{}')::jsonb
WHERE tooth_diagnoses IS NOT NULL 
  AND jsonb_typeof(tooth_diagnoses) = 'string';
```
Or to fix all 4 JSONB columns:
```sql
UPDATE appointments SET
  tooth_diagnoses = CASE WHEN jsonb_typeof(tooth_diagnoses) = 'string' THEN (tooth_diagnoses #>> '{}')::jsonb ELSE tooth_diagnoses END,
  treatments = CASE WHEN jsonb_typeof(treatments) = 'string' THEN (treatments #>> '{}')::jsonb ELSE treatments END,
  treatment_fees = CASE WHEN jsonb_typeof(treatment_fees) = 'string' THEN (treatment_fees #>> '{}')::jsonb ELSE treatment_fees END,
  medicines = CASE WHEN jsonb_typeof(medicines) = 'string' THEN (medicines #>> '{}')::jsonb ELSE medicines END;
```
