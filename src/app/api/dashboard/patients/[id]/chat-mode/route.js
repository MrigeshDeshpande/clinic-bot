import { NextResponse } from 'next/server';
import { getSql } from '@/db/pool';
import { logger } from '@/lib/logger';
import { getOrCreate, save } from '@/lib/session';

export async function GET(req, { params }) {
  try {
    const sql = getSql();
    const { id } = await params;

    const patientRows = await sql`
      SELECT wa_id, phone FROM patients WHERE id = ${id} LIMIT 1
    `;

    if (!patientRows || patientRows.length === 0) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    const waId = patientRows[0].wa_id || patientRows[0].phone;
    if (!waId) {
      return NextResponse.json({ manualMode: false });
    }

    const session = await getOrCreate(waId, null, null);
    return NextResponse.json({
      manualMode: session?.context?.manualMode === true,
      manualModeStartedAt: session?.context?.manualModeStartedAt || null,
    });
  } catch (error) {
    logger.error('CHAT_MODE_GET_ERROR', { params, error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req, { params }) {
  try {
    const sql = getSql();
    const { id } = await params;
    const body = await req.json();
    const { manualMode } = body;

    if (typeof manualMode !== 'boolean') {
      return NextResponse.json({ error: 'manualMode must be a boolean' }, { status: 400 });
    }

    const patientRows = await sql`
      SELECT wa_id, phone, name FROM patients WHERE id = ${id} LIMIT 1
    `;

    if (!patientRows || patientRows.length === 0) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    const patient = patientRows[0];
    const waId = patient.wa_id || patient.phone;
    if (!waId) {
      return NextResponse.json({ error: 'Patient has no WhatsApp ID or phone' }, { status: 400 });
    }

    const session = await getOrCreate(waId, null, patient.name || 'Patient');
    if (!session) {
      return NextResponse.json({ error: 'Could not load session' }, { status: 500 });
    }

    session.context.manualMode = manualMode;
    session.context.manualModeStartedAt = manualMode ? new Date().toISOString() : null;
    await save(session);

    logger.info('CHAT_MODE_UPDATED', { patientId: id, waId, manualMode });
    return NextResponse.json({ success: true, manualMode });
  } catch (error) {
    logger.error('CHAT_MODE_PATCH_ERROR', { params, error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
