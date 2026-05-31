# Documentation Index

This folder contains both current behavior docs and historical design/audit records.

## Read In This Order

1. `user-flows.md` - current end-to-end bot behavior, intents, and enhancement backlog.
2. `patient-flow-improvements.md` - most recent patient-facing changes (2026-05-30).
3. `robustness-layer-changes.md` - correction handling, overwrite policy, replay testing.
4. `doctor-flow-simple.md` - doctor command/flow quick reference.
5. `testing-update-2026-05-31.md` - latest replay test fixes and coverage update.
6. `daily-flow-patient-doctor.md` - simple day-to-day flow for both users.
7. `daily-flow-patient-doctor-visual.md` - visual flowcharts for patient and doctor journeys.
8. `india-edge-cases-hardening-2026-05-31.md` - India-focused edge cases and hardening summary.

## Architecture and Deep Design

- `architecture.md` - foundational architecture spec and patterns.
- `truth-and-mutation-model.md` - mutation safety model and state-truth guidance.
- `entity-extraction-design.md` - extraction strategy details.

## Audits and Historical Notes

- `audit-report-2026-05-26.md` - broad project audit snapshot.
- `audit-and-improvements.md` - bug analysis + fix plan from earlier phase.

## Source-of-Truth Notes

- Some older docs describe planned or pre-fix behavior.
- If documents conflict, treat these as primary:
  1. `user-flows.md`
  2. `patient-flow-improvements.md`
  3. Code under `src/lib/`, `src/config/`, and `src/app/api/`

## Known Documentation Gaps

- `README.md` was upgraded from generic Next.js template to project-specific setup.
- A dedicated `.env.example` file is still recommended but not yet added.
