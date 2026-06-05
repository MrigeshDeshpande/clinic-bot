# India Edge Cases Hardening (2026-05-31)

## Why this hardening was needed

Real users in India often type mixed English + Hinglish on WhatsApp.
The earlier logic handled standard English well, but some common local phrases
could fail parsing or route to wrong intents.

---

## Edge Cases Identified

1. **Date words not parsed**
   - Inputs like `kal`, `parso`, `aaj` were common but not supported.

2. **Time words not parsed**
   - Inputs like `5 baje`, `7 bje shaam`, `saade 5` were not supported.

3. **Emergency phrases in Hinglish**
   - Phrases like `masoodon se khun` and `bahut dard` were weakly covered.

4. **Hindi confirmation language**
   - `haan`, `theek hai`, `kar do` should confirm in booking confirmation step.

5. **Hindi cancel language**
   - `radd karo`, `cancel karo` should trigger cancel intent.

6. **Cancel-confirm backflow bug**
   - In `CANCEL_CONFIRM`, user saying a "no/back" style response could jump to
     `MAIN_MENU` via global back instead of restoring booked summary.

---

## What was changed

### 1) Date parsing hardening

File: `src/lib/validators.js`

- Added support:
  - `aaj` -> today
  - `kal` -> tomorrow
  - `parso` -> day after tomorrow
- Added weekday prefix acceptance for `agla/agle` with weekday text.
- Added relative day offsets:
  - `2 din baad`, `3 din baad`
  - `do din baad`, `teen din baad`, etc.

### 1b) Ambiguity guard for `kal`

File: `src/lib/validators.js`

- In real usage, `kal` can mean yesterday or tomorrow.
- To avoid wrong-date bookings, parser now treats bare `kal` as ambiguous and
  asks user to type explicit date (`tomorrow` / `25 May`).

### 2) Time parsing hardening

File: `src/lib/validators.js`

- Added support:
  - `5 baje` / `7 bje` (with optional `subah/shaam/raat`)
  - `saade 5` / `sade 5` -> `:30`
- Added local time-of-day words to existing mapping:
  - `subah`, `dopahar`, `shaam`, `raat`

### 2b) Devanagari date/time support

Files: `src/lib/validators.js`, `src/lib/router.js`, `src/config/intents.js`

- Added Devanagari terms for date/time:
  - `आज`, `कल`, `परसों`
  - `५ बजे शाम` style time entries
  - `साढ़े 5` style half-past entries
- Added Indic digit normalization (`०१२३४५६७८९` -> `0123456789`) before parsing.
- Updated keyword matcher to handle non-ASCII words with safe substring matching
  (word-boundary regex was unreliable for Devanagari).
- Added Devanagari intent terms like `नमस्ते`, `हाँ`, `ठीक है`, `कर दो`, `बहुत दर्द`.

### 3) Intent keyword hardening

File: `src/config/intents.js`

- Expanded emergency keywords:
  - `bahut dard`, `bahot dard`, `masoodon se khun`
- Expanded affirm/confirm coverage:
  - `haan`, `han`, `thik hai`, `theek hai`, `kar do`
- Expanded cancel coverage:
  - `radd karo`, `cancel karo`
- Tightened cancel coverage:
  - removed `mat karo` from global cancel to avoid conflict in
    cancel-confirm "no" flow.
- Expanded cancel confirmation yes/no coverage:
  - yes: `haan`, `radd karo`, `cancel karo`
  - no/back: `nahi`, `mat karo`, `cancel mat karo`

### 4) Cancel confirmation flow bug fix

File: `src/lib/handlers.js`

- Global `back` now special-cases `CANCEL_CONFIRM` and routes to
  `handleCancelConfirm(session, 'back')`.
- This preserves expected behavior (return to booked summary) instead of
  jumping to main menu.

### 5) Indian phone validation hardening

File: `src/lib/validators.js`

- Mobile validation now accepts only numbers starting with `6-9`.
- Prevents accidental acceptance of invalid 10-digit numbers like `123...`.

---

## Replay tests added for India edge cases

File: `tests/replay/fixtures.js`

Added fixtures:

1. `India Hindi Date/Time Parsing (kal + baje)`
2. `India Date Ambiguity Guard (kal)`
3. `India Hindi Time Parsing (baje)`
4. `India Hindi Date Parsing (parso)`
5. `India Relative Days Parsing (do din baad)`
6. `India Hinglish Time Parsing (saade 5)`
7. `India Emergency Phrase (masoodon se khun)`
8. `India Cancel Confirm Hindi No (mat karo)`
9. `India Mixed Language Booking (tomorrow + bje + haan)`
10. `India Callback Invalid Then Valid Phone`
11. `India Emergency Hinglish Phrase (bahut dard)`
12. `India Relative Days Numeric (3 din baad)`
13. `India Devanagari Date Time (आज + ५ बजे शाम)`
14. `India Devanagari Emergency (बहुत दर्द)`

---

## Verification

Command:

```bash
npm run test:replay
```

Result after hardening:

- **26 passed, 0 failed, 0 skipped**

---

## Remaining known limits

1. Full Hindi script parsing (Devanagari) is still limited.
2. Ambiguous `kal` can mean yesterday/tomorrow in real speech; current logic
   treats it as tomorrow (booking-safe default).
3. More regional spellings can still be added over time from real chat logs.
