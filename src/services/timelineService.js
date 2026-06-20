import { logger } from '@/lib/logger';
import { EVENT_TYPES, TIMELINE_EVENT_METADATA_VERSION } from '@/lib/timelineEvents';

export async function recordEvent(sql, { patient_id, event_type, actor_type, actor_id, source_type, source_id, metadata }) {
  if (!patient_id || !event_type) {
    logger.warn('TIMELINE_SKIP_MISSING_FIELDS', { patient_id, event_type });
    return null;
  }
  const [row] = await sql`
    INSERT INTO patient_timeline_events (patient_id, event_type, actor_type, actor_id, source_type, source_id, metadata)
    VALUES (${patient_id}, ${event_type}, ${actor_type || 'system'}, ${actor_id || null}, ${source_type || null}, ${source_id || null}, ${metadata || { version: TIMELINE_EVENT_METADATA_VERSION }})
    RETURNING id, event_type, event_time
  `;
  return row || null;
}

export async function recordPlanCreated(tx, {
  patient_id, actor_type, actor_id, source_type, source_id,
  procedure_code, procedure_name, tooth_number, expected_steps, source,
}) {
  if (!patient_id) throw new Error('recordPlanCreated: patient_id is required');
  return recordEvent(tx, {
    patient_id,
    event_type: EVENT_TYPES.PLAN_CREATED,
    actor_type,
    actor_id,
    source_type,
    source_id,
    metadata: {
      version: TIMELINE_EVENT_METADATA_VERSION,
      procedure_code,
      procedure_name,
      tooth_number,
      expected_steps,
      source,
    },
  });
}

export async function recordStepCompleted(tx, {
  patient_id, actor_type, actor_id, source_type, source_id,
  step_names, step_ids, step_count, appointment_id,
}) {
  if (!patient_id) throw new Error('recordStepCompleted: patient_id is required');
  return recordEvent(tx, {
    patient_id,
    event_type: EVENT_TYPES.STEP_COMPLETED,
    actor_type,
    actor_id,
    source_type,
    source_id,
    metadata: {
      version: TIMELINE_EVENT_METADATA_VERSION,
      step_names,
      step_ids,
      step_count,
      appointment_id,
    },
  });
}

export async function recordPlanCompleted(tx, {
  patient_id, actor_type, actor_id, source_type, source_id,
  plan_id, tooth_number, total_steps, completed_steps,
}) {
  if (!patient_id) throw new Error('recordPlanCompleted: patient_id is required');
  return recordEvent(tx, {
    patient_id,
    event_type: EVENT_TYPES.PLAN_COMPLETED,
    actor_type,
    actor_id,
    source_type,
    source_id,
    metadata: {
      version: TIMELINE_EVENT_METADATA_VERSION,
      plan_id,
      tooth_number,
      total_steps,
      completed_steps,
    },
  });
}

export async function recordVisitCompleted(tx, {
  patient_id, actor_type, actor_id, source_type, source_id,
  treatment, mode,
}) {
  if (!patient_id) throw new Error('recordVisitCompleted: patient_id is required');
  return recordEvent(tx, {
    patient_id,
    event_type: EVENT_TYPES.VISIT_COMPLETED,
    actor_type,
    actor_id,
    source_type,
    source_id,
    metadata: {
      version: TIMELINE_EVENT_METADATA_VERSION,
      treatment,
      mode,
    },
  });
}

export async function recordFollowupCreated(tx, {
  patient_id, actor_type, actor_id, source_type, source_id,
  follow_up_date, reason, created_by,
}) {
  if (!patient_id) throw new Error('recordFollowupCreated: patient_id is required');
  return recordEvent(tx, {
    patient_id,
    event_type: EVENT_TYPES.FOLLOWUP_CREATED,
    actor_type,
    actor_id,
    source_type,
    source_id,
    metadata: {
      version: TIMELINE_EVENT_METADATA_VERSION,
      follow_up_date,
      reason,
      created_by,
    },
  });
}

export async function recordFollowupCancelled(tx, {
  patient_id, actor_type, actor_id, source_type, source_id,
}) {
  if (!patient_id) throw new Error('recordFollowupCancelled: patient_id is required');
  return recordEvent(tx, {
    patient_id,
    event_type: EVENT_TYPES.FOLLOWUP_CANCELLED,
    actor_type,
    actor_id,
    source_type,
    source_id,
    metadata: {
      version: TIMELINE_EVENT_METADATA_VERSION,
    },
  });
}

export async function recordPaymentReceived(tx, {
  patient_id, actor_type, actor_id, source_type, source_id,
  amount, method, outstanding_after,
}) {
  if (!patient_id) throw new Error('recordPaymentReceived: patient_id is required');
  return recordEvent(tx, {
    patient_id,
    event_type: EVENT_TYPES.PAYMENT_RECEIVED,
    actor_type,
    actor_id,
    source_type,
    source_id,
    metadata: {
      version: TIMELINE_EVENT_METADATA_VERSION,
      amount,
      method,
      outstanding_after,
    },
  });
}

export async function recordAttentionAcknowledged(tx, {
  patient_id, actor_type, actor_id, source_type, source_id,
  plan_id, tooth_number, previous_status,
}) {
  if (!patient_id) throw new Error('recordAttentionAcknowledged: patient_id is required');
  return recordEvent(tx, {
    patient_id,
    event_type: EVENT_TYPES.ATTENTION_ACKNOWLEDGED,
    actor_type,
    actor_id,
    source_type,
    source_id,
    metadata: {
      version: TIMELINE_EVENT_METADATA_VERSION,
      plan_id,
      tooth_number,
      previous_status,
    },
  });
}

export async function recordAttentionResolved(tx, {
  patient_id, actor_type, actor_id, source_type, source_id,
  plan_id, tooth_number, previous_status, auto,
}) {
  if (!patient_id) throw new Error('recordAttentionResolved: patient_id is required');
  return recordEvent(tx, {
    patient_id,
    event_type: EVENT_TYPES.ATTENTION_RESOLVED,
    actor_type,
    actor_id,
    source_type,
    source_id,
    metadata: {
      version: TIMELINE_EVENT_METADATA_VERSION,
      plan_id,
      tooth_number,
      previous_status,
      auto,
    },
  });
}

export async function recordAttentionReopened(tx, {
  patient_id, actor_type, actor_id, source_type, source_id,
  plan_id, tooth_number, previous_status,
}) {
  if (!patient_id) throw new Error('recordAttentionReopened: patient_id is required');
  return recordEvent(tx, {
    patient_id,
    event_type: EVENT_TYPES.ATTENTION_REOPENED,
    actor_type,
    actor_id,
    source_type,
    source_id,
    metadata: {
      version: TIMELINE_EVENT_METADATA_VERSION,
      plan_id,
      tooth_number,
      previous_status,
    },
  });
}

export async function getPatientTimeline(sql, patientId, limit = 50) {
  return await sql`
    SELECT * FROM patient_timeline_events
    WHERE patient_id = ${patientId}
    ORDER BY event_time DESC
    LIMIT ${limit}
  `;
}
