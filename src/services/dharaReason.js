import { logger } from '@/lib/logger';

export async function getReason(sql, patientId, { planId } = {}) {
  if (!patientId) {
    throw Object.assign(new Error('patientId is required'), { status: 400 });
  }

  try {
    let plansPromise;
    if (planId) {
      plansPromise = sql`
        SELECT tp.*, pc.name AS procedure_name, pc.code AS procedure_code
        FROM treatment_plans tp
        JOIN procedure_codes pc ON pc.id = tp.procedure_code_id
        WHERE tp.id = ${planId} AND tp.patient_id = ${patientId}
        LIMIT 1
      `.catch(() => []);
    } else {
      plansPromise = sql`
        SELECT tp.*, pc.name AS procedure_name, pc.code AS procedure_code
        FROM treatment_plans tp
        JOIN procedure_codes pc ON pc.id = tp.procedure_code_id
        WHERE tp.patient_id = ${patientId}
        ORDER BY tp.created_at DESC
        LIMIT 10
      `.catch(() => []);
    }

    const [patientRows, planRows, visitRows, timelineRows] = await Promise.all([
      sql`SELECT id, name FROM patients WHERE id = ${patientId} LIMIT 1`.catch(() => []),
      plansPromise,
      sql`
        SELECT a.id, a.created_at, a.follow_up_status, a.follow_up_date, a.follow_up_reason,
          (COALESCE(a.consultation_fee, 0) + COALESCE(a.treatment_charges, 0) + COALESCE(a.medicine_charges, 0) - COALESCE(a.paid_amount, 0)) AS outstanding,
          a.treatment,
          (a.follow_up_date - CURRENT_DATE)::int AS followup_days_remaining
        FROM appointments a
        WHERE a.patient_id = ${patientId} AND a.status = 'completed'
        ORDER BY a.created_at DESC
        LIMIT 1
      `.catch(() => []),
      sql`
        SELECT * FROM patient_timeline_events
        WHERE patient_id = ${patientId}
        ORDER BY event_time DESC
        LIMIT 20
      `.catch(() => []),
    ]);

    const patient = patientRows[0] || null;
    const plans = planRows || [];
    const lastVisit = visitRows[0] || null;
    const timeline = timelineRows || [];

    if (!patient) {
      throw Object.assign(new Error('Patient not found'), { status: 404 });
    }

    const analysis = analyzeData({ plans, lastVisit, timeline });
    const evidence = buildEvidence({ plans, lastVisit, analysis });
    const priority = determinePriority(analysis);
    const confidence = computeConfidence(analysis);
    const reason = buildReason(priority, analysis, evidence);
    const recommendation = buildRecommendation(priority, analysis);

    return {
      patient_id: patientId,
      patient_name: patient.name,
      priority,
      reason,
      recommendation,
      confidence,
      evidence,
      analysis,
    };
  } catch (err) {
    if (err.status) throw err;
    logger.error('DHARA_REASON_ERROR', { patientId, error: err.message });
    throw Object.assign(new Error('Failed to analyze patient data'), { status: 500 });
  }
}

function analyzeData({ plans, lastVisit, timeline }) {
  const activePlans = plans.filter(p => p.status === 'active');
  const completedPlans = plans.filter(p => p.status === 'completed');

  const mostActivePlan = activePlans.length > 0
    ? activePlans.reduce((a, b) =>
        (a.last_activity_at || a.created_at) < (b.last_activity_at || b.created_at) ? a : b
      )
    : null;

  const daysSinceActivity = mostActivePlan
    ? Math.floor((Date.now() - new Date(mostActivePlan.last_activity_at || mostActivePlan.created_at).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const daysSinceCreation = mostActivePlan
    ? Math.floor((Date.now() - new Date(mostActivePlan.created_at).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const followUpOverdue = !!(lastVisit && lastVisit.follow_up_status === 'pending' && lastVisit.followup_days_remaining !== null && lastVisit.followup_days_remaining < 0);
  const followUpUpcoming = !!(lastVisit && lastVisit.follow_up_status === 'pending' && lastVisit.followup_days_remaining !== null && lastVisit.followup_days_remaining >= 0);

  return {
    has_active_plan: activePlans.length > 0,
    plan_count: plans.length,
    active_plan_count: activePlans.length,
    completed_plan_count: completedPlans.length,
    procedure_name: mostActivePlan ? mostActivePlan.procedure_name : null,
    tooth_number: mostActivePlan ? mostActivePlan.tooth_number : null,
    days_since_last_activity: daysSinceActivity,
    days_since_creation: daysSinceCreation,
    completed_steps: mostActivePlan ? mostActivePlan.completed_steps : 0,
    expected_steps: mostActivePlan ? mostActivePlan.expected_steps : 0,
    next_action: mostActivePlan ? mostActivePlan.next_action : null,
    follow_up_overdue: followUpOverdue,
    follow_up_upcoming: followUpUpcoming,
    days_overdue: followUpOverdue ? Math.abs(lastVisit.followup_days_remaining) : 0,
    follow_up_reason: lastVisit ? lastVisit.follow_up_reason : null,
    follow_up_date: lastVisit ? lastVisit.follow_up_date : null,
    outstanding: lastVisit ? Math.max(0, Number(lastVisit.outstanding) || 0) : 0,
    timeline_event_count: timeline.length,
    last_event_type: timeline.length > 0 ? timeline[0].event_type : null,
    last_event_time: timeline.length > 0 ? timeline[0].event_time : null,
  };
}

function buildEvidence({ plans, lastVisit, analysis }) {
  const evidence = [];

  if (analysis.has_active_plan) {
    const plan = plans.find(p => p.status === 'active');
    if (plan) {
      evidence.push(
        `Treatment plan active: ${plan.procedure_name}${plan.tooth_number ? ` (tooth ${plan.tooth_number})` : ''}`
      );

      if (analysis.days_since_last_activity !== null && analysis.days_since_last_activity > 0) {
        evidence.push(`Last activity ${analysis.days_since_last_activity} days ago`);
      }

      if (analysis.completed_steps > 0 && analysis.expected_steps > 0) {
        evidence.push(`${analysis.completed_steps}/${analysis.expected_steps} steps completed`);
      }

      if (analysis.next_action) {
        evidence.push(`Next step: ${analysis.next_action}`);
      }
    }
  }

  if (analysis.follow_up_overdue) {
    evidence.push(`Follow-up overdue by ${analysis.days_overdue} days${analysis.follow_up_reason ? ` (${analysis.follow_up_reason})` : ''}`);
  } else if (analysis.follow_up_upcoming) {
    const daysAhead = analysis.follow_up_date
      ? Math.ceil((new Date(analysis.follow_up_date) - Date.now()) / (1000 * 60 * 60 * 24))
      : null;
    evidence.push(`Follow-up in ${daysAhead} days${analysis.follow_up_reason ? ` (${analysis.follow_up_reason})` : ''}`);
  }

  if (analysis.outstanding > 0) {
    evidence.push(`Outstanding balance ₹${analysis.outstanding}`);
  }

  return evidence;
}

function determinePriority(analysis) {
  const { has_active_plan, days_since_last_activity, follow_up_overdue, days_overdue, outstanding } = analysis;

  if (has_active_plan && days_since_last_activity !== null && days_since_last_activity >= 30) return 'high';
  if (has_active_plan && days_since_last_activity !== null && days_since_last_activity >= 14 && follow_up_overdue) return 'high';
  if (follow_up_overdue && days_overdue >= 7 && outstanding > 1000) return 'high';

  if (has_active_plan && days_since_last_activity !== null && days_since_last_activity >= 14) return 'medium';
  if (follow_up_overdue) return 'medium';
  if (outstanding > 0) return 'medium';

  return 'low';
}

function computeConfidence(analysis) {
  let signalCount = 0;
  if (analysis.has_active_plan) signalCount++;
  if (analysis.follow_up_overdue || analysis.follow_up_upcoming) signalCount++;
  if (analysis.outstanding > 0) signalCount++;

  if (signalCount >= 3) return 1.0;
  if (signalCount >= 2) return 0.8;
  if (signalCount === 1) return 0.6;
  return 0.4;
}

function buildReason(priority, analysis, evidence) {
  if (priority === 'low') return 'No immediate concerns detected';
  if (evidence.length === 0) return 'No immediate concerns detected';

  const parts = [];
  if (analysis.has_active_plan && analysis.procedure_name) {
    let s = `Treatment plan for ${analysis.procedure_name}${analysis.tooth_number ? ` (tooth ${analysis.tooth_number})` : ''} is active`;
    if (analysis.days_since_last_activity !== null && analysis.days_since_last_activity >= 7) {
      s += ` with no activity for ${analysis.days_since_last_activity} days`;
    }
    parts.push(s);
  }
  if (analysis.follow_up_overdue) {
    parts.push(`Follow-up is overdue by ${analysis.days_overdue} days`);
  }
  if (analysis.outstanding > 0) {
    parts.push(`Outstanding balance of ₹${analysis.outstanding} remains`);
  }

  return parts.length > 0 ? parts.join('. ') + '.' : evidence[0];
}

function buildRecommendation(priority, analysis) {
  switch (priority) {
    case 'high':
      if (analysis.follow_up_overdue && analysis.has_active_plan) {
        return 'Call patient to reschedule follow-up and resume treatment';
      }
      if (analysis.follow_up_overdue && analysis.outstanding > 1000) {
        return 'Contact patient regarding overdue follow-up and outstanding balance';
      }
      if (analysis.outstanding > 1000) {
        return 'Contact patient regarding outstanding balance and schedule next appointment';
      }
      return 'Schedule appointment to continue treatment';
    case 'medium':
      if (analysis.follow_up_overdue) {
        return 'Send follow-up reminder to patient';
      }
      if (analysis.days_since_last_activity !== null && analysis.days_since_last_activity > 7) {
        return 'Consider reaching out to patient for treatment continuation';
      }
      if (analysis.outstanding > 0) {
        return 'Discuss outstanding balance at next visit';
      }
      return 'Monitor during next routine visit';
    case 'low':
    default:
      return 'No action needed';
  }
}
