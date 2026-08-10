# Ground-Truth System Analysis

> **Date:** 2026-08-10
> **Scope:** The REAL system as it runs in production/code — not intended design, not assumptions. Verified against the codebase line-by-line.
> **Flow covered:** WhatsApp message received → final output (stored prescription or follow-up message).

---

## 1. ENTRY POINT

**Endpoint:** `POST /api/webhook/whatsapp` — `src/app/api/webhook/whatsapp/route.js:22`

**GET** is the Meta hub verification handshake (mode/token/challenge against `WHATSAPP_VERIFY_TOKEN`).

**POST flow (route.js:22-46):**
1. `WEBHOOK_LIMITER(req)` — in-memory `Map` rate limit, 60 req/min per IP (`src/lib/rateLimit.js:35`). Returns 429 if exceeded.
2. `req.text()` → `JSON.parse` — **parsed exactly once, right here** (comment at line 29 warns downstream never to re-parse).
3. `await runMigrations()` — **runs the entire ~1000-line migration suite on EVERY webhook call** before any processing (cold-start safety; pooled via `migrationsPromise`).
4. `await processEvent(payload)` — **the full conversational pipeline blocks the HTTP response**. Comment at line 41-42: Vercel terminates the function if it returns 200 first. So there is no fire-and-forget.

**Incoming payload shape** (WhatsApp Cloud API v19.0):

```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "changes": [{
      "value": {
        "messages": [{ "from": "91...", "id": "wamid...", "timestamp": "...", "type": "text", "text": { "body": "..." } }],
        "contacts": [{ "profile": { "name": "..." }, "wa_id": "91..." }],
        "metadata": { "display_phone_number": "...", "phone_number_id": "..." }
      }
    }]
  }]
}
```

**Validations (engine.js `classifyEvent` :19-55):**
- `object !== 'whatsapp_business_account'` → halt
- `value.statuses` (delivery/read receipts) → halt
- `value.errors` → log + halt
- Filters out messages where `from === WHATSAPP_PHONE_NUMBER_ID` (self-messages)
- Sorts remaining messages by timestamp ascending

**⚠️ Security gap:** the POST handler does **NOT verify Meta's `X-Hub-Signature-256`**. There is no signature check anywhere. Anybody who can reach the URL can inject fake events (they just get `received:true`). Protection is only the IP rate-limit.

**Stored immediately (not atomically — three separate fire-and-forget writes):**
- `sessions` row via `getOrCreate` → `upsertSession` (upsert on `wa_id`) — `sessionRepository.js:28`
- `messages` row via `createMessage` (after intent classification) — `messageRepository.js:4`

---

## 2. MESSAGE STORAGE

**Table:** `messages` (`pool.js:111`) — `id`, `msg_id` (UNIQUE), `session_id` FK→sessions, `wa_id`, `role` (`user`/`bot`), `content`, `intent`, `metadata` JSONB, `created_at`.

**Is the full payload preserved? No.** `normalizeMessage` (engine.js:60-119) reduces each message to: `msgId, waId, profileName, type, text (NFKC-normalized, whitespace-collapsed), textClean (emojis stripped), textLower, textTrimmed, timestamp, phoneNumberId, hasMedia, interactiveId, mediaId, mimeType`. Everything else in the original payload is discarded. `metadata` column only holds `stateBefore`/`stateAfter`/`replyType` — not the raw body.

**Bot replies are also stored** (`role='bot'`, engine.js:342-351). If the send returns no ID, a synthetic `bot_<ts>_<rand>` msgId is generated — so a failed/silent send still records a message with no traceability to a real WhatsApp ID.

**Idempotency — two layers (`src/lib/deduplicate.js`):**
1. **Fast path:** in-memory `Set` (capped 10k, trims to last 5k).
2. **Slow path:** `SELECT 1 FROM messages WHERE msg_id = X`.

**Real behavior / weakness:** the DB is the source of truth, but `isDuplicate` adds the msgId to the memory Set **even when not found in DB** (line 42), so the Set only helps within one process. `createMessage` uses `ON CONFLICT (msg_id) DO UPDATE` (`messageRepository.js:14-20`) — i.e. **upsert, not reject**. Consequence: two concurrent webhook deliveries of the same message both pass the dedup check and **both run the full pipeline** (AI classify + handler + `sendReply` → **two WhatsApp replies**); the second message-write just silently overwrites the first. Dedup does not protect against double-send under concurrency or across Vercel instances (per-instance memory).

---

## 3. PROCESSING PIPELINE

**There is NO queue for chat messages.** Everything is synchronous inside the webhook request. The only queue in the system is `media_processing_jobs` for OCR/extraction (see §5).

**Flow per message (engine.js `processEvent` :177-391):**
1. `isDuplicate(msg.id)` → skip if dup
2. `normalizeMessage(msg, event)`
3. `markAsRead(msgId)` — fire-and-forget, `.catch(() => {})`
4. `getOrCreate(waId, phoneNumberId, profileName)` — role detection (doctor/receptionist by waId), 3-layer cache: memory → DB → new session (`session.js:178`)
5. If `session.context.manualMode` → store user msg, forward preview to doctor, fire dashboard event, `continue` (bot is bypassed)
6. `checkRapidFireSafety` — logs `RAPID_FIRE_RISK` but always returns `safe: true` (dead logic, line 151-172)
7. `classifyWithFallback` → AI intent classification w/ rule fallback
8. Correction detection (only if intent `unknown` in booking states)
9. `extractEntities` + `accumulateEntities` into session context
10. `createMessage` (user msg, fire-and-forget)
11. `getNextState` → `handle(state, ...)` → applies transition if handler didn't change state
12. `sendReply` — **blocks** on the Meta Graph API call, with fallbacks for list→text and buttons→text (`sendReply` :124-146)
13. `checkAndSendPostVisit(waId)` — fire-and-forget auto post-visit summary
14. `createMessage` (bot msg), `notifyNewMessage` (dashboard SSE event)
15. `save(session)` — cache updated synchronously, **DB write is fire-and-forget** (engine.js:336-339)

**Triggering:** only via the webhook POST. Nothing polls or batches chat messages.

---

## 4. ASYNC vs SYNC

| Part | Mode | Where |
|---|---|---|
| Intent classification (Kali/Ollama) | **Sync** (up to 3s timeout, blocks webhook) | `kali.js:13-22` |
| Handler execution + DB reads | **Sync** | `handlers.js` |
| `sendReply` (Meta Graph API) | **Sync** — 2 retries × 500ms backoff | `whatsapp.js:45-87` |
| `markAsRead` | Fire-and-forget | `engine.js:201` |
| `createMessage` user/bot | Fire-and-forget | `engine.js:291, 343` |
| `save(session)` | Fire-and-forget (cache sync) | `engine.js:339` |
| `checkAndSendPostVisit` | Fire-and-forget | `engine.js:325` |
| Media download + R2 upload | **Sync inside handler** (blocks reply) | `media.js:74-145` |
| Whisper transcription | **Sync inside handler, NO timeout** | `transcriber.js` |
| OCR / extraction | **Async** — worker poll loop | `dhara-worker.mjs` |
| Cron reminders | **Async** — external scheduler hits routes | `cron/*` routes |
| Dashboard SSE notifications | **Sync emit** (in-process EventEmitter) | `messageEvents.js` |

**Where blocking happens (worst offenders):**
- Whisper (`transcriber.js:24`) has **no timeout / no retry / no abort signal** — a hung OpenAI call hangs the doctor's entire webhook reply indefinitely.
- OCR blocks the *doctor's* reply: `handleDoctorObservationPhoto` (handlers.js:3103) calls `ingestObservationMedia` → downloads media from Meta + uploads to R2 **synchronously** before returning "📸 Got it". The OCR *itself* is async, but the media round-trip is not.
- Every webhook request pays for `runMigrations()` (guarded by a promise, so it's one-time per process, but on a cold Vercel instance the first request waits for the whole suite).

---

## 5. AI / OCR FLOW

**Trigger:** doctor sends a photo via WhatsApp → `handleDoctorObservationPhoto` (handlers.js:3103) → `ingestObservationMedia` (media.js:152-189) → downloads from Meta (`downloadMediaFromMeta`), uploads to R2, inserts `media_assets`, and enqueues a job:

```sql
INSERT INTO media_processing_jobs (media_asset_id, job_type, status, idempotency_key)
VALUES (..., 'ocr', 'queued', sha256(assetId:ocr-v1))
```

**Who runs it:** `scripts/dhara-worker.mjs` (systemd service, polls every 10s, `FOR UPDATE SKIP LOCKED`, claims 10 at a time).

**Models (real, verified):**
- OCR: **Ollama `minicpm-v:latest`** via `performOcr` (`src/lib/ai/ocrClient.js:16`) — `OLLAMA_BASE_URL/api/chat`, temperature 0, 120s timeout via `AbortSignal.timeout`.
- Extraction: **Ollama `qwen2.5-coder:latest`** via `extractPrescription` (`extractionClient.js`) → Kali gateway `POST /extract` → `ai-gateway/providers/qwen.js:75` → 60s timeout.
- Intent classification: same Qwen model via `POST /understand` → `qwen.js:25` → 15s timeout (gateway) + 3s timeout (kali client).
- Audio: **OpenAI Whisper** (`transcriber.js`) — synchronous, no timeout.

**Worker job graph (dhara-worker.mjs):**
1. Claim `ocr` job → `downloadFromR2` → `performOcr` → insert `prescription_extractions` (status `ocr_completed`) → enqueue `extraction` job → mark job `completed`.
2. Claim `extraction` job → `extractPrescription(raw_text)` → update `structured_json`, status `extraction_completed` → mark job `completed`.

**Failure handling:** per-job `try/catch` sets status=`failed` + `error_message`. **No retries, no backoff, no dead-letter queue, no re-queue.** `attempt_count` is incremented on claim but never consulted. A failed job sits in `failed` forever.

**Where results are stored:** `prescription_extractions` (`raw_text`, `structured_json`, `extraction_status`). Nothing propagates to the patient record automatically — a human must approve via `PATCH /api/dashboard/extractions/[id]` (`action=approve`), which then writes diagnosis/treatment/estimate events into `patient_timeline_events` (`extractionApprovalService.js`).

**⚠️ Mismatch found:** the **dashboard upload path** (`src/app/api/dashboard/media/route.js:70-85`) inserts into `media_assets` but does **NOT enqueue an OCR job** (unlike the WhatsApp path in `media.js`). So dashboard-uploaded images never go through OCR/extraction.

---

## 6. DATA TRANSFORMATION

**Raw → structured happens in three stages:**

**a) Intent classification** — `classifyWithFallback` (`src/lib/ai/index.js`) → `gateway.understand` (`src/lib/ai/gateway.js`):
1. Interactive ID → deterministic `classifyIntent` (router.js:123-215), confidence 1.0
2. Kali AI (Qwen) with `availableIntents` from the transition matrix
3. Rule fallback `classifyIntent` (router.js:122) — priority: interactive ID → global keywords → corrections → state-specific keywords → entity-derived → number match → `unknown`

**b) Entity extraction** — `extractEntities` (`src/lib/entities.js:18`) + `src/lib/validators.js` (regex-based date/time/treatment/phone parsing). `preprocessText` strips conversational prefixes ("i want to", "please"...). Parsed-but-invalid values are still returned; handlers do the validation.

**c) Progressive slot-filling** — `accumulateEntities` / `computePendingFields` (entities.js:58-113) accumulate dates/times/treatments into `session.context.receivedEntities`.

**Correction detection:** `detectCorrection` (`correction-detector.js`) + `evaluateOverwrite` (`overwrite-policy.js`) — decides whether a change is allowed or requires edit/reschedule flow.

**Output schema (de-facto):** the JSONB `session.context` (booking object, receivedEntities, lastCorrection, messageSequence, lastMessageIds, manualMode, role + ~30 dynamic fields), the `messages` row, and ultimately `appointments` (booking writes) / `patients`.

**⚠️ Technical debt (documented in AGENTS.md):** `rowToSession()` (session.js:71) reconstructs context from DB via a **manual whitelist**. PR-10A fixed 27 silently-dropped fields. Any new `session.context.X` write that isn't whitelisted disappears on DB reload. No test enforces it.

---

## 7. DATABASE DESIGN (ACTUAL)

All migrations live **inline in `src/db/pool.js`** (~1085 lines of `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` executed on every boot and on every webhook). `src/db/migrations/001_core.sql` is **vestigial** — the real schema is in pool.js. Migrations use `DO $$ ... EXCEPTION WHEN duplicate_object` for idempotency.

**Tables:** sessions, messages, appointments, patients, blocked_dates, patient_reviews, payments, due_reminder_log, shadow_logs, patient_relationships, settings, ai_classifications, procedure_codes, treatment_plans, treatment_plan_steps, patient_timeline_events, media_assets, prescription_extractions, media_processing_jobs. Enums: `treatment_plan_status`, `treatment_step_status`.

**Relationships:**
- `messages.session_id → sessions.id`
- `appointments.session_id → sessions.id`; `appointments.patient_id → patients.id`
- `payments.appointment_id → appointments.id`, `.patient_id → patients.id`
- `patient_reviews.patient_id/appointment_id` (both required)
- `media_assets.appointment_id → appointments.id` (nullable), `.patient_id → patients.id`
- `prescription_extractions.media_asset_id → media_assets.id`
- `media_processing_jobs.media_asset_id → media_assets.id`
- `treatment_plans.patient_id`, `.procedure_code_id`; `treatment_plan_steps.plan_id` (cascade), `.appointment_id`
- `patient_timeline_events.patient_id` (cascade)

**Denormalization / shortcuts (explicit):**
- `appointments` is a ~50-column mega-table: denormalized `patient_name`, `patient_phone`, `wa_id` (copied from patients), plus fees, `payment_status`/`paid_amount`/`paid_at` (**dual-write with `payments` table** — completeVisit.js:162-201 maintains both via CTE), `chit_media TEXT[]` (**dual-write with `media_assets`**), `prescription_key`/`compiled_document_key` (R2 cache pointers), `follow_up_*` fields, `tooth_diagnoses JSONB`, `treatment_fees JSONB`.
- **Logical versioning hack:** `appointments` has `logical_id` + `version` + `replaces_version` + `superseded_at` + `UNIQUE (logical_id, version)` to implement rescheduling — a "copy row, bump version, supersede old" pattern (`supersedeAppointment`). Old rows are kept (not deleted) for the unique-slot constraint.
- `sessions.context`/`metrics` are whole-object JSONB blobs written on every save.
- `shadow_logs` and `ai_classifications` tables exist with repositories (`shadowLogRepository.js`, `aiClassificationRepository.js`) but **no code writes to them** — dead/legacy schema.
- `media_processing_jobs` doubles as both the queue and its own state store (no external broker).

---

## 8. STATE MANAGEMENT

**Conversational state:** a **soft FSM**. `config/states.js` defines ~40 states + `TRANSITIONS[state] → allowed intents[]`. But the engine only *suggests* transitions:
- `getNextState` validates + maps intent→next state (transitions.js)
- Engine applies it **only if the handler didn't already change state** and intent isn't a correction (engine.js:316-318)
- Many handlers mutate `session.state` directly (e.g., `handleBookingCollection` sets its own progression, BOOKING_PATIENT_AGE flows)

So the transition table is **advisory, not enforced**. There's no guard against handlers setting arbitrary states; `isValidTransition` gates `getNextState`, not the handler's writes.

**Persistence:** `sessions` — `state`, `previous_state`, `is_escalated`, `expires_at` (30-min sliding), `version` (**optimistic lock**: `saveSession` uses `WHERE wa_id AND version = expected`; on conflict logs `SESSION_SAVE_CONFLICT` and **silently drops the write** — no retry, session.js cache keeps the newer copy but the DB is stale).

**Flags vs state machines:**
- **Plain flags** (idempotency sentinels on appointments): `reminder_sent_at`, `follow_up_reminder_sent_at`, `post_visit_sent_at`, `feedback_sent_at`, `due_reminder_sent_at`, `arrival_status` (scheduled/arrived/called/in_session/done), `payment_status`, `follow_up_status` (pending/cancelled).
- **Real state machines:** `media_processing_jobs` (queued→processing→completed/failed) and `prescription_extractions.extraction_status` (pending→ocr_completed→extraction_completed→review_pending→approved/rejected).
- **Explicit state machine:** `session.state` FSM above.

---

## 9. FOLLOW-UP / ACTION SYSTEM

**Scheduler — the real one is GitHub Actions**, not Vercel: `.github/workflows/cron.yml` defines 6 schedules that `curl` the cron routes with `?secret=CRON_SECRET`. `vercel.json` also defines 4 (duplicating, and **missing** due-reminders + follow-up-reminders — those exist only in GH Actions).

| Route | Schedule (UTC) | Query | Send type |
|---|---|---|---|
| `/api/cron/daily-summary` | 50 3 * * * | today's appts → doctor | `sendText` |
| `/api/cron/reminders` | 30 17 * * * | appts tomorrow, `reminder_sent_at IS NULL` | `sendTemplate('appointment_reminder')` |
| `/api/cron/evening-checkin` | 0 14 * * * | today's appts → doctor | `sendText` |
| `/api/cron/feedback` | 30 10 * * * | completed appts, feedback not sent | `sendTemplate('feedback_request')` |
| `/api/cron/due-reminders` | 0 11 * * * | pending/partial payments, `due_reminder_sent_at IS NULL` | `sendText` (plain, not template) |
| `/api/cron/follow-up-reminders` | 30 2 * * * | completed appts, `follow_up_date <= tomorrow`, `follow_up_reminder_sent_at IS NULL` | `sendText` (plain) |

**Follow-up triggers:**
- `follow_up_date`/`follow_up_instructions`/`follow_up_status` set atomically at visit completion (`completeVisit.js:61-73`) or walk-in creation.
- **Post-visit summary is NOT a cron** — `checkAndSendPostVisit` (handlers.js:1104) runs inline after every webhook reply: finds today's confirmed appts where `time+40min` has passed and `post_visit_sent_at IS NULL`, sends the summary.

**Pending actions storage:** sentinel columns on `appointments` (fire-and-forget crons re-scan; no scheduled future rows), `media_processing_jobs` (OCR/extraction), and derived attention queries (`attentionEngine.js` — overdue follow-ups, inactive treatment plans, unpaid balances; 7-day inactivity threshold).

**⚠️ Gaps:** all cron sends are **sequential** (`for...of`, awaiting each `sendText` with up to 2 retries×500ms) — N appointments × network latency serialized inside one function run. No concurrency, no per-patient dedup against multiple completed visits, no failure queue (errors logged and skipped). Follow-up/due reminders use **plain text** (`sendText`) even though Meta requires **templates** outside the 24h window — AGENTS.md acknowledges this; the template names are registered but the route still calls `sendText`.

---

## 10. FAILURE SCENARIOS

| Failure | What actually happens | Retry/DLQ? |
|---|---|---|
| **OCR fails** | Worker sets job `failed` + `error_message`. Extraction never runs. No re-queue. | ❌ No retry, no DLQ. Manual re-enqueue only. |
| **Extraction fails / gateway timeout** | Same — job `failed`. | ❌ None. |
| **DB write fails (webhook)** | `createMessage`/`save` catch + log; **message + reply still sent** to user; DB is silently missing the record. | ❌ None. |
| **DB unavailable entirely** | `getSql()` returns null; sessions fall back to in-memory cache ("replay-like" mode); messages not stored. Bot keeps talking, state lost on instance death. | ❌ None. |
| **WhatsApp send fails** | `apiPost` retries 5xx/429 ×2 with 500ms/1000ms backoff; network errors retried; final failure returns null → handler falls back (list→text) or reply lost. | ⚠️ 2 retries, then give up. |
| **Meta webhook retries a message** | `isDuplicate` (in-memory + DB) usually skips; **but concurrent/duplicate deliveries can double-send** (see §2). | ⚠️ Partial. |
| **Cron send fails** | Per-appointment `try/catch`, logs, continues to next; sentinel not marked → **next run re-sends to everyone already sent**, because marking happens *after* send and success is per-appt. | ⚠️ Re-triggering but also re-sends. |
| **Session save conflict** | Version mismatch → `SESSION_SAVE_CONFLICT` logged, write **dropped silently**. | ❌ None. |
| **runMigrations fails** | Caught + logged, processing continues on possibly-stale schema. | ⚠️ 3 attempts with 2s backoff inside runMigrations. |

**No dead-letter infrastructure anywhere.** No outbox/transactional outbox pattern: every external side effect (WhatsApp send, media upload) happens outside a transaction, with only best-effort logging.

---

## 11. SCALING LIMITATIONS

1. **Synchronous webhook pipeline is the #1 bottleneck.** AI classify + handlers + Meta send all block the response. Per-message latency floor = AI round-trip (3-15s) + send latency. Concurrent messages from different patients pile up in Vercel function instances with no shared queue, no ordering, no load shedding.
2. **No distributed cache/state.** Session cache (`session.js` Map, 500 entries, 30-min TTL) and dedup Set are **per-instance**. N Vercel instances = N divergent session caches → interleaved messages from one patient can hit different instances and clobber sessions (mitigated only by the optimistic-lock drop, which loses data).
3. **Every webhook call runs the migration suite** (guarded, but heavy on cold starts).
4. **Neon free-tier pool sizing:** `max: 5` connections (`pool.js:17`), worker `max: 3`. Under burst traffic the pool exhausts; repositories return null/[] on error, so the bot degrades to amnesia rather than erroring visibly.
5. **Cron fan-out is serial** — a growing appointment base linearly increases cron duration; GitHub Actions has a hard 6h job limit, and crons can overlap/stack.
6. **Single worker process for OCR/extraction**, polls every 10s, 10 jobs/cycle. A backlog of images = hours of latency. No concurrency, no per-type parallelism, no scaling.
7. **`FOR UPDATE SKIP LOCKED` claim + no lease/timeout:** if a job is claimed and the worker crashes mid-processing (e.g., OCR hangs past a restart), the job stays `processing` **forever** — no requeue of stale `processing` rows.
8. **Rate limits are in-memory** (`rateLimit.js`) → per-instance, bypassable by distributing across instances; not usable as a real abuse guard.
9. **Known perf trap:** `updateMedicineUsage` parses/re-writes the entire `settings` JSONB on every visit; `save(session)` rewrites the full `context` blob on every message.
10. **R2 bucket default mismatch:** `r2.js:9` defaults to `clinic-bot-chits`, but `dhara-worker.mjs:113` defaults to `clinic-bot` — works only because `R2_BUCKET` env is set consistently; a misconfigured env silently makes the worker unable to find media.

---

## 12. CODE REFERENCES (by step)

| Step | File:function |
|---|---|
| Webhook entry | `src/app/api/webhook/whatsapp/route.js` (GET verify, POST process) |
| Classify/normalize event | `src/lib/engine.js` `classifyEvent` / `normalizeMessage` / `processEvent` |
| Dedup/idempotency | `src/lib/deduplicate.js` `isDuplicate`; `messageRepository.js` `createMessage` (upsert) |
| Session load/save | `src/lib/session.js` `getOrCreate`/`save`/`rowToSession`; `sessionRepository.js` |
| Intent classification | `src/lib/ai/index.js` → `ai/gateway.js` → `ai/kali.js`; fallback `src/lib/router.js` `classifyIntent`; `config/intents.js`, `config/states.js` |
| Entity extraction | `src/lib/entities.js`, `src/lib/validators.js`, `correction-detector.js`, `overwrite-policy.js` |
| Handler dispatch | `src/lib/handlers.js` `handle` (:250), doctor/receptionist dispatch (:3112, :5690) |
| State transitions | `src/lib/transitions.js`, `config/states.js` |
| WhatsApp send | `src/lib/whatsapp.js` `sendText/sendButtons/sendList/sendTemplate/sendDocument` (2 retries) |
| Media ingest + OCR enqueue | `src/lib/media.js` `processAndStoreMedia`/`ingestObservationMedia`; `media/route.js` (dashboard path, no OCR enqueue) |
| OCR worker | `scripts/dhara-worker.mjs`; OCR `src/lib/ai/ocrClient.js`; extraction `src/lib/ai/extractionClient.js` |
| AI gateway | `ai-gateway/server.js` (`/understand`, `/extract`); `ai-gateway/providers/qwen.js`; legacy `src/lib/ai/gemini.js` (unused in current path) |
| Whisper | `src/lib/transcriber.js` |
| Prescription PDF | `src/lib/prescription.js` `generatePrescription`/`generateDentalChart` (uploads R2 key `prescriptions/<id>_<ts>.pdf`) |
| Prescription route | `src/app/api/dashboard/visits/[id]/prescription/route.js` (caches `prescription_key`) |
| Compiled PDF | `src/lib/compileDocument.js`; send via `visits/[id]/compile/send/route.js` |
| Visit completion | `src/services/completeVisit.js`, `createWalkIn.js`, `recordPayment.js`; route `visit/route.js` |
| Extraction review/approve | `src/services/prescriptionExtractionService.js`, `extractionApprovalService.js`; routes `extractions/route.js`, `extractions/[id]/route.js` |
| Follow-up crons | `src/app/api/cron/follow-up-reminders/route.js`, `due-reminders/route.js`, `reminders/route.js`, `feedback/route.js`, `evening-checkin/route.js`, `daily-summary/route.js` |
| Scheduler | `.github/workflows/cron.yml` (real) + `vercel.json` (partial duplicate) |
| Post-visit auto-summary | `src/lib/handlers.js` `checkAndSendPostVisit` (:1104) |
| Schema/migrations | `src/db/pool.js` (`runMigrations`), legacy `src/db/migrations/001_core.sql` |
| Attention/actions (Phase 2) | `src/services/attentionEngine.js`, `dharaReason.js`; dashboard `send-whatsapp/route.js` |

---

## Biggest mismatches between intended design and reality

1. **"Async pipeline" vs synchronous reality** — intended as event-driven; actually one blocking webhook call. The only async parts are the OCR worker and crons.
2. **Message dedup is not actually safe** — upsert-based dedup masks double-processing/double-sends under concurrency.
3. **Schema migrations in application code** (`pool.js`) on every request, not a migration tool — `001_core.sql` is dead weight.
4. **`shadow_logs` / `ai_classifications` tables + repositories exist but nothing writes to them** — dead schema.
5. **Dashboard media upload skips OCR enqueue** — inconsistent with the WhatsApp path (likely a bug).
6. **Follow-up/due-reminder crons send plain `sendText`** despite the template plan in AGENTS.md, and **aren't in `vercel.json`** (only GH Actions).
7. **`checkRapidFireSafety` always returns safe** — logic is inert.
8. **R2 default bucket names diverge** between app (`clinic-bot-chits`) and worker (`clinic-bot`).
9. **Session optimistic-lock conflicts silently drop writes**; session cache is per-instance → state divergence across Vercel instances.
10. **Failed OCR/extraction jobs have no retry or stale-`processing` recovery.**
