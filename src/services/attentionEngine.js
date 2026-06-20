import { logger } from '@/lib/logger';
import { updateAttentionStatus } from '@/db/repositories/treatmentPlanRepository';
import { recordEvent } from './timelineService';

/**
 * Get patients with overdue follow-ups.
 * Patients whose followup_date has passed AND who haven't returned since.
 * ! followup_date column may not exist yet — returns [] if error.
 */
export async function getOverdueFollowups(sql, limit = 20) {
  try {
    return await sql`
      WITH last_visit AS (
        SELECT DISTINCT ON (a.patient_id)
          a.patient_id,
          p.name              AS patient_name,
          a.follow_up_date,
          a.follow_up_reason,
          a.follow_up_status,
          a.created_at        AS visit_date,
          COALESCE(a.treatment, a.arrival_complaint, 'Visit') AS treatment_label
        FROM appointments a
        JOIN patients p ON p.id = a.patient_id
        WHERE a.status = 'completed'
          AND a.follow_up_date IS NOT NULL
          AND a.follow_up_date < CURRENT_DATE
          AND a.follow_up_status = 'pending'
          AND a.patient_id IS NOT NULL
        ORDER BY a.patient_id, a.created_at DESC
      )
      SELECT *,
        (CURRENT_DATE - lv.follow_up_date)::int AS days_overdue
      FROM last_visit lv
      WHERE NOT EXISTS (
        SELECT 1 FROM appointments a2
        WHERE a2.patient_id = lv.patient_id
          AND a2.status = 'completed'
          AND a2.created_at > lv.visit_date
      )
      ORDER BY lv.follow_up_date ASC
      LIMIT ${limit}
    `;
  } catch (err) {
    logger.warn('ATTENTION_OVERDUE_FOLLOWUPS_FAILED', { error: err.message });
    return [];
  }
}

/**
 * Get active treatment plans with no activity for 7+ days.
 */
export async function getIncompleteTreatments(sql, limit = 20) {
  try {
    return await sql`
      SELECT
        tp.id                  AS plan_id,
        tp.patient_id,
        p.name                 AS patient_name,
        tp.tooth_number,
        pc.name                AS procedure_name,
        tp.last_activity_at,
        tp.created_at,
        tp.attention_status,
        (CURRENT_DATE - tp.last_activity_at::date) AS days_since_activity,
        (
          SELECT ts.step_name
          FROM treatment_plan_steps ts
          WHERE ts.plan_id = tp.id AND ts.status = 'pending'
          ORDER BY ts.step_order ASC
          LIMIT 1
        ) AS next_step
      FROM treatment_plans tp
      JOIN patients p ON p.id = tp.patient_id
      JOIN procedure_codes pc ON pc.id = tp.procedure_code_id
      WHERE tp.status = 'active'
        AND tp.last_activity_at < CURRENT_DATE - INTERVAL '7 days'
        AND tp.attention_status IS DISTINCT FROM 'resolved'
      ORDER BY
        CASE tp.attention_status WHEN 'new' THEN 0 ELSE 1 END,
        tp.last_activity_at ASC
      LIMIT ${limit}
    `;
  } catch (err) {
    logger.warn('ATTENTION_INCOMPLETE_TREATMENTS_FAILED', { error: err.message });
    return [];
  }
}

/**
 * Get patients with outstanding balance on completed visits.
 */
export async function getPendingPayments(sql, limit = 20) {
  try {
    return await sql`
      SELECT
        a.id                  AS appointment_id,
        a.patient_id,
        p.name                AS patient_name,
        a.created_at          AS visit_date,
        (
          COALESCE(a.consultation_fee, 0)
          + COALESCE(a.treatment_charges, 0)
          + COALESCE(a.medicine_charges, 0)
          - COALESCE(a.paid_amount, 0)
        ) AS outstanding,
        COALESCE(a.treatment, a.arrival_complaint, 'Visit') AS treatment_label
      FROM appointments a
      JOIN patients p ON p.id = a.patient_id
      WHERE a.status = 'completed'
        AND a.patient_id IS NOT NULL
        AND (
          COALESCE(a.consultation_fee, 0)
          + COALESCE(a.treatment_charges, 0)
          + COALESCE(a.medicine_charges, 0)
          - COALESCE(a.paid_amount, 0)
        ) > 0
      ORDER BY outstanding DESC
      LIMIT ${limit}
    `;
  } catch (err) {
    logger.warn('ATTENTION_PENDING_PAYMENTS_FAILED', { error: err.message });
    return [];
  }
}

/**
 * Set attention status on a treatment plan with transition validation.
 * Allowed: new↔acknowledged, new/acknowledged→resolved.
 * Not allowed: resolved→anything.
 */
export async function setAttentionStatus(sql, planId, status, actorType = 'doctor') {
  if (!['acknowledged', 'resolved', 'new'].includes(status)) {
    throw Object.assign(new Error(`Invalid attention status: ${status}`), { status: 400 });
  }

  return sql.begin(async (tx) => {
    const result = await updateAttentionStatus(planId, status, tx);
    if (!result) {
      throw Object.assign(new Error('Plan not found or invalid transition'), { status: 404 });
    }

    await recordEvent(tx, {
      patient_id: result.patient_id,
      event_type: status === 'acknowledged' ? 'ATTENTION_ACKNOWLEDGED' :
                  status === 'resolved' ? 'ATTENTION_RESOLVED' : 'ATTENTION_REOPENED',
      actor_type: actorType,
      source_type: 'treatment_plan',
      source_id: planId,
      metadata: { version: 1, plan_id: planId, tooth_number: result.tooth_number, previous_status: result.attention_status },
    });

    return result;
  });
}

/**
 * Run all 3 attention queries in parallel and return a summary.
 * Each query is independent; one failure returns [] for that category.
 */
export async function getAttentionSummary(sql) {
  const [overdue_followups, incomplete_treatments, pending_payments] = await Promise.all([
    getOverdueFollowups(sql),
    getIncompleteTreatments(sql),
    getPendingPayments(sql),
  ]);

  return { overdue_followups, incomplete_treatments, pending_payments };
}
