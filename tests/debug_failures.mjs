// Debug script — trace full pipeline for failing fixtures
import { processEvent } from '../src/lib/engine.js';
import { FIXTURES } from './replay/fixtures.js';

process.env.REPLAY_MODE = 'true';
process.env.LOG_LEVEL = 'error';

let counter = 9000;

function makeWaId() {
  return 'dbg_' + (counter++);
}

function simulateMessage(waId, text) {
  const msgId = `dbg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return {
    object: 'whatsapp_business_account',
    entry: [{
      changes: [{
        value: {
          messaging_product: 'whatsapp',
          metadata: { phone_number_id: 'dbg_phone' },
          contacts: [{ profile: { name: 'Debug User' } }],
          messages: [{
            id: msgId,
            from: waId,
            type: 'text',
            timestamp: String(Math.floor(Date.now() / 1000)),
            text: { body: text },
          }],
        },
      }],
    }],
  };
}

// Run a fixture exactly as the runner would
async function runFixture(fixture) {
  console.log(`\n===== ${fixture.name} =====`);
  const waId = makeWaId();

  for (let i = 0; i < fixture.messages.length; i++) {
    const msg = fixture.messages[i];
    if (i > 0) await new Promise(r => setTimeout(r, 5));
    const payload = simulateMessage(waId, msg.text);

    try {
      const result = await processEvent(payload);
      const step = result?.steps?.[result.steps.length - 1] || {};
      const status = step.error ? `ERROR: ${step.error}` : `intent:${step.intent} state:${step.state}`;
      console.log(`  [${i}] "${msg.text}" → expected:${msg.intent} | actual: ${status}`);
    } catch (err) {
      console.log(`  [${i}] "${msg.text}" → EXCEPTION: ${err.message}`);
    }
  }
}

// Run failing fixtures
const names = [
  'Invalid Then Corrected Input',
  'Back Navigation Through Booking',
  'Correction At Confirmation Step',
  'Contradictory Rapid Messages',
  'Escalation During Booking',
  'Repeated Greetings',
];

async function main() {
  for (const name of names) {
    const fixture = FIXTURES.find(f => f.name === name);
    if (fixture && !fixture.skip) {
      await runFixture(fixture);
    }
  }
}

main().catch(console.error).then(() => {
  console.log('\nDone.');
  process.exit(0);
});
