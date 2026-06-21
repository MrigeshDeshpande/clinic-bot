// Quick Visit Update — integration test
// Run: node tests/manual/quick-visit-update.mjs
// Requires DATABASE_URL to be set

import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('FATAL: DATABASE_URL not set');
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { max: 1, idle_timeout: 5, connect_timeout: 10 });

let passed = 0;
let failed = 0;
let testApptId = null;

function assert(condition, msg) {
  if (condition) {
    console.log(`  ✅ ${msg}`);
    passed++;
  } else {
    console.log(`  ❌ ${msg}`);
    failed++;
  }
}

async function setup() {
  // Create a test appointment with existing notes to verify append behavior
  const [appt] = await sql`
    INSERT INTO appointments (wa_id, patient_name, date, time, treatment, status, notes)
    VALUES ('test_wa_qvu', 'Test Patient QVU', CURRENT_DATE, CURRENT_TIME, 'Initial Treatment', 'confirmed',
            'Patient anxious about extraction.\nPrefers evening appointments.')
    RETURNING id
  `;
  testApptId = appt.id;
  console.log(`\n📋 Test appointment created: ${testApptId}`);
  console.log(`   Existing notes: "Patient anxious about extraction.\\nPrefers evening appointments."`);
}

async function cleanup() {
  if (testApptId) {
    await sql`DELETE FROM appointments WHERE id = ${testApptId}`;
    console.log(`\n🧹 Cleaned up test appointment`);
  }
  await sql.end();
}

// ───────────────────────────────────────
// Simulate handleVisitSummary logic
// ───────────────────────────────────────
function parseInput(text) {
  const normalized = text.replace(/,/g, ' ');
  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length < 4 || isNaN(parseInt(parts[1], 10)) || isNaN(parseInt(parts[2], 10))) {
    return { ok: false };
  }
  const treatment = parts[0];
  const estimate = parseInt(parts[1], 10);
  const paid = parseInt(parts[2], 10);
  const followUpRaw = parts.slice(3).join(' ');
  let followUpDate = null;
  const followUpNum = parseInt(followUpRaw, 10);
  if (!isNaN(followUpNum) && /^\d+$/.test(followUpRaw)) {
    const d = new Date();
    d.setDate(d.getDate() + followUpNum);
    followUpDate = d.toISOString().slice(0, 10);
  }
  const notesValue = `[Quick Visit Update]\nFollow-up: ${followUpRaw}`;
  return { ok: true, treatment, estimate, paid, followUpRaw, followUpDate, notesValue };
}

async function runUpdate(apptId, parsed) {
  const result = await sql`
    UPDATE appointments
    SET treatment = ${parsed.treatment},
        treatment_charges = ${parsed.estimate},
        paid_amount = ${parsed.paid},
        follow_up_date = ${parsed.followUpDate}::date,
        notes = CASE
          WHEN COALESCE(notes, '') = '' THEN ${parsed.notesValue}
          ELSE notes || chr(10) || ${parsed.notesValue}
        END,
        updated_at = NOW()
    WHERE id = ${apptId}
      AND status NOT IN ('completed', 'cancelled', 'no_show', 'superseded')
    RETURNING id, treatment, treatment_charges, paid_amount, follow_up_date, notes
  `;
  return result[0];
}

// ───────────────────────────────────────
// Tests
// ───────────────────────────────────────
async function testHappyPathComma() {
  console.log('\n═══ Test 1: Happy Path (comma-separated) ═══');
  const parsed = parseInput('RCT,3000,1000,7d');
  assert(parsed.ok === true, 'parseInput succeeds');
  assert(parsed.treatment === 'RCT', `treatment = "${parsed.treatment}"`);
  assert(parsed.estimate === 3000, `estimate = ${parsed.estimate}`);
  assert(parsed.paid === 1000, `paid = ${parsed.paid}`);
  assert(parsed.followUpRaw === '7d', `followUpRaw = "${parsed.followUpRaw}"`);

  if (!parsed.ok) return;

  const result = await runUpdate(testApptId, parsed);
  assert(result !== undefined, 'UPDATE returned a row');
  assert(result.treatment === 'RCT', `DB treatment = "${result.treatment}"`);
  assert(result.treatment_charges === 3000, `DB treatment_charges = ${result.treatment_charges}`);
  assert(result.paid_amount === 1000, `DB paid_amount = ${result.paid_amount}`);
  assert(result.notes.includes('[Quick Visit Update]'), 'notes contains [Quick Visit Update] tag');
  assert(result.notes.includes('Follow-up: 7d'), 'notes contains follow-up text');
  assert(result.notes.includes('Patient anxious about extraction.'), 'existing notes preserved');
  console.log(`  📝 Final notes: "${result.notes}"`);
}

async function testSpaceSeparated() {
  console.log('\n═══ Test 2: Space-separated input ═══');
  const parsed = parseInput('RCT 3000 1000 7d');
  assert(parsed.ok === true, 'parseInput succeeds');
  assert(parsed.treatment === 'RCT', `treatment = "${parsed.treatment}"`);
  assert(parsed.estimate === 3000, `estimate = ${parsed.estimate}`);
  assert(parsed.paid === 1000, `paid = ${parsed.paid}`);
  assert(parsed.followUpRaw === '7d', `followUpRaw = "${parsed.followUpRaw}"`);

  if (!parsed.ok) return;

  // Fresh appointment for this test
  await sql`DELETE FROM appointments WHERE id = ${testApptId}`;
  const [appt] = await sql`
    INSERT INTO appointments (wa_id, patient_name, date, time, treatment, status, notes)
    VALUES ('test_wa_qvu', 'Test Patient QVU', CURRENT_DATE, CURRENT_TIME, 'Prev Treatment', 'confirmed',
            'Some existing notes here.')
    RETURNING id
  `;
  testApptId = appt.id;

  const result = await runUpdate(testApptId, parsed);
  assert(result.treatment === 'RCT', `DB treatment = "${result.treatment}"`);
  assert(result.treatment_charges === 3000, `DB treatment_charges = ${result.treatment_charges}`);
  assert(result.paid_amount === 1000, `DB paid_amount = ${result.paid_amount}`);
  assert(result.notes.includes('[Quick Visit Update]'), 'notes contains tag');
  assert(result.notes.includes('Some existing notes here.'), 'existing notes preserved');
}

async function testParseFailureShort() {
  console.log('\n═══ Test 3: Parse failure (short input) ═══');
  const parsed = parseInput('RCT 3000');
  assert(parsed.ok === false, 'parseInput returns ok=false for 2-token input');
  console.log('  ✅ Parse correctly rejected');
}

async function testParseFailureThreeTokens() {
  console.log('\n═══ Test 4: Parse failure (3 tokens) ═══');
  const parsed = parseInput('Scaling,500,500');
  assert(parsed.ok === false, 'parseInput returns ok=false for 3-token input');
  console.log('  ✅ Parse correctly rejected');

  // Verify no partial write — appointment is unchanged from test 2 state
  const [appt] = await sql`SELECT treatment, treatment_charges, paid_amount FROM appointments WHERE id = ${testApptId}`;
  assert(appt.treatment === 'RCT', `treatment untouched = "${appt.treatment}" (not "Scaling")`);
  assert(appt.paid_amount === 1000, `paid_amount untouched = ${appt.paid_amount}`);
}

// ───────────────────────────────────────
// Run
// ───────────────────────────────────────
try {
  await setup();
  await testHappyPathComma();

  // Reset for test 2
  await testSpaceSeparated();
  await testParseFailureShort();
  await testParseFailureThreeTokens();

  console.log(`\n═══════════════════════════════`);
  console.log(`📊 ${passed} passed, ${failed} failed`);
  console.log(`═══════════════════════════════\n`);
} catch (err) {
  console.error('\n💥 Test error:', err);
  failed++;
} finally {
  await cleanup();
  process.exit(failed > 0 ? 1 : 0);
}
