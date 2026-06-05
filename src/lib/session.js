import { findSessionByWaId, upsertSession, saveSession } from '@/db/repositories/sessionRepository';
import { CLINIC } from '@/config/clinic';
import { logger } from '@/lib/logger';

export const MANUAL_MODE_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24h before auto-release

// In-memory session cache for replay mode and no-DB scenarios.
// Ensures session continuity when Neon persistence is unavailable.
const sessionCache = new Map();
const MAX_CACHE_SIZE = 500;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

// Periodic cleanup of expired cache entries
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of sessionCache) {
    if (now > entry.expiresAt) sessionCache.delete(key);
  }
}, CLEANUP_INTERVAL_MS).unref();

function cacheSession(session) {
  if (!session.waId) return;
  if (sessionCache.size >= MAX_CACHE_SIZE) {
    const firstKey = sessionCache.keys().next().value;
    if (firstKey) sessionCache.delete(firstKey);
  }
  sessionCache.set(session.waId, { session, expiresAt: Date.now() + CACHE_TTL_MS });
}

function getCached(waId) {
  const entry = sessionCache.get(waId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    sessionCache.delete(waId);
    return null;
  }
  return { ...entry.session, metrics: { ...entry.session.metrics } };
}

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
      bookingTimestamps: { date: null, time: null, treatment: null },
      pendingFields: ['treatment', 'date', 'time'],
      receivedEntities: { dates: [], times: [], treatments: [] },
      lastCorrection: { field: null, fromValue: null, toValue: null, timestamp: null },
      messageSequence: 0,
      lastMessageIds: [],
      manualMode: false,
      manualModeStartedAt: null,
      appointmentId: null,
      logicalId: null,
      reschedulingLogicalId: null,
      escalationReason: null,
      awaitingTreatmentHelp: null,
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
      bookingTimestamps: {
        date: contextRaw.bookingTimestamps?.date || null,
        time: contextRaw.bookingTimestamps?.time || null,
        treatment: contextRaw.bookingTimestamps?.treatment || null,
      },
      pendingFields: contextRaw.pendingFields || ['date', 'time', 'treatment'],
      receivedEntities: {
        dates: Array.isArray(contextRaw.receivedEntities?.dates) ? contextRaw.receivedEntities.dates : [],
        times: Array.isArray(contextRaw.receivedEntities?.times) ? contextRaw.receivedEntities.times : [],
        treatments: Array.isArray(contextRaw.receivedEntities?.treatments) ? contextRaw.receivedEntities.treatments : [],
      },
      lastCorrection: {
        field: contextRaw.lastCorrection?.field || null,
        fromValue: contextRaw.lastCorrection?.fromValue || null,
        toValue: contextRaw.lastCorrection?.toValue || null,
        timestamp: contextRaw.lastCorrection?.timestamp || null,
      },
      messageSequence: contextRaw.messageSequence || 0,
      lastMessageIds: Array.isArray(contextRaw.lastMessageIds) ? contextRaw.lastMessageIds : [],
      manualMode: contextRaw.manualMode === true,
      manualModeStartedAt: contextRaw.manualModeStartedAt || null,
      appointmentId: contextRaw.appointmentId || null,
      logicalId: contextRaw.logicalId || null,
      reschedulingLogicalId: contextRaw.reschedulingLogicalId || null,
      escalationReason: contextRaw.escalationReason || null,
    },
    metrics: {
      failedAttempts: metricsRaw.failedAttempts || 0,
      totalFailedAttempts: metricsRaw.totalFailedAttempts || 0,
      // Do NOT increment here — the handler increments messagesInState once per process.
      // Incrementing here would double-count: DB load (N) + handler (N+1) = N+2 instead of N+1.
      messagesInState: (metricsRaw.messagesInState || 0),
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

  // Auto-release manual mode after timeout
  if (session.context.manualMode && session.context.manualModeStartedAt) {
    const elapsed = Date.now() - new Date(session.context.manualModeStartedAt).getTime();
    if (elapsed > MANUAL_MODE_TIMEOUT_MS) {
      session.context.manualMode = false;
      session.context.manualModeStartedAt = null;
    }
  }

  return session;
}

export async function getOrCreate(waId, phoneNumberId, profileName) {
  // Detect role: doctor and receptionist waIds are configured in clinic.js
  // Strip leading + from both sides for reliable comparison
  const cleanWaId = waId.replace(/^\+/, '');
  const cleanDoctorWaId = (CLINIC.doctor?.waId || '').replace(/^\+/, '');
  const cleanReceptionistWaId = (CLINIC.receptionist?.waId || '').replace(/^\+/, '');
  let role = 'patient';
  if (cleanDoctorWaId && cleanWaId === cleanDoctorWaId) role = 'doctor';
  else if (cleanReceptionistWaId && cleanWaId === cleanReceptionistWaId) role = 'receptionist';

  // Layer 1: In-memory cache (replay mode, no-DB, or between saves)
  // Cached sessions are in internal format — return a shallow copy directly
  const cached = getCached(waId);
  if (cached) {
    // Always set role for doctor waId (overwrites stale 'patient' from pre-feature sessions)
    cached.context = { ...cached.context, role };
    return cached;
  }

  // Layer 2: Database
  const existing = await findSessionByWaId(waId);

  if (existing) {
    const session = rowToSession(existing);
    // Always set role (rowToSession drops non-standard context fields)
    session.context = { ...session.context, role };
    cacheSession(session);
    return session;
  }

  // Layer 3: New session — create via upsert or fallback to in-memory
  const session = emptySession(waId, phoneNumberId, profileName);
  session.context = { ...session.context, role };
  const created = await upsertSession({
    waId: session.waId,
    phoneNumberId: session.phoneNumberId,
    profileName: session.profileName,
  });
  if (created) {
    session.id = created.id;
    session.version = created.version;
    cacheSession(session);
  } else {
    // No DB available — cache in-memory for continuity
    cacheSession(session);
  }
  return session;
}

export async function save(session) {
  // Always update in-memory cache for continuity
  cacheSession(session);

  // DB persistence (may be unavailable in replay/no-DB mode)
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

/**
 * Clear in-memory session cache. Used between replay fixtures to
 * prevent cross-fixture state leakage when multiple fixtures share
 * the same waId (e.g., doctor fixtures).
 */
export function clearSessionCache() {
  sessionCache.clear();
}
