// ───────────────────────────────────────────────
// AI vs Rule Replay Comparison
//
// Feeds all conversation fixtures through both the
// rule-based classifier and the AI gateway, then
// reports agreement rate, language breakdown, and
// top disagreement patterns.
//
// Usage:
//   KALI_AI_URL=http://100.100.74.71:3002 node \
//     --experimental-loader ../replay/path-loader.js \
//     tests/ai/replay-compare.js
//
//   KALI_AI_URL=http://localhost:3002 node \
//     --experimental-loader ../replay/path-loader.js \
//     tests/ai/replay-compare.js
//
// No DB writes. No production impact.
// ───────────────────────────────────────────────

import { classifyIntent } from '@/lib/router';
import { understand as gatewayUnderstand } from '@/lib/ai/gateway';
import { FIXTURES } from '../replay/fixtures.js';
// LOG_LEVEL=error is set via env (default is 'info')

async function main() {
  const args = process.argv.slice(2);
  const listOnly = args.includes('--list');
  const filter = args.find(a => a.startsWith('--fixture='))?.split('=')[1] || null;

  const fixturesToRun = filter
    ? FIXTURES.filter(f => f.name === filter)
    : FIXTURES.filter(f => !f.skip);

  if (listOnly) {
    console.log('\nAvailable Fixtures:\n');
    fixturesToRun.forEach(f => console.log(`  ${f.name}`));
    console.log(`\nTotal: ${fixturesToRun.length}\n`);
    return;
  }

  const results = [];
  let totalMatches = 0;
  let totalMessages = 0;
  const languageCounts = {};
  const disagreementPatterns = {};

  console.log('\nAI vs Rule Replay Comparison\n');
  console.log('-'.repeat(70));

  for (const fixture of fixturesToRun) {
    const name = fixture.name;
    const messages = fixture.messages;

    let step = 0;
    for (const msg of messages) {
      step++;
      totalMessages++;

      const normalized = {
        textClean: msg.text || '',
        textLower: (msg.text || '').toLowerCase(),
        type: msg.type || 'text',
        interactiveId: null,
        waId: `replay_compare_${step}`,
      };

      const session = {
        state: 'IDLE',
        context: {
          role: fixture.role || 'patient',
          booking: {},
        },
      };

      // Rule classification
      const ruleResult = classifyIntent(normalized, session);

      // AI classification
      let aiResult;
      try {
        aiResult = await gatewayUnderstand({ normalized, session });
      } catch (error) {
        aiResult = { intent: 'error', entities: {}, source: 'error', confidence: 0 };
      }

      const matched = ruleResult.intent === aiResult.intent;
      if (matched) totalMatches++;

      const language = aiResult.language || 'unknown';
      if (!languageCounts[language]) languageCounts[language] = 0;
      languageCounts[language]++;

      if (!matched) {
        const key = `${ruleResult.intent} → ${aiResult.intent}`;
        if (!disagreementPatterns[key]) disagreementPatterns[key] = 0;
        disagreementPatterns[key]++;

        results.push({
          fixture: name,
          step,
          text: msg.text,
          ruleIntent: ruleResult.intent,
          aiIntent: aiResult.intent,
          language,
        });
      }

      // Advance session state based on expected intent for subsequent messages
      if (msg.intent === 'appointment' || msg.intent === 'book') {
        session.state = 'BOOKING_COLLECTION';
      } else if (msg.intent === 'confirm') {
        session.state = 'BOOKED';
      } else if (msg.intent === 'provide_date' || msg.intent === 'provide_time' || msg.intent === 'provide_treatment') {
        // Stay in BOOKING_COLLECTION
        session.state = 'BOOKING_COLLECTION';
      } else if (msg.intent === 'main_menu') {
        session.state = 'MAIN_MENU';
      } else if (msg.intent === 'cancel' || msg.intent === 'cancel_appointment') {
        session.state = 'MAIN_MENU';
      }
    }
  }

  const agreementRate = totalMessages > 0
    ? ((totalMatches / totalMessages) * 100).toFixed(1)
    : '0.0';

  console.log(`\nResults:`);
  console.log(`  Total messages:  ${totalMessages}`);
  console.log(`  Matches:         ${totalMatches}`);
  console.log(`  Agreement rate:  ${agreementRate}%\n`);

  console.log(`Language breakdown:`);
  for (const [lang, count] of Object.entries(languageCounts).sort((a, b) => b[1] - a[1])) {
    const pct = ((count / totalMessages) * 100).toFixed(1);
    console.log(`  ${lang.padEnd(15)} ${String(count).padStart(4)} (${pct}%)`);
  }

  console.log(`\nTop disagreements:`);
  const sortedDisagreements = Object.entries(disagreementPatterns)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  if (sortedDisagreements.length === 0) {
    console.log('  None — perfect agreement!\n');
  } else {
    for (const [pattern, count] of sortedDisagreements) {
      console.log(`  ${pattern.padEnd(40)} ${String(count).padStart(4)}`);
    }
  }

  if (results.length > 0 && results.length <= 20) {
    console.log(`\nDetail:`);
    for (const r of results) {
      console.log(`  [${r.fixture.split(' ').slice(0, 4).join(' ')}...] "${r.text}"`);
      console.log(`    Rule: ${r.ruleIntent}  AI: ${r.aiIntent}  Lang: ${r.language}`);
    }
  } else if (results.length > 20) {
    console.log(`\n(${results.length} total disagreements — use --fixture to drill into specific flows)\n`);
  }

  console.log('-'.repeat(70));
  console.log('');
}

main().catch(err => {
  console.error('Replay comparison failed:', err);
  process.exit(1);
});
