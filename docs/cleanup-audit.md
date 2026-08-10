# Cleanup Audit — June 2026

Comprehensive audit of remaining work, technical debt, dead code, and issues before starting new features.

---

## 🛑 Critical (Exploitable / Data Loss)

| # | Issue | Location | Detail |
|---|-------|----------|--------|
| C1 | **No auth middleware** | `src/proxy.js` (dead) | `proxy.js` has proper auth logic (cookie check + redirect) but Next.js never loads it — must be named `middleware.js` at project root. All `/dashboard/*` and `/api/dashboard/*` routes are publicly accessible. |
| C2 | **Broken API call** | `src/app/dashboard/appointments/page.js:478` | Calls `/api/dashboard/appointments/complete-all` which doesn't exist — only `/bulk` exists. The code acknowledges this in a comment (`// wait, is it /api/dashboard/appointments/bulk or complete_all?`) then calls **both** — first always 404s. |
| C3 | **Live secrets in `.env.local`** | `.env.local` | DB connection string (with password), WhatsApp tokens, R2 keys, Gemini API key. `.gitignore` has `.env*` so git is safe, but risky during dev operations (cp, tar, screen sharing). |

## 🟡 High Priority (Technical Debt)

| # | Issue | Location | Detail |
|---|-------|----------|--------|
| H1 | **27 silent catch handlers** | `engine.js`, `handlers.js`, `visit/page.js`, `patients/[id]/page.js` | `.catch(() => {})` — fire-and-forget with zero logging. When WhatsApp send, session save, or post-visit check fails → silent data loss with no trace. |
| H2 | **45+ console.log/error calls** | `visit/page.js` (12), `media/route.js` (10), dashboard pages | Should be structured `logger.info/error`. Makes production debugging impossible — no correlation IDs, no log levels, no JSON output. |
| H3 | **`valid_state` constraint drift** | `pool.js:518-532` vs `states.js:2-17` | 5 states exist in code but are missing from the DB CHECK constraint. Sessions in these states silently fail to persist. Missing: `DOCTOR_EDIT_PATIENT`, `DOCTOR_FEEDBACK`, `FAMILY_SELECTION`, `WAITING_FOR_VISIT_SUMMARY`, `DOCTOR_LOG_VISIT_NAME`. |

## 🔵 Medium Priority (Cleanup / Hygiene)

| # | Issue | Location | Detail |
|---|-------|----------|--------|
| M1 | **proxy.js is dead code** | `src/proxy.js` | 31 lines of auth middleware — never imported, never loaded by Next.js. Auth is effectively missing (see C1). |
| M2 | **VisitCompleteModal.js is dead code** | `src/app/dashboard/appointments/VisitCompleteModal.js` | 409-line component — never imported anywhere. Superseded by QuickCheckoutModal? |
| M3 | **mock.js is dead code** | `src/lib/ai/mock.js` | Never imported in `src/` |
| M4 | **templates.js is dead code** | `src/config/templates.js` | 68 lines — never imported in `src/` |
| M5 | **aiClassificationRepository.js is dead code** | `src/db/repositories/` | Was imported only by `gateway.js` shadow branch (now removed) |
| M6 | **shadowLogRepository.js is dead code** | `src/db/repositories/` | No imports in `src/` |
| M7 | **Dual treatment catalogs** | `config/clinic.js` (8 treatments) vs `lib/treatments.js` (22 treatments) | No cross-validation — edits to one silently drift from the other. WhatsApp bot uses clinic.js, dashboard uses treatments.js. |
| M8 | **UPI_ID env var mismatch** | `config/clinic.js` vs `visit/page.js` | One reads `process.env.UPI_ID`, the other reads `process.env.NEXT_PUBLIC_UPI_ID`. Different values at runtime. |
| M9 | **State drift — extra in constraint** | `pool.js:519-521` | `BOOKING_DATE`, `BOOKING_TIME`, `BOOKING_TREATMENT` — in DB CHECK constraint but not in canonical `STATES` array from `states.js` |
| M10 | **No `.env.example` parity check** | `.env.example` | Lists 6 variables but code reads 20+ — no automated validation that example stays in sync with actual requirements |

## 🟢 Low Priority

| # | Issue | Detail |
|---|-------|--------|
| L1 | `gemini.js` is dead code | Never imported in `src/` — kept per request |
| L2 | `ocrClient.js` is CLI-only | Never imported in production code |
| L3 | `timelineRenderer.js` only imported by tests | No production callers |
| L4 | `handlers.js` has zero tests | 5000+ lines, zero test coverage |
| L5 | `encodeURIComponent` on potentially null value | `visit/page.js:43` — `NEXT_PUBLIC_UPI_ID` could be undefined |

---

## Recommended Fix Order

### Phase A — Fix Critical Security (30 min)
1. Rename `src/proxy.js` → `src/middleware.js` (Next.js auto-loads it)
2. Remove the dead `complete-all` API call at `page.js:478`
3. Rotate `.env.local` secrets after documenting required vars in `.env.example`

### Phase B — Stop Silent Data Loss (1 hr)
4. Add `logger.warn` to all 27 empty catch handlers
5. Replace 45+ `console.log/error` with structured `logger.info/error`

### Phase C — Clean Dead Code (30 min)
6. Delete `VisitCompleteModal.js`, `mock.js`, `templates.js`, `aiClassificationRepository.js`, `shadowLogRepository.js`
7. Fix `valid_state` constraint to match `states.js`

### Phase D — Quality (2 hr)
8. Reconcile dual treatment catalogs or add cross-validation
9. Unify `UPI_ID` → `NEXT_PUBLIC_UPI_ID` across all files
10. Add parity check for `.env.example` vs actual env var usage
