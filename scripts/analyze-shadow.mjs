/**
 * Shadow Mode Analyzer
 *
 * Analyzes shadow_logs (from DB or log file) to produce
 * agreement reports, per-intent accuracy, high-risk disagreements,
 * and pattern clustering.
 *
 * Usage (log file):
 *   node scripts/analyze-shadow.mjs app.log
 *   node scripts/analyze-shadow.mjs app.log --csv
 *   node scripts/analyze-shadow.mjs app.log --csv > report.csv
 *
 * Usage (database):
 *   node --experimental-loader ./tests/replay/path-loader.js scripts/analyze-shadow.mjs --db
 *   node --experimental-loader ./tests/replay/path-loader.js scripts/analyze-shadow.mjs --db --from 2026-06-01 --to 2026-06-07
 *   node --experimental-loader ./tests/replay/path-loader.js scripts/analyze-shadow.mjs --db --csv
 */

import { readFileSync, existsSync } from 'fs';

const HIGH_RISK_INTENTS = ['confirm', 'confirm_cancel', 'emergency'];

const RISK_SCORE_MAP = {
  'confirm': 5, 'confirm_cancel': 5, 'emergency': 5,
  'cancel_appointment': 4, 'reschedule': 4,
  'appointment': 3, 'cancel': 3,
  'edit_date': 3, 'edit_time': 3, 'edit_treatment': 3,
  'correction_date': 3, 'correction_time': 3, 'correction_treatment': 3,
  'provide_date': 2, 'provide_time': 2, 'provide_treatment': 2,
  'my_appointments': 1, 'location': 1, 'timings': 1,
  'services': 1, 'greeting': 1, 'thanks': 1, 'help': 1,
  'affirm': 1, 'arrival': 1, 'callback': 1,
  'main_menu': 1, 'back': 1, 'unknown': 0,
};

function riskLabel(ruleIntent, aiIntent) {
  const rs1 = RISK_SCORE_MAP[ruleIntent] || 1;
  const rs2 = RISK_SCORE_MAP[aiIntent] || 1;
  const diff = Math.abs(rs1 - rs2);
  if (diff >= 4) return 'CRITICAL';
  if (diff >= 2) return 'HIGH';
  if (diff >= 1) return 'MEDIUM';
  return 'LOW';
}

function loadEntries(filePath) {
  if (!existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const raw = readFileSync(filePath, 'utf-8');
  const lines = raw.split('\n').filter(Boolean);
  const entries = [];

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed.message === 'INTENT_CLASSIFICATION_SHADOW') {
        entries.push(parsed);
      }
    } catch {
      // skip malformed lines
    }
  }

  return entries;
}

function buildReport(entries) {
  const total = entries.length;
  let matches = 0;
  const disagreements = [];
  const byIntent = {};
  const textPatterns = {};

  for (const entry of entries) {
    const ruleIntent = entry.rule_intent || 'unknown';
    const aiIntent = entry.ai_intent || 'unknown';
    const text = (entry.text || entry.message_text || '').trim().toLowerCase();
    const state = entry.state || entry.session_state || '';
    const aiConfidence = entry.ai_confidence || 0;
    const risk = riskLabel(ruleIntent, aiIntent);

    const isMatch = ruleIntent === aiIntent;

    if (isMatch) {
      matches++;
    } else {
      disagreements.push({ ruleIntent, aiIntent, text, state, risk, aiConfidence });
    }

    if (!byIntent[ruleIntent]) {
      byIntent[ruleIntent] = { total: 0, matches: 0, disagreements: [], texts: [] };
    }
    byIntent[ruleIntent].total++;
    if (isMatch) {
      byIntent[ruleIntent].matches++;
    } else {
      byIntent[ruleIntent].disagreements.push({ aiIntent, text, state, risk, aiConfidence });

      const key = `${ruleIntent} \u2192 ${aiIntent}`;
      if (!textPatterns[key]) {
        textPatterns[key] = { count: 0, examples: [], ruleIntent, aiIntent };
      }
      textPatterns[key].count++;
      if (textPatterns[key].examples.length < 5) {
        textPatterns[key].examples.push({ text, state, confidence: aiConfidence });
      }
    }
  }

  const agreementRate = total > 0 ? ((matches / total) * 100).toFixed(1) : '0.0';
  const highRiskDisagreements = disagreements.filter(d => d.risk === 'CRITICAL' || d.risk === 'HIGH');

  return {
    total,
    matches,
    disagreements: disagreements.length,
    agreementRate,
    highRiskCount: highRiskDisagreements.length,
    byIntent,
    textPatterns,
    disagreements,
    highRiskDisagreements,
  };
}

function printReport(report) {
  const separator = '='.repeat(40);
  const subSeparator = '-'.repeat(40);

  console.log(`\n${separator}`);
  console.log('SHADOW MODE REPORT');
  console.log(`${separator}\n`);

  console.log(`Messages Analyzed: ${report.total}`);
  console.log(`Agreement Rate:    ${report.agreementRate}%`);
  console.log(`Matches:           ${report.matches}`);
  console.log(`Disagreements:     ${report.disagreements.length}`);
  console.log(`High Risk:         ${report.highRiskCount}\n`);

  // Per-intent breakdown sorted by volume descending
  const sortedIntents = Object.entries(report.byIntent)
    .sort((a, b) => b[1].total - a[1].total);

  console.log(subSeparator);
  console.log('Per Intent');
  console.log(`${subSeparator}\n`);

  for (const [intent, data] of sortedIntents) {
    const accuracy = data.total > 0 ? ((data.matches / data.total) * 100).toFixed(1) : '0.0';
    console.log(`${intent}`);
    console.log(`  matches:       ${data.matches}`);
    console.log(`  disagreements: ${data.disagreements.length}`);
    console.log(`  accuracy:      ${accuracy}%\n`);
  }

  // Top disagreement patterns
  const sortedPatterns = Object.entries(report.textPatterns)
    .sort((a, b) => b[1].count - a[1].count);

  if (sortedPatterns.length > 0) {
    console.log(subSeparator);
    console.log('Top Disagreement Patterns');
    console.log(`${subSeparator}\n`);

    for (const [pattern, data] of sortedPatterns.slice(0, 10)) {
      const risk = riskLabel(data.ruleIntent, data.aiIntent);
      console.log(`Pattern: ${pattern}`);
      console.log(`  Count:  ${data.count}`);
      console.log(`  Risk:   ${risk}`);
      console.log(`  Examples:`);
      for (const ex of data.examples) {
        console.log(`    "${ex.text}" (state: ${ex.state}, confidence: ${ex.confidence})`);
      }
      console.log();
    }
  }

  // High risk breakdown
  if (report.highRiskDisagreements.length > 0) {
    console.log(subSeparator);
    console.log('Critical & High Risk Disagreements');
    console.log(`${subSeparator}\n`);

    for (const d of report.highRiskDisagreements.slice(0, 20)) {
      console.log(`  ${d.ruleIntent} \u2192 ${d.aiIntent}`);
      console.log(`    Text:  "${d.text}"`);
      console.log(`    State: ${d.state}`);
      console.log(`    Risk:  ${d.risk}`);
      console.log();
    }
  }

  console.log(subSeparator);
  console.log('Risk Legend');
  console.log(`${subSeparator}`);
  console.log('  CRITICAL: confirm\u2192cancel, cancel\u2192confirm, emergency\u2192anything');
  console.log('  HIGH:     booking actions mapped to wrong action');
  console.log('  MEDIUM:   wrong date/time/treatment, correct category');
  console.log('  LOW:      info intent confusion (services vs timings)');
  console.log();
}

function printCsv(report) {
  const headers = ['timestamp', 'text', 'state', 'ruleIntent', 'aiIntent', 'confidence', 'risk'];
  console.log(headers.join(','));

  for (const d of report.disagreements) {
    const row = [
      '',
      `"${d.text.replace(/"/g, '""')}"`,
      d.state,
      d.ruleIntent,
      d.aiIntent,
      d.aiConfidence,
      d.risk,
    ];
    console.log(row.join(','));
  }
}

async function main() {
  const args = process.argv.slice(2);
  const csvMode = args.includes('--csv');
  const dbMode = args.includes('--db');
  const fromArg = args.includes('--from') ? args[args.indexOf('--from') + 1] : null;
  const toArg = args.includes('--to') ? args[args.indexOf('--to') + 1] : null;

  if (dbMode) {
    const { getStats, getIntentBreakdown, getDisagreements, getDisagreementPatterns } =
      await import('@/db/repositories/shadowLogRepository');

    const startDate = fromArg ? new Date(fromArg) : null;
    const endDate = toArg ? new Date(toArg + 'T23:59:59Z') : null;

    const stats = await getStats(startDate, endDate);
    if (!stats || stats.total === 0) {
      console.error('No shadow_logs entries found in database.');
      process.exit(1);
    }

    const intentBreakdown = await getIntentBreakdown(startDate, endDate);
    const disagreements = await getDisagreements({ limit: 500 });
    const patterns = await getDisagreementPatterns({ minCount: 1 });

    // Build report object in the same shape as buildReport
    const byIntent = {};
    for (const row of intentBreakdown) {
      byIntent[row.rule_intent] = {
        total: row.total,
        matches: row.matches,
        disagreements: [],
        texts: [],
      };
    }

    const report = {
      total: stats.total,
      matches: stats.matches,
      disagreements: stats.disagreements,
      agreementRate: stats.agreement_rate?.toString() || '0.0',
      highRiskCount: disagreements.filter(d =>
        riskLabel(d.rule_intent, d.ai_intent) === 'CRITICAL' ||
        riskLabel(d.rule_intent, d.ai_intent) === 'HIGH'
      ).length,
      byIntent,
      textPatterns: Object.fromEntries(
        patterns.map(p => [
          `${p.rule_intent} → ${p.ai_intent}`,
          {
            count: p.count,
            examples: [],
            ruleIntent: p.rule_intent,
            aiIntent: p.ai_intent,
          },
        ])
      ),
      disagreements: disagreements.map(d => ({
        ruleIntent: d.rule_intent,
        aiIntent: d.ai_intent,
        text: d.message_text,
        state: d.session_state,
        risk: riskLabel(d.rule_intent, d.ai_intent),
        aiConfidence: d.ai_confidence,
      })),
      highRiskDisagreements: disagreements
        .filter(d => {
          const r = riskLabel(d.rule_intent, d.ai_intent);
          return r === 'CRITICAL' || r === 'HIGH';
        })
        .map(d => ({
          ruleIntent: d.rule_intent,
          aiIntent: d.ai_intent,
          text: d.message_text,
          state: d.session_state,
          risk: riskLabel(d.rule_intent, d.ai_intent),
          aiConfidence: d.ai_confidence,
        })),
    };

    if (csvMode) {
      printCsv(report);
    } else {
      printReport(report);
    }
    return;
  }

  // Log file mode
  const filePath = args[0];
  if (!filePath) {
    console.error('Usage:');
    console.error('  node scripts/analyze-shadow.mjs <logfile> [--csv]');
    console.error('');
    console.error('  node --experimental-loader ./tests/replay/path-loader.js scripts/analyze-shadow.mjs --db [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--csv]');
    process.exit(1);
  }

  const entries = loadEntries(filePath);
  if (entries.length === 0) {
    console.error('No INTENT_CLASSIFICATION_SHADOW entries found in', filePath);
    process.exit(1);
  }

  const report = buildReport(entries);

  if (csvMode) {
    printCsv(report);
  } else {
    printReport(report);
  }
}

main();
