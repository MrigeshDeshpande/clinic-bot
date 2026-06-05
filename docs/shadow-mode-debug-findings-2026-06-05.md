# Shadow Mode Debug Findings — 2026-06-05

## Problem

`shadow_logs` table was empty despite `SHADOW_MODE=true` and `GEMINI_API_KEY` being configured in Vercel environment variables.

## Root Cause

Gemini API returned **HTTP 429 (quota exhausted)** on every call:

```
Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 0
Quota exceeded for metric: generate_content_free_tier_requests, limit: 0, model: gemini-2.0-flash
Quota exceeded for metric: generate_content_free_tier_input_token_count, limit: 0, model: gemini-2.0-flash
```

The free tier quota for the project `Clinixy` (API key ending `...aN-g`) was effectively **zero** — likely because the daily free limit was already exhausted, or the model `gemini-2.0-flash` no longer has free tier availability in the user's region.

## Code Path

In `src/lib/ai/index.js`, the `classifyWithFallback` function:

1. `classifier` is set to `geminiClassify` because `GEMINI_API_KEY` is present ✅
2. `SHADOW_MODE=true` → AI result is compared with rule result ✅
3. AI call to `gemini-2.0-flash` fails with 429 ❌
4. Error is caught → `INTENT_CLASSIFICATION_FAILED` logged ✅
5. Falls through to rule-only result **without inserting a shadow log** ❌

Shadow logs are only inserted on AI success (`index.js:102-113`). On AI failure, no log is written.

## Affected Tables

| Table | Status | Reason |
|---|---|---|
| `shadow_logs` | Empty | AI call always fails (429) — insert never reached |
| `due_reminder_log` | Empty | Cron runs at 5:30 PM daily; no qualifying appointments yet |
| `test_migrations` | N/A | Table does not exist in any migration |

## Verified Working

- `DB_MIGRATIONS_COMPLETE` logged on cold start ✅
- `MANUAL_MODE_ACTIVE` working for patient `919993307810` ✅
- `SESSION_SAVED` to DB ✅
- Webhook returns 200 and processes synchronously ✅

## Next Steps

1. **Enable billing** on Google AI Studio project to get paid quota
2. Or **remove `GEMINI_API_KEY`** from Vercel env vars to skip AI entirely (cleaner logs, no failed calls)
3. Re-test shadow logging after quota is resolved
