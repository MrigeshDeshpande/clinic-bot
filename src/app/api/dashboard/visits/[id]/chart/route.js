import { NextResponse } from 'next/server';
import { getSql } from '@/db/pool';
import { getR2SignedUrl } from '@/lib/r2';
import { generateDentalChart } from '@/lib/prescription';
import { logger } from '@/lib/logger';
import { requireCsrf, checkRateLimit, jsonError } from '@/lib/apiAuth';

function parseToothDiagnoses(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') try { return JSON.parse(raw); } catch { return []; }
  return [];
}

export async function POST(req, { params }) {
  const csrfErr = requireCsrf(req);
  if (csrfErr) return csrfErr;
  const rateErr = checkRateLimit(req);
  if (rateErr) return rateErr;
  try {
    const sql = getSql();
    const { id } = await params;

    const rows = await sql`
      SELECT a.id, a.patient_name, a.patient_phone, a.patient_id,
             a.date, a.treatment, a.treatments, a.tooth_diagnoses,
             p.name AS p_name, p.age AS p_age, p.sex AS p_sex
      FROM appointments a
      LEFT JOIN patients p ON p.id = a.patient_id
      WHERE a.id = ${id}
      LIMIT 1
    `;

    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
    }

    const a = rows[0];

    const patient = {
      name: a.p_name || a.patient_name,
      phone: a.patient_phone,
      age: a.p_age,
      sex: a.p_sex,
    };

    const visit = {
      tooth_diagnoses: parseToothDiagnoses(a.tooth_diagnoses),
    };

    const appointment = {
      id: a.id,
      date: a.date,
    };

    const result = await generateDentalChart({ patient, visit, appointment });

    if (!result || !result.key) {
      return NextResponse.json({ error: 'Failed to generate chart' }, { status: 500 });
    }

    return NextResponse.json({ key: result.key, url: result.url });
  } catch (error) {
    logger.error('CHART_GENERATE_ERROR', {
      error: error.message,
      stack: error.stack,
    });
    return NextResponse.json(
      { error: error.message || 'Chart generation failed' },
      { status: 500 },
    );
  }
}
