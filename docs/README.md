# Documentation Index

This folder contains both current behavior docs and historical design/audit records.

## Read In This Order

1. `user-flow-guide.md` - comprehensive end-user conversation guide (34 states, all patient + doctor flows).
2. `user-flows.md` - detailed patient intent/state catalog and enhancement backlog.
3. `patient-flow-improvements.md` - patient-facing changes (reminder replies, patient name, feedback, time filtering).
4. `robustness-layer-changes.md` - correction handling, overwrite policy, replay testing.
5. `doctor-flow.md` - technical doctor flow design (all 22 doctor states, registration, visit logging, chit media).
6. `doctor-flow-simple.md` - non-technical doctor command quick reference.
7. `testing-update-2026-05-31.md` - replay test coverage (28 fixtures, Devanagari, evening check-in).
8. `daily-flow-patient-doctor.md` - simple day-to-day flow for both users (all cron schedules).
9. `daily-flow-patient-doctor-visual.md` - visual flowcharts (patient + doctor journeys).
10. `india-edge-cases-hardening-2026-05-31.md` - India/Hinglish/Devanagari edge cases.
11. `chit-media-flow.md` - technical design for chit photo/voice note storage.
12. `chit-media-for-clinic.md` - non-technical guide for clinic staff.

## Architecture and Deep Design

- `architecture.md` - foundational architecture spec (historical — implementation has evolved).
- `truth-and-mutation-model.md` - mutation safety model and state-truth guidance.
- `entity-extraction-design.md` - current extraction strategy details (validators.js implementation).

## Roadmap / Planning

- `enhancements-roadmap.md` - upcoming features: receptionist role, queue management, and future enhancements.

## Audits and Historical Notes

- `audit-report-2026-05-26.md` - point-in-time audit snapshot (mostly fixed).
- `audit-and-improvements.md` - bug analysis from earlier phase (mostly resolved).

## Cron Schedule Summary

All crons run via Vercel Cron Jobs (`vercel.json`):

| Cron | Schedule (UTC) | IST | Purpose |
|---|---|---|---|
| Morning summary | `50 3 * * *` | 9:20 AM | Doctor's daily appointment list |
| Evening check-in | `0 14 * * *` | 7:30 PM | Doctor's end-of-day recap + no-show marking |
| Patient reminders | `30 17 * * *` | 11:00 PM | Night-before reminder for next day's patients |

## Source-of-Truth Notes

- `docs/user-flow-guide.md` and `docs/user-flows.md` are the primary current-behavior references.
- `docs/architecture.md`, `docs/audit-report-2026-05-26.md`, and `docs/audit-and-improvements.md` contain historical/design context — not strict current-state truth.
