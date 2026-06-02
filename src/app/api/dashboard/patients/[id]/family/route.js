import { NextResponse } from 'next/server';
import { getSql } from '@/db/pool';
import { logger } from '@/lib/logger';
import { checkRateLimit, jsonError, sanitizeResponse } from '@/lib/apiAuth';

export async function GET(req, { params }) {
  const rateErr = checkRateLimit(req);
  if (rateErr) return rateErr;
  try {
    const sql = getSql();
    const { id } = await params;

    const relationships = await sql`
      SELECT
        pr.id AS relationship_id,
        pr.relationship_type,
        p.id,
        p.name,
        p.age,
        p.sex,
        p.phone,
        p.created_at
      FROM patient_relationships pr
      JOIN patients p ON p.id = pr.related_patient_id
      WHERE pr.patient_id = ${id}
      ORDER BY pr.created_at ASC
    `;

    return NextResponse.json({ family: sanitizeResponse(relationships || []) });
  } catch (error) {
    logger.error('PATIENT_FAMILY_ERROR', { params, error: error.message });
    return jsonError(error);
  }
}

export async function POST(req, { params }) {
  const rateErr = checkRateLimit(req);
  if (rateErr) return rateErr;
  try {
    const sql = getSql();
    const { id } = await params;
    const body = await req.json();
    const { relatedPatientId, relationshipType } = body;

    if (!relatedPatientId) {
      return NextResponse.json({ error: 'relatedPatientId is required' }, { status: 400 });
    }
    if (relatedPatientId === id) {
      return NextResponse.json({ error: 'Cannot link a patient to themselves' }, { status: 400 });
    }

    // Verify both patients exist
    const patients = await sql`
      SELECT id FROM patients WHERE id IN (${id}, ${relatedPatientId}) LIMIT 2
    `;
    if (patients.length !== 2) {
      return NextResponse.json({ error: 'One or both patients not found' }, { status: 404 });
    }

    const validTypes = ['spouse', 'child', 'parent', 'sibling', 'guardian', 'other'];
    const type = validTypes.includes(relationshipType) ? relationshipType : 'other';

    // Also create the reverse relationship so it shows on both profiles
    await sql`
      INSERT INTO patient_relationships (patient_id, related_patient_id, relationship_type)
      VALUES (${id}, ${relatedPatientId}, ${type})
      ON CONFLICT (patient_id, related_patient_id) DO NOTHING
    `;
    await sql`
      INSERT INTO patient_relationships (patient_id, related_patient_id, relationship_type)
      VALUES (${relatedPatientId}, ${id}, ${type})
      ON CONFLICT (patient_id, related_patient_id) DO NOTHING
    `;

    const created = await sql`
      SELECT
        pr.id AS relationship_id,
        pr.relationship_type,
        p.id,
        p.name,
        p.age,
        p.sex,
        p.phone,
        p.created_at
      FROM patient_relationships pr
      JOIN patients p ON p.id = pr.related_patient_id
      WHERE pr.patient_id = ${id} AND pr.related_patient_id = ${relatedPatientId}
      LIMIT 1
    `;

    return NextResponse.json({ family: sanitizeResponse(created?.[0] || null) }, { status: 201 });
  } catch (error) {
    logger.error('PATIENT_FAMILY_CREATE_ERROR', { params, error: error.message });
    return jsonError(error);
  }
}

export async function DELETE(req, { params }) {
  const rateErr = checkRateLimit(req);
  if (rateErr) return rateErr;
  try {
    const sql = getSql();
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const relationshipId = searchParams.get('relationshipId');
    const relatedPatientId = searchParams.get('relatedPatientId');

    if (relationshipId) {
      // Delete by relationship ID (must belong to this patient)
      const rel = await sql`
        DELETE FROM patient_relationships
        WHERE id = ${relationshipId} AND patient_id = ${id}
        RETURNING related_patient_id
      `;
      if (rel.length > 0) {
        // Also delete the reverse relationship
        await sql`
          DELETE FROM patient_relationships
          WHERE patient_id = ${rel[0].related_patient_id} AND related_patient_id = ${id}
        `;
      }
    } else if (relatedPatientId) {
      // Delete by related patient ID
      await sql`
        DELETE FROM patient_relationships
        WHERE patient_id = ${id} AND related_patient_id = ${relatedPatientId}
      `;
      await sql`
        DELETE FROM patient_relationships
        WHERE patient_id = ${relatedPatientId} AND related_patient_id = ${id}
      `;
    } else {
      return NextResponse.json({ error: 'relationshipId or relatedPatientId required' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('PATIENT_FAMILY_DELETE_ERROR', { params, error: error.message });
    return jsonError(error);
  }
}
