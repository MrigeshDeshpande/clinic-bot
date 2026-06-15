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
  visit_layout: {
    leftColumn: [
      { id: 'chiefComplaint', label: 'Chief Complaint', enabled: true },
      { id: 'medicalHistory', label: 'Medical / Dental History', enabled: true },
      { id: 'toothChart', label: 'Tooth Chart', enabled: true },
      { id: 'perToothEditor', label: 'Per-Tooth Editor', enabled: true },
      { id: 'findings', label: 'Findings', enabled: true },
      { id: 'overallDiagnosis', label: 'Overall Diagnosis', enabled: true },
      { id: 'treatmentPlan', label: 'Treatment Plan', enabled: true },
      { id: 'examination', label: 'Examination', enabled: true },
      { id: 'prescription', label: 'Prescription', enabled: true },
      { id: 'advice', label: 'Advice', enabled: true },
      { id: 'visitSummary', label: 'Visit Summary', enabled: true },
    ],
    rightColumn: [
      { id: 'attachments', label: 'Attachments', enabled: true },
      { id: 'contextSidebar', label: 'Context Sidebar', enabled: true },
    ],
  },
  medicines: {
    salts: {
      // Antibiotics
      'Amoxicillin': { category: 'antibiotics', enabled: true, price: 0 },
      'Amoxicillin + Clavulanic Acid': { category: 'antibiotics', enabled: true, price: 0 },
      'Azithromycin': { category: 'antibiotics', enabled: true, price: 0 },
      'Cefixime': { category: 'antibiotics', enabled: true, price: 0 },
      'Ceftriaxone Injection': { category: 'antibiotics', enabled: true, price: 0 },
      'Cefuroxime': { category: 'antibiotics', enabled: true, price: 0 },
      'Cephalexin': { category: 'antibiotics', enabled: true, price: 0 },
      'Ciprofloxacin': { category: 'antibiotics', enabled: true, price: 0 },
      'Clindamycin': { category: 'antibiotics', enabled: true, price: 0 },
      'Doxycycline': { category: 'antibiotics', enabled: true, price: 0 },
      'Erythromycin': { category: 'antibiotics', enabled: true, price: 0 },
      'Metronidazole': { category: 'antibiotics', enabled: true, price: 0 },
      'Penicillin V': { category: 'antibiotics', enabled: true, price: 0 },
      'Tetracycline': { category: 'antibiotics', enabled: true, price: 0 },
      'Mouthwash - Chlorhexidine': { category: 'antibiotics', enabled: true, price: 0 },
      'Mouthwash - Povidone Iodine': { category: 'antibiotics', enabled: true, price: 0 },
      // Painkillers / NSAIDs
      'Aceclofenac': { category: 'painkillers', enabled: true, price: 0 },
      'Combiflam (Ibuprofen + Paracetamol)': { category: 'painkillers', enabled: true, price: 0 },
      'Diclofenac': { category: 'painkillers', enabled: true, price: 0 },
      'Gabapentin': { category: 'painkillers', enabled: true, price: 0 },
      'Ibuprofen': { category: 'painkillers', enabled: true, price: 0 },
      'Ketorolac': { category: 'painkillers', enabled: true, price: 0 },
      'Ketorolac Injection': { category: 'painkillers', enabled: true, price: 0 },
      'Lornoxicam': { category: 'painkillers', enabled: true, price: 0 },
      'Mefenamic Acid': { category: 'painkillers', enabled: true, price: 0 },
      'Naproxen': { category: 'painkillers', enabled: true, price: 0 },
      'Paracetamol': { category: 'painkillers', enabled: true, price: 0 },
      'Paracetamol + Diclofenac Combination': { category: 'painkillers', enabled: true, price: 0 },
      'Pregabalin': { category: 'painkillers', enabled: true, price: 0 },
      // Corticosteroids
      'Betamethasone': { category: 'corticosteroids', enabled: true, price: 0 },
      'Dexamethasone': { category: 'corticosteroids', enabled: true, price: 0 },
      'Prednisolone': { category: 'corticosteroids', enabled: true, price: 0 },
      'Triamcinolone Acetonide': { category: 'corticosteroids', enabled: true, price: 0 },
      'Triamcinolone Ointment': { category: 'corticosteroids', enabled: true, price: 0 },
      // Anaesthetics
      'Articaine': { category: 'anaesthetics', enabled: true, price: 0 },
      'Bupivacaine': { category: 'anaesthetics', enabled: true, price: 0 },
      'Lignocaine': { category: 'anaesthetics', enabled: true, price: 0 },
      'Lignocaine Gel': { category: 'anaesthetics', enabled: true, price: 0 },
      'Lignocaine Spray': { category: 'anaesthetics', enabled: true, price: 0 },
      'Lignocaine with Adrenaline': { category: 'anaesthetics', enabled: true, price: 0 },
      'Mepivacaine': { category: 'anaesthetics', enabled: true, price: 0 },
      // Antifungals
      'Amphotericin B Oral Suspension': { category: 'antifungals', enabled: true, price: 0 },
      'Clotrimazole Gel': { category: 'antifungals', enabled: true, price: 0 },
      'Clotrimazole Mouth Paint': { category: 'antifungals', enabled: true, price: 0 },
      'Fluconazole': { category: 'antifungals', enabled: true, price: 0 },
      'Itraconazole': { category: 'antifungals', enabled: true, price: 0 },
      'Miconazole Gel': { category: 'antifungals', enabled: true, price: 0 },
      'Nystatin Oral Suspension': { category: 'antifungals', enabled: true, price: 0 },
      // Antivirals
      'Acyclovir': { category: 'antivirals', enabled: true, price: 0 },
      'Acyclovir Cream': { category: 'antivirals', enabled: true, price: 0 },
      'Valacyclovir': { category: 'antivirals', enabled: true, price: 0 },
      // Analgesics
      'Codeine Phosphate': { category: 'analgesics', enabled: true, price: 0 },
      'Tramadol': { category: 'analgesics', enabled: true, price: 0 },
      // Antacids / GI
      'Domperidone': { category: 'gi', enabled: true, price: 0 },
      'Metoclopramide': { category: 'gi', enabled: true, price: 0 },
      'Omeprazole': { category: 'gi', enabled: true, price: 0 },
      'Ondansetron': { category: 'gi', enabled: true, price: 0 },
      'Pantoprazole': { category: 'gi', enabled: true, price: 0 },
      'Ranitidine': { category: 'gi', enabled: true, price: 0 },
      // Vitamins / Supplements
      'Calcium + Vitamin D3': { category: 'vitamins', enabled: true, price: 0 },
      'Iron + Folic Acid': { category: 'vitamins', enabled: true, price: 0 },
      'Multivitamin Tablet': { category: 'vitamins', enabled: true, price: 0 },
      'Vitamin B Complex': { category: 'vitamins', enabled: true, price: 0 },
      'Vitamin C': { category: 'vitamins', enabled: true, price: 0 },
      'Vitamin D3': { category: 'vitamins', enabled: true, price: 0 },
      'Zinc': { category: 'vitamins', enabled: true, price: 0 },
      // Sedatives
      'Alprazolam': { category: 'sedatives', enabled: true, price: 0 },
      'Diazepam': { category: 'sedatives', enabled: true, price: 0 },
      'Ketamine': { category: 'sedatives', enabled: true, price: 0 },
      'Lorazepam': { category: 'sedatives', enabled: true, price: 0 },
      'Midazolam': { category: 'sedatives', enabled: true, price: 0 },
      'Nitrous Oxide': { category: 'sedatives', enabled: true, price: 0 },
      // Hemostatics
      'Tranexamic Acid': { category: 'hemostatics', enabled: true, price: 0 },
      'Tranexamic Acid Injection': { category: 'hemostatics', enabled: true, price: 0 },
      // Mouthwashes / Topical
      'Benzocaine Gel': { category: 'mouthwashes_topical', enabled: true, price: 0 },
      'Chlorhexidine Mouthwash': { category: 'mouthwashes_topical', enabled: true, price: 0 },
      'Choline Salicylate Gel (Bonjela)': { category: 'mouthwashes_topical', enabled: true, price: 0 },
      'Hydrogen Peroxide Mouthwash': { category: 'mouthwashes_topical', enabled: true, price: 0 },
      'Metronidazole Gel': { category: 'mouthwashes_topical', enabled: true, price: 0 },
      'Saline Mouthwash': { category: 'mouthwashes_topical', enabled: true, price: 0 },
      'Triamcinolone Oral Paste': { category: 'mouthwashes_topical', enabled: true, price: 0 },
      // Other Dental
      'Calcium Hydroxide Paste': { category: 'other_dental', enabled: true, price: 0 },
      'Desensitizing Paste': { category: 'other_dental', enabled: true, price: 0 },
      'Fluoride Varnish': { category: 'other_dental', enabled: true, price: 0 },
      'Formocresol': { category: 'other_dental', enabled: true, price: 0 },
      'MTA (Mineral Trioxide Aggregate)': { category: 'other_dental', enabled: true, price: 0 },
      'Potassium Nitrate Gel': { category: 'other_dental', enabled: true, price: 0 },
      'Sensodyne Toothpaste': { category: 'other_dental', enabled: true, price: 0 },
      'Sodium Fluoride Gel': { category: 'other_dental', enabled: true, price: 0 },
      'Tetracycline Ointment': { category: 'other_dental', enabled: true, price: 0 },
      'Zinc Oxide Eugenol Paste': { category: 'other_dental', enabled: true, price: 0 },
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
