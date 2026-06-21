import { getSql } from '@/db/pool';
import { logger } from '@/lib/logger';

// ───────────────────────────────────────────────
// Create a new appointment (version 1 of a new logical chain)
// ───────────────────────────────────────────────
export async function createAppointment({ sessionId, waId, patientName, patientId, patientPhone, date, time, treatment, treatments }) {
  const sql = getSql();
  if (!sql) return null;

  // Derive treatments array from single treatment string if not explicitly provided
  const treatmentsArr = treatments && treatments.length > 0
    ? treatments
    : (treatment ? [treatment] : []);

  try {
    const rows = await sql`
      INSERT INTO appointments (logical_id, version, session_id, wa_id, patient_name, patient_id, patient_phone, date, time, treatment, treatments)
      VALUES (gen_random_uuid(), 1, ${sessionId || null}, ${waId}, ${patientName || null},
              ${patientId || null}, ${patientPhone || null}, ${date}, ${time}, ${treatment || null}, ${JSON.stringify(treatmentsArr)})
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
      WHERE id = ${id} AND status = 'confirmed'
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

export async function bulkCompleteAppointmentsForDate(date) {
  const sql = getSql();
  if (!sql) return 0;

  try {
    const rows = await sql`
      UPDATE appointments
      SET status = 'completed',
          updated_at = NOW()
      WHERE date = ${date}
        AND status = 'confirmed'
      RETURNING id
    `;
    return rows.length;
  } catch (error) {
    logger.error('APPOINTMENT_BULK_COMPLETE_ERROR', { date, error: error.message });
    return 0;
  }
}

export async function bulkCancelAppointmentsForDate(date) {
  const sql = getSql();
  if (!sql) return [];

  try {
    const rows = await sql`
      UPDATE appointments
      SET status = 'cancelled',
          updated_at = NOW()
      WHERE date = ${date}
        AND status = 'confirmed'
      RETURNING *
    `;
    return rows;
  } catch (error) {
    logger.error('APPOINTMENT_BULK_CANCEL_ERROR', { date, error: error.message });
    return [];
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

export async function findBookedTimesForDate(date) {
  const sql = getSql();
  if (!sql) return [];

  try {
    const rows = await sql`
      SELECT DISTINCT time
      FROM appointments
      WHERE date = ${date}
        AND status = 'confirmed'
    `;
    return rows.map(r => r.time);
  } catch (error) {
    logger.error('APPOINTMENT_BOOKED_TIMES_ERROR', { date, error: error.message });
    return [];
  }
}

export async function findNextAvailableSlots(date, afterTime, allSlots, count = 3) {
  const sql = getSql();
  if (!sql) return [];

  try {
    const rows = await sql`
      SELECT DISTINCT time
      FROM appointments
      WHERE date = ${date}
        AND status = 'confirmed'
    `;
    const bookedSet = new Set(rows.map(r => r.time));
    return allSlots
      .filter(t => t > afterTime && !bookedSet.has(t))
      .slice(0, count);
  } catch (error) {
    logger.error('FIND_NEXT_AVAILABLE_SLOTS_ERROR', { date, afterTime, error: error.message });
    return [];
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
        SELECT version, status, wa_id, patient_name, patient_phone, patient_id,
               session_id, treatment, treatments, diagnosis, medicines,
               consultation_fee, treatment_charges, medicine_charges,
               notes, follow_up_date, follow_up_instructions, follow_up_status, follow_up_reason, follow_up_created_by,
               advice_selected, diagnosis_selected, tooth_diagnoses,
               location, payment_status, payment_method, transaction_id,
               paid_amount, paid_at, arrival_status, chit_media
        FROM appointments
        WHERE logical_id = ${logicalId}
        ORDER BY version DESC
        LIMIT 1
      `;

      if (!current || current.length === 0) {
        logger.error('APPOINTMENT_SUPERSEDE_NOT_FOUND', { logicalId });
        return null;
      }

      const {
        version: currentVersion, status: currentStatus, wa_id, patient_name, patient_phone, patient_id,
        session_id, treatment: oldTreatment, treatments, diagnosis, medicines,
        consultation_fee, treatment_charges, medicine_charges,
        notes, follow_up_date, follow_up_instructions, follow_up_status, follow_up_reason, follow_up_created_by,
        advice_selected, diagnosis_selected, tooth_diagnoses,
        location, payment_status, payment_method, transaction_id,
        paid_amount, paid_at, arrival_status, chit_media
      } = current[0];

      if (currentStatus !== 'confirmed') {
        return { ok: false, reason: 'invalid_state' };
      }

      const newVersion = currentVersion + 1;

      // Merge the UPDATE and INSERT into a single atomic CTE statement.
      // This prevents a split logical chain if the UPDATE were to fail after the INSERT.
      const rows = await sql`
        WITH updated AS (
          UPDATE appointments
          SET superseded_at = NOW(), updated_at = NOW(), status = 'superseded'
          WHERE logical_id = ${logicalId}
            AND version = ${currentVersion}
            AND superseded_at IS NULL
          RETURNING id
        ),
        inserted AS (
          INSERT INTO appointments (
            logical_id, version, replaces_version, wa_id, patient_name, patient_phone, patient_id,
            session_id, date, time, treatment, treatments, diagnosis, medicines,
            consultation_fee, treatment_charges, medicine_charges,
            notes, follow_up_date, follow_up_instructions, follow_up_status, follow_up_reason, follow_up_created_by,
            advice_selected, diagnosis_selected, tooth_diagnoses,
            location, payment_status, payment_method, transaction_id,
            paid_amount, paid_at, arrival_status, chit_media, status
          ) SELECT
            ${logicalId}, ${newVersion}, ${currentVersion}, ${wa_id}, ${patient_name}, ${patient_phone}, ${patient_id},
            ${session_id}, ${date}, ${time}, ${treatment || oldTreatment}, ${JSON.stringify(treatments || [])},
            ${diagnosis}, ${JSON.stringify(medicines || [])},
            ${consultation_fee}, ${treatment_charges}, ${medicine_charges},
            ${notes}, ${follow_up_date}, ${follow_up_instructions}, ${follow_up_status}, ${follow_up_reason}, ${follow_up_created_by},
            ${advice_selected || []}, ${diagnosis_selected || []}, ${tooth_diagnoses || []},
            ${location}, ${payment_status}, ${payment_method}, ${transaction_id},
            ${paid_amount}, ${paid_at}, ${arrival_status}, ${chit_media}, 'confirmed'
          WHERE EXISTS (SELECT 1 FROM updated)
          RETURNING *
        )
        SELECT * FROM inserted;
      `;

      // If 0 rows returned, the UPDATE CTE matched 0 rows, meaning this version
      // was already superseded by a concurrent request. We trigger the retry loop.
      if (!rows || rows.length === 0) {
        if (attempt < maxRetries - 1) continue;
        return null;
      }

      logger.info('APPOINTMENT_SUPERSEDED', {
        logicalId,
        oldVersion: currentVersion,
        newVersion,
        newId: rows[0].id,
      });

      return rows[0] || null;
    } catch (error) {
      if (error.code === '23505') {
        const msg = error.message || '';
        // If the target slot was taken, Postgres enforces the unique constraint.
        if (error.constraint_name === 'idx_appointments_unique_slot' || msg.includes('idx_appointments_unique_slot')) {
          return { ok: false, reason: 'slot_conflict' };
        }
        // Otherwise, it was a concurrent reschedule colliding on (logical_id, version). Retry.
        if (attempt < maxRetries - 1) {
          continue;
        }
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

export async function fetchLatestCompletedByWaId(waId) {
  const sql = getSql();
  if (!sql) return null;

  try {
    const rows = await sql`
      SELECT id, wa_id, patient_name, date, time, treatment
      FROM appointments
      WHERE wa_id = ${waId}
        AND status = 'completed'
        AND feedback_sent_at IS NOT NULL
      ORDER BY updated_at DESC
      LIMIT 1
    `;
    return rows[0] || null;
  } catch (error) {
    logger.error('FETCH_LATEST_COMPLETED_ERROR', { waId, error: error.message });
    return null;
  }
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

// ───────────────────────────────────────────────
// Fetch appointments with pending dues where due reminder not yet sent
// Used by the due-reminder cron job
// ───────────────────────────────────────────────
export async function fetchAppointmentsForDueReminder() {
  const sql = getSql();
  if (!sql) return [];

  try {
    const rows = await sql`
      SELECT DISTINCT ON (logical_id) id, logical_id, wa_id, patient_name, date, time,
        consultation_fee, treatment_charges, medicine_charges,
        paid_amount, payment_status
      FROM appointments
      WHERE status IN ('completed', 'confirmed')
        AND payment_status IN ('pending', 'partial')
        AND (consultation_fee + treatment_charges + medicine_charges) > COALESCE(paid_amount, 0)
        AND due_reminder_sent_at IS NULL
      ORDER BY logical_id, version DESC
    `;
    return rows;
  } catch (error) {
    logger.error('APPOINTMENT_FETCH_DUE_REMINDER_ERROR', { error: error.message });
    return [];
  }
}

// ───────────────────────────────────────────────
// Mark due reminder as sent for a given appointment id
// ───────────────────────────────────────────────
export async function markDueReminderSent(id) {
  const sql = getSql();
  if (!sql) return;
  try {
    await sql`UPDATE appointments SET due_reminder_sent_at = NOW() WHERE id = ${id}`;
  } catch (error) {
    logger.error('APPOINTMENT_MARK_DUE_REMINDER_ERROR', { id, error: error.message });
  }
}

// ───────────────────────────────────────────────
// Fetch completed appointments with follow-up dates where reminder not yet sent
// Used by the follow-up reminder cron job
// ───────────────────────────────────────────────
export async function fetchAppointmentsForFollowUpReminder() {
  const sql = getSql();
  if (!sql) return [];

  try {
    const rows = await sql`
      SELECT DISTINCT ON (logical_id) id, logical_id, wa_id, patient_name, date, follow_up_date, follow_up_instructions
      FROM appointments
      WHERE status = 'completed'
        AND follow_up_date IS NOT NULL
        AND follow_up_date <= CURRENT_DATE + INTERVAL '1 day'
        AND follow_up_reminder_sent_at IS NULL
        AND wa_id IS NOT NULL
      ORDER BY logical_id, version DESC
    `;
    return rows;
  } catch (error) {
    logger.error('APPOINTMENT_FETCH_FOLLOW_UP_REMINDER_ERROR', { error: error.message });
    return [];
  }
}

// ───────────────────────────────────────────────
// Mark follow-up reminder as sent for a given appointment id
// ───────────────────────────────────────────────
export async function markFollowUpReminderSent(id) {
  const sql = getSql();
  if (!sql) return;
  try {
    await sql`UPDATE appointments SET follow_up_reminder_sent_at = NOW() WHERE id = ${id}`;
  } catch (error) {
    logger.error('APPOINTMENT_MARK_FOLLOW_UP_REMINDER_ERROR', { id, error: error.message });
  }
}

// Alias used by daily-summary cron — same as fetchAppointmentsByDate(today)
export async function fetchTodayAppointments() {
  const today = new Date().toISOString().slice(0, 10);
  return fetchAppointmentsByDate(today);
}

// ───────────────────────────────────────────────
// Queue management functions
// ───────────────────────────────────────────────

// Fetch today's queue — priority first, then by time then arrival
export async function fetchTodayQueue() {
  const sql = getSql();
  if (!sql) return [];

  try {
    const today = new Date().toISOString().slice(0, 10);
    const rows = await sql`
      SELECT * FROM appointments
      WHERE date = ${today}
        AND arrival_status IN ('arrived', 'waiting', 'called')
        AND status != 'cancelled'
      ORDER BY
        is_priority DESC,
        CASE WHEN time IS NOT NULL THEN 0 ELSE 1 END,
        time ASC,
        arrived_at ASC
    `;
    return rows;
  } catch (error) {
    logger.error('QUEUE_FETCH_TODAY_ERROR', { error: error.message });
    return [];
  }
}

// Update arrival_status and optionally set arrived_at or called_at
export async function updateArrivalStatus(id, status) {
  const sql = getSql();
  if (!sql) return null;

  try {
    const setArrived = status === 'arrived' ? sql`arrived_at = NOW(),` : sql``;
    const setCalled = status === 'called' ? sql`called_at = NOW(),` : sql``;
    const rows = await sql`
      UPDATE appointments
      SET arrival_status = ${status},
          ${setArrived}
          ${setCalled}
          updated_at = NOW()
      WHERE id = ${id}
        AND status != 'cancelled'
      RETURNING *
    `;
    return rows[0] || null;
  } catch (error) {
    logger.error('QUEUE_UPDATE_ARRIVAL_ERROR', { id, status, error: error.message });
    return null;
  }
}

// Fetch today's confirmed appointments that haven't arrived yet (scheduled)
export async function fetchTodayScheduledAppointments() {
  const sql = getSql();
  if (!sql) return [];

  try {
    const today = new Date().toISOString().slice(0, 10);
    const rows = await sql`
      SELECT * FROM appointments
      WHERE date = ${today}
        AND status = 'confirmed'
        AND arrival_status = 'scheduled'
      ORDER BY time ASC
    `;
    return rows;
  } catch (error) {
    logger.error('QUEUE_FETCH_SCHEDULED_TODAY_ERROR', { error: error.message });
    return [];
  }
}

// Get count of today's appointments by arrival_status
export async function countTodayByArrivalStatus(status) {
  const sql = getSql();
  if (!sql) return 0;

  try {
    const today = new Date().toISOString().slice(0, 10);
    const rows = await sql`
      SELECT COUNT(*) as count FROM appointments
      WHERE date = ${today}
        AND arrival_status = ${status}
        AND status != 'cancelled'
    `;
    return parseInt(rows[0]?.count || '0', 10);
  } catch (error) {
    logger.error('QUEUE_COUNT_ARRIVAL_ERROR', { status, error: error.message });
    return 0;
  }
}

// Toggle the priority flag for an appointment
export async function toggleAppointmentPriority(id) {
  const sql = getSql();
  if (!sql) return null;

  try {
    const rows = await sql`
      UPDATE appointments
      SET is_priority = NOT is_priority,
          updated_at = NOW()
      WHERE id = ${id}
        AND status != 'cancelled'
      RETURNING *
    `;
    return rows[0] || null;
  } catch (error) {
    logger.error('QUEUE_TOGGLE_PRIORITY_ERROR', { id, error: error.message });
    return null;
  }
}
