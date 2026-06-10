# Clinical Workspace v3 — 12-Panel Reimagined Layout

## Core Principle
Reproduce the **dentist's thinking process** with 12 distinct panels in natural clinical flow.

## Left Pane (70%) — 8 Clinical Panels (Dentist Order)

```
1. Chief Complaint          (textarea, auto-expand)
2. General Examination      (textarea)
3. Extra-Oral Examination   (textarea)
4. Tooth Chart              (grid + progressive editor + tooth history)
5. Intra-Oral Findings      (DERIVED — grouped diagnoses from tooth chart)
6. Additional Observations  (textarea — free-text, things outside tooth model)
7. Provisional Diagnosis    (chips + notes)     ← form.diagnosisSelected[] + form.diagnosis
8. Planned Procedures       (DERIVED — review list)  ← per-tooth + general procedures
9. Prescription             (presets-first)
10. Advice                  (chips)
11. Attachments             (collapsible)
12. Visit Summary           (DERIVED — pre-save review)
```

### Planned Procedures — compact review list (not chips)
```
Planned Procedures

• Tooth 16 — Composite Filling
• Tooth 46 — RCT
• General — Scaling
```
- **Per-tooth procedures**: derived from `form.toothDiagnoses[].treatment`
- **General procedures**: from `selectedTreatments` where treatment has no tooth association
- Single source of truth feeds billing, PDF, and summary

### Intra-Oral Findings — derived + additional observations
```
Intra-Oral Findings

Derived
• Caries: 16, 25
• Deep Caries: 44
• Pocket: 24-25

Additional Observations
_________________________
(Buccal cortical expansion, high frenum, etc.)
```
- Derived section = computed from `form.toothDiagnoses`, grouped by diagnosis, read-only
- Additional Observations = free text bound to a new/renamed form field

### Visit Summary — structured pre-save review
```
VISIT SUMMARY

Chief Complaint
Pain UL back tooth

Clinical Findings
Caries: 16, 25
Deep Caries: 44

Diagnosis
Irreversible pulpitis

Planned Procedures
RCT 46 | Scaling

Rx
Amox 500, PCM 650

Advice
Soft food, Warm saline rinse

Follow-up
14 Jun
```

## Right Pane (30%) — Patient Context

```
Patient
Mrigesh · 26 M · +91-xxxxxxxxxx
[Edit demographics]

🔴 Penicillin Allergy
🟠 Diabetes
🟡 Hypertension

──────────

▼ Medical           (chronic conditions, blood group, BP, weight, medications)

▼ Dental            (previous RCT, caps, extraction, implants, PDH)

▼ Habits            (smoking, alcohol, tobacco, habits)

▼ Family            (diabetes, orthodontic, FH)

──────────

Current Bill  ₹5,500          ← read-only, auto-derived
  ✓ Consultation    ₹2,000
  ✓ RCT 46          ₹4,500
  ✓ Scaling         ₹1,000

Follow-up
[date]  [instructions]

[Save Clinical Record]
[Checkout Patient]
```

### Critical alerts — severity-based styling, always visible
| Severity | Style | Example |
|----------|-------|---------|
| Life-threatening | 🔴 Red bg, bold | Penicillin allergy |
| Chronic | 🟠 Orange bg | Diabetes, Hypertension |
| Note | 🟡 Yellow bg | Mild allergies |

Never hidden behind collapsibles. Only non-critical details collapse.

### Billing — read-only for doctor
Shows projected line items. No edit inputs, no ± buttons, no payment method selection. Reception handles adjustments.

## Files to Create (3)

| File | Purpose |
|------|---------|
| `IntraOralFindings.js` | Derived grouped-diagnosis view + free-text Additional Observations textarea |
| `ProvisionalDiagnosisCard.js` | Chip selector from `diagnosisOptions` + notes textarea |
| `VisitSummary.js` | Auto-generated structured pre-save review |

## Files to Modify (4)

| File | Changes |
|------|---------|
| `page.js` | Insert all sections in new order. IntraOralFindings + ProvisionalDiagnosis + VisitSummary. Reorder existing sections. General/Extra-Oral as separate textareas (move out of ClinicalNotesCard). Planned Procedures as derived list. |
| `ContextSidebar.js` | Critical alerts with severity styling, always visible. Reorg collapsibles: Medical/Dental/Habits/Family. Billing read-only (remove edit inputs). Follow-up above Save. |
| `ClinicalNotesCard.js` | Rename to `GeneralExaminationCard` or just inline in page.js — split into General Exam + Extra Oral textareas directly |
| `PrescriptionCard.js` | Already presets-first, no changes needed |

## What stays unchanged (7+ files)
- `ToothChartCard.js` — keep progressive disclosure, tooth history, sticky strip
- `PerToothDiagnosisPanel.js` — keep spatial surface diagram, all editing controls
- `MediaCard.js` — keep collapsed by default
- `AdviceCard.js` — already chips-based
- `WalkInDrawer.js`, `EditPatientDrawer.js` — keep as-is
- All 7 old card files — keep on disk for rollback

## Data Model — zero changes
All fields already exist. Derived views use existing `form.toothDiagnoses`, `form.diagnosisSelected`, `form.diagnosis`, `selectedTreatments`, `treatmentFees`.

| UI Section | Source |
|------------|--------|
| Intra-Oral Findings (derived) | `form.toothDiagnoses[]` → group by diagnosis |
| Additional Observations | New form field or repurpose existing notes field |
| Planned Procedures (per-tooth) | `form.toothDiagnoses[].treatment` filtered by truthy |
| Planned Procedures (general) | `selectedTreatments` not associated with any tooth |
| Provisional Diagnosis chips | `form.diagnosisSelected[]` |
| Provisional Diagnosis notes | `form.diagnosis` |
| Visit Summary | Computed from all above fields |

## Key interactions
- Adding diagnosis+treatment to a tooth → auto-appears in IntraOral Findings + Planned Procedures + billing
- Removing from tooth → auto-removes from all derived views
- General procedures (Scaling, Whitening) tracked via existing `toggleTreatment`/`treatmentFees`
- Critical alerts computed from `medicalHistory.allergies` and `medicalHistory.chronicConditions` with severity mapping
- Visit Summary is the pre-save single source of truth for PDF, WhatsApp, print
