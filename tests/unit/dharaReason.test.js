import { describe, it, expect, vi } from 'vitest';
import { getReason } from '../../src/services/dharaReason';

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function mockReasonSql({ patient, plans, visit, timeline }) {
  let callCount = 0;
  return vi.fn(() => {
    callCount++;
    // plansPromise is evaluated before Promise.all, so call 1 = plans
    switch (callCount) {
      case 1: return Promise.resolve(plans || []);
      case 2: return Promise.resolve(patient ? [patient] : []);
      case 3: return Promise.resolve(visit ? [visit] : []);
      case 4: return Promise.resolve(timeline || []);
      default: return Promise.resolve([]);
    }
  });
}

const basePatient = { id: 'pat-1', name: 'Ravi' };

const activePlanInactive14d = {
  id: 1, patient_id: 'pat-1', procedure_code_id: 1,
  tooth_number: 16, status: 'active', source: 'doctor',
  expected_steps: 3, completed_steps: 1, next_action: 'Step 2',
  created_at: daysAgo(60), last_activity_at: daysAgo(14),
  procedure_name: 'Root Canal', procedure_code: 'RCT',
};

const activePlanInactive35d = {
  id: 2, patient_id: 'pat-1', procedure_code_id: 1,
  tooth_number: 26, status: 'active', source: 'doctor',
  expected_steps: 5, completed_steps: 2, next_action: 'Crown placement',
  created_at: daysAgo(90), last_activity_at: daysAgo(35),
  procedure_name: 'Crown', procedure_code: 'CRN',
};

const completedPlan = {
  id: 3, patient_id: 'pat-1', procedure_code_id: 2,
  tooth_number: 11, status: 'completed', source: 'doctor',
  expected_steps: 2, completed_steps: 2, next_action: null,
  created_at: daysAgo(120), last_activity_at: daysAgo(30), completed_at: daysAgo(30),
  procedure_name: 'Scaling', procedure_code: 'SCL',
};

const visitOverdue = {
  id: 101, created_at: daysAgo(30),
  follow_up_status: 'pending', follow_up_date: daysAgo(15), follow_up_reason: 'Review',
  outstanding: 3500, treatment: 'Root Canal', followup_days_remaining: -15,
};

const visitNoFollowup = {
  id: 102, created_at: daysAgo(30),
  follow_up_status: null, follow_up_date: null, follow_up_reason: null,
  outstanding: 0, treatment: 'Scaling', followup_days_remaining: null,
};

const visitOverdueOnly = {
  id: 103, created_at: daysAgo(10),
  follow_up_status: 'pending', follow_up_date: daysAgo(5), follow_up_reason: 'Checkup',
  outstanding: 0, treatment: 'Checkup', followup_days_remaining: -5,
};

const visitOutstandingOnly = {
  id: 104, created_at: daysAgo(20),
  follow_up_status: null, follow_up_date: null, follow_up_reason: null,
  outstanding: 2000, treatment: 'Crown', followup_days_remaining: null,
};

const visitUpcomingFollowup = {
  id: 105, created_at: daysAgo(10),
  follow_up_status: 'pending', follow_up_date: daysAgo(-5), follow_up_reason: 'Review',
  outstanding: 500, treatment: 'Scaling', followup_days_remaining: 5,
};

const timelineEntry = (type) => ({
  id: `evt-${type}`,
  patient_id: 'pat-1',
  event_type: type,
  event_time: daysAgo(14),
  actor_type: 'doctor',
  metadata: { version: 1 },
});

describe('Dhara Reason', () => {
  it('returns 404 when patient not found', async () => {
    const sql = mockReasonSql({ patient: null });
    await expect(getReason(sql, 'pat-999')).rejects.toMatchObject({
      status: 404,
      message: 'Patient not found',
    });
  });

  it('returns 400 when patientId is missing', async () => {
    await expect(getReason(undefined, null)).rejects.toMatchObject({
      status: 400,
      message: 'patientId is required',
    });
  });

  it('LOW priority — no plans, no visit, no data', async () => {
    const sql = mockReasonSql({ patient: basePatient, plans: [], visit: null, timeline: [] });
    const result = await getReason(sql, 'pat-1');
    expect(result.priority).toBe('low');
    expect(result.confidence).toBe(0.4);
    expect(result.reason).toBe('No immediate concerns detected');
    expect(result.recommendation).toBe('No action needed');
    expect(result.evidence).toEqual([]);
  });

  it('LOW priority — all plans completed', async () => {
    const sql = mockReasonSql({
      patient: basePatient,
      plans: [completedPlan],
      visit: visitNoFollowup,
      timeline: [],
    });
    const result = await getReason(sql, 'pat-1');
    expect(result.priority).toBe('low');
    expect(result.confidence).toBe(0.4);
  });

  it('MEDIUM priority — active plan, inactive 14 days, no other signals', async () => {
    const sql = mockReasonSql({
      patient: basePatient,
      plans: [activePlanInactive14d],
      visit: visitNoFollowup,
      timeline: [timelineEntry('PLAN_CREATED')],
    });
    const result = await getReason(sql, 'pat-1');
    expect(result.priority).toBe('medium');
    expect(result.confidence).toBe(0.6);
    expect(result.evidence[0]).toContain('Treatment plan active');
    expect(result.evidence[1]).toContain('Last activity');
    expect(result.recommendation).toBe('Consider reaching out to patient for treatment continuation');
  });

  it('MEDIUM priority — just overdue follow-up', async () => {
    const sql = mockReasonSql({
      patient: basePatient,
      plans: [],
      visit: visitOverdueOnly,
      timeline: [],
    });
    const result = await getReason(sql, 'pat-1');
    expect(result.priority).toBe('medium');
    expect(result.confidence).toBe(0.6);
    expect(result.evidence[0]).toContain('Follow-up overdue');
    expect(result.recommendation).toBe('Send follow-up reminder to patient');
  });

  it('MEDIUM priority — just outstanding balance', async () => {
    const sql = mockReasonSql({
      patient: basePatient,
      plans: [],
      visit: visitOutstandingOnly,
      timeline: [],
    });
    const result = await getReason(sql, 'pat-1');
    expect(result.priority).toBe('medium');
    expect(result.confidence).toBe(0.6);
    expect(result.evidence[0]).toContain('Outstanding balance');
    expect(result.recommendation).toBe('Discuss outstanding balance at next visit');
  });

  it('HIGH priority — active plan inactive 30+ days alone', async () => {
    const sql = mockReasonSql({
      patient: basePatient,
      plans: [activePlanInactive35d],
      visit: visitNoFollowup,
      timeline: [timelineEntry('PLAN_CREATED'), timelineEntry('STEP_COMPLETED')],
    });
    const result = await getReason(sql, 'pat-1');
    expect(result.priority).toBe('high');
    expect(result.confidence).toBe(0.6);
    expect(result.evidence[0]).toContain('Crown');
    expect(result.evidence[1]).toContain('35 days');
    expect(result.recommendation).toBe('Schedule appointment to continue treatment');
  });

  it('HIGH priority — active plan 14d inactive + overdue follow-up', async () => {
    const sql = mockReasonSql({
      patient: basePatient,
      plans: [activePlanInactive14d],
      visit: visitOverdue,
      timeline: [timelineEntry('PLAN_CREATED')],
    });
    const result = await getReason(sql, 'pat-1');
    expect(result.priority).toBe('high');
    expect(result.recommendation).toBe('Call patient to reschedule follow-up and resume treatment');
  });

  it('HIGH priority — overdue follow-up 7+ days + outstanding > ₹1000 (no active plan)', async () => {
    const sql = mockReasonSql({
      patient: basePatient,
      plans: [completedPlan],
      visit: { ...visitOverdue, outstanding: 2000, followup_days_remaining: -10 },
      timeline: [],
    });
    const result = await getReason(sql, 'pat-1');
    expect(result.priority).toBe('high');
    expect(result.confidence).toBe(0.8);
    expect(result.recommendation).toContain('overdue follow-up');
  });

  it('HIGH priority — all 3 signals: active plan + overdue + outstanding', async () => {
    const sql = mockReasonSql({
      patient: basePatient,
      plans: [activePlanInactive14d],
      visit: { ...visitOverdue, outstanding: 3500, followup_days_remaining: -15 },
      timeline: [timelineEntry('PLAN_CREATED'), timelineEntry('STEP_COMPLETED')],
    });
    const result = await getReason(sql, 'pat-1');
    expect(result.priority).toBe('high');
    expect(result.confidence).toBe(1.0);
    expect(result.evidence).toHaveLength(6);
  });

  it('planId filter — only returns analysis for that specific plan', async () => {
    const sql = mockReasonSql({
      patient: basePatient,
      plans: [activePlanInactive14d],
      visit: visitNoFollowup,
      timeline: [],
    });
    const result = await getReason(sql, 'pat-1', { planId: 1 });
    expect(result.priority).toBe('medium');
    expect(result.patient_id).toBe('pat-1');
  });

  it('includes evidence with step progress for active plans', async () => {
    const sql = mockReasonSql({
      patient: basePatient,
      plans: [activePlanInactive14d],
      visit: visitNoFollowup,
      timeline: [],
    });
    const result = await getReason(sql, 'pat-1');
    expect(result.evidence.some(e => e.includes('1/3 steps completed'))).toBe(true);
    expect(result.evidence.some(e => e.includes('Next step: Step 2'))).toBe(true);
  });

  it('follow-up upcoming contributes to confidence but not overdue rules', async () => {
    const sql = mockReasonSql({
      patient: basePatient,
      plans: [],
      visit: visitUpcomingFollowup,
      timeline: [],
    });
    const result = await getReason(sql, 'pat-1');
    expect(result.priority).toBe('medium');
    expect(result.confidence).toBe(0.8);
    expect(result.evidence.some(e => e.includes('Follow-up in'))).toBe(true);
    expect(result.recommendation).toBe('Discuss outstanding balance at next visit');
  });

  it('SQL error on timeline query does not crash — other data still used', async () => {
    let callCount = 0;
    const sql = vi.fn(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve([activePlanInactive35d]);  // plansPromise
      if (callCount === 2) return Promise.resolve([basePatient]);  // patient query
      if (callCount === 3) return Promise.resolve([visitNoFollowup]);  // visit query
      if (callCount === 4) return Promise.reject(new Error('timeline error'));  // timeline
      return Promise.resolve([]);
    });
    const result = await getReason(sql, 'pat-1');
    expect(result.priority).toBe('high');
    expect(result.patient_name).toBe('Ravi');
  });
});
