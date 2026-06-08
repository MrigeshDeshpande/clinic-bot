import { NextResponse } from 'next/server';
import { getSql } from '@/db/pool';
import { logger } from '@/lib/logger';
import { requireCsrf, checkRateLimit, jsonError } from '@/lib/apiAuth';

const DISALLOWED_KEYS = new Set(['database', 'password', 'secret', 'key']);
let ensured = false;

const DEFAULTS = {
  clinic: { subtitle: 'Advanced Dental Care & Implant Center', email: 'shribalajiadc@gmail.com', instagram: 'shribalaji_adc', timing_mon_sat: '10:00 AM \u2013 8:00 PM', timing_sun: '10:00 AM \u2013 2:00 PM' },
  doctor: { qualifications: 'BDS, MOI', registration: 'CGDC/G/24/4198', designation: 'Dental Surgeon | Oral Implantologist' },
  prescription: { primary_color: '#0d1b2a', accent_color: '#3a86c8', watermark_text: 'Shri Balaji', show_watermark: true, font_size: 10, show_rx: true, generic_substitution: true, border_enabled: true },
  checklists: {
    diagnosis: ['Gingivitis', 'Halitosis', 'Caries', 'Deep caries', 'Periapical Abscess', 'Grossly Decayed', 'Missing', 'Pocket', 'Periodontitis', 'Mobility', 'Lesion', 'Pericoronitis', 'Impacted', 'Fractured Tooth / Cusp', 'Abrasion / Attrition / Erosion', 'Irregular Teeth', 'Calculus', 'Stains'],
    advice: ['Avoid hot/cold foods for 24 hours', 'Take prescribed medicines on time', 'Maintain oral hygiene', 'Use soft-bristled toothbrush', 'Rinse with warm salt water', 'Avoid hard/sticky foods'],
  },
  google_maps: { review_url: '' },
};

async function ensureTable() {
  if (ensured) return;
  ensured = true;
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS settings (
      key         TEXT PRIMARY KEY,
      value       JSONB NOT NULL DEFAULT '{}',
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;
  for (const [key, value] of Object.entries(DEFAULTS)) {
    await sql`
      INSERT INTO settings (key, value) VALUES (${key}, ${JSON.stringify(value)})
      ON CONFLICT (key) DO NOTHING;
    `;
  }
}

export async function GET() {
  try {
    await ensureTable();
    const sql = getSql();
    const rows = await sql`SELECT key, value FROM settings`;
    const settings = {};
    for (const row of rows) {
      settings[row.key] = row.value;
    }
    return NextResponse.json({ settings });
  } catch (error) {
    logger.error('SETTINGS_GET_ERROR', { error: error.message });
    return jsonError(error);
  }
}

export async function PUT(req) {
  const csrfErr = requireCsrf(req);
  if (csrfErr) return csrfErr;
  const rateErr = checkRateLimit(req);
  if (rateErr) return rateErr;
  try {
    await ensureTable();
    const sql = getSql();
    const body = await req.json();
    const { key, value } = body;
    if (!key || typeof key !== 'string') {
      return NextResponse.json({ error: 'key is required' }, { status: 400 });
    }
    if (DISALLOWED_KEYS.has(key.toLowerCase())) {
      return NextResponse.json({ error: 'Invalid key' }, { status: 400 });
    }
    await sql`
      INSERT INTO settings (key, value, updated_at)
      VALUES (${key}, ${JSON.stringify(value)}, NOW())
      ON CONFLICT (key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `;

    // Invalidate all cached prescriptions when clinic/doctor/prescription settings change
    if (['clinic', 'doctor', 'prescription'].includes(key)) {
      await sql`UPDATE appointments SET prescription_key = NULL WHERE prescription_key IS NOT NULL`;
      logger.info('PRESCRIPTION_CACHE_INVALIDATED', { reason: `settings:${key}` });
    }

    logger.info('SETTINGS_UPDATED', { key });
    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error('SETTINGS_PUT_ERROR', { error: error.message });
    return jsonError(error);
  }
}
