import { getSql } from '@/db/pool';
import { logger } from '@/lib/logger';

export async function createPlan({ patientId, procedureCodeId, toothNumber, status, source, nextAction, notes }) {
  const sql = getSql();
  if (!sql) return null;

  try {
    const rows = await sql`
      INSERT INTO treatment_plans (
        patient_id, procedure_code_id, tooth_number, status, source,
        next_action, notes
      ) VALUES (
        ${patientId}, ${procedureCodeId}, ${toothNumber || null},
        ${status || 'active'}, ${source || 'doctor'},
        ${nextAction || null}, ${notes || null}
      )
      RETURNING *
    `;
    return rows[0] || null;
  } catch (error) {
    logger.error('TREATMENT_PLAN_CREATE_ERROR', { patientId, procedureCodeId, error: error.message });
    return null;
  }
}

export async function getPlanById(id) {
  const sql = getSql();
  if (!sql) return null;

  try {
    const rows = await sql`
      SELECT * FROM treatment_plans WHERE id = ${id}
    `;
    return rows[0] || null;
  } catch (error) {
    logger.error('TREATMENT_PLAN_GET_BY_ID_ERROR', { id, error: error.message });
    return null;
  }
}

export async function getPlansForPatient(patientId) {
  const sql = getSql();
  if (!sql) return [];

  try {
    const rows = await sql`
      SELECT * FROM treatment_plans
      WHERE patient_id = ${patientId}
      ORDER BY created_at DESC
    `;
    return rows;
  } catch (error) {
    logger.error('TREATMENT_PLANS_GET_FOR_PATIENT_ERROR', { patientId, error: error.message });
    return [];
  }
}

export async function getActivePlansForPatient(patientId) {
  const sql = getSql();
  if (!sql) return [];

  try {
    const rows = await sql`
      SELECT * FROM treatment_plans
      WHERE patient_id = ${patientId}
        AND status = 'active'
      ORDER BY created_at DESC
    `;
    return rows;
  } catch (error) {
    logger.error('TREATMENT_PLANS_GET_ACTIVE_ERROR', { patientId, error: error.message });
    return [];
  }
}

export async function createSteps(planId, stepNames) {
  const sql = getSql();
  if (!sql) return null;

  if (!stepNames || stepNames.length === 0) {
    logger.warn('TREATMENT_STEPS_CREATE_EMPTY', { planId });
    return [];
  }

  const cols = ['plan_id', 'step_order', 'step_name'];
  const perRow = cols.length;
  const placeholders = stepNames.map((_, i) =>
    `(${cols.map((_, j) => `$${i * perRow + j + 1}`).join(', ')})`
  ).join(', ');
  const params = stepNames.flatMap((name, i) => [
    planId,
    i + 1,
    name,
  ]);

  try {
    const rows = await sql.unsafe(`
      INSERT INTO treatment_plan_steps (plan_id, step_order, step_name)
      VALUES ${placeholders}
      ON CONFLICT (plan_id, step_order) DO UPDATE SET
        step_name = EXCLUDED.step_name
      RETURNING *
    `, params);
    return rows;
  } catch (error) {
    logger.error('TREATMENT_STEPS_CREATE_ERROR', { planId, count: stepNames.length, error: error.message });
    return null;
  }
}

export async function getStepsForPlan(planId) {
  const sql = getSql();
  if (!sql) return [];

  try {
    const rows = await sql`
      SELECT * FROM treatment_plan_steps
      WHERE plan_id = ${planId}
      ORDER BY step_order
    `;
    return rows;
  } catch (error) {
    logger.error('TREATMENT_STEPS_GET_FOR_PLAN_ERROR', { planId, error: error.message });
    return [];
  }
}

export async function getStepById(stepId) {
  const sql = getSql();
  if (!sql) return null;

  try {
    const rows = await sql`
      SELECT * FROM treatment_plan_steps WHERE id = ${stepId}
    `;
    return rows[0] || null;
  } catch (error) {
    logger.error('TREATMENT_STEP_GET_BY_ID_ERROR', { stepId, error: error.message });
    return null;
  }
}

export async function completeStep(stepId) {
  const sql = getSql();
  if (!sql) return null;

  try {
    const rows = await sql`
      UPDATE treatment_plan_steps
      SET status = 'completed', completed_at = NOW()
      WHERE id = ${stepId}
      RETURNING *
    `;
    const step = rows[0] || null;
    if (step) {
      await sql`
        UPDATE treatment_plans
        SET last_activity_at = NOW()
        WHERE id = ${step.plan_id}
      `;
    }
    return step;
  } catch (error) {
    logger.error('TREATMENT_STEP_COMPLETE_ERROR', { stepId, error: error.message });
    return null;
  }
}

export async function skipStep(stepId) {
  const sql = getSql();
  if (!sql) return null;

  try {
    const rows = await sql`
      UPDATE treatment_plan_steps
      SET status = 'skipped'
      WHERE id = ${stepId}
      RETURNING *
    `;
    const step = rows[0] || null;
    if (step) {
      await sql`
        UPDATE treatment_plans
        SET last_activity_at = NOW()
        WHERE id = ${step.plan_id}
      `;
    }
    return step;
  } catch (error) {
    logger.error('TREATMENT_STEP_SKIP_ERROR', { stepId, error: error.message });
    return null;
  }
}

export async function markPlanCompleted(planId) {
  const sql = getSql();
  if (!sql) return null;

  try {
    const rows = await sql`
      UPDATE treatment_plans
      SET status = 'completed', completed_at = NOW(), last_activity_at = NOW()
      WHERE id = ${planId}
      RETURNING *
    `;
    return rows[0] || null;
  } catch (error) {
    logger.error('TREATMENT_PLAN_MARK_COMPLETED_ERROR', { planId, error: error.message });
    return null;
  }
}

export async function getProcedureCodeById(id) {
  const sql = getSql();
  if (!sql) return null;

  try {
    const rows = await sql`
      SELECT * FROM procedure_codes WHERE id = ${id}
    `;
    return rows[0] || null;
  } catch (error) {
    logger.error('PROCEDURE_CODE_GET_BY_ID_ERROR', { id, error: error.message });
    return null;
  }
}

export async function getProcedureCodeByCode(code) {
  const sql = getSql();
  if (!sql) return null;

  try {
    const rows = await sql`
      SELECT * FROM procedure_codes WHERE code = ${code}
    `;
    return rows[0] || null;
  } catch (error) {
    logger.error('PROCEDURE_CODE_GET_BY_CODE_ERROR', { code, error: error.message });
    return null;
  }
}
