# Replay Testing Update (2026-05-31)

## What Was Updated

### 1) Patient flow fixes

- Added missing treatment catalog entries in `src/config/clinic.js`:
  - `General Dentistry`
  - `Teeth Cleaning`
- Added robust aliases for both so free-text inputs like "cleaning" and
  "general dentistry" resolve as `provide_treatment`.

### 2) Doctor flow bug fix

- Fixed malformed list reply payload in `handleDoctorMainMenu` for
  `doctor_view_by_date` in `src/lib/handlers.js`.
- Before fix, the handler returned `reply` as a plain string with
  `buttonLabel/sections` outside the `reply` object, which caused runtime
  failure in list send path.

### 3) Replay runner improvements

- Updated `tests/replay/runner.js` to:
  - set replay env before imports using dynamic imports,
  - support doctor fixtures reliably,
  - support interactive fixture messages (`interactiveId`, `interactiveTitle`).

### 4) Replay fixture coverage expansion

- Rebuilt `tests/replay/fixtures.js` to include:
  - Patient positive and negative flows aligned with current booking design
    (including patient name step via `affirm` before final confirm).
  - Doctor positive and negative flows based on current scope:
    - doctor main menu,
    - view today,
    - manage schedule,
    - stats,
    - invalid date handling,
    - unknown input handling.

## Test Result

Command:

```bash
REPLAY_MODE=true node --experimental-loader ./tests/replay/path-loader.js tests/replay/runner.js
```

Result:

- **13 passed, 0 failed, 0 skipped**

## Files Changed

- `src/config/clinic.js`
- `src/lib/handlers.js`
- `tests/replay/runner.js`
- `tests/replay/fixtures.js`
- `docs/testing-update-2026-05-31.md`
