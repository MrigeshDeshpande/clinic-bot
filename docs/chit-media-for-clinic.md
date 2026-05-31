# Clinic Bot — How It Works (For Clinic Staff & Doctor)

## Today's Flow (Without Bot)

```
Patient walks in
  → Reception writes: name, age, sex, WhatsApp number
  → Patient sees doctor
  → Doctor examines, prescribes, explains costs
  → May treat immediately or schedule next visit
  → Patient leaves
  → Doctor writes in diary: treatment, fees, medicines, next visit
  → Doctor personally WhatsApps patient: OPD summary + X-rays + photos
```

## How the Bot Changes It

The bot **replaces the diary** and **replaces the manual WhatsApp**.
Everything else — paper prescription, patient walking in, examining — stays 100% same.

---

## Flow Step by Step

### Step 1: Register the Patient (Reception — or Doctor)

When a new patient walks in:

```
Bot:  New patient. Enter name:
Reception: Ramesh

Bot:  Age?
Reception: 28

Bot:  Sex?
Reception: M

Bot:  WhatsApp number (with country code)?
Reception: 9198xxxx50

Bot:  Appointment time or "walk-in"?
Reception: walk-in

Bot:  ✅ Ramesh (28/M) registered for today.
```

If the patient has come before, bot recognizes them and skips registration.

**No receptionist?** No problem. Doctor can register the patient directly.

### Step 2: Doctor Logs the Visit (Replaces Diary)

After patient leaves, doctor opens WhatsApp → bot → Today's Appointments
→ taps Ramesh → taps "Complete Visit".

Bot asks step by step:

```
🦷 Treatment done?
  → RCT Sitting 1

💰 Consultation fee?
  → 500

💰 Treatment charges?
  → 3000

💰 Medicine charges?
  → 200

🗓 Next visit date & time? (or "none")
  → 7-Jun 11am

📝 Notes for patient?
  → Avoid hard food for 24 hours

📷 Send photos / X-rays / prescription? (up to 5)
  Doctor sends photos...
```

That's it. **No more writing in the diary.** The bot stores everything.

### Step 3: Patient Auto-Receives WhatsApp Summary (Replaces Manual Forwarding)

Bot sends patient a clean summary:

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

📎 Photos & X-rays attached below
```

**No need for the doctor to manually take photos of the prescription and forward.
The bot does it automatically.**

### Step 4: Searchable Digital Diary

Want to check a patient's history? Type their name in the bot:

```
Doctor types: Ramesh

Bot:  2 patients found:
      1. Ramesh S — 9198xxxx50
         Last visit: 31-May (RCT) — View details
      2. Ramesh K — 9198xxxx22
         Last visit: 15-May (Cleaning) — View details
```

Tap any patient → see all visits with charges and attached photos.

**Think of it as a WhatsApp-based diary that's always searchable.**

### Step 5: Sending X-rays / Photos from Laptop

X-ray machine and intraoral camera save to the laptop.
Doctor has WhatsApp Web open on the same laptop:

```
1. Drag-drop image file into bot chat
2. Bot asks: "Which patient?"
3. Doctor types patient name
4. Bot asks: "Save to latest visit (31-May, RCT)?"
5. Doctor confirms
6. Image is saved → also sent to patient automatically
```

**No USB drive. No software install. Just drag-drop and type the name.**

---

## What Changes vs What Stays Same

| Stays Same | Replaced by Bot |
|---|---|
| Patient walks in (appointment or walk-in) | ❌ Paper diary → ✅ Bot logs visit digitally |
| Reception writes name, age, sex, WhatsApp | ❌ Doctor manually WhatsApps patient → ✅ Bot auto-sends |
| Doctor examines, prescribes, treats | ❌ Flipping diary pages for old records → ✅ Search by name |
| Doctor writes prescription on paper | |
| Doctor explains costs, next visit | |
| Doctor takes X-rays / photos | |

---

## Frequently Asked Questions

**Q: Do I need to change how I treat patients?**
A: No. Examine, prescribe, treat — same as always. Only the "writing in diary"
and "sending WhatsApp" steps move into the bot.

**Q: What if there's no receptionist?**
A: Doctor can register the patient directly in the bot. One extra step — still
faster than writing in the diary.

**Q: What if I forget to log the visit right away?**
A: Open the patient's record later and log it. Photos and charges can be added
anytime.

**Q: Can I see past visits for a patient?**
A: Yes. Search by name or phone in the bot. Every visit shows treatment,
charges, and attached photos.

**Q: Does the patient see other patients' records?**
A: No. Each patient only sees their own visits.

**Q: What about X-rays from the machine that has no internet?**
A: Open WhatsApp Web on the laptop. Drag-drop the image. Type the patient name.
That's it.

**Q: Is this secure?**
A: Yes. Photos are stored securely. Only the doctor and the specific patient
can access them.
