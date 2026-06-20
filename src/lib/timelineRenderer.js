export function describeEvent(event) {
  const m = event.metadata || {};
  switch (event.event_type) {
    case 'PLAN_CREATED':
      return `Treatment plan created${m.procedure_name ? `: ${m.procedure_name}` : ''}${m.tooth_number ? ` (tooth ${m.tooth_number})` : ''}`;
    case 'STEP_COMPLETED': {
      const names = m.step_names;
      if (Array.isArray(names) && names.length > 0) {
        return names.length === 1 ? `${names[0]} completed` : `${names.length} steps completed`;
      }
      return 'Step completed';
    }
    case 'PLAN_COMPLETED':
      return `Treatment plan completed${m.procedure_name ? `: ${m.procedure_name}` : ''}`;
    case 'FOLLOWUP_CREATED':
      return `Follow-up scheduled${m.follow_up_date ? ` for ${m.follow_up_date}` : ''}${m.reason ? ` (${m.reason})` : ''}`;
    case 'FOLLOWUP_CANCELLED':
      return `Follow-up cancelled`;
    case 'PAYMENT_RECEIVED':
      return `Payment received${m.amount ? `: ₹${m.amount}` : ''}${m.method ? ` via ${m.method}` : ''}`;
    case 'VISIT_COMPLETED':
      return `Visit completed${m.treatment ? ` — ${m.treatment}` : ''}`;
    case 'ATTENTION_ACKNOWLEDGED':
      return `Attention acknowledged${m.tooth_number ? ` (tooth ${m.tooth_number})` : ''}`;
    case 'ATTENTION_RESOLVED':
      return m.auto ? `Attention auto-resolved (plan completed)` : `Attention resolved`;
    case 'ATTENTION_REOPENED':
      return `Attention re-opened for review`;
    default:
      return event.event_type ? `${event.event_type.replace(/_/g, ' ').toLowerCase()}` : 'Unknown event';
  }
}

export function getEventSeverity(event) {
  switch (event.event_type) {
    case 'PAYMENT_RECEIVED':
    case 'STEP_COMPLETED':
    case 'PLAN_COMPLETED':
    case 'ATTENTION_RESOLVED':
      return 'positive';
    case 'FOLLOWUP_CANCELLED':
    case 'ATTENTION_ACKNOWLEDGED':
      return 'neutral';
    case 'PLAN_CREATED':
    case 'VISIT_COMPLETED':
    case 'FOLLOWUP_CREATED':
    case 'ATTENTION_REOPENED':
      return 'info';
    default:
      return 'neutral';
  }
}

export function getEventColor(event) {
  switch (getEventSeverity(event)) {
    case 'positive': return 'emerald';
    case 'neutral':  return 'gray';
    case 'info':     return 'blue';
    default:         return 'gray';
  }
}

export function getEventIcon(event) {
  switch (event.event_type) {
    case 'PLAN_CREATED':        return 'clipboard-plus';
    case 'STEP_COMPLETED':      return 'check-circle';
    case 'PLAN_COMPLETED':      return 'check-all';
    case 'FOLLOWUP_CREATED':    return 'calendar-plus';
    case 'FOLLOWUP_CANCELLED':  return 'calendar-x';
    case 'PAYMENT_RECEIVED':    return 'currency-rupee';
    case 'VISIT_COMPLETED':     return 'clipboard-check';
    case 'ATTENTION_ACKNOWLEDGED': return 'eye';
    case 'ATTENTION_RESOLVED':  return 'check-double';
    case 'ATTENTION_REOPENED':  return 'refresh';
    default:                    return 'circle';
  }
}
