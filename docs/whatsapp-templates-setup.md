# WhatsApp Template Messages — Setup Guide

## Overview

Template messages bypass Meta's 24-hour messaging window, allowing the bot to proactively message patients who haven't interacted recently. The code now supports templates with automatic fallback to free-form text (which works within the 24h window).

## Step 1: Create Templates in Meta Business Manager

1. Go to [Meta Business Manager > WhatsApp > Message Templates](https://business.facebook.com/wa/manage/message-templates/)
2. Select your WABA (WhatsApp Business Account)
3. Click **Create Template**
4. Choose category: **Utility** (fastest approval)

### Template 1: `appointment_reminder`

| Field | Value |
|-------|-------|
| Name | `appointment_reminder` |
| Category | Utility |
| Language | English |
| Header | None |
| Body | `Hi {{1}}, just a reminder for tomorrow — {{2}} at {{3}}.` |
| | `Treatment: {{4}}` |
| | `📍 {{5}}, {{6}}` |
| | `Reply confirm to keep it or cancel to cancel.` |
| Footer | `Shri Balaji Dental Clinic` |

**Parameters:**
| # | Content |
|---|---------|
| `{{1}}` | Patient first name (e.g. "Ramesh") |
| `{{2}}` | Formatted date (e.g. "Wednesday, 3 June") |
| `{{3}}` | Formatted time (e.g. "10:00 AM") |
| `{{4}}` | Treatment (e.g. "Root Canal") |
| `{{5}}` | Clinic name (e.g. "Shri Balaji Dental Clinic") |
| `{{6}}` | Location (e.g. "Bhilai") |

### Template 2: `feedback_request`

| Field | Value |
|-------|-------|
| Name | `feedback_request` |
| Category | Utility |
| Language | English |
| Header | None |
| Body | `Hi {{1}}! How was your visit to {{2}}?` |
| | `Your feedback helps us serve you better.` |
| Footer | None |

**Parameters:**
| # | Content |
|---|---------|
| `{{1}}` | Patient first name (e.g. "Priya") |
| `{{2}}` | Clinic name (e.g. "Shri Balaji Dental Clinic") |

### Optional: `booking_confirmation`

If you also want booking confirmations as templates:

| Field | Value |
|-------|-------|
| Name | `booking_confirmation` |
| Category | Utility |
| Language | English |
| Body | `Hi {{1}}, your appointment is confirmed:` |
| | `📅 {{2}} at {{3}}` |
| | `🦷 {{4}}` |
| | `📍 {{5}}` |

### Optional: `visit_summary`

| Field | Value |
|-------|-------|
| Name | `visit_summary` |
| Category | Utility |
| Language | English |
| Body | `Hi {{1}}, thank you for your visit on {{2}}.` |
| | `Treatment: {{3}}` |
| | `Total: ₹{{4}}` |
| | `📍 {{5}}` |

## Step 2: Approval Process

- **Utility templates** are typically approved within minutes to a few hours
- Once approved, status changes to **APPROVED**
- The template is available immediately across all phone numbers in your WABA

## Step 3: Verify in Code

Templates are called from:

- `src/app/api/cron/reminders/route.js` — `sendTemplate(waId, 'appointment_reminder', [...])`
- `src/app/api/cron/feedback/route.js` — `sendTemplate(waId, 'feedback_request', [...])`

The registry lives at `src/config/templates.js`.

## Fallback Behavior

The code automatically falls back to free-form text (or interactive buttons for feedback) if:

- The template name doesn't match a registered/approved template
- The template isn't approved yet
- The API returns an error

This means you can deploy the code **before** templates are approved — the crons continue working within the 24h window until templates are live.
