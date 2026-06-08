# Documentation Index

> **Last updated:** June 8, 2026
> **Bot version:** Production — full patient, doctor, and receptionist flows with web dashboard

This folder contains documentation for the Shri Balaji Dental Clinic WhatsApp bot and web dashboard.

---

## Primary Reference Docs (Read These First)

| Doc | What It Covers |
|-----|----------------|
| **`architecture.md`** | Current architecture: state machine (36+ states), pipeline engine, session model, intent routing, entity extraction, correction detection, overwrite policy, web dashboard, cron jobs, database schema, environment variables |
| **`user-flow-guide.md`** | Complete end-user guide — all patient states, doctor flows, booking walkthroughs, intent catalog, entity extraction capabilities, validation rules |
| **`user-flows.md`** | Developer-level flow catalog — every conversational path with exact bot responses, state transition table, validation rules, escape hatches, edge case design decisions |
| **`doctor-flow.md`** | Doctor-specific flow design — 22 doctor states, registration, visit logging, chit media, queue management, proactive notifications |

## Feature & Enhancement Documentation

| Doc | What It Covers |
|-----|----------------|
| **`current-enhancement-status.md`** | Status of all enhancements across all phases (completed vs pending) |
| **`enhancements-roadmap.md`** | Future feature roadmap — receptionist role, queue management, walk-in shortcut, voice transcription, etc. |
| **`clinic-automation-vision.md`** | North star vision, current feature map, gap analysis, enhancement preference table |
| **`web-vs-bot-feature-gap-analysis.md`** | Feature comparison between web dashboard and WhatsApp bot |
| **`feature-gap-analysis.md`** | Comprehensive feature-by-feature matrix between web and bot |

## Deep Design Docs

| Doc | What It Covers |
|-----|----------------|
| **`truth-and-mutation-model.md`** | Mutation safety model: historical/operational/draft/committed truth types, versioned identity, correction handling |
| **`robustness-layer-changes.md`** | Correction detection (14 patterns), overwrite policy engine (4 tiers), entity accumulation, replay test suite (15+ fixtures) |
| **`entity-extraction-design.md`** | Current entity extraction implementation — date/time/treatment/phone parsing with Hinglish/Devanagari support |
| **`ai-evolution-plan.md`** | Principal architect review — AI readiness assessment, Gemini integration strategy, component-by-component migration plan |
| **`whatsapp-templates-setup.md`** | WhatsApp template message setup guide for Meta Business Manager approval |

## Flow Documentation

| Doc | What It Covers |
|-----|----------------|
| **`user-flow-guide.md`** | Comprehensive patient + doctor flow guide (primary reference) |
| **`doctor-flow-simple.md`** | Non-technical doctor command quick reference |
| **`patient-flow-improvements.md`** | Patient-facing changes (reminder replies, patient name collection, feedback, time filtering, multi-treatment) |
| **`daily-flow-patient-doctor.md`** | Simple day-to-day flow for both users with all cron schedules |
| **`daily-flow-patient-doctor-visual.md`** | Visual flowcharts (patient + doctor journeys) |
| **`reception-desk-flow.md`** | Reception desk flow design |
| **`chit-media-flow.md`** | Technical design for chit photo/voice note storage |
| **`chit-media-for-clinic.md`** | Non-technical guide for clinic staff |
| **`dashboard-ux-ideas.md`** | Dashboard UX brainstorming |

## Audit & Historical Notes

| Doc | What It Covers |
|-----|----------------|
| **`full-architectural-audit.md`** | Comprehensive architectural audit — all features, data model, API surface, security, debt, agentic readiness assessment |
| **`audit-report-2026-05-26.md`** | Point-in-time audit snapshot (mostly fixed) |
| **`audit-and-improvements.md`** | Bug analysis from earlier phase (mostly resolved) |
| **`backend-interview-report.md`** | Backend interview prep — 20 stories, system design topics, debugging stories |

---

## Current Architecture at a Glance

| Component | Implementation |
|-----------|---------------|
| **Framework** | Next.js 16 (App Router), JavaScript |
| **Database** | PostgreSQL (Neon serverless) with in-memory LRU session cache |
| **Messaging** | Meta Cloud API v19.0 (WhatsApp) |
| **State Machine** | 36+ states — patient (14), doctor (22+), receptionist (3) |
| **Intent Classification** | Rule-based (keyword/regex) with AI shadow mode (Gemini 2.5 Flash) |
| **Entity Extraction** | Regex-based with Hinglish/Devanagari support |
| **Correction Detection** | 14 pattern markers + overwrite policy (4 tiers) |
| **Media Storage** | Cloudflare R2 (signed URLs for access) |
| **Audio Transcription** | OpenAI Whisper (for doctor voice notes) |
| **Auth** | Custom JWT (HMAC-SHA256) + CSRF double-submit |
| **Deployment** | Vercel (serverless) |
| **Web Dashboard** | 11 pages, 30+ API routes (Next.js App Router) |
| **Cron Jobs** | 5 scheduled functions (daily summary, reminders, evening check-in, feedback, due reminders) |

---

## Source-of-Truth Notes

- **`docs/architecture.md`** and **`docs/user-flow-guide.md`** are the primary current-behavior references.
- **`docs/architecture.md`** in this version has been updated to reflect the actual implementation (not just the foundational design).
- Historical docs (`audit-report-2026-05-26.md`, `audit-and-improvements.md`) contain context from earlier phases — cross-check with current code for latest behavior.
