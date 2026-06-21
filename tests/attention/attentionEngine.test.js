import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getOverdueFollowups,
  getIncompleteTreatments,
  getPendingPayments,
  getAttentionSummary,
  setAttentionStatus,
} from '../../src/services/attentionEngine';

// Helper: create a mock sql client that returns given data
function mockSql(data) {
  return vi.fn(() => Promise.resolve(data));
}

// setAttentionStatus calls updateAttentionStatus from the repository
vi.mock('@/db/repositories/treatmentPlanRepository', () => ({
  updateAttentionStatus: vi.fn(),
}));
import { updateAttentionStatus } from '@/db/repositories/treatmentPlanRepository';

describe('Attention Engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ──────────────────────────────────────────────
  // Scenario 1 & 2: Overdue Follow-ups
  // ──────────────────────────────────────────────
  describe('getOverdueFollowups', () => {
    it('Patient overdue followup → appears', async () => {
      const sql = mockSql([
        {
          patient_id: 1,
          patient_name: 'Ravi',
          follow_up_date: '2026-01-15',
          follow_up_reason: 'Review',
          follow_up_status: 'pending',
          days_overdue: 19,
        },
      ]);
      const result = await getOverdueFollowups(sql);
      expect(result).toHaveLength(1);
      expect(result[0].patient_name).toBe('Ravi');
      expect(result[0].days_overdue).toBe(19);
      expect(result[0].follow_up_status).toBe('pending');
    });

    it('Patient returned (newer visit after followup) → disappears', async () => {
      const sql = mockSql([]);
      const result = await getOverdueFollowups(sql);
      expect(result).toHaveLength(0);
    });

    it('SQL error → returns empty gracefully', async () => {
      const sql = vi.fn(() => Promise.reject(new Error('DB down')));
      const result = await getOverdueFollowups(sql);
      expect(result).toEqual([]);
    });
  });

  // ──────────────────────────────────────────────
  // Scenario 3, 4 & 5: Incomplete Treatments
  // ──────────────────────────────────────────────
  describe('getIncompleteTreatments', () => {
    it('Treatment inactive 10 days → appears', async () => {
      const sql = mockSql([
        {
          plan_id: 1,
          patient_id: 1,
          patient_name: 'Priya',
          tooth_number: 16,
          procedure_name: 'Root Canal',
          days_since_activity: 10,
          attention_status: 'new',
          next_step: 'Access cavity preparation',
        },
      ]);
      const result = await getIncompleteTreatments(sql);
      expect(result).toHaveLength(1);
      expect(result[0].patient_name).toBe('Priya');
      expect(result[0].days_since_activity).toBe(10);
      expect(result[0].attention_status).toBe('new');
    });

    it('Treatment acknowledged → appears (sorted as acknowledged)', async () => {
      const sql = mockSql([
        {
          plan_id: 2,
          patient_id: 2,
          patient_name: 'Amit',
          attention_status: 'acknowledged',
          days_since_activity: 8,
          procedure_name: 'Scaling',
          next_step: 'Ultrasonic scaling',
        },
      ]);
      const result = await getIncompleteTreatments(sql);
      expect(result).toHaveLength(1);
      expect(result[0].attention_status).toBe('acknowledged');
    });

    it('Treatment resolved → disappears (filtered by query)', async () => {
      const sql = mockSql([]);
      const result = await getIncompleteTreatments(sql);
      expect(result).toHaveLength(0);
    });

    it('SQL error → returns empty gracefully', async () => {
      const sql = vi.fn(() => Promise.reject(new Error('connection lost')));
      const result = await getIncompleteTreatments(sql);
      expect(result).toEqual([]);
    });
  });

  // ──────────────────────────────────────────────
  // Scenario 6 & 7: Pending Payments
  // ──────────────────────────────────────────────
  describe('getPendingPayments', () => {
    it('Partial payment → appears with outstanding balance', async () => {
      const sql = mockSql([
        {
          appointment_id: 1,
          patient_id: 1,
          patient_name: 'Sunita',
          outstanding: 500,
          treatment_label: 'Crown',
        },
      ]);
      const result = await getPendingPayments(sql);
      expect(result).toHaveLength(1);
      expect(result[0].patient_name).toBe('Sunita');
      expect(result[0].outstanding).toBe(500);
    });

    it('Fully paid → disappears', async () => {
      const sql = mockSql([]);
      const result = await getPendingPayments(sql);
      expect(result).toHaveLength(0);
    });

    it('SQL error → returns empty gracefully', async () => {
      const sql = vi.fn(() => Promise.reject(new Error('timeout')));
      const result = await getPendingPayments(sql);
      expect(result).toEqual([]);
    });
  });

  // ──────────────────────────────────────────────
  // getAttentionSummary: parallel aggregation
  // ──────────────────────────────────────────────
  describe('getAttentionSummary', () => {
    it('runs all 3 queries in parallel and combines results', async () => {
      let callCount = 0;
      const sql = vi.fn(() => {
        callCount++;
        // Each of the 3 functions calls sql once, in order:
        // 1 = getOverdueFollowups, 2 = getIncompleteTreatments, 3 = getPendingPayments
        if (callCount === 1) return Promise.resolve([
          { patient_id: 'pat-1', patient_name: 'Ravi', days_overdue: 5 },
        ]);
        if (callCount === 2) return Promise.resolve([
          { plan_id: 'plan-1', patient_name: 'Priya', days_since_activity: 10 },
        ]);
        return Promise.resolve([
          { appointment_id: 'appt-1', patient_name: 'Sunita', outstanding: 500 },
        ]);
      });

      const result = await getAttentionSummary(sql);
      expect(result).toHaveProperty('overdue_followups');
      expect(result).toHaveProperty('incomplete_treatments');
      expect(result).toHaveProperty('pending_payments');
      expect(result.overdue_followups).toHaveLength(1);
      expect(result.incomplete_treatments).toHaveLength(1);
      expect(result.pending_payments).toHaveLength(1);
    });

    it('one query failure returns [] for that category without crashing others', async () => {
      let callCount = 0;
      const sql = vi.fn(() => {
        callCount++;
        if (callCount === 2) return Promise.reject(new Error('partial failure'));
        return Promise.resolve([]);
      });

      const result = await getAttentionSummary(sql);
      expect(result.overdue_followups).toEqual([]);
      expect(result.incomplete_treatments).toEqual([]);
      expect(result.pending_payments).toEqual([]);
    });
  });

  // ──────────────────────────────────────────────
  // Attention Status Transitions
  // ──────────────────────────────────────────────
  describe('setAttentionStatus', () => {
    function mockTx() {
      const fn = vi.fn().mockResolvedValue([{ id: 'evt-1', event_type: 'ATTENTION_ACKNOWLEDGED', event_time: new Date() }]);
      return Object.assign(fn, { begin: vi.fn(cb => cb(fn)) });
    }

    it('acknowledge a plan → succeeds', async () => {
      updateAttentionStatus.mockResolvedValue({ id: 1, patient_id: 1, tooth_number: 16, attention_status: 'acknowledged' });
      const result = await setAttentionStatus(mockTx(), 1, 'acknowledged');
      expect(result.attention_status).toBe('acknowledged');
      expect(updateAttentionStatus).toHaveBeenCalledWith(1, 'acknowledged', expect.any(Function));
    });

    it('resolve a plan → succeeds', async () => {
      updateAttentionStatus.mockResolvedValue({ id: 1, patient_id: 1, attention_status: 'resolved' });
      const result = await setAttentionStatus(mockTx(), 1, 'resolved');
      expect(result.attention_status).toBe('resolved');
    });

    it('un-acknowledge (mark new) → succeeds', async () => {
      updateAttentionStatus.mockResolvedValue({ id: 1, patient_id: 1, attention_status: 'new' });
      const result = await setAttentionStatus(mockTx(), 1, 'new');
      expect(result.attention_status).toBe('new');
    });

    it('invalid status → throws 400', async () => {
      await expect(setAttentionStatus(mockTx(), 1, 'invalid')).rejects.toMatchObject({ status: 400 });
      expect(updateAttentionStatus).not.toHaveBeenCalled();
    });

    it('repository returns null (not found / invalid transition) → throws 404', async () => {
      updateAttentionStatus.mockResolvedValue(null);
      await expect(setAttentionStatus(mockTx(), 999, 'acknowledged')).rejects.toMatchObject({ status: 404 });
    });
  });
});
