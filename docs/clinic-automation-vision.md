# Clinic Bot — Automation Vision & Gap Analysis

> **Generated:** June 2, 2026
> **Status:** Living document — captures our north star, current state, and gaps

---

## 1. Our Intent

Build an **autonomous clinic operations system** for a single-doctor dental clinic in Bhilai, India, operating entirely through WhatsApp as the primary interface.

### Core Problem
Small clinics can't afford full-time receptionists, CRMs, or custom software. But every patient has WhatsApp. We replace the front desk with a bot that handles everything except clinical treatment.

### What We Do
- **Patient-facing:** Booking, rescheduling, cancellation, feedback, emergency triage
- **Doctor-facing:** Queue management, visit logging, stats, schedule control, patient lookup
- **Receptionist-facing:** Walk-in registration, queue management, patient search

### What We Are NOT Building
- A web-first product (dashboard is convenience, not primary)
- Multi-clinic or multi-tenant (bespoke for one clinic)
- An LLM chatbot (deterministic keyword matching)
- A payment processor (no UPI/card yet)
- An SMS gateway (WhatsApp-only currently)

---

## 2. Architecture Summary

| Layer | Choice | Why |
|---|---|---|
| **Framework** | Next.js 16 (App Router) | Serverless-friendly, familiar ecosystem |
| **Language** | JavaScript (no TypeScript) | Speed of iteration |
| **Database** | PostgreSQL (Neon) | Serverless SQL, good for structured clinic data |
| **Messaging** | Meta Cloud API v19.0 | WhatsApp — ubiquitous in Indian small cities |
| **Media Storage** | Cloudflare R2 | S3-compatible, cheap, signed URLs |
| **Transcription** | OpenAI Whisper | Optional voice-to-text for doctor notes |
| **Auth** | Custom JWT (HMAC-SHA256) | Simple, no external dependency |
| **State Mgmt** | PostgreSQL sessions + in-memory LRU cache | Concurrency-safe, fast hot path |
| **Styling** | Tailwind CSS 4 + Recharts + Lucide | Modern, lightweight |
| **Deployment** | Vercel + 4 cron jobs | Zero-ops serverless |

### Key Architectural Decisions
- **Deterministic routing** (no LLM) — works on spotty mobile networks, predictable, testable
- **State machine** (17+ states) — no hallucination, clear transitions
- **Session locking** via optimistic concurrency (version column) — handles concurrent webhooks
- **Dedup** (in-memory bloom + DB UNIQUE) — WhatsApp retries don't double-book
- **Pipeline engine** — classifyEvent → dedup → getOrCreate → classifyIntent → accumulateEntities → detectCorrection → handle → save
- **Engine returns 200 immediately** — WhatsApp timeout is 15s, processing is async

### The WhatsApp Constraint (Critical)
Meta's 24h messaging window: we can only proactively message patients who messaged us in the last 24h. After that, only pre-approved **template messages** can reach them. We haven't implemented templates yet.

---

## 3. Current Feature Map

### Patient-Facing (Bot)
| Feature | Status |
|---|---|
| Booking (date/time/treatment with progressive fill) | ✅ |
| Rescheduling (supersede appointment chain) | ✅ |
| Cancellation with confirmation | ✅ |
| Emergency detection & escalation | ✅ |
| Human handoff | ✅ |
| Family/group accounts (multiple profiles per wa_id) | ✅ |
| Multi-treatment booking (add multiple treatments) | ✅ |
| Treatment help (symptom → treatment matching) | ✅ |
| Feedback collection (great/okay/poor) | ✅ |
| Callback request | ✅ |
| Language switching (English/Hinglish) | ✅ |
| My appointments (upcoming list) | ✅ |
| Clinic info (services, location, timings) | ✅ |

### Doctor-Facing (Bot)
| Feature | Status |
|---|---|
| View today's appointments | ✅ |
| View by date | ✅ |
| Appointment detail with actions (complete/no-show/chit) | ✅ |
| Visit logging (treatment → fees → next visit → notes → media) | ✅ |
| Walk-in visit shortcut (log visit from main menu) | ✅ |
| Queue management (view, call next, call patient, mark arrived) | ✅ |
| Priority toggle | ✅ |
| Patient search & visit history | ✅ |
| Patient detail edit (name/age/sex) | ✅ |
| Stats (today's count, revenue, weekly/monthly trends) | ✅ |
| Schedule management (block/unblock dates with conflict warning) | ✅ |
| Feedback summary (satisfaction %, callbacks) | ✅ |
| Message history (last 30 WhatsApp messages per patient) | ✅ |
| Media attachment to appointments | ✅ |
| Voice note transcription (Whisper → text → accept/edit) | ✅ |
| Proactive notifications (new booking, cancellation, reschedule) | ✅ |
| PDF prescription on visit completion (auto-generated → WhatsApp document) | ✅ |

### Receptionist-Facing (Bot)
| Feature | Status |
|---|---|
| Queue view (pending arrival + in queue sections) | ✅ |
| Mark patient arrived | ✅ |
| Call patient | ✅ |
| Toggle priority | ✅ |
| Walk-in registration | ✅ |
| Patient search | ✅ |

### Web Dashboard
| Feature | Status |
|---|---|
| Calendar with color-coded dots | ✅ |
| Slot grid (booked vs open) | ✅ |
| Quick book modal | ✅ |
| Stats cards + charts (Recharts) | ✅ |
| Appointment table with KPIs | ✅ |
| Queue board (Kanban-style, auto-refresh) | ✅ |
| Visit logging form (single page, fee breakdown + medicines + media) | ✅ |
| Patient search + detail + edit | ✅ |
| Visit history + edit past visits | ✅ |
| Message transcript (full chat, SSE live updates) | ✅ |
| Media viewer (inline images/audio) | ✅ |
| Notification panel (sidebar) | ✅ |
| Send message to patient (manual chat mode) | ✅ |
| Schedule management (calendar block/unblock) | ✅ |
| Feedback dashboard (satisfaction %, rating distribution, callbacks) | ✅ |
| Bulk operations (complete all / cancel all) | ✅ |
| Symptom → treatment matching on visit form | ✅ |
| Family account chips + booking for family | ✅ |
| Language toggle | ❌ Not started |

### Cron Jobs
| Feature | Status |
|---|---|
| 24h appointment reminders | ✅ |
| Daily summary to doctor | ✅ |
| Evening pending list to doctor | ✅ |
| Post-visit feedback request | ✅ |

---

## 4. The Last Level — Fully Autonomous Clinic

### Vision
A **zero-touch clinic operations system**. The doctor only does clinical work. Everything else is automated.

```
Patient Journey:
  Discovery → Booking → Reminder → Check-in → Treatment → Payment → Summary → Feedback → Follow-up (recall)
                                                                                                        ↓
Doctor Experience:
  See queue → Treat → Log visit (tap, 3 sec) → Done. Everything else is push notifications.
```

### Full Capability Matrix

| Capability | Current | Target | Gap |
|---|---|---|---|
| **Booking** | Full WhatsApp flow | + QR scan at door → auto-checkin | Minor |
| **Pre-reminders** | Text via 24h window | Template msg + SMS fallback | **Templates not done** |
| **Check-in** | Manual "Mark Arrived" | Geo-fence / QR auto check-in | Manual step |
| **Payment** | None | UPI link in reminder + auto-receipt | **Biggest gap** |
| **Visit summary** | WhatsApp text + PDF | PDF prescription + invoice + receipt | Invoice auto-generation not done |
| **Follow-up** | One-time next visit | Auto-recalls at 3/6/12mo per treatment | No recall engine |
| **No-show** | Evening check-in (manual) | Auto-cancel + auto-rebook | No automation |
| **Analytics** | Text stats | Dashboard: retention, peak hours, LTV, trends | No insights |
| **Inventory** | None | Auto reorder at threshold | Entirely missing |
| **Multi-channel** | WhatsApp only | WhatsApp + SMS + Web + IVR | Single channel |
| **Language** | Hinglish mixed | Full Hindi + English modes | Half-baked |
| **Multi-clinic** | Single doctor | Multi-provider, multi-branch | Not scalable |

---

## 5. Enhancement Preference Table

### Bugs
| # | Item | Effort | Impact | File | Lines |
|---|---|---|---|---|---|
| B1 | **Slot rounding displays "10.5:30"** — `Math.floor(645/30)*30/60 = 10.5` → broken suggestion text | 🔵 Tiny | 🟡 Low | `validators.js` | ~330 |
| B2 | "Thanks" during booking doesn't re-prompt — just ack and silent | 🔵 Small | 🟡 Low | `handlers.js` | ~296 |

### Features (Priority Order)
| # | Feature | Effort | Impact | Risk | Dependencies |
|---|---|---|---|---|---|
| F1 | **Fix N6 slot rounding bug** | 🔵 Tiny | 🟡 Low | None | None |
| F2 | **WhatsApp template messages** for reminders, feedback, summaries | 🟡 Medium | 🟢 High | Low | Meta business approval |
| F3 | **PDF prescription generator** from visit data → WhatsApp document | 🟡 Medium | 🟢 High | Low | None | ✅ Done |
| F4 | **UPI payment link** in confirmation + reminders | 🟡 Medium | 🟢 High | Medium | UPI gateway |
| F5 | **Auto-cancel no-shows** — cron marks un-arrived past-slot as no-show | 🔵 Small | 🟡 Medium | Low | None |
| F6 | **Wait time estimates on bot** — queue position when patient asks | 🔵 Small | 🟡 Medium | Low | None |
| F7 | **Patient message history on bot** — full transcript (web has it) | 🟡 Medium | 🟡 Medium | Low | None |
| F8 | **Slot grid / calendar on bot** — send visual weekday image | 🟡 Medium | 🟡 Medium | Low | Image generation |
| F9 | **Recurring appointments** — weekly/monthly series booking | 🟡 Medium | 🟡 Medium | Medium | Schema change |
| F10 | **Recall engine** — auto-reminder at 3/6/12mo per treatment type | 🟡 Medium | 🟡 Medium | Low | New cron + schema |
| F11 | **Analytics dashboard** — peak hours, retention, LTV, no-show rates | 🔴 Large | 🟡 Medium | Low | Data volume |
| F12 | **Full Hindi bot** — all 60+ prompts translated, Hindi date/numbers | 🔴 Large | 🟡 Medium | Low | Translation |
| F13 | **Language toggle on web** — Hinglish switch for dashboard | 🔵 Small | 🔵 Small | Low | None |
| F14 | **handlers.js refactor** — split 5045-line file into domain modules | 🔴 Large | 🔵 High (maint) | Medium | None |
| F15 | **SMS fallback** — second channel for reminders via Twilio/MSG91 | 🟡 Medium | 🟢 High | Low | SMS provider |
| F16 | **Inventory tracking** — materials per treatment, low stock alerts | 🔴 Large | 🔵 Small | Medium | None |

### Recommended Implementation Order
1. **B1 (slot rounding bug)** — 10-min fix, broken text visible to users
2. **F3 (PDF prescriptions)** — ✅ Done
3. **F2 (WhatsApp templates)** — unblocks reliable proactive messaging
4. **F5 (auto-cancel no-shows)** — cleans up queue automatically
5. **F4 (UPI payment)** — revenue collection automation
6. **F6 (wait time estimates)** — patient experience improvement
7. **F10 (recall engine)** — patient retention
8. **F11 (analytics)** — data-driven decisions
9. **F12 (full Hindi)** — accessibility
10. **F14 (refactor)** — maintainability

---

## 6. Key Constraints

| Constraint | Implication |
|---|---|
| **WhatsApp 24h window** | Templates required for proactive outreach to cold patients |
| **Meta Cloud API rate limits** | Can't blast all patients at once — need throttling |
| **Neon cold starts** | 4-retry circuit breaker in pool.js |
| **Vercel serverless timeout (60s)** | Cron jobs must be fast — no heavy processing |
| **WhatsApp interactive list limit (10 rows)** | Multi-page lists for >10 items |
| **No LLM dependency** | Must handle variety of free-text with regex + state machine |
| **Single clinic** | Schema is not tenant-aware — no isolation between clinics |
| **Indian mobile networks** | Messages arrive out of order, duplicates possible — dedup + locking critical |

---

## 7. Files Reference

| Area | Key Files |
|---|---|
| Pipeline engine | `src/lib/engine.js` |
| State handlers | `src/lib/handlers.js` (5045 lines) |
| Intent routing | `src/lib/router.js`, `src/config/intents.js` |
| State machine | `src/config/states.js`, `src/lib/transitions.js` |
| Entity extraction | `src/lib/entities.js` |
| Validation | `src/lib/validators.js` |
| Session management | `src/lib/session.js` |
| WhatsApp client | `src/lib/whatsapp.js` |
| Media handling | `src/lib/media.js`, `src/lib/r2.js`, `src/lib/transcriber.js` |
| Prescription | `src/lib/prescription.js` |
| Repositories | `src/db/repositories/*.js` |
| Cron jobs | `src/app/api/cron/*/route.js` |
| Dashboard pages | `src/app/dashboard/*` |
| Dashboard API | `src/app/api/dashboard/*` |
| Config | `src/config/clinic.js` |
| Tests | `tests/` |
| Docs | `docs/` |
