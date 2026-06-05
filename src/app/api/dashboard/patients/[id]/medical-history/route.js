import { NextResponse } from 'next/server';
import { getSql } from '@/db/pool';
import { logger } from '@/lib/logger';
import { requireCsrf, checkRateLimit, checkBodySize, jsonError } from '@/lib/apiAuth';

export async function PATCH(req, { params }) {
  const csrfErr = requireCsrf(req);
  if (csrfErr) return csrfErr;
  const rateErr = checkRateLimit(req);
  if (rateErr) return rateErr;
  const sizeErr = checkBodySize(req);
  if (sizeErr) return sizeErr;
  try {
    const sql = getSql();
    const { id } = await params;
    const body = await req.json();
    const { allergies, chronicConditions, bloodGroup, bp, weight, medications } = body;

    if (!id) {
      return NextResponse.json({ error: 'Patient ID required' }, { status: 400 });
    }

    const setClauses = [];
    const queryParams = [];
    let p = 1;

    if (allergies !== undefined) {
      setClauses.push(`allergies = $${p++}`);
      queryParams.push(allergies);
    }
    if (chronicConditions !== undefined) {
      setClauses.push(`chronic_conditions = $${p++}`);
      queryParams.push(chronicConditions);
    }
    if (bloodGroup !== undefined) {
      setClauses.push(`blood_group = $${p++}`);
      queryParams.push(bloodGroup);
    }
    if (bp !== undefined) {
      setClauses.push(`bp = $${p++}`);
      queryParams.push(bp);
    }
    if (weight !== undefined) {
      setClauses.push(`weight = $${p++}`);
      queryParams.push(weight);
    }
    if (medications !== undefined) {
      setClauses.push(`medications = $${p++}`);
      queryParams.push(medications);
    }

    if (setClauses.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    setClauses.push('updated_at = NOW()');
    queryParams.push(id);

    const rows = await sql.query(
      `UPDATE patients SET ${setClauses.join(', ')} WHERE id = $${p} RETURNING id, allergies, chronic_conditions, blood_group, bp, weight, medications`,
      queryParams
    );

    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    logger.info('MEDICAL_HISTORY_UPDATED', { patientId: id });
    return NextResponse.json({ medicalHistory: rows[0] });
  } catch (error) {
    logger.error('MEDICAL_HISTORY_UPDATE_ERROR', { params, error: error.message });
    return jsonError(error);
  }
}
