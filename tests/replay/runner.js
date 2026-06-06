// ───────────────────────────────────────────────
// Replay Test Runner
//
// Processes conversation fixtures through the engine
// and validates expected outcomes including state
// transitions, intents, and final booking context.
//
// Usage:
//   REPLAY_MODE=true node --experimental-loader ./tests/replay/path-loader.js tests/replay/runner.js
//   REPLAY_MODE=true node --experimental-loader ./tests/replay/path-loader.js tests/replay/runner.js --fixture "Happy Path Booking"
//   REPLAY_MODE=true node --experimental-loader ./tests/replay/path-loader.js tests/replay/runner.js --list
//
// NOTE: requires --experimental-loader to resolve @/ path alias
// because standalone Node.js doesn't know the Next.js path mapping.
// ───────────────────────────────────────────────

process.env.REPLAY_MODE = 'true';
process.env.LOG_LEVEL = 'error';
if (!process.env.DOCTOR_WA_ID) process.env.DOCTOR_WA_ID = 'r_doctor';

const { processEvent } = await import('../../src/lib/engine.js');
const { FIXTURES } = await import('./fixtures.js');
const { getSql, runMigrations } = await import('../../src/db/pool.js');
const { clearSessionCache } = await import('../../src/lib/session.js');

// Counter-based waId generator — avoids collisions from similar fixture names
let fixtureCounter = 1000;
function makeWaId(fixture) {
  if (fixture?.waId) return fixture.waId;
  if (fixture?.role === 'doctor') return process.env.DOCTOR_WA_ID;
  // Use a simple counter-based ID format: r_{counter}
  // This guarantees uniqueness and stays within VARCHAR limits
  const id = fixtureCounter++;
  return 'r_' + id;
}

function simulateMessage(waId, text, type = 'text', interactiveId = null, interactiveTitle = null) {
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
             id: msgId,
             from: waId,
             type,
             timestamp: String(now),
             text: type === 'text' ? { body: text } : undefined,
             interactive: isInteractive ? {
               list_reply: {
                 id: interactiveId || 'unknown_id',
                 title: interactiveTitle || text || 'Selection',
               },
             } : undefined,
           }],
        },
      }],
    }],
  };
}

async function runFixture(fixture) {
  if (fixture.skip) {
    return { name: fixture.name, skipped: true };
  }

  const waId = makeWaId(fixture);
  const steps = [];

  for (let i = 0; i < fixture.messages.length; i++) {
    const msg = fixture.messages[i];
    // Add a 5ms delay between messages to simulate realistic timing
    if (i > 0) await new Promise(r => setTimeout(r, 5));

    const payload = simulateMessage(
      waId,
      msg.text,
      msg.type || 'text',
      msg.interactiveId || null,
      msg.interactiveTitle || null
    );

    try {
      const result = await processEvent(payload);
      const stepInfo = {
        index: i,
        text: msg.text,
        expectedIntent: msg.intent,
        expectedState: msg.checkState || null,
        actualIntent: null,
        actualState: null,
        error: null,
      };

      if (result && result.steps && result.steps.length > 0) {
        // The last step in the returned steps corresponds to this message
        const replayStep = result.steps[result.steps.length - 1];
        stepInfo.actualIntent = replayStep.intent || null;
        stepInfo.actualState = replayStep.state || null;
        stepInfo.actualPreviousState = replayStep.previousState || null;
        stepInfo.nextState = replayStep.nextState || null;
      }

      steps.push(stepInfo);
    } catch (error) {
      steps.push({
        index: i,
        text: msg.text,
        expectedIntent: msg.intent,
        expectedState: msg.checkState || null,
        error: error.message,
      });
    }
  }

  // After all messages, get the final step to check final state
  const lastStep = steps[steps.length - 1] || {};
  const finalState = lastStep.actualState || null;

  return {
    name: fixture.name,
    skipped: false,
    steps,
    finalState,
    expectations: fixture.expectations || {},
  };
}

function evaluateResult(result) {
  if (result.skipped) {
    return { pass: true, details: 'Skipped' };
  }

  const issues = [];

  for (const step of result.steps) {
    if (step.error) {
      issues.push(`  [${step.index}] "${step.text}" → ERROR: ${step.error}`);
      continue;
    }

    // Verify expected intent
    if (step.actualIntent && step.expectedIntent && step.actualIntent !== step.expectedIntent) {
      // Don't fail on intent mismatch if the actual intent is still reasonable
      // (e.g., 'unknown' fallback is acceptable for some flows)
      issues.push(`  [${step.index}] "${step.text}" → expected intent "${step.expectedIntent}", got "${step.actualIntent}"`);
    }

    // Verify expected state after this step
    if (step.expectedState && step.actualState && step.actualState !== step.expectedState) {
      issues.push(`  [${step.index}] "${step.text}" → expected state "${step.expectedState}", got "${step.actualState}"`);
    }

    // Detect stale state — never advancing past MAIN_MENU
    if (step.index > 0 && step.actualState === 'MAIN_MENU' && step.actualPreviousState === 'IDLE') {
      // This is suspicious if we've sent several messages already
      const prevSteps = result.steps.slice(0, step.index);
      const allMainMenu = prevSteps.every(s => s.actualState === 'MAIN_MENU' || s.actualState === undefined);
      if (allMainMenu && step.index >= 2) {
        issues.push(`  [${step.index}] "${step.text}" → state stuck at MAIN_MENU (never progressed)`);
      }
    }
  }

  // Verify final state expectation
  const exp = result.expectations;
  if (exp.finalState && result.finalState && result.finalState !== exp.finalState) {
    issues.push(`  Final state expected "${exp.finalState}", got "${result.finalState}"`);
  }

  if (issues.length === 0) {
    return { pass: true, details: 'All expectations met' };
  }

  return { pass: false, name: result.name, details: issues.join('\n') };
}

async function cleanupStaleSessions(waIds) {
  // Delete any existing sessions for these waIds to ensure fixture isolation
  const sql = getSql();
  if (!sql) return;
  try {
    // Use ANY() for array matching — postgres.js/neon handles arrays natively
    await sql`DELETE FROM messages WHERE wa_id = ANY(${waIds})`;
    await sql`DELETE FROM appointments WHERE wa_id = ANY(${waIds})`;
    await sql`DELETE FROM sessions WHERE wa_id = ANY(${waIds})`;
  } catch (error) {
    // Non-fatal — sessions may not exist yet
  }
}

async function main() {
  const args = process.argv.slice(2);
  const listOnly = args.includes('--list');
  const filter = args.find(a => a.startsWith('--fixture='))?.split('=')[1] || null;

  if (listOnly) {
    console.log('\n\x1b[1mAvailable Fixtures:\x1b[0m\n');
    FIXTURES.forEach(f => {
      const skipLabel = f.skip ? ' \u23ED\uFE0F' : '';
      console.log(`  ${f.name}${skipLabel}`);
    });
    console.log(`\nTotal: ${FIXTURES.length} fixtures (${FIXTURES.filter(f => !f.skip).length} active)`);
    return;
  }

  const fixturesToRun = filter
    ? FIXTURES.filter(f => f.name === filter)
    : FIXTURES;

  // Run DB migrations to ensure schema (including state constraint) is up to date
  await runMigrations().catch(() => {});

  // Pre-clean all fixture waIds to avoid stale session state
  const activeFixtures = fixturesToRun.filter(f => !f.skip);
  const allWaIds = activeFixtures.map((_, i) => `r_${1000 + i}`);
  const doctorWaId = process.env.DOCTOR_WA_ID || 'r_doctor';
  if (!allWaIds.includes(doctorWaId)) allWaIds.push(doctorWaId);
  await cleanupStaleSessions(allWaIds);

  console.log('\n\x1b[1mReplay Conversation Tests\x1b[0m\n');
  console.log('-'.repeat(58));

  let passed = 0;
  let failed = 0;
  let skipped = 0;
  const failures = [];

  for (const fixture of fixturesToRun) {
    clearSessionCache();
    const result = await runFixture(fixture);
    const evaluation = evaluateResult(result);

    if (result.skipped) {
      skipped++;
      console.log(`  \u23ED\uFE0F  SKIP  ${result.name}`);
    } else if (evaluation.pass) {
      passed++;
      console.log(`  \u2705  PASS  ${result.name}`);
    } else {
      failed++;
      const icon = '\u274C';
      console.log(`  ${icon}  FAIL  ${result.name}`);
      console.log(`       ${evaluation.details}`);
      failures.push({ name: result.name, details: evaluation.details });
    }

    // Clean shared doctor session between fixtures to prevent state leakage
    if (fixture.role === 'doctor') {
      const sql = getSql();
      if (sql) {
        try {
          const doctorWaId = process.env.DOCTOR_WA_ID || 'r_doctor';
          await sql`DELETE FROM sessions WHERE wa_id = ${doctorWaId}`;
          await sql`DELETE FROM messages WHERE wa_id = ${doctorWaId}`;
          await sql`DELETE FROM appointments WHERE wa_id = ${doctorWaId}`;
        } catch (e) {
          // Non-fatal cleanup
        }
      }
    }
  }

  console.log('-'.repeat(58));
  const total = passed + failed + skipped;
  console.log(`\n\x1b[1mResults: ${passed} passed, ${failed} failed, ${skipped} skipped (${total} total)\x1b[0m`);

  if (failures.length > 0) {
    console.log('\n\x1b[31mFailures:\x1b[0m');
    for (const f of failures) {
      console.log(`  \u274C  ${f.name}`);
      console.log(`       ${f.details.split('\n').join('\n       ')}`);
    }
  }

  console.log('');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Runner error:', err);
  process.exit(1);
});
