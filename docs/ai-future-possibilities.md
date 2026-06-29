# AI Future Possibilities

All features build on the existing local AI stack (Ollama + Qwen 2.5-coder + MiniCPM-V + Whisper). Zero cloud API costs.

---

## 1. Semantic Search over Clinical Notes

Replace PostgreSQL ILIKE with vector embeddings (pgvector).

- Embed patient notes, diagnoses, prescriptions into `vector(768)` columns
- Natural language querying: *"find patients with persistent gum bleeding"*, *"patients who had root canal last year"*
- Dashboard search bar returns ranked results by cosine similarity
- **Prerequisite**: Install pgvector extension on Neon, generate embeddings via Ollama (nomic-embed-text or similar)

## 2. RAG for Treatment Recommendations

Embed procedure codes + clinical guidelines + historical outcomes.

- When a dentist diagnoses a tooth, surface relevant treatment protocols, success rates, estimated costs from historical data
- **Input**: tooth number + diagnosis → **Output**: ranked treatment options with clinic-specific success stats
- Chroma or in-memory vector store; no external infra needed

## 3. Predictive Analytics

### No-Show Prediction
- Features: appointment time, day of week, patient history, lead time, weather, prior no-shows
- Train a small model (XGBoost or logistic regression) on appointment data
- Dashboard shows risk badge (High/Medium/Low) on each appointment

### Treatment Duration Estimation
- Learn from completed step times in `treatment_plan_steps`
- Predict total duration per procedure code per tooth type
- Smart scheduling: auto-slot allocation based on predicted time

### Payment Default Prediction
- Features: outstanding history, payment mode preference, visit frequency, amount
- Attention Panel surfaces high-risk accounts proactively

## 4. AI-Assisted Diagnosis from Symptoms

Patient describes symptoms via WhatsApp → AI suggests possible diagnoses + urgency.

- Use Qwen to classify symptom text into structured findings
- Map to FDI tooth numbers + common conditions (caries, pulpitis, abscess, gingivitis)
- Urgency triage: Emergency (same day) / Urgent (48h) / Routine (schedule)
- Dentist reviews suggestion on dashboard before it becomes a diagnosis
- **Pipeline**: WhatsApp → Kali Gateway `/understand` (extended with diagnosis intent) → Dashboard notification

## 5. Voice-First Clinical Notes

Expand beyond `LOG_NOTES` WhatsApp state to real-time transcription during patient visits.

- Dentist speaks notes during procedure → Whisper transcribes → Qwen structures into SOAP format (Subjective, Objective, Assessment, Plan)
- Auto-suggest ICD codes from transcribed text
- One-tap save to visit notes with structured sections
- **Integration point**: Dashboard visit page with record button using MediaRecorder API

## 6. Automated Follow-up Generation

AI drafts personalized follow-up messages based on treatment plan + last visit outcome.

- **Input**: patient name, procedure, tooth, outcome, follow-up date
- **Output**: ready-to-send WhatsApp message in clinic's tone (Hindi/English/Hinglish)
- Dentist reviews/edits in one click from the Attention Panel or Visit page
- Supports template pre-approval: dentist sets a preferred template once, AI fills variables

## 7. Multi-Language Expansion

Beyond Hindi/Hinglish: Marathi, Gujarati, Tamil, Kannada, Bengali.

- Qwen 2.5-coder already supports multilingual instruction following
- Add language detection → route to language-specific intent patterns
- Response generation in patient's detected language
- **No new models needed** — prompt engineering + testing with fixture corpus

## 8. Image Analysis on Uploaded Photos

Beyond OCR text extraction — detect dental conditions from clinical photos.

- Use MiniCPM-V or a fine-tuned vision model to detect:
  - Caries (location, severity)
  - Gum inflammation / recession
  - Abscess / swelling
  - Fractured / missing teeth
- Map findings to FDI tooth numbers automatically
- Pre-populate `tooth_diagnoses` JSONB for dentist approval
- **Pipeline**: Upload → dhara-worker → vision model → structured findings → dashboard review

## 9. Smart Scheduling

Optimize appointment booking with AI assistance.

- Predict optimal appointment duration per treatment type + patient history
- Auto-suggest available slots matching required duration
- Detect scheduling conflicts (same tooth booked for conflicting procedures)
- Suggest contiguous blocks for multi-step treatments (e.g., RCT needs 3 visits)
- **Integration**: Calendar component (MonthView/WeekView) highlights recommended slots

## 10. Conversation Analytics

Aggregate WhatsApp conversations for clinic intelligence.

- Topic clustering: what do patients ask about most? (timings, fees, emergency, procedures)
- Sentiment trends: frustrated vs satisfied patients over time
- Abandonment analysis: at which conversation step do patients drop off?
- Response time tracking: how fast does the clinic reply?
- Dashboard insights widget with weekly/monthly trends
- **Data source**: `sessions` table conversation logs (already stored) + AI classification

---

## Infrastructure Notes

- All features run on the existing stack: Ollama (11434) + Kali Gateway (3002) + dhara-worker
- No external API costs — everything is local models
- pgvector requires a one-time Neon extension enablement (`CREATE EXTENSION vector;`)
- Most features follow the same pipeline pattern: trigger → worker → AI → structured output → dashboard review → approve/deny
- The extraction approval flow (OCR → extraction → approve → timeline events) is the template for all new AI features
