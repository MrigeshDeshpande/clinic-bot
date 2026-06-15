import { NextResponse } from 'next/server';
import { getSql } from '@/db/pool';
import { createPatient, findPatientByPhone } from '@/db/repositories/patientRepository';
import { logger } from '@/lib/logger';
import { requireCsrf, checkRateLimit, checkBodySize, jsonError, sanitizeResponse } from '@/lib/apiAuth';

export async function GET(req) {
  const rateErr = checkRateLimit(req);
  if (rateErr) return rateErr;
  try {
    const sql = getSql();

    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q') || '';
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 50);

    let patients;
    if (q.length >= 2) {
      const pattern = `%${q}%`;
      patients = await sql`
        SELECT p.id, p.name, p.phone, p.age, p.sex, p.wa_id, p.created_at,
          COALESCE(ac.visit_count, 0)::int AS visit_count,
          ac.last_visit,
          lv.time AS last_visit_time
        FROM patients p
        LEFT JOIN (
          SELECT patient_id,
            COUNT(*) FILTER (WHERE status = 'completed') AS visit_count,
            MAX(date) AS last_visit
          FROM appointments
          GROUP BY patient_id
        ) ac ON ac.patient_id = p.id
        LEFT JOIN LATERAL (
          SELECT time FROM appointments
          WHERE patient_id = p.id AND date = ac.last_visit AND status = 'completed'
          LIMIT 1
        ) lv ON true
        WHERE p.name ILIKE ${pattern} OR p.phone ILIKE ${pattern}
        ORDER BY p.created_at DESC
        LIMIT ${limit}
      `;
    } else {
      patients = await sql`
        SELECT p.id, p.name, p.phone, p.age, p.sex, p.wa_id, p.created_at,
          COALESCE(ac.visit_count, 0)::int AS visit_count,
          ac.last_visit,
          lv.time AS last_visit_time
        FROM patients p
        LEFT JOIN (
          SELECT patient_id,
            COUNT(*) FILTER (WHERE status = 'completed') AS visit_count,
            MAX(date) AS last_visit
          FROM appointments
          GROUP BY patient_id
        ) ac ON ac.patient_id = p.id
        LEFT JOIN LATERAL (
          SELECT time FROM appointments
          WHERE patient_id = p.id AND date = ac.last_visit AND status = 'completed'
          LIMIT 1
        ) lv ON true
        ORDER BY p.created_at DESC
        LIMIT ${limit}
      `;
    }

    return NextResponse.json({ patients: sanitizeResponse(patients || []) });
  } catch (error) {
    logger.error('DASHBOARD_PATIENTS_ERROR', { error: error.message });
    return jsonError(error);
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
    const body = await req.json();
    const name = body.name?.trim();

    if (!name) {
      return NextResponse.json({ error: 'Patient name required' }, { status: 400 });
    }

    const existing = body.phone ? await findPatientByPhone(body.phone) : null;
    if (existing) {
      const existingName = (existing.name || '').trim().toLowerCase();
      const incomingName = name.trim().toLowerCase();
      if (existingName && existingName !== incomingName) {
        return NextResponse.json(
          { error: `Phone already belongs to ${existing.name}. Select that patient or enter a different phone.` },
          { status: 409 }
        );
      }
    }

    const patient = await createPatient({
      name,
      age: body.age || null,
      sex: body.sex || null,
      phone: body.phone || null,
      waId: body.phone || null,
      location: body.location || null,
    });

    if (!patient) {
      return NextResponse.json({ error: 'Failed to create patient' }, { status: 500 });
    }

    logger.info('PATIENT_CREATED_FROM_DASHBOARD', { id: patient.id });
    return NextResponse.json({ patient: sanitizeResponse(patient) });
  } catch (error) {
    logger.error('DASHBOARD_PATIENT_CREATE_ERROR', { error: error.message });
    return jsonError(error);
  }
}
