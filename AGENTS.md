## Goal
Transform the clinic-bot into a dentist-specific clinical record system with per-tooth diagnosis tracking, treatment planning, severity/outcome tracking, interactive tooth grid, and professional PDF exports.

## Constraints & Preferences
- Use FDI (ISO 3950) tooth numbering (11-48) instead of Universal #1-32
- 2 rows only (upper + lower), 16 teeth per row in a single row, zero gaps between grid cells
- Teeth SVGs as large as possible (`w-full`), minimal padding (`p-px`), no `aspect-square`
- SVG tooth paths for 4 types: molar, premolar, canine, incisor — must be clearly distinguishable
- Clean, interactive design: hover scale, click glow, right-click context menu, bulk select
- All 4 tooth SVGs are user-provided in 24×24 viewBox
- PDF prescription must show tooth diagnoses in a bordered table format (not plain text list)
- Surface diagram renders the actual tooth shape (not a generic outline) with positions that adapt per tooth type

## Progress
### Done
- Replaced all 4 generated SVG tooth paths with user-provided SVGs (molar, premolar, canine, incisor) — clean 24×24 viewBox
- Switched from Universal #1-32 to FDI notation (11-48) in both `ToothGrid` and `PerToothDiagnosisPanel`
- Changed layout from 4 rows (2 per jaw) to 2 rows total — 16 teeth per row in `grid-cols-16`
- Removed arch curve SVGs, background gradient, midline markers — replaced with clean white/gray-900 bg
- Added interactive tooth effects: `hover:scale-110 hover:z-10 hover:drop-shadow-lg`, `active:scale-95`, `ring-2 ring-blue-500/50 ring-offset-1` for active
- Added tooth surface diagram: SVG with actual tooth shape (molar/premolar/canine/incisor), clickable O/M/D/B/L zones with 14×14px hit areas, per-tooth-type positions (canine centered at x=18, incisor B at y=17, etc.)
- Surface label terminology adapts: O="Incisal" for front teeth vs "Occlusal" for posteriors, L="Palatal" for upper vs "Lingual" for lower
- Added treatment plan selector with 13 options + custom input, shows treatment label below tooth in grid
- Added severity levels (mild/moderate/severe) with opacity-based tooth shading
- Added outcome tracking (Successful/Complication/Ongoing/Failed) with color-coded badges
- Added per-tooth notes textarea in panel
- Added status management (Active/Treated/In Progress) with status dots on tooth SVGs (rendered on top of tooth outline)
- Added right-click context menu: quick diagnoses (Caries, Pocket, Mobility, Fractured, Missing) + clear
- Added bulk select mode: "Multi" toggle → click teeth → bulk action bar with quick diagnoses + clear
- Added per-tooth history timeline on patient profile: clickable expand/collapse cards, dot-and-line progress bars color-coded by outcome, full per-visit detail (date, surface, diagnosis, severity, treatment, outcome, notes)
- Updated prescription PDF with 4-column tooth table (Tooth | Surf. | Plan | Diagnosis)
- Added printable dental chart PDF: landscape A4 with all 32 teeth colored by diagnosis, treatment labels, legend — `POST /api/dashboard/visits/[id]/chart` route + Chart buttons on patient profile
- Added full surface name labels below SVG (e.g., "B = Buccal") instead of truncated + removed redundant button row
- Auto-scroll to conditions list when surface is selected
- Updated `onQuickDiagnosis` handler in visit page to preserve treatment, severity, status fields
- Updated patient profile chips and visit summary to show treatment, severity, outcome, status
- Added `chartKey` and `Chart` button UI on patient profile (per-visit + header)

### Fixed
- **`column a.tooth_diagnoses does not exist`** — Added missing `tooth_diagnoses JSONB` column to `appointments` table via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (was already in pool.js:391-395 migration but needed a server restart to apply, or the DB was created before the migration was added). Ran manually via psql and verified API returns 401 instead of 500.
- **Reschedule 500 (unique constraint `idx_appointments_unique_slot`)** — Three-part fix: (1) `supersedeAppointment` now sets `status='superseded'` on the old version so it doesn't hold the slot in the `WHERE status='confirmed'` constraint, (2) reschedule route now checks slot availability upfront and returns 409 if taken, (3) WeekView/DayTimeline call `invalidateFetchCache('/api/dashboard/appointments')` after successful drop so the 60s cache doesn't hide the new position.

### In Progress
- (none)

## Key Decisions
- **FDI over Universal**: User explicitly requested 18-11, 21-28 upper and 48-41, 31-38 lower with 2 rows only
- **One row per jaw**: 16 teeth in `grid-cols-16` (no splitting into 2 rows per jaw)
- **`w-full` SVGs**: Fill available column width, square viewBox maintains aspect ratio, zero gaps
- **`toothPath()` function**: Uses `toothType()` which maps FDI second digit to shape, with `toothQuadrant()` for labels
- **Surface diagram uses actual tooth shape**: Molar/premolar/canine/incisor paths rendered in 40×40 viewBox with per-type zone positions for O/M/B/D/L
- **`buildEntry()` helper**: Centralized entry creation in panel to avoid missing fields across all setter functions
- **Single `expandedTooth` state**: Used instead of per-item `useState` since hooks can't be called inside JSX map callbacks
- **`tooth_diagnoses` JSONB is additive**: Backward-compatible — old `diagnosis_selected TEXT[]` column kept unchanged
- **Status dots render after tooth stroke**: Moved `circle` elements after the `<path>` outline so they appear on top, opacity increased from 0.5 → 0.7

## Next Steps
1. ~~Add `tooth_diagnoses` JSONB column to `appointments` table via DB migration~~ ✅ Done
2. Test full end-to-end flow: tooth grid → save → prescription PDF → patient profile history
3. Deploy and clear R2 cache for PDF changes to take effect

## Critical Context
- All 4 tooth SVGs are user-provided in 24×24 viewBox — paths stored as constants with `toothPath(num)` dispatcher
- `toothType()` uses FDI second digit: `pos % 10` — 1-2=incisor, 3=canine, 4-5=premolar, 6-8=molar
- `surfaceLabel(id, num)` returns correct terminology: Incisal for incisors/canines, Palatal for upper teeth
- `ZONE_POSITIONS` maps per tooth type with specific x,y coordinates for surface labels in 40×40 viewBox
- `buildEntry()` in PerToothDiagnosisPanel ensures all fields (diagnoses, surface, treatment, severity, status, outcome, notes) are always included
- The dental diagram's B label was recently centered for canines (x=20→18), incisor B moved up (y=18→17)
- Chart PDF (`generateDentalChart`) renders A4 landscape with all 32 teeth, color-coded by diagnosis
- R2 cached PDFs must be invalidated (`prescription_key = NULL`) before PDF changes appear
- Server running on port 3000

## Relevant Files
- `src/components/ToothGrid.js`: Full rewrite — FDI, 2-row grid, interactive hover/active, context menu, bulk select, severity shading, status dots, treatment labels, legend
- `src/components/PerToothDiagnosisPanel.js`: Surface diagram (per-tooth-type), diagnosis checklist, treatment planner, severity/outcome/status selectors, tooth notes, auto-scroll, `buildEntry()` pattern
- `src/lib/prescription.js`: `generatePrescription()` — 4-column tooth table (Tooth | Surf. | Plan | Diagnosis); `generateDentalChart()` — A4 landscape chart PDF with 32 colored teeth and legend
- `src/app/api/dashboard/patients/[id]/route.js`: Fetches `tooth_diagnoses` in patient visits query
- `src/app/api/dashboard/visit/route.js`: Saves `tooth_diagnoses` JSONB on PATCH/INSERT
- `src/app/api/dashboard/appointments/route.js`: Includes `tooth_diagnoses` in GET SELECT queries
- `src/app/api/dashboard/visits/[id]/prescription/route.js`: Passes `tooth_diagnoses` to PDF generator
- `src/app/api/dashboard/visits/[id]/chart/route.js`: New route for printable dental chart PDF
- `src/app/dashboard/patients/[id]/page.js`: Per-tooth diagnosis chips with treatment/severity/outcome, per-tooth history timeline with clickable expand/collapse, progress dot visualization, Chart + Print buttons
- `src/app/dashboard/visit/page.js`: Integration of ToothGrid + PerToothDiagnosisPanel, `onQuickDiagnosis` handler preserves all fields, summary chips with surface/treatment/severity
- `src/components/WeekView.js`: 7-column weekly calendar with time-slot grid (8am-8pm), appointment blocks positioned by time, **drag-to-reschedule** via native HTML5 DnD, click empty slot to book, click appointment to view patient
- `src/components/DayTimeline.js`: Single-day vertical timeline with hour rows, wider appointment blocks (name/time/treatment/location/phone/status), drag-to-reschedule
- `src/app/dashboard/page.js`: View switcher `[Month] [Week] [Day]` in header — Month renders existing Calendar+SlotGrid, Week renders WeekView, Day renders DayTimeline; `?book=time` query param auto-opens QuickBook modal
