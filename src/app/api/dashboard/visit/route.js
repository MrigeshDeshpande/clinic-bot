import { NextResponse } from 'next/server';
import { getSql } from '@/db/pool';
import { logger } from '@/lib/logger';
import { requireCsrf, checkRateLimit, checkBodySize, jsonError, sanitizeResponse } from '@/lib/apiAuth';
import { VISIT_MODES } from '@/lib/visitModes';
import { completeVisit } from '@/services/completeVisit';
import { createWalkIn } from '@/services/createWalkIn';

const VALID_MODES = new Set(Object.values(VISIT_MODES));

async function updateMedicineUsage(sql, medicines) {
  if (!medicines || !Array.isArray(medicines) || medicines.length === 0) return;
  try {
    const rows = await sql`SELECT value FROM settings WHERE key = 'medicines'`;
    if (rows.length === 0) return;
    const current = typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value;
    if (!current) return;
    const usage = current.usage || {};
    const now = new Date().toISOString();
    for (const med of medicines) {
      if (med.name) {
        const prev = usage[med.name];
        if (typeof prev === 'number') {
          usage[med.name] = { count: prev + 1, last_used_at: now };
        } else if (prev && typeof prev === 'object') {
          usage[med.name] = { count: (prev.count || 0) + 1, last_used_at: now };
        } else {
          usage[med.name] = { count: 1, last_used_at: now };
        }
      }
    }
    current.usage = usage;
    await sql`UPDATE settings SET value = ${JSON.stringify(current)}, updated_at = NOW() WHERE key = 'medicines'`;
  } catch (e) {
    logger.warn('MEDICINE_USAGE_UPDATE_FAILED', { error: e.message });
  }
}

export async function POST(req) {
  const csrfErr = requireCsrf(req);
  if (csrfErr) return csrfErr;
  const rateErr = checkRateLimit(req);
  if (rateErr) return rateErr;
  const sizeErr = checkBodySize(req);
  if (sizeErr) return sizeErr;

  try {
    const sql = getSql();
    const body = await req.json();
    const mode = body.mode;

    if (!mode || !VALID_MODES.has(mode)) {
      return NextResponse.json({ error: `Invalid or missing visit mode. Must be one of: ${Object.values(VISIT_MODES).join(', ')}` }, { status: 400 });
    }

    if (mode === VISIT_MODES.CREATE_WALK_IN) {
      const result = await createWalkIn(sql, body);
      updateMedicineUsage(sql, body.medicines);
      return NextResponse.json({
        appointment: sanitizeResponse(result.appointment),
        patient_name: result.patient_name,
        treatment: result.treatment,
        fees: result.fees,
      });
    }

    if (!body.appointmentId) {
      return NextResponse.json({ error: 'appointmentId is required for ' + mode }, { status: 400 });
    }

    const appointment = await completeVisit(sql, body);
    updateMedicineUsage(sql, body.medicines);
    return NextResponse.json({ appointment: sanitizeResponse(appointment) });
  } catch (error) {
    if (error.status) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    logger.error('DASHBOARD_VISIT_ERROR', { error: error.message });
    return jsonError(error);
  }
}
