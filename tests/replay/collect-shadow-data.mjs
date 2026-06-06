// Shadow data collection — runs all fixtures through engine with Gemini active
// Compares rule vs AI classification and stores results in shadow_logs table

process.env.LOG_LEVEL = 'error';
process.env.SHADOW_MODE = 'true';
process.env.SHADOW_SAMPLE_RATE = '1';

const { processEvent } = await import('../../src/lib/engine.js');
const { runMigrations, getSql } = await import('../../src/db/pool.js');
const { clearSessionCache } = await import('../../src/lib/session.js');
const { FIXTURES } = await import('./fixtures.js');

await runMigrations().catch(() => {});

let fixtureCounter = 10000;
function makeWaId(fixture) {
  if (fixture?.waId) return fixture.waId;
  if (fixture?.role === 'doctor') return 'r_doctor';
  const id = fixtureCounter++;
  return 'r_' + id;
}

function simulateMessage(waId, text, type = 'text', interactiveId = null) {
  const msgId = `rm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = Math.floor(Date.now() / 1000);
  const isInteractive = type === 'interactive';
  return {
    object: 'whatsapp_business_account',
    entry: [{
      changes: [{
        value: {
          messaging_product: 'whatsapp',
          metadata: { phone_number_id: 'replay_phone_id' },
          contacts: [{ profile: { name: 'Replay User' } }],
          messages: [{
            id: msgId, from: waId, type, timestamp: String(now),
            text: type === 'text' ? { body: text } : undefined,
            interactive: isInteractive ? {
              list_reply: { id: interactiveId || 'unknown_id', title: text || 'Selection' },
            } : undefined,
          }],
        },
      }],
    }],
  };
}

// Clean up existing fixture sessions
await getSql()`
  DELETE FROM shadow_logs WHERE wa_id LIKE 'r_%'
`.catch(() => {});

for (const fixture of FIXTURES) {
  if (fixture.skip) continue;
  const waId = makeWaId(fixture);
  clearSessionCache();

  for (let i = 0; i < fixture.messages.length; i++) {
    const msg = fixture.messages[i];
    if (i > 0) await new Promise(r => setTimeout(r, 5));
    const payload = simulateMessage(waId, msg.text, msg.type || 'text', msg.interactiveId || null);
    try {
      await processEvent(payload);
    } catch (e) {
      // Ignore per-message errors
    }
  }
}

// Report results
const sql = getSql();
const [count] = await sql`SELECT COUNT(*)::int AS total FROM shadow_logs WHERE wa_id LIKE 'r_%'`;
console.log('Total shadow entries collected:', count.total);

if (count.total > 0) {
  const [stats] = await sql`
    SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE matched = TRUE)::int AS matches,
      COUNT(*) FILTER (WHERE matched = FALSE)::int AS disagreements,
      ROUND((COUNT(*) FILTER (WHERE matched = TRUE)::numeric / NULLIF(COUNT(*), 0) * 100), 1) AS agreement_rate
    FROM shadow_logs WHERE wa_id LIKE 'r_%'
  `;
  console.log(`Agreement: ${stats.agreement_rate}% (${stats.matches} match, ${stats.disagreements} disagree of ${stats.total})`);

  const breakdown = await sql`
    SELECT rule_intent, COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE matched = TRUE)::int AS matches,
      ROUND((COUNT(*) FILTER (WHERE matched = TRUE)::numeric / NULLIF(COUNT(*), 0) * 100), 1) AS accuracy
    FROM shadow_logs WHERE wa_id LIKE 'r_%'
    GROUP BY rule_intent ORDER BY total DESC LIMIT 15
  `;
  console.log('\nIntent breakdown:');
  for (const r of breakdown) {
    console.log(`  ${r.rule_intent}: ${r.total} (${r.matches} match, ${r.accuracy}% acc)`);
  }

  const patterns = await sql`
    SELECT rule_intent, ai_intent, COUNT(*)::int AS count
    FROM shadow_logs WHERE matched = FALSE AND wa_id LIKE 'r_%'
    GROUP BY rule_intent, ai_intent HAVING COUNT(*) >= 2 ORDER BY count DESC LIMIT 10
  `;
  if (patterns.length > 0) {
    console.log('\nRecurring disagreement patterns:');
    for (const p of patterns) {
      console.log(`  Rule:${p.rule_intent} → AI:${p.ai_intent} (${p.count}x)`);
    }
  }

  const samples = await sql`
    SELECT message_text, rule_intent, ai_intent, ai_confidence
    FROM shadow_logs WHERE matched = FALSE AND wa_id LIKE 'r_%'
    ORDER BY created_at DESC LIMIT 15
  `;
  console.log('\nSample disagreements:');
  for (const s of samples) {
    console.log(`  "${s.message_text}" → rule=${s.rule_intent} ai=${s.ai_intent} (conf=${s.ai_confidence})`);
  }
}

process.exit(0);
