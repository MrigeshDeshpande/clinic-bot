# Documentation Index

This folder contains both current behavior docs and historical design/audit records.

## Read In This Order

1. `user-flows.md` - current end-to-end bot behavior, intents, and enhancement backlog.
2. `patient-flow-improvements.md` - most recent patient-facing changes (2026-05-30).
3. `robustness-layer-changes.md` - correction handling, overwrite policy, replay testing.
4. `doctor-flow-simple.md` - doctor command/flow quick reference.
5. `testing-update-2026-05-31.md` - latest replay test fixes, coverage, and feature additions (Devanagari, evening check-in, timing update).
6. `daily-flow-patient-doctor.md` - simple day-to-day flow for both users (includes all cron schedules and evening check-in flow).
7. `daily-flow-patient-doctor-visual.md` - visual flowcharts for patient and doctor journeys (updated with evening check-in).
8. `india-edge-cases-hardening-2026-05-31.md` - India-focused edge cases and hardening summary (updated with Devanagari support).

## Architecture and Deep Design

- `architecture.md` - foundational architecture spec and patterns.
- `truth-and-mutation-model.md` - mutation safety model and state-truth guidance.
- `entity-extraction-design.md` - extraction strategy details.

## Audits and Historical Notes

- `audit-report-2026-05-26.md` - broad project audit snapshot.
- `audit-and-improvements.md` - bug analysis + fix plan from earlier phase.

## Cron Schedule Summary

All crons run via Vercel Cron Jobs (`vercel.json`):

| Cron | Schedule (UTC) | IST | Purpose |
|---|---|---|---|
| Morning summary | `50 3 * * *` | 9:20 AM | Doctor's daily appointment list |
| Evening check-in | `0 14 * * *` | 7:30 PM | Doctor's end-of-day recap + no-show marking |
| Patient reminders | `30 17 * * *` | 11:00 PM | Night-before reminder for next day's patients |

## Source-of-Truth Notes

- Some older docs describe planned or pre-fix behavior.
- If documents conflict, treat these as primary:
  1. `user-flows.md`
  2. `patient-flow-improvements.md`
  3. Code under `src/lib/`, `src/config/`, and `src/app/api/`

## Known Documentation Gaps

- `README.md` was upgraded from generic Next.js template to project-specific setup.
- A dedicated `.env.example` file is still recommended but not yet added.
