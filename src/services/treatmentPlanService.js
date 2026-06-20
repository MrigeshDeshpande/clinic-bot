import { recordEvent } from './timelineService';

export async function createPlanWithSteps({ patientId, procedureCodeId, toothNumber, source }, sql) {
  if (!patientId) throw Object.assign(new Error('patientId is required'), { status: 400 });
  if (!procedureCodeId) throw Object.assign(new Error('procedureCodeId is required'), { status: 400 });

  return sql.begin(async (tx) => {
    const [procedure] = await tx`
      SELECT * FROM procedure_codes WHERE id = ${procedureCodeId}
    `;
    if (!procedure) throw Object.assign(new Error('Procedure code not found'), { status: 404 });

    const stepNames = procedure.expected_steps || [];

    const [plan] = await tx`
      INSERT INTO treatment_plans (
        patient_id, procedure_code_id, tooth_number, source,
        expected_steps, next_action
      ) VALUES (
        ${patientId}, ${procedureCodeId}, ${toothNumber || null},
        ${source || 'doctor'}, ${stepNames.length}, ${stepNames[0] || null}
      )
      RETURNING *
    `;

    let steps = [];
    if (stepNames.length > 0) {
      const cols = ['plan_id', 'step_order', 'step_name'];
      const perRow = cols.length;
      const placeholders = stepNames.map((_, i) =>
        `(${cols.map((_, j) => `$${i * perRow + j + 1}`).join(', ')})`
      ).join(', ');
      const params = stepNames.flatMap((name, i) => [plan.id, i + 1, name]);

      steps = await tx.unsafe(`
        INSERT INTO treatment_plan_steps (plan_id, step_order, step_name)
        VALUES ${placeholders}
        ON CONFLICT (plan_id, step_order) DO NOTHING
        RETURNING *
      `, params);
    }

    await recordEvent(tx, {
      patient_id: plan.patient_id,
      event_type: 'PLAN_CREATED',
      actor_type: source || 'doctor',
      source_type: 'treatment_plan',
      source_id: plan.id,
      metadata: { version: 1, procedure_code: procedure.code, procedure_name: procedure.name, tooth_number: toothNumber, expected_steps: stepNames.length, source: source || 'doctor' },
    });

    return { plan, steps };
  });
}

export async function completeVisitSteps({ appointmentId, stepIds }, sql) {
  if (!appointmentId) throw Object.assign(new Error('appointmentId is required'), { status: 400 });
  if (!stepIds || stepIds.length === 0) {
    throw Object.assign(new Error('stepIds is required'), { status: 400 });
  }

  return sql.begin(async (tx) => {
    const existingSteps = await tx`
      SELECT s.id, s.plan_id, s.status, p.status AS plan_status
      FROM treatment_plan_steps s
      JOIN treatment_plans p ON p.id = s.plan_id
      WHERE s.id = ANY(${stepIds})
    `;

    if (existingSteps.length !== stepIds.length) {
      const found = new Set(existingSteps.map(s => s.id));
      const missing = stepIds.filter(id => !found.has(id));
      throw Object.assign(
        new Error(`Treatment step(s) not found: ${missing.join(', ')}`),
        { status: 404 }
      );
    }

    for (const step of existingSteps) {
      if (step.status !== 'pending') {
        throw Object.assign(
          new Error(`Step ${step.id} is already ${step.status}`),
          { status: 400 }
        );
      }
      if (step.plan_status !== 'active') {
        throw Object.assign(
          new Error(`Plan ${step.plan_id} is ${step.plan_status}, not active`),
          { status: 400 }
        );
      }
    }

    const updatedSteps = await tx`
      UPDATE treatment_plan_steps
      SET status = 'completed', completed_at = NOW(), appointment_id = ${appointmentId}
      WHERE id = ANY(${stepIds})
        AND status = 'pending'
      RETURNING *
    `;

    const planIds = [...new Set(updatedSteps.map(s => s.plan_id))];

    for (const planId of planIds) {
      await tx`
        UPDATE treatment_plans SET last_activity_at = NOW() WHERE id = ${planId}
      `;
    }

    const plans = [];
    for (const planId of planIds) {
      const plan = await recalculatePlan(planId, tx);
      if (plan) plans.push(plan);
    }

    for (const plan of plans) {
      const completedForPlan = updatedSteps.filter(s => s.plan_id === plan.id);
      if (completedForPlan.length > 0) {
        await recordEvent(tx, {
          patient_id: plan.patient_id,
          event_type: 'STEP_COMPLETED',
          actor_type: 'doctor',
          source_type: 'treatment_plan',
          source_id: plan.id,
          metadata: { version: 1, step_names: completedForPlan.map(s => s.step_name), step_ids: completedForPlan.map(s => s.id), step_count: completedForPlan.length, appointment_id: appointmentId },
        });
      }
      if (plan.status === 'completed') {
        await recordEvent(tx, {
          patient_id: plan.patient_id,
          event_type: 'PLAN_COMPLETED',
          actor_type: 'doctor',
          source_type: 'treatment_plan',
          source_id: plan.id,
          metadata: { version: 1, plan_id: plan.id, tooth_number: plan.tooth_number, total_steps: plan.expected_steps, completed_steps: plan.completed_steps },
        });
      }
    }

    return { steps: updatedSteps, plans };
  });
}

export async function recalculatePlan(planId, sql) {
  const [plan] = await sql`
    WITH completed_count AS (
      SELECT COUNT(*)::int AS cnt
      FROM treatment_plan_steps
      WHERE plan_id = ${planId} AND status = 'completed'
    ),
    next_step AS (
      SELECT step_name
      FROM treatment_plan_steps
      WHERE plan_id = ${planId} AND status = 'pending'
      ORDER BY step_order
      LIMIT 1
    ),
    plan_info AS (
      SELECT expected_steps FROM treatment_plans WHERE id = ${planId}
    )
    UPDATE treatment_plans tp SET
      completed_steps = (SELECT cnt FROM completed_count),
      next_action = (SELECT step_name FROM next_step),
      status = CASE
        WHEN (SELECT cnt FROM completed_count) >= (SELECT expected_steps FROM plan_info)
        THEN 'completed'::treatment_plan_status
        ELSE 'active'::treatment_plan_status
      END,
      attention_status = CASE
        WHEN (SELECT cnt FROM completed_count) >= (SELECT expected_steps FROM plan_info)
        THEN 'resolved'
        ELSE attention_status
      END,
      completed_at = CASE
        WHEN (SELECT cnt FROM completed_count) >= (SELECT expected_steps FROM plan_info)
          AND completed_at IS NULL
        THEN NOW()
        ELSE completed_at
      END,
      last_activity_at = NOW()
    WHERE tp.id = ${planId}
    RETURNING *
  `;
  return plan || null;
}

export async function getNextPendingStep(planId, sql) {
  const [step] = await sql`
    SELECT * FROM treatment_plan_steps
    WHERE plan_id = ${planId} AND status = 'pending'
    ORDER BY step_order
    LIMIT 1
  `;
  return step || null;
}
