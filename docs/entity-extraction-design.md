# Entity Extraction — Current Implementation

> **Last updated:** May 31, 2026
> **Covers:** Current production implementation in `src/lib/validators.js` and `src/lib/entities.js`

---

## Architecture Overview

Entity extraction uses a **simpler direct-parse** approach rather than a layered pipeline. Each validator function (`validateDate`, `validateTime`, `validateTreatment`, `validatePhone`) independently scans the preprocessed text and returns a result object.

```
Input text
    │
    ▼
Preprocess (strip conversational fluff)
    │
    ├──► validateDate()    ──► { valid, parsed, reason, suggestion }
    ├──► validateTime()    ──► { valid, parsed, reason, suggestion }
    ├──► validateTreatment()──► { valid, parsed, reason, suggestion }
    └──► validatePhone()   ──► { valid, parsed, reason, suggestion }
```

Key design choices:
- **No scoring/confidence system** — first pattern to match wins (sequential checking)
- **Validation integrated** — a date/time is parsed AND validated against clinic rules in one function
- **Extractor passes through invalid-but-parsed values** — `extractEntities` in `entities.js` includes `date`/`time` even when `valid === false`, so handlers can show suggestions

---

## Preprocessing (`src/lib/entities.js:3-16`)

Before extraction, conversational fillers are stripped:

```js
function preprocessText(raw) {
  let text = raw.toLowerCase().trim();

  // Remove conversational request prefixes
  text = text.replace(/^(i want to|i would like to|i need to|i wanna|i need|can i|...)\s+/i, '');

  // Remove polite suffixes
  text = text.replace(/\s+(please|thanks|thank you|thankyou|thx|pls|plz|kindly)$/i, '');

  // Remove question prefixes
  text = text.replace(/^(can you tell me|do you have|is there|what about|how about|...)\s+/i, '');

  return text.trim();
}
```

**Before:** `"I want to come next Friday at 2pm for a cleaning please"`
**After:** `"come next Friday at 2pm for a cleaning"`

---

## Date Extraction (`src/lib/validators.js:71-179`)

### Devanagari Digit Normalization

All text runs through `normalizeIndicDigits()` first:

```js
'०'→'0', '१'→'1', '२'→'2', '३'→'3', '४'→'4',
'५'→'5', '६'→'6', '७'→'7', '८'→'8', '९'→'9'
```

This means `"२५/०५/२०२६"` becomes `"25/05/2026"` and parses normally.

### Pattern Matching (checked in order)

| # | Pattern | Example | Notes |
|---|---------|---------|-------|
| 1 | `kal` / `कल` | `"kal"`, `"कल"` | Returns AMBIGUOUS — user must be explicit. Only auto-resolves if "tomorrow" or "next" also present |
| 2 | Absolute (today/tomorrow/parso) | `"today"`, `"आज"`, `"tomorrow"`, `"kal"`, `"परसों"` | Includes Devanagari: आज, कल, परसों |
| 3 | Numeric relative | `"2 din baad"`, `"3 days later"` | `\b(\d{1,2})\s*(din\|day\|days)\s*(baad\|later\|after)\b` |
| 4 | Hinglish number words | `"do din baad"`, `"teen din baad"` | Uses HINGLISH_NUMBER_WORDS map (ek=1, do=2, teen=3...) |
| 5 | Qualified weekday | `"next Friday"`, `"agle Monday"` | Supports `next/this/coming/agle/agla` prefixes |
| 6 | Bare weekday | `"Friday"`, `"Monday"` | Gets next occurrence of that day |
| 7 | Spoken DMY | `"25 May"`, `"25th May 2026"` | Also `"May 25"`, `"May 25th"` |
| 8 | ISO format | `"2026-05-25"` | YYYY-MM-DD |
| 9 | Numeric DD/MM/YYYY | `"25/05/2026"` | Also `"25-05-2026"`, `"25.05.2026"` |
| 10 | Numeric short DD/MM | `"25/05"` | Uses current year |

### Validation

Once parsed, the date is checked against:
- **Past dates** — rejected with `PAST_DATE`
- **Beyond booking horizon** (30 days) — rejected with `BEYOND_HORIZON`
- Returns `{ valid: true, parsed: Date }` on success

---

## Time Extraction (`src/lib/validators.js:181-355`)

### Pattern Matching (checked in order)

| # | Pattern | Example | Output |
|---|---------|---------|--------|
| 1 | HH:MM with am/pm | `"2:30 pm"`, `"14:30"` | 14:30 |
| 2 | Hour + am/pm | `"2pm"`, `"10 am"` | 14:00, 10:00 |
| 3 | After/before/by/around | `"after 3"`, `"around 5pm"` | 15:00, 17:00 |
| 4 | Time-of-day words | `"morning"`, `"subah"`, `"सुबह"` | 10:00 |
|  |  | `"afternoon"`, `"dopahar"`, `"दोपहर"` | 14:00 |
|  |  | `"evening"`, `"shaam"`, `"raat"`, `"शाम"`, `"रात"` | 17:00 |
| 5 | Hinglish "baje" | `"5 baje"`, `"5 baje shaam"`, `"५ बजे शाम"` | 17:00 |
| 6 | Hinglish "saade" | `"saade 5"`, `"साढ़े 5"` | 17:30 |
| 7 | "half past X" | `"half past 2"` | 14:30 |
| 8 | "quarter past X" | `"quarter past 2"` | 14:15 |
| 9 | "quarter to X" | `"quarter to 3"` | 14:45 |
| 10 | "X o'clock" | `"2 o'clock"` | 14:00 |

### Default PM heuristic for standalone hours

For patterns without AM/PM (e.g., `"after 3"`, `"around 5"`), hours 1-6 default to PM (13-17), hours 7-12 default to AM (7-12).

### Validation

Once parsed, time is checked against:
- **Before opening** — rejected with `BEFORE_OPENING` (weekday 10:00, Sunday 10:00)
- **After closing** — rejected with `AFTER_CLOSING` (weekday 20:00, Sunday 14:00)
- **Slot alignment** — must be on 30-min boundary; if not, rejects with `INVALID_SLOT` + suggestion
- **Slot availability** — must be in `CLINIC.slots[dayType]`; rejects with `SLOT_UNAVAILABLE` + suggestion
- **Past time today** — if booking for today, rejects times that have already passed (`TIME_PASSED`)
- Returns `{ valid: true, parsed: 'HH:MM' }` on success

---

## Treatment Extraction (`src/lib/validators.js:357-379`)

### Approach

Simple alias matching with word boundaries, sorted by alias length (descending) so multi-word aliases match first:

```js
// Sort aliases by length (descending)
allAliases.sort((a, b) => b.alias.length - a.alias.length);

for (const entry of allAliases) {
  const pattern = new RegExp(`\\b${escapeRegex(entry.alias)}\\b`);
  if (pattern.test(lower)) {
    return { valid: true, parsed: entry.treatmentName };
  }
}
```

### Treatment Aliases (from `src/config/clinic.js`)

| Treatment | Aliases |
|-----------|---------|
| General Dentistry | checkup, check up, general, consultation, cleaning general, routine |
| Teeth Cleaning | cleaning, clean, teeth cleaning, scaling, teeth whitening |
| Root Canal | root canal, rc, rct, nerve treatment, root, canal |
| Whitening | whitening, white, bleaching |
| Implants | implants, implant, dental implant |
| Braces | braces, orthodontic, ortho |
| Crowns | crowns, crown, cap, dental crown |
| Pediatric Dentistry | pediatric, child, children, kids, baby, paediatric |

### Anti-False-Positive via Word Boundaries

Word boundaries (`\b`) prevent:
- `"general"` in `"general store"` matching General Dentistry ✅ (misses, so false positive avoided)
- `"white"` in `"white color"` matching Whitening ✅ (misses)

---

## Phone Extraction (`src/lib/validators.js:381-400`)

### Pattern

```js
const cleaned = text.replace(/[^0-9]/g, '');

if (/^(91)?[6-9]\d{9}$/.test(cleaned)) {
  digits = cleaned.slice(-10);        // 10 digits starting with 6-9
} else if (/^(0)[6-9]\d{9}$/.test(cleaned)) {
  digits = cleaned.slice(1);           // Strip leading 0
}
```

Accepts:
- `"9876543210"` → +919876543210
- `"98765 43210"` → +919876543210
- `"+91 98765 43210"` → +919876543210
- `"919876543210"` → +919876543210
- `"09876543210"` → +919876543210

Only Indian mobile numbers (10 digits, start 6-9).

---

## Entity Accumulation (`src/lib/entities.js:58-113`)

Entities are accumulated across fragmented messages for progressive slot filling:

```js
export function accumulateEntities(sessionContext, newEntities) {
  // Appends to dates[], times[], treatments[] arrays, deduplicating
}

export function computePendingFields(context, accumulated) {
  // Returns ['treatment', 'date', 'time', 'patientName']
  // — whichever fields are still missing
}
```

This allows multi-message booking:
1. `"I want a cleaning"` → `{ treatment: 'Teeth Cleaning' }`, pending: `['date','time','patientName']`
2. `"tomorrow"` → `{ date: ... }`, pending: `['time','patientName']`
3. `"2pm"` → `{ time: ... }`, pending: `['patientName']`

If all four fields are provided in one message, the bot skips straight to confirmation.

---

## Summary: Sentences That Work

| User says | Extracted date | Extracted time | Extracted treatment |
|---|---|---|---|
| "tomorrow at 10am for cleaning" | ✅ tomorrow | ✅ 10:00 | ✅ Teeth Cleaning |
| "next Friday 2:30 pm root canal" | ✅ next Fri | ✅ 14:30 | ✅ Root Canal |
| "can I come on 25th May around 4?" | ✅ 25 May | ✅ 16:00 | — |
| "I need braces, can you do this Friday?" | ✅ this Fri | — | ✅ Braces |
| "my child needs a checkup tomorrow morning" | ✅ tomorrow | ✅ 10:00 | ✅ Pediatric Dentistry |
| "book me for RCT on Tuesday at 3" | ✅ next Tue | ✅ 15:00 | ✅ Root Canal |
| "I want my teeth whitened on May 25th" | ✅ 25 May | — | ✅ Whitening |
| "call me back at 9876543210" | — | — | — |
| "kal 5 baje cleaning ke liye" | ✅ tomorrow | ✅ 17:00 | ✅ Teeth Cleaning |
| "आज शाम ५ बजे" | ✅ today | ✅ 17:00 | — |
| "do din baad saade 3" | ✅ +2 days | ✅ 15:30 | — |
| "agle Monday half past 10" | ✅ next Mon | ✅ 10:30 | — |

---

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/validators.js` | All date, time, treatment, phone parsing + validation |
| `src/lib/entities.js` | Preprocessing, entity extraction orchestration, accumulation |
| `src/config/clinic.js` | Treatment definitions with aliases, clinic hours, slots |
