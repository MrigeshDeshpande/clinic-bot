import { describe, it, expect, vi } from 'vitest';
import { recordEvent, getPatientTimeline } from '../../src/services/timelineService';
import { describeEvent, getEventSeverity, getEventColor, getEventIcon } from '../../src/lib/timelineRenderer';

// ──────────────────────────────────────────────
// Timeline Service Tests
// ──────────────────────────────────────────────
describe('timelineService', () => {
  describe('recordEvent', () => {
    it('inserts an event and returns the row', async () => {
      const mockRow = { id: 'evt-1', event_type: 'VISIT_COMPLETED', event_time: new Date() };
      const sql = vi.fn().mockResolvedValue([mockRow]);
      const result = await recordEvent(sql, {
        patient_id: 'pat-1',
        event_type: 'VISIT_COMPLETED',
        actor_type: 'doctor',
        source_type: 'appointment',
        source_id: 'appt-1',
        metadata: { version: 1, treatment: 'Root Canal' },
      });
      expect(result).toEqual(mockRow);
      expect(sql).toHaveBeenCalledOnce();
    });

    it('returns null when patient_id is missing', async () => {
      const sql = vi.fn();
      const result = await recordEvent(sql, { event_type: 'VISIT_COMPLETED' });
      expect(result).toBeNull();
      expect(sql).not.toHaveBeenCalled();
    });

    it('returns null when event_type is missing', async () => {
      const sql = vi.fn();
      const result = await recordEvent(sql, { patient_id: 'pat-1' });
      expect(result).toBeNull();
      expect(sql).not.toHaveBeenCalled();
    });
  });

  describe('getPatientTimeline', () => {
    it('returns events ordered by event_time DESC', async () => {
      const events = [
        { id: 'evt-3', event_type: 'PAYMENT_RECEIVED', event_time: '2026-06-20T10:00:00Z' },
        { id: 'evt-2', event_type: 'VISIT_COMPLETED', event_time: '2026-06-19T10:00:00Z' },
        { id: 'evt-1', event_type: 'PLAN_CREATED', event_time: '2026-06-18T10:00:00Z' },
      ];
      const sql = vi.fn().mockResolvedValue(events);
      const result = await getPatientTimeline(sql, 'pat-1', 10);
      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('evt-3');
      expect(sql).toHaveBeenCalledOnce();
    });

    it('returns empty array when no events exist', async () => {
      const sql = vi.fn().mockResolvedValue([]);
      const result = await getPatientTimeline(sql, 'pat-999', 50);
      expect(result).toEqual([]);
    });
  });
});

// ──────────────────────────────────────────────
// Timeline Renderer Tests
// ──────────────────────────────────────────────
describe('timelineRenderer', () => {
  describe('describeEvent', () => {
    it('renders PLAN_CREATED with procedure name and tooth', () => {
      const text = describeEvent({ event_type: 'PLAN_CREATED', metadata: { procedure_name: 'Root Canal Treatment', tooth_number: 16 } });
      expect(text).toBe('Treatment plan created: Root Canal Treatment (tooth 16)');
    });

    it('renders PLAN_CREATED without optional metadata', () => {
      const text = describeEvent({ event_type: 'PLAN_CREATED', metadata: {} });
      expect(text).toBe('Treatment plan created');
    });

    it('renders STEP_COMPLETED with single step name', () => {
      const text = describeEvent({ event_type: 'STEP_COMPLETED', metadata: { step_names: ['RCT Sitting 1'] } });
      expect(text).toBe('RCT Sitting 1 completed');
    });

    it('renders STEP_COMPLETED with multiple steps', () => {
      const text = describeEvent({ event_type: 'STEP_COMPLETED', metadata: { step_names: ['RCT Sitting 1', 'RCT Sitting 2'] } });
      expect(text).toBe('2 steps completed');
    });

    it('renders STEP_COMPLETED without metadata', () => {
      const text = describeEvent({ event_type: 'STEP_COMPLETED', metadata: {} });
      expect(text).toBe('Step completed');
    });

    it('renders PLAN_COMPLETED', () => {
      const text = describeEvent({ event_type: 'PLAN_COMPLETED', metadata: { procedure_name: 'Crown' } });
      expect(text).toBe('Treatment plan completed: Crown');
    });

    it('renders FOLLOWUP_CREATED with date and reason', () => {
      const text = describeEvent({ event_type: 'FOLLOWUP_CREATED', metadata: { follow_up_date: '2026-07-15', reason: 'Review' } });
      expect(text).toBe('Follow-up scheduled for 2026-07-15 (Review)');
    });

    it('renders FOLLOWUP_CREATED without date or reason', () => {
      const text = describeEvent({ event_type: 'FOLLOWUP_CREATED', metadata: {} });
      expect(text).toBe('Follow-up scheduled');
    });

    it('renders FOLLOWUP_CANCELLED', () => {
      const text = describeEvent({ event_type: 'FOLLOWUP_CANCELLED', metadata: {} });
      expect(text).toBe('Follow-up cancelled');
    });

    it('renders PAYMENT_RECEIVED with amount and method', () => {
      const text = describeEvent({ event_type: 'PAYMENT_RECEIVED', metadata: { amount: 500, method: 'upi' } });
      expect(text).toBe('Payment received: ₹500 via upi');
    });

    it('renders PAYMENT_RECEIVED without metadata', () => {
      const text = describeEvent({ event_type: 'PAYMENT_RECEIVED', metadata: {} });
      expect(text).toBe('Payment received');
    });

    it('renders VISIT_COMPLETED', () => {
      const text = describeEvent({ event_type: 'VISIT_COMPLETED', metadata: { treatment: 'Root Canal' } });
      expect(text).toBe('Visit completed — Root Canal');
    });

    it('renders ATTENTION_ACKNOWLEDGED with tooth', () => {
      const text = describeEvent({ event_type: 'ATTENTION_ACKNOWLEDGED', metadata: { tooth_number: 16 } });
      expect(text).toBe('Attention acknowledged (tooth 16)');
    });

    it('renders ATTENTION_RESOLVED auto', () => {
      const text = describeEvent({ event_type: 'ATTENTION_RESOLVED', metadata: { auto: true } });
      expect(text).toBe('Attention auto-resolved (plan completed)');
    });

    it('renders ATTENTION_REOPENED', () => {
      const text = describeEvent({ event_type: 'ATTENTION_REOPENED', metadata: {} });
      expect(text).toBe('Attention re-opened for review');
    });

    it('renders unknown event type gracefully', () => {
      const text = describeEvent({ event_type: 'UNKNOWN_EVENT', metadata: {} });
      expect(text).toBe('unknown event');
    });

    it('renders missing event_type gracefully', () => {
      const text = describeEvent({ metadata: {} });
      expect(text).toBe('Unknown event');
    });
  });

  describe('getEventSeverity', () => {
    it('maps positive events', () => {
      expect(getEventSeverity({ event_type: 'PAYMENT_RECEIVED' })).toBe('positive');
      expect(getEventSeverity({ event_type: 'STEP_COMPLETED' })).toBe('positive');
      expect(getEventSeverity({ event_type: 'PLAN_COMPLETED' })).toBe('positive');
      expect(getEventSeverity({ event_type: 'ATTENTION_RESOLVED' })).toBe('positive');
    });

    it('maps neutral events', () => {
      expect(getEventSeverity({ event_type: 'FOLLOWUP_CANCELLED' })).toBe('neutral');
      expect(getEventSeverity({ event_type: 'ATTENTION_ACKNOWLEDGED' })).toBe('neutral');
    });

    it('maps info events', () => {
      expect(getEventSeverity({ event_type: 'PLAN_CREATED' })).toBe('info');
      expect(getEventSeverity({ event_type: 'VISIT_COMPLETED' })).toBe('info');
      expect(getEventSeverity({ event_type: 'FOLLOWUP_CREATED' })).toBe('info');
      expect(getEventSeverity({ event_type: 'ATTENTION_REOPENED' })).toBe('info');
    });
  });

  describe('getEventColor', () => {
    it('returns emerald for positive', () => {
      expect(getEventColor({ event_type: 'PAYMENT_RECEIVED' })).toBe('emerald');
    });

    it('returns gray for neutral', () => {
      expect(getEventColor({ event_type: 'FOLLOWUP_CANCELLED' })).toBe('gray');
    });

    it('returns blue for info', () => {
      expect(getEventColor({ event_type: 'VISIT_COMPLETED' })).toBe('blue');
    });
  });

  describe('getEventIcon', () => {
    it('returns icon for each event type', () => {
      expect(getEventIcon({ event_type: 'PLAN_CREATED' })).toBe('clipboard-plus');
      expect(getEventIcon({ event_type: 'STEP_COMPLETED' })).toBe('check-circle');
      expect(getEventIcon({ event_type: 'PLAN_COMPLETED' })).toBe('check-all');
      expect(getEventIcon({ event_type: 'FOLLOWUP_CREATED' })).toBe('calendar-plus');
      expect(getEventIcon({ event_type: 'FOLLOWUP_CANCELLED' })).toBe('calendar-x');
      expect(getEventIcon({ event_type: 'PAYMENT_RECEIVED' })).toBe('currency-rupee');
      expect(getEventIcon({ event_type: 'VISIT_COMPLETED' })).toBe('clipboard-check');
      expect(getEventIcon({ event_type: 'ATTENTION_ACKNOWLEDGED' })).toBe('eye');
      expect(getEventIcon({ event_type: 'ATTENTION_RESOLVED' })).toBe('check-double');
      expect(getEventIcon({ event_type: 'ATTENTION_REOPENED' })).toBe('refresh');
      expect(getEventIcon({ event_type: 'UNKNOWN' })).toBe('circle');
    });
  });
});
