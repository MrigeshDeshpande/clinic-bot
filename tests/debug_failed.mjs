import { processEvent } from '../src/lib/engine.js';
import { runMigrations, getSql } from '../src/db/pool.js';

process.env.REPLAY_MODE = 'true';
process.env.LOG_LEVEL = 'error';

await runMigrations().catch(() => {});

function makeMsg(waId, text, i) {
  const msgId = `dbg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = Math.floor(Date.now() / 1000) + i;
  return {
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ value: {
      messaging_product: 'whatsapp',
      metadata: { phone_number_id: 'dbg_phone' },
      contacts: [{ profile: { name: 'Debug User' } }],
      messages: [{
        id: msgId,
        from: waId,
        type: 'text',
        timestamp: String(now),
        text: { body: text },
      }],
    }}]}],
  };
}

const waId = 'debug_fail_' + Date.now();

// Clean up any previous session
const sql = getSql();
if (sql) {
  await sql`DELETE FROM sessions WHERE wa_id = ${waId}`.catch(() => {});
  await sql`DELETE FROM messages WHERE wa_id = ${waId}`.catch(() => {});
}

// Fixture 9: Invalid Then Corrected Input
const messages = ['Hi','Book','Banana','Tomorrow',"O'clock",'10am','Zebra','cleaning','Confirm'];

for (let i = 0; i < messages.length; i++) {
  if (i > 0) await new Promise(r => setTimeout(r, 10));
  const payload = makeMsg(waId, messages[i], i);
  console.log(`\n--- Step ${i}: "${messages[i]}" ---`);
  try {
    const result = await processEvent(payload);
    if (result && result.steps) {
      const s = result.steps[result.steps.length - 1];
      console.log(`  Intent: ${s.intent}`);
      console.log(`  State: ${s.state} (prev: ${s.previousState})`);
      console.log(`  Entities: ${JSON.stringify(s.entities)}`);
      if (s.error) console.log(`  ERROR: ${s.error}`);
    } else {
      console.log(`  No steps returned`);
    }
  } catch(e) {
    console.log(`  EXCEPTION: ${e.stack || e.message}`);
  }
}

console.log('\n--- Done ---');
process.exit(0);
