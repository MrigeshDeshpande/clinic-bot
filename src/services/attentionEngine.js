import { logger } from '@/lib/logger';

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
          p.name           AS patient_name,
          a.followup_date,
          a.created_at     AS visit_date,
          COALESCE(a.treatment, a.arrival_complaint, 'Visit') AS treatment_label
        FROM appointments a
        JOIN patients p ON p.id = a.patient_id
        WHERE a.status = 'completed'
          AND a.followup_date IS NOT NULL
          AND a.followup_date < CURRENT_DATE
          AND a.patient_id IS NOT NULL
        ORDER BY a.patient_id, a.created_at DESC
      )
      SELECT *
      FROM last_visit lv
      WHERE NOT EXISTS (
        SELECT 1 FROM appointments a2
        WHERE a2.patient_id = lv.patient_id
          AND a2.status = 'completed'
          AND a2.created_at > lv.visit_date
      )
      ORDER BY lv.followup_date ASC
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
      ORDER BY tp.last_activity_at ASC
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
