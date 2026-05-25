import { findSessionByWaId, upsertSession, saveSession } from '@/db/repositories/sessionRepository';
import { logger } from '@/lib/logger';

function emptySession(waId, phoneNumberId, profileName) {
  return {
    id: null,
    waId,
    phoneNumberId: phoneNumberId || null,
    profileName: profileName || null,
    state: 'IDLE',
    previousState: null,
    context: {
      booking: { date: null, time: null, treatment: null, patientName: null, patientPhone: null, notes: null },
      appointmentId: null,
      escalationReason: null,
    },
    metrics: { failedAttempts: 0, totalFailedAttempts: 0, messagesInState: 0, frustrationScore: 0, currentField: null },
    isEscalated: false,
    version: 1,
  };
}

function rowToSession(row) {
  const contextRaw = (row.context || {});
  const metricsRaw = (row.metrics || {});

  const session = {
    id: row.id,
    waId: row.wa_id,
    phoneNumberId: row.phone_number_id,
    profileName: row.profile_name,
    state: row.state,
    previousState: row.previous_state,
    context: {
      booking: {
        date: contextRaw.booking?.date || null,
        time: contextRaw.booking?.time || null,
        treatment: contextRaw.booking?.treatment || null,
        patientName: contextRaw.booking?.patientName || null,
        patientPhone: contextRaw.booking?.patientPhone || null,
        notes: contextRaw.booking?.notes || null,
      },
      appointmentId: contextRaw.appointmentId || null,
      escalationReason: contextRaw.escalationReason || null,
    },
    metrics: {
      failedAttempts: metricsRaw.failedAttempts || 0,
      totalFailedAttempts: metricsRaw.totalFailedAttempts || 0,
      messagesInState: (metricsRaw.messagesInState || 0) + 1,
      frustrationScore: metricsRaw.frustrationScore || 0,
      currentField: metricsRaw.currentField || null,
    },
    isEscalated: row.is_escalated || false,
    version: row.version || 1,
  };

  // If session expired and not in a terminal state, mark as ABANDONED
  if (row.expires_at && new Date(row.expires_at) < new Date() && !['DONE', 'ABANDONED'].includes(row.state)) {
    session.state = 'ABANDONED';
    session.previousState = row.state;
  }

  return session;
}

export async function getOrCreate(waId, phoneNumberId, profileName) {
  const existing = await findSessionByWaId(waId);

  if (existing) {
    return rowToSession(existing);
  }

  // No existing session — create one via upsert
  const session = emptySession(waId, phoneNumberId, profileName);
  const created = await upsertSession({
    waId: session.waId,
    phoneNumberId: session.phoneNumberId,
    profileName: session.profileName,
  });
  if (created) {
    session.id = created.id;
    session.version = created.version;
  }
  return session;
}

export async function save(session) {
  if (!session.id) return;

  try {
    const updated = await saveSession(session);
    if (updated) {
      session.version = updated.version;
    }
  } catch (error) {
    logger.error('SESSION_SAVE_FAILED', { sessionId: session.id, error: error.message });
  }
}
