# Clinic Bot

WhatsApp chatbot for Shri Balaji Dental Clinic.

It handles appointment booking, service/location/timing queries, emergency detection,
human escalation, callback requests, and doctor-facing daily operations (reminders and
morning summaries).

## Stack

- Next.js 16 (App Router)
- Node.js runtime
- PostgreSQL (Neon via `@neondatabase/serverless`)
- Meta WhatsApp Cloud API

## Core Capabilities

- Stateful booking flow (date -> time -> treatment -> patient name -> confirmation)
- Appointment management (view upcoming, cancel, reschedule)
- Deterministic intent routing + entity extraction
- Correction-aware handling (`"actually..."`, `"change to..."`, `"no, not that"`)
- Session persistence with optimistic locking
- Emergency and escalation flows
- Scheduled workflows:
  - 24h reminders (`/api/cron/reminders`)
  - Daily doctor summary (`/api/cron/daily-summary`)

## Project Structure

```text
src/
  app/api/webhook/whatsapp/route.js    # WhatsApp webhook (GET verify + POST ingest)
  app/api/cron/reminders/route.js      # Daily reminder cron endpoint
  app/api/cron/daily-summary/route.js  # Daily doctor summary endpoint
  config/                              # Clinic config, states, intents
  lib/                                 # Engine, router, handlers, validators, WhatsApp client
  db/                                  # Pool, migration SQL, repositories
  utils/                               # Formatters
docs/                                  # Architecture, flow guides, audits, backlog
```

## Environment Variables

Create a local `.env.local` with:

```bash
DATABASE_URL=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_VERIFY_TOKEN=
DOCTOR_WA_ID=
CRON_SECRET=
LOG_LEVEL=info
```

Notes:
- `DOCTOR_WA_ID` is used for doctor notifications.
- `CRON_SECRET` secures cron endpoints (`Authorization: Bearer <CRON_SECRET>`).

## Local Setup

```bash
npm install
npm run db:migrate
npm run dev
```

Webhook endpoint (local):

```text
http://localhost:3000/api/webhook/whatsapp
```

## Scripts

- `npm run dev` - start dev server
- `npm run build` - production build
- `npm run start` - run production server
- `npm run lint` - lint source
- `npm run db:migrate` - apply SQL migration
- `npm run db:status` - list database tables

## Cron Endpoints

- `GET /api/cron/reminders` - sends tomorrow reminders, idempotent via `reminder_sent_at`
- `GET /api/cron/daily-summary` - sends today's schedule to doctor

Both require:

```text
Authorization: Bearer <CRON_SECRET>
```

Configured schedules are in `vercel.json`.

## Docs Map

- `docs/README.md` - documentation index and reading order
- `docs/user-flow-guide.md` - comprehensive end-user guide (current)
- `docs/user-flows.md` - detailed intent/state catalog
- `docs/doctor-flow.md` - technical doctor flow design (current)
- `docs/doctor-flow-simple.md` - non-technical doctor quick reference
- `docs/entity-extraction-design.md` - current extraction implementation
- `docs/patient-flow-improvements.md` - patient-facing improvements
- `docs/robustness-layer-changes.md` - correction/robustness hardening
- `docs/daily-flow-patient-doctor.md` - daily flow for both users
- `docs/chit-media-flow.md` - chit media system design
- `docs/architecture.md` - original architecture blueprint (historical)
- `docs/audit-report-2026-05-26.md` - project audit snapshot (historical)
