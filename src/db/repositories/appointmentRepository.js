import { getSql } from '@/db/pool';
import { logger } from '@/lib/logger';

export async function createAppointment({ sessionId, waId, patientName, date, time, treatment }) {
  const sql = getSql();
  if (!sql) return null;

  try {
    const rows = await sql`
      INSERT INTO appointments (session_id, wa_id, patient_name, date, time, treatment)
      VALUES (${sessionId || null}, ${waId}, ${patientName || null},
              ${date}, ${time}, ${treatment || null})
      RETURNING *
    `;
    return rows[0] || null;
  } catch (error) {
    logger.error('APPOINTMENT_CREATE_ERROR', { waId, error: error.message });
    return null;
  }
}

export async function findAppointmentsByWaId(waId) {
  const sql = getSql();
  if (!sql) return [];

  try {
    const rows = await sql`
      SELECT * FROM appointments
      WHERE wa_id = ${waId}
      ORDER BY created_at DESC
    `;
    return rows;
  } catch (error) {
    logger.error('APPOINTMENT_FIND_ERROR', { waId, error: error.message });
    return [];
  }
}

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

export async function findUpcomingByWaId(waId) {
  const sql = getSql();
  if (!sql) return [];

  try {
    const rows = await sql`
      SELECT * FROM appointments
      WHERE wa_id = ${waId}
        AND status = 'confirmed'
        AND date >= CURRENT_DATE
      ORDER BY date ASC, time ASC
    `;
    return rows;
  } catch (error) {
    logger.error('APPOINTMENT_FIND_UPCOMING_ERROR', { waId, error: error.message });
    return [];
  }
}

export async function updateAppointment(id, { date, time, treatment }) {
  const sql = getSql();
  if (!sql) return null;

  try {
    const rows = await sql`
      UPDATE appointments
      SET date = ${date}, time = ${time},
          treatment = ${treatment || null}, updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;
    return rows[0] || null;
  } catch (error) {
    logger.error('APPOINTMENT_UPDATE_ERROR', { id, error: error.message });
    return null;
  }
}
