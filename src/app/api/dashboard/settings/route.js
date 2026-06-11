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
  treatments: { favorites: [], recent: [], hidden: [], custom: [] },
  google_maps: { review_url: '' },
  medicines: {
    salts: {
      // Antibiotics
      'Amoxicillin': { category: 'antibiotics', enabled: true },
      'Amoxicillin + Clavulanic Acid': { category: 'antibiotics', enabled: true },
      'Azithromycin': { category: 'antibiotics', enabled: true },
      'Cefixime': { category: 'antibiotics', enabled: true },
      'Ceftriaxone Injection': { category: 'antibiotics', enabled: true },
      'Cefuroxime': { category: 'antibiotics', enabled: true },
      'Cephalexin': { category: 'antibiotics', enabled: true },
      'Ciprofloxacin': { category: 'antibiotics', enabled: true },
      'Clindamycin': { category: 'antibiotics', enabled: true },
      'Doxycycline': { category: 'antibiotics', enabled: true },
      'Erythromycin': { category: 'antibiotics', enabled: true },
      'Metronidazole': { category: 'antibiotics', enabled: true },
      'Penicillin V': { category: 'antibiotics', enabled: true },
      'Tetracycline': { category: 'antibiotics', enabled: true },
      'Mouthwash - Chlorhexidine': { category: 'antibiotics', enabled: true },
      'Mouthwash - Povidone Iodine': { category: 'antibiotics', enabled: true },
      // Painkillers / NSAIDs
      'Aceclofenac': { category: 'painkillers', enabled: true },
      'Combiflam (Ibuprofen + Paracetamol)': { category: 'painkillers', enabled: true },
      'Diclofenac': { category: 'painkillers', enabled: true },
      'Gabapentin': { category: 'painkillers', enabled: true },
      'Ibuprofen': { category: 'painkillers', enabled: true },
      'Ketorolac': { category: 'painkillers', enabled: true },
      'Ketorolac Injection': { category: 'painkillers', enabled: true },
      'Lornoxicam': { category: 'painkillers', enabled: true },
      'Mefenamic Acid': { category: 'painkillers', enabled: true },
      'Naproxen': { category: 'painkillers', enabled: true },
      'Paracetamol': { category: 'painkillers', enabled: true },
      'Paracetamol + Diclofenac Combination': { category: 'painkillers', enabled: true },
      'Pregabalin': { category: 'painkillers', enabled: true },
      // Corticosteroids
      'Betamethasone': { category: 'corticosteroids', enabled: true },
      'Dexamethasone': { category: 'corticosteroids', enabled: true },
      'Prednisolone': { category: 'corticosteroids', enabled: true },
      'Triamcinolone Acetonide': { category: 'corticosteroids', enabled: true },
      'Triamcinolone Ointment': { category: 'corticosteroids', enabled: true },
      // Anaesthetics
      'Articaine': { category: 'anaesthetics', enabled: true },
      'Bupivacaine': { category: 'anaesthetics', enabled: true },
      'Lignocaine': { category: 'anaesthetics', enabled: true },
      'Lignocaine Gel': { category: 'anaesthetics', enabled: true },
      'Lignocaine Spray': { category: 'anaesthetics', enabled: true },
      'Lignocaine with Adrenaline': { category: 'anaesthetics', enabled: true },
      'Mepivacaine': { category: 'anaesthetics', enabled: true },
      // Antifungals
      'Amphotericin B Oral Suspension': { category: 'antifungals', enabled: true },
      'Clotrimazole Gel': { category: 'antifungals', enabled: true },
      'Clotrimazole Mouth Paint': { category: 'antifungals', enabled: true },
      'Fluconazole': { category: 'antifungals', enabled: true },
      'Itraconazole': { category: 'antifungals', enabled: true },
      'Miconazole Gel': { category: 'antifungals', enabled: true },
      'Nystatin Oral Suspension': { category: 'antifungals', enabled: true },
      // Antivirals
      'Acyclovir': { category: 'antivirals', enabled: true },
      'Acyclovir Cream': { category: 'antivirals', enabled: true },
      'Valacyclovir': { category: 'antivirals', enabled: true },
      // Analgesics
      'Codeine Phosphate': { category: 'analgesics', enabled: true },
      'Tramadol': { category: 'analgesics', enabled: true },
      // Antacids / GI
      'Domperidone': { category: 'gi', enabled: true },
      'Metoclopramide': { category: 'gi', enabled: true },
      'Omeprazole': { category: 'gi', enabled: true },
      'Ondansetron': { category: 'gi', enabled: true },
      'Pantoprazole': { category: 'gi', enabled: true },
      'Ranitidine': { category: 'gi', enabled: true },
      // Vitamins / Supplements
      'Calcium + Vitamin D3': { category: 'vitamins', enabled: true },
      'Iron + Folic Acid': { category: 'vitamins', enabled: true },
      'Multivitamin Tablet': { category: 'vitamins', enabled: true },
      'Vitamin B Complex': { category: 'vitamins', enabled: true },
      'Vitamin C': { category: 'vitamins', enabled: true },
      'Vitamin D3': { category: 'vitamins', enabled: true },
      'Zinc': { category: 'vitamins', enabled: true },
      // Sedatives
      'Alprazolam': { category: 'sedatives', enabled: true },
      'Diazepam': { category: 'sedatives', enabled: true },
      'Ketamine': { category: 'sedatives', enabled: true },
      'Lorazepam': { category: 'sedatives', enabled: true },
      'Midazolam': { category: 'sedatives', enabled: true },
      'Nitrous Oxide': { category: 'sedatives', enabled: true },
      // Hemostatics
      'Tranexamic Acid': { category: 'hemostatics', enabled: true },
      'Tranexamic Acid Injection': { category: 'hemostatics', enabled: true },
      // Mouthwashes / Topical
      'Benzocaine Gel': { category: 'mouthwashes_topical', enabled: true },
      'Chlorhexidine Mouthwash': { category: 'mouthwashes_topical', enabled: true },
      'Choline Salicylate Gel (Bonjela)': { category: 'mouthwashes_topical', enabled: true },
      'Hydrogen Peroxide Mouthwash': { category: 'mouthwashes_topical', enabled: true },
      'Metronidazole Gel': { category: 'mouthwashes_topical', enabled: true },
      'Saline Mouthwash': { category: 'mouthwashes_topical', enabled: true },
      'Triamcinolone Oral Paste': { category: 'mouthwashes_topical', enabled: true },
      // Other Dental
      'Calcium Hydroxide Paste': { category: 'other_dental', enabled: true },
      'Desensitizing Paste': { category: 'other_dental', enabled: true },
      'Fluoride Varnish': { category: 'other_dental', enabled: true },
      'Formocresol': { category: 'other_dental', enabled: true },
      'MTA (Mineral Trioxide Aggregate)': { category: 'other_dental', enabled: true },
      'Potassium Nitrate Gel': { category: 'other_dental', enabled: true },
      'Sensodyne Toothpaste': { category: 'other_dental', enabled: true },
      'Sodium Fluoride Gel': { category: 'other_dental', enabled: true },
      'Tetracycline Ointment': { category: 'other_dental', enabled: true },
      'Zinc Oxide Eugenol Paste': { category: 'other_dental', enabled: true },
    },
    custom: [],
    usage: {},
    templates: [],
  },
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
      await sql`UPDATE appointments SET prescription_key = NULL, compiled_document_key = NULL WHERE prescription_key IS NOT NULL`;
      logger.info('PRESCRIPTION_CACHE_INVALIDATED', { reason: `settings:${key}` });
    }

    logger.info('SETTINGS_UPDATED', { key });
    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error('SETTINGS_PUT_ERROR', { error: error.message });
    return jsonError(error);
  }
}
