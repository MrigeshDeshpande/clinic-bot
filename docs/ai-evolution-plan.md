# AI Evolution Plan: Principal Architect Review

---

## Part 1 — AI Readiness: Component-by-Component Analysis

### 1a. Which components should remain UNTOUCHED?

| File | Verdict | Rationale |
|------|---------|-----------|
| `src/lib/whatsapp.js` | **Keep as-is** | Pure I/O layer. WhatsApp API client. No AI benefit from touching it. |
| `src/lib/transitions.js` | **Keep as-is** | State transition table (`transitions.js:22-161`). This is a pure deterministic function: `(state, intent) → nextState`. It already works perfectly. AI cannot improve it — it would add risk. |
| `src/lib/overwrite-policy.js` | **Keep as-is** | Deterministic business rules (`overwrite-policy.js:37-102`). These encode clinic-specific policies about when booking fields can change. Should never be AI-driven. |
| `src/lib/deduplicate.js` | **Keep as-is** | Pure infrastructure. |
| `src/lib/rateLimit.js` | **Keep as-is** | Infrastructure. |
| `src/lib/sanitize.js` | **Keep as-is** | Security layer. |
| `src/lib/apiAuth.js` | **Keep as-is** | Security layer. |
| `src/lib/logger.js` | **Keep as-is** | Infrastructure. |
| `src/lib/r2.js` | **Keep as-is** | Infrastructure. |
| `src/lib/messageEvents.js` | **Keep as-is** | Infrastructure. |
| `src/middleware.js` | **Keep as-is** | Authentication. |

### 1b. Which components should be AI-enhanced?

| File | Verdict | How |
|------|---------|-----|
| `src/lib/router.js` | **AI-enhance** | Current: keyword matching (`router.js:6-22`). Replace intent classification with LLM call while keeping interactive ID handling (`router.js:123-215`) as a deterministic fast-path. |
| `src/lib/validators.js` | **AI-enhance selectively** | Keep regex for phone (`validators.js:381-400`), time slot validation (`validators.js:311-355`), and clinic hours checks. Move date parsing (`validators.js:71-179`) and treatment matching (`validators.js:357-379`) to AI for flexible natural language understanding. |
| `src/lib/entities.js` | **AI-enhance** | Keep the `accumulateEntities` and `computePendingFields` logic. Replace `extractEntities` with AI-powered extraction that also returns confidence. |
| `src/lib/correction-detector.js` | **AI-enhance** | The regex approach (`correction-detector.js:9-27`) misses many correction patterns. Let AI detect corrections as part of intent classification. |
| `src/lib/handlers.js` | **Leave for now** | This is the riskiest file (~8,000 lines). Do NOT touch this until the AI input layer (router + validators) is stable. The handlers call the database and WhatsApp API — AI should not control them directly. |

### 1c. Which components should eventually be replaced?

| File | When | Replace With |
|------|------|-------------|
| `router.js` entirely | Phase 2 end | LLM-based intent classifier with fallback to regex |
| `validators.js` date/treatment | Phase 2 end | AI entity extraction |
| `correction-detector.js` | Phase 2 end | Built into the AI intent step |
| `handlers.js` booking logic | Phase 3-4 | Tool functions callable by an agent |

### 1d. Which components are dangerous to replace?

| File | Danger Level | Why |
|------|-------------|-----|
| `handlers.js` | **EXTREME** | 8,000+ lines, ~40 state handlers, each with DB calls, WhatsApp calls, and business logic. An AI making decisions here could double-book, cancel wrong appointments, or send wrong info. The handler must remain deterministic. |
| `overwrite-policy.js` | **HIGH** | Controls when booking fields can be mutated. An AI deciding this could corrupt booking data. |
| `transitions.js` | **HIGH** | The state machine is the backbone. Letting AI decide transitions would produce unpredictable behavior. |
| `validators.js` phone/time validation | **MEDIUM** | Phone number format (`validators.js:381-400`) and clinic hours validation (`validators.js:311-355`) are country/region-specific rules. AI may hallucinate validations. Keep these regex. |

---

## Part 2 — Gemini Integration Strategy

### 2a. Is this the correct evolution path?

**Yes, but with one critical correction.**

Your proposed flow:
```
Message → Gemini → Intent + Entities + Confidence → Existing Engine → Handler → Response
```

**This is almost correct.** However, Gemini should NOT replace the session loading step. Session must load BEFORE Gemini for two reasons:
1. The state machine context is needed for intent classification (e.g., "yes" means different things in BOOKING_CONFIRMATION vs CANCEL_CONFIRM)
2. The conversation history in the session provides context

**Correct flow:**
```
Message
→ Deduplicate (untouched)
→ Load Session (untouched — engine.js:204)
→ Gemini (NEW: intent + entities + confidence)
→ Correction Detection (can be inside Gemini now)
→ Evaluate Overwrite Policy (untouched)
→ Transitions.getNextState (untouched)
→ Handler (untouched)
→ Save Session (untouched)
→ Send Reply (untouched)
```

### 2b. Where exactly should Gemini be called?

**In `engine.js`, replace the current steps 2e-2f** (lines 244-277):

```javascript
// Current (lines 244-277):
const intentResult = classifyIntent(normalized, session);  // router.js
// ... correction detection ...
const entities = intentResult.entities || extractEntities(normalized.textClean);  // validators.js

// Should become:
let aiResult = null;
if (USE_AI && normalized.type !== 'interactive') {
  aiResult = await ai.classify({
    text: normalized.textClean,
    state: session.state,
    booking: session.context.booking,
    conversationHistory: session.context.recentMessages,
  });
}
const intentResult = aiResult?.intent
  ? aiResult
  : classifyIntent(normalized, session);  // fallback to rule-based
const entities = aiResult?.entities
  ? aiResult.entities
  : extractEntities(normalized.textClean);  // fallback to regex
```

### 2c. Should Gemini replace router.js?

**Yes, but keep a fallback chain:**

1. **Priority 0 (deterministic):** Interactive button/list replies (`router.js:123-215`) — these have known IDs, 100% confidence. Never send to AI.
2. **Priority 1 (AI):** Free-text messages go to Gemini for intent + entity extraction.
3. **Priority 2 (fallback):** If Gemini fails, return low confidence, or takes too long → fall back to `router.js` keyword matching.
4. **Priority 3 (last resort):** If both fail → `unknown` intent.

**File to modify:** `engine.js` lines 244-277. Replace the call to `classifyIntent` with an AI routing layer. Do NOT delete `router.js` — keep it as the fallback.

### 2d. Should Gemini replace validators.js?

**Partial replacement.** Keep these validator functions as regex always:

- `validatePhone()` (`validators.js:381-400`) — phone format validation MUST be exact
- Clinic hours validation (`validators.js:311-355`) — slot alignment, opening hours
- `validateTime()` slot availability checks — deterministic

Move these to AI:

- `validateDate()` (`validators.js:71-179`) — let AI handle "day after tomorrow", "agle mahine ki 5 tarik", etc.
- `validateTreatment()` (`validators.js:357-379`) — let AI match fuzzy treatment descriptions

**Hybrid approach for date/time:** Let AI extract the raw date/time, then pass through existing validators for clinic rules enforcement (past date, beyond horizon, before opening, etc.).

### 2e. Should Gemini run before or after session loading?

**After** session loading. The session provides:
- Current state (needed for context-aware classification)
- Booking context (already collected fields)
- Recent messages (for conversation continuity)

The session load is already done at `engine.js:204`. Insert AI call at line 244, replacing `classifyIntent`.

### 2f. What should happen if Gemini fails?

**Graceful degradation chain:**

```
Gemini call
  ├── Timeout (>2s) → fallback to router.js keyword matching
  ├── Returns null/empty → fallback to router.js
  ├── Confidence < 0.3 → fallback to router.js, log low confidence
  ├── Confidence < 0.6 → use AI result but flag for audit
  └── Confidence >= 0.6 → use AI result
```

Implementation in a new `src/lib/ai/index.js`:

```javascript
export async function classifyWithFallback(normalized, session) {
  // Priority 0: Interactive IDs — deterministic
  if (normalized.interactiveId) {
    const ruleResult = classifyIntent(normalized, session);
    if (ruleResult.confidence === 1.0) return ruleResult;
  }

  // Priority 1: AI (with timeout)
  try {
    const aiResult = await Promise.race([
      callGemini(normalized, session),
      new Promise((_, reject) => setTimeout(() => reject(new Error('AI_TIMEOUT')), 2000))
    ]);
    if (aiResult && aiResult.confidence >= 0.6) return aiResult;
    if (aiResult && aiResult.confidence >= 0.3) {
      logger.warn('AI_LOW_CONFIDENCE', { confidence: aiResult.confidence, intent: aiResult.intent });
      // Still use it — but log it
      return aiResult;
    }
  } catch (e) {
    logger.warn('AI_FAILED', { error: e.message });
  }

  // Priority 2: Rule-based fallback
  return classifyIntent(normalized, session);
}
```

---

## Part 3 — AI Abstraction Layer

### Proposed structure:

```
src/lib/ai/
├── index.js          # Public API — classifyWithFallback()
├── provider.js       # Provider interface + contract
├── gemini.js         # Gemini implementation
├── openai.js         # OpenAI implementation (future)
├── claude.js         # Claude implementation (future)
└── mock.js           # Mock for testing
```

### Interface contract (`provider.js`):

```javascript
/**
 * @typedef {Object} AIRequest
 * @property {string} text - Cleaned user message text
 * @property {string} state - Current session state
 * @property {Object} booking - Current booking context { date, time, treatment, ... }
 * @property {Array<{role:string, content:string}>} recentMessages - Last N messages
 * @property {Object} clinic - Clinic config (for available treatments, hours)
 *
 * @typedef {Object} AIResponse
 * @property {string} intent - Classified intent (must match existing intent names)
 * @property {number} confidence - 0.0 to 1.0
 * @property {Object} entities - Extracted entities { date?, time?, treatment?, phone?, name? }
 * @property {boolean} isCorrection - Whether this is a correction of previous input
 * @property {string} correctionField - If isCorrection: which field ('date', 'time', 'treatment')
 * @property {string} reasoning - Brief explanation (for debugging/audit)
 * @property {string} source - 'gemini', 'openai', 'claude', 'mock'
 *
 * @typedef {Function} AIProvider
 * @param {AIRequest} request
 * @returns {Promise<AIResponse>}
 */
```

### Gemini implementation (`gemini.js`):

```javascript
const SYSTEM_PROMPT = `You are the AI intent classifier for a dental clinic's WhatsApp receptionist.

Your job is to:
1. Classify the patient's intent from their message
2. Extract any entities (date, time, treatment, phone number, patient name)
3. Detect if the patient is correcting a previous input
4. Return a confidence score

Current session state: {{STATE}}
Already collected booking info: {{BOOKING_CONTEXT}}
Available treatments: {{TREATMENTS}}

Intent names (use exactly these):
- appointment (want to book)
- provide_date (giving a date)
- provide_time (giving a time)
- provide_treatment (choosing a treatment)
- cancel_appointment (want to cancel)
- reschedule (want to reschedule)
- my_appointments (asking about existing bookings)
- location (asking for clinic location)
- timings (asking for clinic hours)
- services (asking about treatments)
- emergency (urgent dental issue)
- escalate (want to talk to a human)
- main_menu (want to go back to menu)
- back (go to previous step)
- confirm (confirm the booking)
- correction_date (correcting the date)
- correction_time (correcting the time)
- correction_treatment (correcting the treatment)
- unknown (can't determine intent)

Return JSON: { intent, confidence, entities: { date?, time?, treatment?, phone?, name? }, isCorrection, correctionField, reasoning }`;
```

### Testing with mock (`mock.js`):

```javascript
export async function classify(request) {
  // For replay testing: look up expected intent from recorded data
  const match = replayData.find(r => r.text === request.text);
  if (match) {
    return {
      intent: match.intent,
      confidence: 1.0,
      entities: match.entities || {},
      isCorrection: false,
      correctionField: null,
      reasoning: 'Replay match',
      source: 'mock',
    };
  }
  // Default: fall through
  throw new Error('MOCK_NO_MATCH');
}
```

---

## Part 4 — Intent Classification Migration

### 4a. Which intents should stay rule-based?

All **interactive IDs** (`router.js:123-215`) — these are button/list reply IDs with deterministic mapping:

| Intent | Source | Keep Rule-Based? | Why |
|--------|--------|------------------|-----|
| `appointment` (from ID `apt`) | `router.js:25` | ✅ Yes | Button click, deterministic |
| `confirm` (from ID `confirm`) | `router.js:29` | ✅ Yes | Button click |
| `cancel` (from ID `cancel`) | `router.js:33` | ✅ Yes | Button click |
| `provide_date` (from date_* IDs) | `router.js:127-135` | ✅ Yes | Date selection from list |
| `provide_treatment` (from treatment IDs) | `router.js:211-214` | ✅ Yes | Treatment selection from list |
| All doctor intents (doc_*) | `router.js:137-203` | ✅ Yes | Doctor menu selections |
| `provide_treatment` (numeric) | `router.js:290-298` | ✅ Yes | "1", "2" for treatment list |
| `emergency` | `intents.js:4-7` | ✅ **Keep** | Must always match immediately |
| `cancel` (global) | `intents.js:8` | Keep | Safety net |
| `main_menu` | `intents.js:9` | Keep | Safety net |
| `greeting` | `intents.js:15` | Keep | Simple pattern |
| `thanks` | `intents.js:16` | Keep | Simple pattern |
| `help` | `intents.js:17` | Keep | Simple pattern |
| `back` | `intents.js:11` | Keep | Navigation |
| `affirm` | `intents.js:12` | Keep | "yes", "ok" |
| `arrival` | `intents.js:13-14` | Keep | Simple pattern |
| `language_en`, `language_hi` | `intents.js:2-3` | Keep | Simple pattern |

### 4b. Which intents should move to Gemini?

| Intent | Current Implementation | Why Move |
|--------|----------------------|----------|
| `appointment` (free-text) | `STATE_INTENTS.MAIN_MENU:27` | Users say this in infinite ways |
| `provide_date` (free-text) | `router.js:276-278` (entity-derived) | "day after tomorrow", "agle hafte" |
| `provide_time` (free-text) | `router.js:279-281` (entity-derived) | "around 3", "saade 5 baje" |
| `provide_treatment` (free-text) | `router.js:282-284` (entity-derived) | "my tooth hurts when I eat cold things" |
| `cancel_appointment` | `STATE_INTENTS.BOOKED:41` | Multiple phrasings |
| `reschedule` | `STATE_INTENTS.BOOKED:42` | Multiple phrasings |
| `my_appointments` | `STATE_INTENTS.MAIN_MENU:31` | "what appointments do I have" |
| `escalate` | `intents.js:10` | "I want to talk to the doctor" |
| `services` | `STATE_INTENTS.MAIN_MENU:28` | "what treatments do you offer for kids" |
| `location` | `STATE_INTENTS.MAIN_MENU:29` | "how do I reach your clinic" |
| `timings` | `STATE_INTENTS.MAIN_MENU:30` | "are you open on sundays" |
| `callback` | `STATE_INTENTS.MAIN_MENU:32` | "can you call me back" |
| `edit_date/edit_time/edit_treatment` | `STATE_INTENTS.BOOKING_CONFIRMATION:36-38` | "actually I wanted evening" |
| `correction_date/correction_time/correction_treatment` | `correction-detector.js` | AI is better at detecting corrections |

### 4c. Which intents are HIGH-RISK?

| Intent | Risk | Why |
|--------|------|-----|
| `confirm` | **HIGH** | Confirming a booking. Wrong classification could book wrong slot. Must have high confidence threshold. |
| `confirm_cancel` | **HIGH** | Cancelling an appointment. AI saying "yes" when user said "no" could lose a booking. |
| `emergency` | **HIGH** | Must never be missed. Keep rule-based as primary, AI as secondary. |
| `provide_date` | **MEDIUM** | Wrong date = wrong booking. But validators catch past dates. |
| `provide_time` | **MEDIUM** | Wrong time = wrong slot. But validators catch invalid slots. |
| `provide_treatment` | **LOW-MEDIUM** | Wrong treatment selected. Reversible. |

### 4d. Confidence thresholds:

| Intent | Min Confidence | Action Below Threshold |
|--------|---------------|----------------------|
| `confirm` | 0.85 | Fallback to rule-based; if rule-based also fails → ask "Did you mean to confirm?" |
| `confirm_cancel` | 0.85 | Fallback + confirmation prompt |
| `emergency` | 0.70 | Always check rule-based too; if either matches → emergency |
| `cancel_appointment` | 0.70 | Fallback + "Did you mean to cancel?" |
| `provide_date` | 0.60 | Fallback to regex validator |
| `provide_time` | 0.60 | Fallback to regex validator |
| `provide_treatment` | 0.50 | Fallback to regex treatment matching |
| All others | 0.40 | Fallback to keyword matching |

### Migration Plan:

1. **Week 1:** Add AI abstraction layer (`src/lib/ai/`). Pipe all messages through both AI and rule-based in parallel. Log discrepancies. Do NOT use AI output yet.
2. **Week 2:** Analyze discrepancies. Adjust prompts. Identify patterns where AI is worse than rules.
3. **Week 3:** Enable AI for low-risk intents (services, location, timings, greeting). Keep high-risk on rules.
4. **Week 4:** Enable AI for medium-risk intents (booking flow). Keep confirm/cancel on rules + high threshold.
5. **Week 5:** Enable AI for all intents with fallback. Monitor. Tune thresholds.

---

## Part 5 — Entity Extraction Migration

### Entity-by-entity analysis:

| Entity | Current Implementation | Recommendation | Why |
|--------|----------------------|---------------|-----|
| **`date`** | `validators.js:71-179` — 108 lines of regex for date parsing | **Move to AI** | Users express dates in infinite ways: "agle mahine ki 5 tarik", "coming Tuesday after next", "parso". Regex misses many. AI parses these naturally. **But: keep `validators.js` for validation** (past date check, horizon check). |
| **`time`** | `validators.js:181-355` — 174 lines of regex | **Hybrid** — AI extracts raw time, regex validates against clinic hours | AI can parse "saade 5 baje" (= 5:30), "around 3" (= 15:00). But slot alignment (`validators.js:329-339`) and clinic hours check (`validators.js:311-355`) MUST remain deterministic. |
| **`treatment`** | `validators.js:357-379` — alias matching | **Move to AI** | Patient describes symptoms ("my tooth hurts when I chew"), not treatment names. AI maps symptoms to treatments. Keep alias matching as fallback. |
| **`phone`** | `validators.js:381-400` — 20 lines | **Keep regex** | Phone format is well-defined (10 digits, +91 prefix). AI would add risk. |
| **`patient name`** | Not explicitly extracted — captured via session profile or free text | **Keep free text** | Name is what the patient says it is. No validation needed beyond sanitization. |

### Hybrid entity extraction design:

```javascript
// In the new AI layer
async function extractEntities(normalized, session) {
  const aiResult = await aiExtractEntities(normalized.textClean);

  const entities = {};

  // Date: AI extracts, regex validates
  if (aiResult.date) {
    const validation = validateDate(aiResult.date); // existing validators.js
    if (validation.valid && validation.parsed) {
      entities.date = validation.parsed;
    }
    // If AI date is invalid, don't use it — let handler ask for clarification
  }

  // Time: AI extracts, regex validates clinic rules
  if (aiResult.time) {
    const validation = validateTime(aiResult.time, entities.date);
    if (validation.valid && validation.parsed) {
      entities.time = validation.parsed;
    }
  }

  // Treatment: AI extracts, fallback to alias matching
  if (aiResult.treatment) {
    const aliasMatch = validateTreatment(aiResult.treatment); // existing
    entities.treatment = aliasMatch.valid ? aliasMatch.parsed : aiResult.treatment;
  }

  // Phone: always regex
  if (aiResult.phone) {
    const validation = validatePhone(aiResult.phone);
    if (validation.valid) entities.phone = validation.parsed;
  }

  return entities;
}
```

**Key principle:** AI extracts the **raw value**, regex **validates against business rules**. Never let AI bypass clinic hours, past dates, or phone format rules.

---

## Part 6 — Agentic Readiness

### 6a. Is this system already secretly an orchestration engine?

**Yes, it is.** The `engine.js` pipeline is an orchestration engine:

```
engine.js line 177-388:
  classifyEvent → deduplicate → normalizeMessage → loadSession
  → classifyIntent → extractEntities → detectCorrection
  → evaluateOverwrite → handle → save → respond
```

This is **exactly** an orchestration DAG (Directed Acyclic Graph). Each step is a pure function or async function that takes input, does one thing, and passes output to the next step. The pipeline supports early termination via `PIPELINE_HALT` (line 14).

**The key difference from an agent framework:** Today these steps are hardcoded and sequential. In an agent system, the agent would decide which step to call and in what order.

### 6b. Does the current state machine map naturally to tool calling?

**Yes, very naturally.** The state machine is already a tool selection mechanism:

| Current State Machine | Agent Tool Calling Equivalent |
|----------------------|------------------------------|
| State = `MAIN_MENU` | Agent decides: book? info? cancel? |
| Intent = `appointment` | Agent calls `checkAvailability()` |
| Intent = `provide_date` | Agent calls `validateDate()` → `updateContext()` |
| Intent = `provide_time` | Agent calls `validateTime()` → `checkSlotAvailable()` |
| Intent = `confirm` | Agent calls `bookAppointment()` |
| Intent = `cancel_appointment` | Agent calls `getAppointments()` → `cancelAppointment()` |
| Intent = `reschedule` | Agent calls `getAppointments()` → `cancelAppointment()` → `checkAvailability()` → `bookAppointment()` |

The transition table (`transitions.js:22-161`) is essentially a **tool routing table**. Each `(state, intent) → nextState` maps to a specific handler function.

### 6c. Which handlers should become tools?

Based on the existing state handlers in `handlers.js`, these are the natural tool boundaries:

| Tool Name | Triggered By | Input | Output | Dependencies |
|-----------|-------------|-------|--------|-------------|
| **`checkSlots(date)`** | `provide_date` | date (Date) | Array of available time slots | `appointmentRepository.getAppointmentsByDate()` |
| **`bookAppointment(waId, date, time, treatment, patientName)`** | `confirm` | booking details | Appointment object or error | `appointmentRepository.createAppointment()`, `session.js` |
| **`cancelAppointment(appointmentId, reason)`** | `confirm_cancel` | appointmentId, reason | Success/error | `appointmentRepository.cancelAppointment()` |
| **`rescheduleAppointment(oldAppointmentId, newDate, newTime)`** | reschedule flow | appointmentId, date, time | New appointment object | `cancelAppointment()` + `bookAppointment()` |
| **`getPatientAppointments(waId)`** | `my_appointments` | waId | Array of appointments | `appointmentRepository.getByWaId()` |
| **`validateDate(text)`** | `provide_date` | text | { valid, parsed } | `validators.js:71-179` |
| **`validateTime(text, date)`** | `provide_time` | text, date | { valid, parsed } | `validators.js:181-355` |
| **`validateTreatment(text)`** | `provide_treatment` | text | { valid, parsed } | `validators.js:357-379` |
| **`sendMessage(waId, message)`** | Any handler | waId, message | Message ID | `whatsapp.js` |
| **`getClinicInfo()`** | `services`, `location`, `timings` | — | Clinic info object | `config/clinic.js` |
| **`saveSession(session)`** | After any change | session object | Updated session | `session.js:199-214` |
| **`createPatient(waId, name, phone)`** | Registration | Patient details | Patient ID | `patientRepository` |

These 12 tools cover all current functionality. **Note:** These are NOT LangChain tools — they are plain async functions with typed inputs/outputs.

---

## Part 7 — Reception Agent Design

### 7a. System Prompt (when building the single agent):

You specifically said you want ONE agent, not multiple. So here is the exact design:

```
You are a dental clinic receptionist AI for Shri Balaji Dental Clinic.

Your job is to help patients book, reschedule, or cancel appointments.

CONSTRAINTS:
1. You do NOT diagnose medical conditions. If a patient describes symptoms, suggest a treatment category.
2. You do NOT handle emergencies. If patient mentions emergency keywords, escalate immediately.
3. You do NOT modify confirmed bookings directly — use the edit flow.
4. You do NOT give medical advice.

AVAILABLE TOOLS:
- checkSlots(date) → available times
- bookAppointment(waId, date, time, treatment, patientName) → confirmation
- cancelAppointment(appointmentId, reason) → cancellation
- getPatientAppointments(waId) → list of appointments
- sendMessage(waId, message) → send message to patient
- getClinicInfo() → hours, location, services
- escalateToHuman(waId, context) → transfer to staff

PROCESS:
1. Understand what the patient wants
2. Collect all required information (treatment, date, time, name, phone)
3. Confirm with patient before booking
4. Book the appointment
5. Ask if they need anything else

If at any point you are unsure or the patient is frustrated, escalate to human.

Keep responses concise and friendly. Be bilingual (English + Hindi).
```

### 7b. What tools should it have?

The 12 tools from Part 6, plus:

| Tool | Why | When to Call |
|------|-----|-------------|
| `escalateToHuman(waId, reason, context)` | Patient wants to talk to staff | On escalate intent or frustration detection |
| `updateBookingContext(field, value)` | Track partially collected data | After each entity extraction |
| `sendButtons(waId, text, buttons)` | Interactive menus | For treatment selection, confirmation dialogues |

### 7c. What memory should it access?

The agent should access, but NOT write:

| Data | Source | Read Access? | Write Access? |
|------|--------|-------------|--------------|
| Current session state | `session.state` | ✅ Yes | ❌ No (handler manages) |
| Current booking context | `session.context.booking` | ✅ Yes | ✅ Yes (via updateBookingContext tool) |
| Recent messages (last 5) | `session.context.recentMessages` | ✅ Yes | ✅ Yes (appends automatically) |
| Patient name | `session.profileName` | ✅ Yes | ✅ Yes |
| Patient's existing appointments | DB query via `getPatientAppointments` | ✅ Yes | ❌ No |
| Clinic config | `config/clinic.js` | ✅ Yes | ❌ No |
| Available treatments | `config/clinic.js:treatments` | ✅ Yes | ❌ No |

### 7d. What actions must remain deterministic?

| Action | Why Must Be Deterministic |
|--------|--------------------------|
| **Slot availability check** | Can't hallucinate an available slot. Must query DB. |
| **Appointment creation** | DB write. Must use `appointmentRepository.createAppointment()`. |
| **Appointment cancellation** | DB write. Must use `appointmentRepository.cancelAppointment()`. |
| **Phone number validation** | Wrong number = can't contact patient. Use regex. |
| **State transitions** | Must follow `transitions.js`. |
| **Overwrite policy** | Must follow `overwrite-policy.js`. |
| **WhatsApp message sending** | Must use `whatsapp.js`. |
| **Emergency detection** | Must always catch. Keep keyword check as safety net. |

**The pattern:** AI decides WHAT to do, deterministic code does HOW to do it.

---

## Part 8 — Risk Analysis

### 8a. Where AI can break bookings

| Risk | Scenario | File/Function | Impact | Mitigation |
|------|----------|---------------|--------|------------|
| **Wrong date** | AI extracts "next Friday" but means "this Friday" | `validators.js` bypassed | Wrong date booked | Always pass AI-extracted dates through `validateDate()`; reject past dates |
| **Double booking** | AI calls `bookAppointment` without checking slot availability | `handlers.js` confirm handler | Overbooked slot | Slot availability check must be a separate tool that AI calls BEFORE booking |
| **Wrong patient** | AI incorrectly matches phone number | `session.js:150-197` | Appointment linked to wrong patient | Phone validation stays regex-based; patient lookup stays deterministic |
| **Premature confirmation** | AI confirms booking when info is incomplete | `handlers.js` BOOKING_CONFIRMATION handler | Appointment with missing treatment | Accumulate entities logic (`entities.js:58-89`) stays; handler checks all fields before confirming |
| **Treatment mismatch** | AI maps "pain" to Root Canal when it's actually a filling | `validators.js:357-379` | Wrong treatment booked | AI suggests, but handler must ask patient to confirm treatment selection |
| **Midnight time confusion** | AI parses "12 PM" as 00:00 instead of 12:00 | `validators.js:181-355` | Wrong time slot | Time validation stays regex-based for AM/PM parsing; AI outputs raw text, regex parses |
| **Hallucinated clinic info** | AI tells patient "we open at 9 AM" when clinic opens at 10 | `handlers.js` INFO handlers | Patient shows up too early | Clinic info responses stay template-based from `translations.js`; AI routes to info handler, doesn't generate |

### 8b. Where AI can create wrong appointments

| Scenario | Where | Risk Level | Safeguard |
|----------|-------|------------|-----------|
| AI hallucinates an appointment without creating it in DB | N/A (tool-based) | **Low** | `bookAppointment` tool does the actual DB insert |
| AI creates appointment but doesn't confirm with patient | `confirm` intent | **MEDIUM** | Handler checks `session.state === 'BOOKING_CONFIRMATION'` before booking |
| AI doesn't check slot availability before booking | `bookAppointment` tool | **MEDIUM** | Tool internally checks availability before insert |
| AI stores wrong patientPhone and can't send confirmation | `session.context.booking.patientPhone` | **LOW** | Phone goes through `validatePhone()` |
| AI skips treatment selection | `pendingFields` accumulation | **LOW** | `computePendingFields()` checks all required fields before booking |

### 8c. Where AI should never have direct control

| Component | Why AI Must Not Control |
|-----------|------------------------|
| **Database writes** (`repositories/*`) | Must use deterministic tools with validation |
| **State transitions** (`transitions.js:22-161`) | Must follow predefined transition table |
| **Overwrite policy** (`overwrite-policy.js:37-102`) | Must follow business rules |
| **Phone number validation** (`validators.js:381-400`) | Must be exact |
| **WhatsApp API calls** (`whatsapp.js`) | Must be exact API calls |
| **Emergency detection** | Must always match — AI may miss |
| **Confirmation flow** ("Are you sure?") | Must always ask before final booking |

### Mitigation architecture:

```
                    ┌──────────────────────┐
Patient Message ──→ │   AI Classifier       │
                    │ (intent + entities)   │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │   Validation Layer    │ ← validators.js (untouched)
                    │ - date/time validation│
                    │ - phone validation    │
                    │ - clinic hours check  │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │   Policy Layer        │ ← overwrite-policy.js (untouched)
                    │ - can overwrite?      │
                    │ - requires edit flow? │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │   State Machine       │ ← transitions.js (untouched)
                    │ - valid transition?   │
                    │ - next state?         │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │   Handler / Tool      │ ← handlers.js / tools (deterministic)
                    │ - DB operations       │
                    │ - WhatsApp API calls  │
                    └──────────────────────┘
```

**AI only touches the top layer.** Everything below is the existing deterministic engine.

---

## Part 9 — Final Recommendation

### Verdict: **Option B — Add Gemini for understanding only**

**I strongly recommend Option B** for the following reasons, based on actual code analysis:

**Why NOT Option A (Stay rule-based):**
- The current regex-based router (`router.js:6-22`) and validators (`validators.js:71-355`) are brittle. Date parsing alone is 108 lines. Time parsing is 174 lines. Every new Hindi/Hinglish expression requires a code change.
- The correction detector (`correction-detector.js:9-27`) has 15 regex patterns. Real patients say things AI handles naturally that these patterns miss.
- You already have replay tests (`scripts/replay.js`) — the perfect safety net for AI integration.

**Why NOT Option C (Single receptionist agent):**
- `handlers.js` is ~8,000 lines with 40 state handlers. An agent making tool-calling decisions at this stage would produce unpredictable outcomes.
- The state machine (`transitions.js:22-161`) works. Replacing it with an agent decision loop would trade predictability for flexibility — the wrong trade for a medical receptionist.
- Risk of hallucinated appointments, wrong cancellations, and patient confusion is too high at this stage.

**Why NOT Option D (Multi-agent):**
- The system is single-tenant, single-process, in-memory state. Multi-agent requires distributed state, message queues, and event buses — all absent.
- Premature optimization. Build the single-agent understanding layer first.

**Why Option B is the right choice:**

The system already has a working, battle-tested deterministic engine. The weakest part is **understanding what the patient means**. This is exactly what Gemini is best at.

| Current Weakness | Gemini Fix | Code Impact |
|-----------------|------------|-------------|
| Date parsing regex misses edge cases (`validators.js:71-179`) | AI understands "agle mahine ki 5 tarik" | Minimal — add AI call before validateDate |
| Treatment mapping misses symptom descriptions (`validators.js:357-379`) | AI maps "my tooth hurts when I eat cold" to Root Canal | Minimal — add AI entity extraction |
| Correction detection misses patterns (`correction-detector.js:9-27`) | AI naturally understands "no I meant Tuesday" | Minimal — correction in AI response |
| Intent classification misses intent in complex sentences (`router.js:217-301`) | AI understands "I need to reschedule my appointment for next week" | Minimal — AI intent replaces router.js |

**Concrete migration steps:**

1. **Create `src/lib/ai/`** (3 days) — provider abstraction, Gemini implementation, mock for replay tests
2. **Instrument `engine.js`** (1 day) — add parallel AI + rule-based classification at line 244; log discrepancies; don't use AI output yet
3. **Run replay tests** (1 day) — `scripts/replay.js` will show exactly where AI disagrees with rules
4. **Iterate on prompt** (3 days) — fix false positives, add edge cases
5. **Enable AI for low-risk intents** (1 day) — services, location, timings
6. **Enable AI for booking intents** (3 days) — provide_date, provide_time, provide_treatment with validation layer
7. **Enable AI for high-risk intents** (1 week) — confirm, cancel — with confidence thresholds
8. **Monitor** (ongoing) — log all AI decisions, run replay tests weekly

**Total time to production AI:** 3-4 weeks. **Total risk:** Low — every AI decision is validated by existing deterministic code before any action is taken.
