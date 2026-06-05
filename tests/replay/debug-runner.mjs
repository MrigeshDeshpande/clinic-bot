// ───────────────────────────────────────────────
// Debug runner — traces actual vs expected intents
// ───────────────────────────────────────────────
import { processEvent } from '../../src/lib/engine.js';

process.env.REPLAY_MODE = 'true';
process.env.LOG_LEVEL = 'error';

function makeWaId(name) {
  const slug = name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  return 'r' + slug.slice(-14);
}

function simulateMessage(waId, text, type = 'text') {
  const msgId = `rm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = Math.floor(Date.now() / 1000);
  return {
    object: 'whatsapp_business_account',
    entry: [{
      changes: [{
        value: {
          messaging_product: 'whatsapp',
          metadata: { phone_number_id: 'replay_phone_id' },
          contacts: [{ profile: { name: 'Replay User' } }],
          messages: [{
            id: msgId,
            from: waId,
            type,
            timestamp: String(now),
            text: type === 'text' ? { body: text } : undefined,
          }],
        },
      }],
    }],
  };
}

async function debugFixture(name, messages) {
  const waId = makeWaId(name);
  console.log(`\n=== ${name} ===`);
  
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (i > 0) await new Promise(r => setTimeout(r, 10));
    
    const payload = simulateMessage(waId, msg.text, msg.type || 'text');
    try {
      const result = await processEvent(payload);
      if (result && result.steps) {
        const step = result.steps[result.steps.length - 1];
        const intentMatch = step.intent === msg.intent ? '✓' : '✗';
        console.log(`  [${i}] ${intentMatch} text="${msg.text}" expected="${msg.intent}" actual="${step.intent || 'null'}" state="${step.state || 'null'}" prevState="${step.previousState || 'null'}" src="${step.intentSource || '?'}"`);
      } else if (result) {
        console.log(`  [${i}] ? text="${msg.text}" expected="${msg.intent}" result=${JSON.stringify(result)}`);
      } else {
        console.log(`  [${i}] ? text="${msg.text}" expected="${msg.intent}" result=null`);
      }
    } catch (e) {
      console.log(`  [${i}] ! text="${msg.text}" expected="${msg.intent}" ERROR: ${e.message}`);
    }
  }
}

// ── Correction flow (failing) ──
await debugFixture('Correction Flow', [
  { text: 'Hi',               intent: 'greeting' },
  { text: 'Book appointment', intent: 'appointment' },
  { text: 'Tomorrow',         intent: 'provide_date' },
  { text: 'Actually Wednesday', intent: 'correction_date' },
  { text: '2pm',              intent: 'provide_time' },
  { text: 'Root canal',       intent: 'provide_treatment' },
  { text: 'Confirm',          intent: 'confirm' },
]);

// ── Correction with "No" prefix ──
await debugFixture('No Evening', [
  { text: 'Hi',        intent: 'greeting' },
  { text: 'Book',       intent: 'appointment' },
  { text: 'Tomorrow',   intent: 'provide_date' },
  { text: '10am',       intent: 'provide_time' },
  { text: 'No evening', intent: 'correction_time' },
]);

// ── Repeated greetings ──
await debugFixture('Repeated Greetings', [
  { text: 'Hi',    intent: 'greeting' },
  { text: 'Hello', intent: 'greeting' },
  { text: 'Hey',   intent: 'greeting' },
  { text: 'Book',  intent: 'appointment' },
]);

// ── Fragmented messages ──
await debugFixture('Fragmented', [
  { text: 'Hi',    intent: 'greeting' },
  { text: 'Book',  intent: 'appointment' },
  { text: 'Tomorrow', intent: 'provide_date' },
  { text: 'after 5',  intent: 'provide_time' },
  { text: 'RCT',      intent: 'provide_treatment' },
]);

// ── Back navigation ──
await debugFixture('Back Nav', [
  { text: 'Hi',     intent: 'greeting' },
  { text: 'Book',    intent: 'appointment' },
  { text: 'Tomorrow', intent: 'provide_date' },
  { text: '10am',     intent: 'provide_time' },
  { text: 'Back',     intent: 'back' },
  { text: '2pm',      intent: 'provide_time' },
  { text: 'Braces',   intent: 'provide_treatment' },
  { text: 'Confirm',  intent: 'confirm' },
]);

// ── Contradictory rapid ──
await debugFixture('Contradictory Rapid', [
  { text: 'Hi',     intent: 'greeting' },
  { text: 'Book',    intent: 'appointment' },
  { text: 'Tomorrow', intent: 'provide_date' },
  { text: '10am',     intent: 'provide_time' },
  { text: '2pm',      intent: 'provide_time' },
  { text: 'Cleaning', intent: 'provide_treatment' },
]);
