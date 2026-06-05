# Clinic Bot — Complete Flow Design Doc

## Real Clinic Workflow (Shri Balaji Dental Clinic)

```
Patient arrives (appointment or walk-in)
        │
        ▼
Reception: writes name, age, sex, WhatsApp number
        │
        ▼
Patient meets doctor → checkup / treatment
        │
        ▼
Doctor writes on paper: diagnosis, treatment, cost, medicine,
                        next appointment date → hands to patient
        │
        ▼
Patient leaves. Doctor writes in diary:
  - Patient name, age, sex, phone
  - Treatment done
  - Consultation fee, treatment charges, medicine charges
  - Next visit date
  - Notes
        │
        ▼
Doctor personally WhatsApps patient:
  - OPD summary
  - X-rays
  - Photos / prescription photos
```

## How the Bot Fits In

The bot replaces two things:
1. **The paper diary** — instead of hand-writing, doctor taps in bot
2. **The manual WhatsApp** — instead of doctor typing/sending individually, bot auto-sends a structured summary

Everything else stays the same — paper prescription, patient walking in, doctor examining.

---

## Implementation Status

| # | Feature | Status |
|---|---|---|
| 1 | `patients` table + migration | ✅ Done |
| 2 | Registration flow (name → age → sex → phone → appointment/walk-in) | ✅ Done |
| 3 | Log-visit flow (treatment → fees → next visit → notes → media) | ✅ Done |
| 4 | Patient-facing summary message (auto-send after visit logged) | ✅ Done |
| 5 | Search Patient (name/phone) | ✅ Done |
| 6 | X-ray/photo handling from laptop (media download + R2 upload) | ✅ Done |
| 7 | "View chit" / "Add Chit" buttons in appointment detail | ✅ Done |
| 8 | Show chit media in patient's appointment history view | ✅ Done |
| 9 | Reply fixtures for all flows | ✅ Done (30 fixtures) |

---

## Flows

### 1) Patient Registration (Reception or Doctor)

When a new patient walks in, staff (or doctor) registers them via the bot:

```
Bot:  New patient. Enter name:
Staff: Ramesh

Bot:  Age:
Staff: 28

Bot:  Sex (M/F):
Staff: M

Bot:  WhatsApp number (with country code):
Staff: 9198xxxx50

Bot:  Appointment time or "walk-in"?
Staff: walk-in

Bot:  ✅ Ramesh (28/M, 9198xxxx50) registered.
```

If the patient already exists (matched by name + phone), bot skips registration
and just adds today's visit.

**Works without staff too** — doctor can register the patient directly.

**Implementation:** `handleDoctorMainMenu` routes `doctor_register_patient` →
`REGISTER_NAME` → `REGISTER_AGE` → `REGISTER_SEX` → `REGISTER_PHONE` →
`REGISTER_APPOINTMENT` → creates patient record + appointment → `DOCTOR_MAIN_MENU`.

---

### 2) Doctor Logs the Visit

After the patient leaves, doctor opens the bot:

```
Doctor: → "Today's Appointments"
        → taps "Ramesh — 11:00"
        → sees detail → taps "✅ Complete Visit"

Bot:  🦷 Treatment done?
Doctor: RCT Sitting 1

Bot:  💰 Consultation fee?
Doctor: 500

Bot:  💰 Treatment charges?
Doctor: 3000

Bot:  💊 Medicine charges?
Doctor: 200

Bot:  🗓 Next visit date & time (or "none")?
Doctor: 7-Jun 11am

Bot:  📝 Notes for patient?
Doctor: Avoid hard food for 24 hours

Bot:  📷 Send photos / X-rays / prescription? (up to 5 images, or Skip)
Doctor: Skip
```

**Implementation:** `doctor_mark_completed` from `DOCTOR_APPOINTMENT_DETAIL` →
`LOG_TREATMENT` → `LOG_CONSULTATION_FEE` → `LOG_TREATMENT_CHARGES` →
`LOG_MEDICINE_CHARGES` → `LOG_NEXT_VISIT` → `LOG_NOTES` → `LOG_MEDIA` →
`updateVisitLog()` saves fees + notes + sets status='completed' → `DOCTOR_MAIN_MENU`.

---

### 3) Patient Receives Structured WhatsApp

Bot auto-sends to the patient after doctor completes the visit:

```
🏥 Shri Balaji Dental Clinic

📅 31-May-2026 | 11:00 AM
🦷 RCT Sitting 1

💰 Consultation:    ₹500
   Treatment:       ₹3,000
   Medicines:       ₹200
   ─────────────────
   Total Paid:      ₹3,700

🗓 Next visit: 07-Jun, 11:00 AM
📝 Note: Avoid hard food for 24 hours
```

Patient gets a clean, structured record. **No more doctor manually forwarding.**

**Implementation:** `sendPatientSummary()` called from `handleLogMedia()` after
`updateVisitLog()` succeeds. Sent via `sendText()` to `result.wa_id`.

---

### 4) Digital Diary — Searchable

Doctor can search any patient anytime:

```
Bot: 🔍 Search Patient

Doctor: Ramesh

Bot:  2 patients found:
      1. Ramesh S — 9198xxxx50 (28/M)
         Last: 31-May (RCT) — View details
      2. Ramesh K — 9198xxxx22
         Last: 15-May (Cleaning) — View details

Doctor: [taps Ramesh S]

Bot:  📋 Ramesh S (28/M)
      Total visits: 3

      ✅ 31-May 11:00 — RCT Sitting 1 (₹3,700)
      ✅ 15-May 10:00 — RCT Sitting 2 (₹3,500)
      🖼 28-Apr 11:00 — Consultation (₹500)
```

**Implementation:** `handleDoctorSearchPatient()` → `searchPatients()` →
`getVisitsByPatientPhone()` → shows formatted list with dates, treatments,
totals, and status icons.

---

### 5) Sending X-rays / Photos from Laptop Machine

Dental machine saves images to laptop. Doctor opens WhatsApp Web:

```
1. Drag-drop image into bot chat
2. Bot:  "Got image. Which patient?"
3. Doctor types: "Ramesh"
4. Bot:  "Save to latest visit (31-May, RCT)? Yes / Find another visit"
5. Doctor: "yes"
6. Bot:  "✅ Saved"
```

**Implementation status: PENDING** — requires:
- `src/lib/r2.js` — R2 upload/download helper
- `src/lib/media.js` — download from Meta → upload to R2 → store in DB
- Webhook handler for `type: 'image'` / `type: 'audio'`
- `awaitingMedia` session context for doctor media replies

---

## Data Model

### New columns on `appointments` table:

```sql
ALTER TABLE appointments ADD COLUMN chit_media TEXT[] DEFAULT '{}';
ALTER TABLE appointments ADD COLUMN consultation_fee INTEGER DEFAULT 0;
ALTER TABLE appointments ADD COLUMN treatment_charges INTEGER DEFAULT 0;
ALTER TABLE appointments ADD COLUMN medicine_charges INTEGER DEFAULT 0;
ALTER TABLE appointments ADD COLUMN notes TEXT DEFAULT '';
ALTER TABLE appointments ADD COLUMN patient_phone VARCHAR(20) DEFAULT '';
ALTER TABLE appointments ADD COLUMN patient_id UUID REFERENCES patients(id);
```

### `patients` table:

```sql
CREATE TABLE patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_id VARCHAR(50),
  name VARCHAR(100) NOT NULL,
  age INTEGER,
  sex VARCHAR(10),
  phone VARCHAR(20) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## R2 Storage

```
bucket: clinic-bot-chits
  path: /{patient_id}/{appointment_id}/{timestamp}_{type}.{ext}
```

**Implementation status: ✅ Done** — R2 client helper (`r2.js`), media download (`media.js`), and storing URLs in `chit_media[]` all implemented.

---

## What Changes vs What Stays

| Stays same | Changes |
|---|---|
| Paper prescription to patient | ✅ Doctor logs visit in bot instead of diary |
| Walking in with/without appointment | ✅ Bot auto-sends structured summary to patient |
| Doctor examines, treats, explains | ✅ Doctor can search patient history anytime |
| Taking photos of X-rays/prescription | ✅ Reception can register via bot |
| Doctor writes in paper diary | ❌ No manual WhatsApp forwarding needed |
| Doctor manually sends WhatsApp to patient | ❌ Bot sends structured summary automatically |

---

## Media Handling Flow

### How Media (X-rays & Photos) Works

### Media Sources (Including Audio)

**Media sources:**
1. **During log-visit flow** — doctor sees "Send photo/X-ray/audio (or tap done)" at `LOG_MEDIA` state; sends image/audio → saved to current appointment
2. **From appointment detail** — doctor taps "➕ Add Chit" → prompted to send image/audio → saved directly to that appointment
3. **Any time (no context)** — doctor sends image/audio → bot asks "Which patient?" → doctor types name → bot saves to most recent visit

**Viewing chit:**
- **From appointment detail** — doctor taps "📎 View Chit" → sees list of media items → taps to get signed URL
- **From patient search** — visit history shows 📎 count per visit → tap visit → see detail → view chit

**Audio support:** Audio messages (voice notes) are treated identically to images — same pipeline, same storage, same viewing.

**Pipeline:**
```
Doctor sends image → WhatsApp webhook
  → engine.js extracts mediaId + mimeType from webhook payload
  → handleDoctorMediaMessage() intercepts in dispatch
  → media.js downloadMediaFromMeta() fetches from Meta CDN
  → r2.js uploadToR2() uploads to Cloudflare R2
  → SQL UPDATE appointments SET chit_media = array_append(...)
```

**Files involved:**
- `src/lib/r2.js` — S3-compatible R2 client (`uploadToR2`, `deleteFromR2`, `getR2SignedUrl`)
- `src/lib/media.js` — `downloadMediaFromMeta()`, `processAndStoreMedia()` orchestration
- `src/lib/engine.js` — `normalizeMessage()` extracts `mediaId`, `mimeType`, `hasMedia`
- `src/lib/handlers.js` — `handleDoctorMediaMessage()`, `handleDoctorMediaPatientLookup()`, pending media routing, `handleDoctorViewChit()`, `handleDoctorViewSingleMedia()`
- `src/config/states.js` — `DOCTOR_VIEW_CHIT`, `DOCTOR_PATIENT_VISITS` states
- `src/lib/router.js` — `view_chit`, `add_chit`, `chit_media_<idx>_<apptId>` routing

---

## Remaining Work

*All features implemented.* See edge cases below.

---

## Edge Cases

Key ones (full analysis in `docs/chit-media-edge-cases.md`):
- Common names → show phone + last visit to disambiguate
- Walk-in with no history → registration flow creates patient
- Family sharing one phone → search by name works
- Network failure mid-upload → retry + temp fallback
- Multiple appointments per patient → doctor picks which visit to attach media to
- Typo in search → fuzzy match / suggestions
