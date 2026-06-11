# Clinical Cockpit v2 — UX Redesign

## Goal
Address 7 UX regressions from the first cockpit redesign: empty page, missing patient context, oversized tooth visualization, floating Chief Complaint, compressed sidebar, cryptic billing, buried prescription.

## Layout
- 12-column grid: `xl:grid-cols-12`
- Clinical workspace: `xl:col-span-8`
- Context sidebar: `xl:col-span-4` (~67/33 split)
- Full-width: remove `max-w-[1600px] mx-auto`
- Tighter padding: `p-4` instead of `p-5 md:p-7 lg:p-10`

## Content Order (Left Pane)
1. Chief Complaint (stays separate, above tooth chart)
2. Tooth Chart (stable size, no compression on selection)
3. Per-Tooth Editor (progressive disclosure — expands only when tooth selected)
4. Tooth History (read-only timeline below editor)
5. Clinical Notes
6. Prescription
7. Advice
8. Media

## 8 Commits

### Commit 1: Layout
- `page.js`: `xl:grid-cols-10` → `xl:grid-cols-12`, clinical `xl:col-span-8`, sidebar `xl:col-span-4`
- Remove `max-w-[1600px] mx-auto`
- `p-5 md:p-7 lg:p-10` → `p-4`

### Commit 2: Tooth chart sizing
- `ToothChartCard.js`: Remove any size clamping, ensure chart fills available width
- Stable on selection — no layout shift when editor opens

### Commit 3: Context sidebar redesign
- `ContextSidebar.js`: 
  - Collapsible sections: `▶ History`, `▶ Medical`, `▶ Dental` (useState toggles)
  - Direct-edit billing: `[2000]` inputs instead of ± buttons
  - Large "Current Bill ₹5,500" at top of TODAY section
  - Shopping-cart ✓ line items (Consultation, Treatment, Medicines)
  - Restore habits, PDH, FH from medicalHistory prop

### Commit 4: Progressive disclosure
- `ToothChartCard.js`: 
  - When `selectedTooth` is null: show only the grid (no placeholder, no panel)
  - When `selectedTooth` is set: grid stays same size, editor expands below
  - Remove the "Tap a tooth above" placeholder text

### Commit 5: Instant tooth history
- `page.js` or new sub-component: Read-only timeline below per-tooth editor
- Filters `patientVisits` for entries matching `selectedTooth`
- Format: `2024  Composite Filling` — no buttons, no hovers, no editing
- Visually distinct from editor (muted colors, smaller text)

### Commit 6: Shopping-cart billing
- `ContextSidebar.js`:
  - ✓ checkmarks on selected treatment items
  - Direct-edit fee amounts (plain input, no ±)
  - Consultation always shown
  - Medicines count if > 0
  - Bold total with separator line

### Commit 7: Content reorder
- `page.js`: 
  - Move PrescriptionCard above ClinicalNotesCard
  - Move AdviceCard below PrescriptionCard
  - Add ToothHistoryCard placeholder below PerToothEditor
  - Final order: CC → ToothChart → Editor → History → ClinicalNotes → Prescription → Advice → Media

### Commit 8: Sticky context strip + surface diagram resize + polish
- `page.js`: Add fixed strip at top of clinical area when `selectedTooth` is set:
  - `🦷 16  •  Caries  •  RCT  •  Mild`
  - Single line, subtle bg, no card/chrome/shadow
  - Clicking it scrolls `#per-tooth-editor` into view
- `PerToothDiagnosisPanel.js`:
  - Shrink SurfaceDiagram from `w-28 h-28` to `w-16 h-16`
  - Keep spatial click zones (not text buttons)
  - Compact layout overall

## Files to Modify
- `src/app/dashboard/visit/page.js`
- `src/components/visit/ContextSidebar.js`
- `src/components/visit/ToothChartCard.js`
- `src/components/PerToothDiagnosisPanel.js`

## Non-Goals
- No new API endpoints
- No new database columns
- No removing old card files (stay on disk for rollback)
- No animation-heavy effects
- No tooth chart compression on selection

## Decisions
- Chief Complaint stays OUTSIDE ToothChartCard (dentist mental model: complaint → examination → chart)
- Surface diagram stays spatial (not text buttons) — clinicians rely on spatial memory
- Tooth history is read-only, visually distinct, separate from editor
- Billing uses direct-edit inputs not ± buttons (typing faster than clicking)
- Sticky context strip is clickable — scrolls to active editor
- page.js stays as orchestrator (~500 lines target), logic in sub-components
