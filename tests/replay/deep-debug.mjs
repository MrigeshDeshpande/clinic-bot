// ───────────────────────────────────────────────
// Deep debug — trace session state at each step
// ───────────────────────────────────────────────
import { processEvent } from '../../src/lib/engine.js';
import { getOrCreate } from '../../src/lib/session.js';

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

async function deepDebug(messages) {
  const waId = makeWaId('deep_debug_test');
  
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (i > 0) await new Promise(r => setTimeout(r, 10));

    // Check session state BEFORE processing
    const beforeSession = await getOrCreate(waId, 'test', 'Test');
    console.log(`\n[BEFORE msg ${i}] waId=${waId} state=${beforeSession.state} msg="${msg.text}"`);

    const payload = simulateMessage(waId, msg.text, msg.type || 'text');
    const result = await processEvent(payload);
    
    if (result && result.steps) {
      const step = result.steps[result.steps.length - 1];
      const intentMatch = step.intent === msg.intent ? '✓' : '✗';
      console.log(`[AFTER  msg ${i}] state=${step.state} prev=${step.previousState} intent=${step.intent} (expected=${msg.intent}) ${intentMatch}`);
    }

    // Check session state AFTER processing
    const afterSession = await getOrCreate(waId, 'test', 'Test');
    console.log(`[CACHE  msg ${i}] waId=${waId} state=${afterSession.state}`);
  }
}

// Test Repeated Greetings
console.log('=== REPEATED GREETINGS DEEP DEBUG ===');
await deepDebug([
  { text: 'Hi',    intent: 'greeting' },
  { text: 'Hello', intent: 'greeting' },
  { text: 'Hey',   intent: 'greeting' },
  { text: 'Book',  intent: 'appointment' },
]);

// Wait a moment then test correction flow
await new Promise(r => setTimeout(r, 100));

console.log('\n\n=== CORRECTION FLOW DEEP DEBUG ===');
await deepDebug([
  { text: 'Hi',               intent: 'greeting' },
  { text: 'Book appointment', intent: 'appointment' },
  { text: 'Tomorrow',         intent: 'provide_date' },
  { text: 'Actually Wednesday', intent: 'correction_date' },
]);

// Wait a moment then test back nav
await new Promise(r => setTimeout(r, 100));

console.log('\n\n=== BACK NAV DEEP DEBUG ===');
await deepDebug([
  { text: 'Hi',     intent: 'greeting' },
  { text: 'Book',    intent: 'appointment' },
  { text: 'Tomorrow', intent: 'provide_date' },
  { text: '10am',     intent: 'provide_time' },
  { text: 'Back',     intent: 'back' },
  { text: '2pm',      intent: 'provide_time' },
]);
