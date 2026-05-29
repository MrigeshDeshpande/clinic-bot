import { getSql } from '@/db/pool';
import { logger } from '@/lib/logger';

// ───────────────────────────────────────────────
// Create a new appointment (version 1 of a new logical chain)
// ───────────────────────────────────────────────
export async function createAppointment({ sessionId, waId, patientName, date, time, treatment }) {
  const sql = getSql();
  if (!sql) return null;

  try {
    const rows = await sql`
      INSERT INTO appointments (logical_id, version, session_id, wa_id, patient_name, date, time, treatment)
      VALUES (gen_random_uuid(), 1, ${sessionId || null}, ${waId}, ${patientName || null},
              ${date}, ${time}, ${treatment || null})
      RETURNING *
    `;
    return rows[0] || null;
  } catch (error) {
    logger.error('APPOINTMENT_CREATE_ERROR', { waId, error: error.message });
    return null;
  }
}

// ───────────────────────────────────────────────
// Find an appointment by its specific version ID
// ───────────────────────────────────────────────
export async function findAppointmentById(id) {
  const sql = getSql();
  if (!sql) return null;

  try {
    const rows = await sql`
      SELECT * FROM appointments WHERE id = ${id}
    `;
    return rows[0] || null;
  } catch (error) {
    logger.error('APPOINTMENT_FIND_BY_ID_ERROR', { id, error: error.message });
    return null;
  }
}

// ───────────────────────────────────────────────
// Find all appointments for a user — returns only the latest version
// per logical_id (i.e. current state of each booking chain)
// ───────────────────────────────────────────────
export async function findAppointmentsByWaId(waId) {
  const sql = getSql();
  if (!sql) return [];

  try {
    const rows = await sql`
      SELECT DISTINCT ON (logical_id) *
      FROM appointments
      WHERE wa_id = ${waId}
      ORDER BY logical_id, version DESC
    `;
    return rows;
  } catch (error) {
    logger.error('APPOINTMENT_FIND_ERROR', { waId, error: error.message });
    return [];
  }
}

// ───────────────────────────────────────────────
// Cancel an appointment by its specific version ID
// ───────────────────────────────────────────────
export async function cancelAppointment(id, reason) {
  const sql = getSql();
  if (!sql) return null;

  try {
    const rows = await sql`
      UPDATE appointments
      SET status = 'cancelled',
          cancelled_at = NOW(),
          cancellation_reason = ${reason || null},
          updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;
    return rows[0] || null;
  } catch (error) {
    logger.error('APPOINTMENT_CANCEL_ERROR', { id, error: error.message });
    return null;
  }
}

// ───────────────────────────────────────────────
// Find upcoming confirmed appointments — returns only the
// latest version per booking chain (avoids showing old
// versions that were superseded by reschedules)
// ───────────────────────────────────────────────
export async function findUpcomingByWaId(waId) {
  const sql = getSql();
  if (!sql) return [];

  try {
    const rows = await sql`
      SELECT DISTINCT ON (logical_id) *
      FROM appointments
      WHERE wa_id = ${waId}
        AND status = 'confirmed'
        AND date >= CURRENT_DATE
      ORDER BY logical_id, version DESC
    `;
    return rows;
  } catch (error) {
    logger.error('APPOINTMENT_FIND_UPCOMING_ERROR', { waId, error: error.message });
    return [];
  }
}

// ───────────────────────────────────────────────
// Supersede an appointment — marks the current version as superseded
// (by setting superseded_at) and creates a new version with updated
// details. Old data is preserved in the superseded row — it is NOT
// mutated in place.
//
// This is the replacement for the old updateAppointment() which
// destroyed the previous state.
//
// Thread safety: Uses UNIQUE (logical_id, version) constraint. If two
// concurrent calls try to supersede the same logical_id, one will
// fail on INSERT with a unique violation and retry (up to 3 attempts).
//
// Returns the new version row on success, null on failure.
// ───────────────────────────────────────────────
// ───────────────────────────────────────────────
// Fetch confirmed appointments for a given date (doctor view)
// ───────────────────────────────────────────────
export async function fetchAppointmentsByDate(date) {
  const sql = getSql();
  if (!sql) return [];

  try {
    const rows = await sql`
      SELECT DISTINCT ON (logical_id) *
      FROM appointments
      WHERE status = 'confirmed'
        AND date = ${date}
      ORDER BY logical_id, version DESC
    `;
    // Sort by time after dedup
    rows.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    return rows;
  } catch (error) {
    logger.error('APPOINTMENT_FETCH_BY_DATE_ERROR', { date, error: error.message });
    return [];
  }
}

// ───────────────────────────────────────────────
// Update appointment status (doctor actions: completed, no_show)
// ───────────────────────────────────────────────
export async function updateAppointmentStatus(id, status) {
  const sql = getSql();
  if (!sql) return null;

  try {
    const rows = await sql`
      UPDATE appointments
      SET status = ${status},
          updated_at = NOW()
      WHERE id = ${id}
        AND status = 'confirmed'
      RETURNING *
    `;
    return rows[0] || null;
  } catch (error) {
    logger.error('APPOINTMENT_UPDATE_STATUS_ERROR', { id, status, error: error.message });
    return null;
  }
}

// ───────────────────────────────────────────────
// Count appointments by status for a date range (doctor stats)
// ───────────────────────────────────────────────
export async function countAppointmentsByDateRange(startDate, endDate, status) {
  const sql = getSql();
  if (!sql) return 0;

  try {
    const query = status
      ? sql`SELECT COUNT(DISTINCT logical_id) as count FROM appointments WHERE date >= ${startDate} AND date <= ${endDate} AND status = ${status}`
      : sql`SELECT COUNT(DISTINCT logical_id) as count FROM appointments WHERE date >= ${startDate} AND date <= ${endDate}`;
    const rows = await query;
    return parseInt(rows[0]?.count || '0', 10);
  } catch (error) {
    logger.error('APPOINTMENT_COUNT_ERROR', { startDate, endDate, error: error.message });
    return 0;
  }
}

export async function countAppointmentsBySlot(date, time) {
  const sql = getSql();
  if (!sql) return 0;

  try {
    const rows = await sql`
      SELECT COUNT(DISTINCT logical_id) as count
      FROM appointments
      WHERE date = ${date}
        AND time = ${time}
        AND status = 'confirmed'
    `;
    return parseInt(rows[0]?.count || '0', 10);
  } catch (error) {
    logger.error('APPOINTMENT_COUNT_BY_SLOT_ERROR', { date, time, error: error.message });
    return 0;
  }
}

export async function supersedeAppointment(logicalId, { date, time, treatment }, maxRetries = 3) {
  const sql = getSql();
  if (!sql) return null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Step 1: Get the current latest version info
      // Note: No FOR UPDATE here — Neon serverless uses HTTP-based
      // connections where locks don't span separate await calls.
      // The UNIQUE (logical_id, version) constraint + retry loop
      // handle concurrent access correctly.
      const current = await sql`
        SELECT version, wa_id, patient_name FROM appointments
        WHERE logical_id = ${logicalId}
        ORDER BY version DESC
        LIMIT 1
      `;

      if (!current || current.length === 0) {
        logger.error('APPOINTMENT_SUPERSEDE_NOT_FOUND', { logicalId });
        return null;
      }

      const { version: currentVersion, wa_id, patient_name } = current[0];
      const newVersion = currentVersion + 1;

      // Step 2: Mark current version as superseded.
      // Conditional WHERE superseded_at IS NULL ensures only one caller
      // succeeds in marking it — the other hits 0 rows and will fail the INSERT.
      await sql`
        UPDATE appointments
        SET superseded_at = NOW(), updated_at = NOW()
        WHERE logical_id = ${logicalId}
          AND version = ${currentVersion}
          AND superseded_at IS NULL
      `;

      // Step 3: Insert new version with the new data.
      // UNIQUE (logical_id, version) constraint prevents duplicate versions.
      const rows = await sql`
        INSERT INTO appointments (logical_id, version, replaces_version, wa_id, patient_name, date, time, treatment, status)
        VALUES (${logicalId}, ${newVersion}, ${currentVersion}, ${wa_id}, ${patient_name}, ${date}, ${time}, ${treatment || null}, 'confirmed')
        RETURNING *
      `;

      if (rows && rows.length > 0) {
        logger.info('APPOINTMENT_SUPERSEDED', {
          logicalId,
          oldVersion: currentVersion,
          newVersion,
          newId: rows[0].id,
        });
      }

      return rows[0] || null;
    } catch (error) {
      // PostgreSQL unique violation (code 23505) — another call inserted
      // this version first. Retry to re-read the latest and try again.
      if (error.code === '23505' && attempt < maxRetries - 1) {
        continue;
      }
      logger.error('APPOINTMENT_SUPERSEDE_ERROR', {
        logicalId,
        attempt: attempt + 1,
        error: error.message,
      });
      return null;
    }
  }
  return null;
}

// ───────────────────────────────────────────────
// Fetch confirmed appointments for tomorrow where reminder not yet sent
// Used by the 24h reminder cron job
// ───────────────────────────────────────────────
export async function fetchAppointmentsForReminder() {
  const sql = getSql();
  if (!sql) return [];

  try {
    const rows = await sql`
      SELECT DISTINCT ON (logical_id) *
      FROM appointments
      WHERE status = 'confirmed'
        AND date = CURRENT_DATE + INTERVAL '1 day'
        AND reminder_sent_at IS NULL
      ORDER BY logical_id, version DESC
    `;
    rows.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    return rows;
  } catch (error) {
    logger.error('APPOINTMENT_FETCH_REMINDER_ERROR', { error: error.message });
    return [];
  }
}

// ───────────────────────────────────────────────
// Mark reminder as sent for a given appointment id
// ───────────────────────────────────────────────
export async function markReminderSent(id) {
  const sql = getSql();
  if (!sql) return;
  try {
    await sql`UPDATE appointments SET reminder_sent_at = NOW() WHERE id = ${id}`;
  } catch (error) {
    logger.error('APPOINTMENT_MARK_REMINDER_ERROR', { id, error: error.message });
  }
}

// Alias used by daily-summary cron — same as fetchAppointmentsByDate(today)
export async function fetchTodayAppointments() {
  const today = new Date().toISOString().slice(0, 10);
  return fetchAppointmentsByDate(today);
}
