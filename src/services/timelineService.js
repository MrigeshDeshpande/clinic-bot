import { logger } from '@/lib/logger';

export async function recordEvent(sql, { patient_id, event_type, actor_type, actor_id, source_type, source_id, metadata }) {
  if (!patient_id || !event_type) {
    logger.warn('TIMELINE_SKIP_MISSING_FIELDS', { patient_id, event_type });
    return null;
  }
  const [row] = await sql`
    INSERT INTO patient_timeline_events (patient_id, event_type, actor_type, actor_id, source_type, source_id, metadata)
    VALUES (${patient_id}, ${event_type}, ${actor_type || 'system'}, ${actor_id || null}, ${source_type || null}, ${source_id || null}, ${JSON.stringify(metadata || { version: 1 })})
    RETURNING id, event_type, event_time
  `;
  return row || null;
}

export async function getPatientTimeline(sql, patientId, limit = 50) {
  return await sql`
    SELECT * FROM patient_timeline_events
    WHERE patient_id = ${patientId}
    ORDER BY event_time DESC
    LIMIT ${limit}
  `;
}
