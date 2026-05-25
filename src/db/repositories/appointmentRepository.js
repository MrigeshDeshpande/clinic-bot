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

export async function cancelAppointment(id) {
  const sql = getSql();
  if (!sql) return null;

  try {
    const rows = await sql`
      UPDATE appointments
      SET status = 'cancelled', updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;
    return rows[0] || null;
  } catch (error) {
    logger.error('APPOINTMENT_CANCEL_ERROR', { id, error: error.message });
    return null;
  }
}
