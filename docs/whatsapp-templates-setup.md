# WhatsApp Template Messages — Setup Guide

## Overview

Template messages bypass Meta's 24-hour messaging window, allowing the bot to proactively message patients who haven't interacted recently. The code supports templates with automatic fallback to free-form text (which works within the 24h window).

Only create templates in Meta that are actively used at runtime. Unused templates (`booking_confirmation`, `visit_summary`) are registered in code as reserved but should not be created in Meta.

## Active Templates in Meta

Currently **2 templates** are created and active in Meta Business Manager:

### Template 1: `feedback_request`

| Field | Value |
|-------|-------|
| Name | `feedback_request` |
| Category | Utility |
| Language | English |
| Header | None |
| Body | `Hi {{1}},` |
| | `Thank you for visiting {{2}}.` |
| | `If you have a moment, we'd be grateful if you could share your experience with others. Your feedback helps patients make informed decisions and helps us continue improving our care.` |
| | `Thank you.` |
| Footer | `Shri Balaji Advanced Dental Care & Implant Center` |
| URL Button | **Button text:** `Leave a Review` |
| | **URL:** `https://g.page/r/CREFemgdjOejEBM/review` |

**Parameters:**
| # | Content |
|---|---------|
| `{{1}}` | Patient first name (e.g. "Ramesh") |
| `{{2}}` | Clinic name (e.g. "Shri Balaji Advanced Dental Care & Implant Center") |

**Called from:**
- `src/app/api/cron/feedback/route.js`

---

### Template 2: `payment_reminder`

| Field | Value |
|-------|-------|
| Name | `payment_reminder` |
| Category | Utility |
| Language | English |
| Header | None |
| Body | `Hi {{1}},` |
| | `This is a payment reminder from Shri Balaji Advanced Dental Care & Implant Center.` |
| | `Amount due: {{2}}` |
| | `Payment link: {{3}}` |
| | `Thank you.` |
| Footer | `Shri Balaji Advanced Dental Care & Implant Center` |

> **Note:** The body in Meta currently still says `Shri Balaji Dental Clinic` — edit the template in Meta Business Manager to use the updated clinic name.

**Parameters:**
| # | Content |
|---|---------|
| `{{1}}` | Patient name (e.g. "Ramesh") |
| `{{2}}` | Amount (e.g. "₹5,500") |
| `{{3}}` | UPI payment link |

**Called from:**
- `src/app/dashboard/visit/page.js` — `sendPaymentLink()` → `sendTemplate(waId, 'payment_reminder', [name, amount, link])`
- `POST /api/dashboard/send-whatsapp` with body `{ to, template: 'payment_reminder', params: [...] }`

## Templates Using Fallback (Not in Meta)

These templates are registered in code but **not created in Meta**. The code falls back to `sendText` automatically.

| Template | Params | Code fallback |
|---|---|---|
| `appointment_reminder` | 6 — `patient_name`, `date`, `time`, `treatment`, `clinic_name`, `location` | `cron/reminders/route.js` sends plain text with `CLINIC.name` |
| `due_reminder` | 4 — `patient_name`, `clinic_name`, `due_amount`, `upi_id` | `cron/due-reminders/route.js` sends plain text with `CLINIC.name` & `CLINIC.upiId` |
| `booking_confirmation` | 5 — (reserved, no runtime usage) | — |
| `visit_summary` | 5 — (reserved, no runtime usage) | — |

The fallback messages already use `CLINIC.name` dynamically and work correctly within the 24-hour messaging window.

## Templates NOT Created in Meta (Reserved for Future Use)

| Template | Reason |
|---|---|
| `booking_confirmation` | Registered in code but not yet sent at runtime |
| `visit_summary` | Registered in code but not yet sent at runtime (uses `sendText` fallback instead) |

## Fallback Behavior

The code automatically falls back to free-form text (or interactive buttons for feedback) if:

- The template name doesn't match a registered/approved template
- The template isn't approved yet
- The API returns an error

This means you can deploy the code **before** templates are approved — the crons continue working within the 24h window until templates are live.
