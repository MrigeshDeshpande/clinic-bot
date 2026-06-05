# Replay Testing Update (2026-05-31)

## Current Test Suite

**28 fixtures — 28 passed, 0 failed, 0 skipped**

### Coverage

| Category | Count | Details |
|---|---|---|
| Patient happy path + variations | 6 | Booking, corrections, invalid-then-corrected, menu interruption, escalation, cancel |
| Patient callback flow | 1 | Phone validation |
| Doctor positive flows | 4 | Greeting, view today, manage schedule, stats |
| Doctor negative flows | 2 | Invalid date, unknown input |
| India date/time parsing | 6 | `kal` ambiguity, `baje`, `parso`, `saade`, relative days, mixed language |
| India emergency phrases | 2 | `masoodon se khun`, `bahut dard` |
| India phone validation | 1 | Invalid then valid callback phone |
| India Devanagari | 2 | Date+time in Devanagari (`आज ५ बजे`), emergency (`बहुत दर्द`) |
| Evening check-in | 2 | Doctor `all good`, doctor `missed <time>` no-show |

### What Was Added (latest round)

- **Devanagari intent keywords** in `src/config/intents.js`: `नमस्ते`, `हाँ`, `ठीक है`, `कर दो`, `रद्द`, `कैंसल`, `बहुत दर्द`
- **Devanagari date/time parsing** in `src/lib/validators.js`: `आज`, `कल`, `परसों`, `५ बजे शाम`, `साढ़े`, `सुबह`/`दोपहर`/`शाम`/`रात`
- **Indic digit normalization** in `src/lib/validators.js`: `०-९` → `0-9`
- **Non-ASCII keyword matching** in `src/lib/router.js`: falls back to `includes()` for Devanagari terms
- **Evening check-in cron** `src/app/api/cron/evening-checkin/route.js`: runs at 7:30 PM IST, sends doctor today's appointment list, supports `missed <time>` and `all good` replies
- **Doctor no-show-by-time** in `src/lib/handlers.js`: `handleDoctorEveningNoshow` + `handleDoctorAffirm`
- **Clinic timing update** in `src/config/clinic.js`: weekday hours changed from 09:00–20:00 to 10:00–20:00
- **Cron schedule updates** in `vercel.json`:
  - Daily summary: `30 2 * * *` → `50 3 * * *` (9:20 AM IST)
  - Reminders: `30 4 * * *` → `30 17 * * *` (11 PM IST)
  - Evening check-in (new): `0 14 * * *` (7:30 PM IST)

## Files Changed (latest round)

- `src/config/clinic.js` — updated timings to 10 AM – 8 PM
- `src/config/intents.js` — Devanagari intent keywords
- `src/lib/validators.js` — Devanagari date/time, Indic digit normalization
- `src/lib/router.js` — non-ASCII keyword matching
- `src/lib/handlers.js` — evening check-in handlers, doctor affirm
- `src/db/pool.js` — added `reminder_sent_at` to base CREATE TABLE
- `src/app/api/cron/evening-checkin/route.js` — new cron endpoint
- `src/app/api/cron/daily-summary/route.js` — added phone to daily summary
- `vercel.json` — updated cron schedules, added evening check-in
- `tests/replay/fixtures.js` — 2 new evening check-in fixtures
- `docs/testing-update-2026-05-31.md` — this file
