import { getSql } from '@/db/pool';
import { logger } from '@/lib/logger';

export async function createPatient({ name, age, sex, phone, waId, location }) {
  const sql = getSql();
  if (!sql) return null;
  try {
    const rows = await sql`
      INSERT INTO patients (name, age, sex, phone, wa_id, location)
      VALUES (${name}, ${age || null}, ${sex || null}, ${phone}, ${waId || null}, ${location || null})
      ON CONFLICT (phone) DO UPDATE
        SET name = COALESCE(NULLIF(EXCLUDED.name, ''), patients.name),
            age = COALESCE(EXCLUDED.age, patients.age),
            sex = COALESCE(NULLIF(EXCLUDED.sex, ''), patients.sex),
            location = COALESCE(NULLIF(EXCLUDED.location, ''), patients.location),
            wa_id = COALESCE(EXCLUDED.wa_id, patients.wa_id),
            updated_at = NOW()
      RETURNING *
    `;
    return rows[0] || null;
  } catch (error) {
    logger.error('PATIENT_CREATE_ERROR', { name, phone, error: error.message });
    return null;
  }
}

export async function findPatientByPhone(phone) {
  const sql = getSql();
  if (!sql) return null;
  try {
    const rows = await sql`
      SELECT * FROM patients WHERE phone = ${phone}
    `;
    return rows[0] || null;
  } catch (error) {
    logger.error('PATIENT_FIND_BY_PHONE_ERROR', { phone, error: error.message });
    return null;
  }
}

export async function searchPatients(query) {
  const sql = getSql();
  if (!sql) return [];
  try {
    const term = `%${query}%`;
    const rows = await sql`
      SELECT * FROM patients
      WHERE name ILIKE ${term} OR phone ILIKE ${term}
      ORDER BY updated_at DESC
      LIMIT 10
    `;
    return rows;
  } catch (error) {
    logger.error('PATIENT_SEARCH_ERROR', { query, error: error.message });
    return [];
  }
}

export async function findPatientById(id) {
  const sql = getSql();
  if (!sql) return null;
  try {
    const rows = await sql`
      SELECT * FROM patients WHERE id = ${id}
    `;
    return rows[0] || null;
  } catch (error) {
    logger.error('PATIENT_FIND_BY_ID_ERROR', { id, error: error.message });
    return null;
  }
}

export async function linkPatientToWaId(patientId, waId) {
  const sql = getSql();
  if (!sql) return null;
  try {
    const rows = await sql`
      UPDATE patients SET wa_id = ${waId}, updated_at = NOW()
      WHERE id = ${patientId}
      RETURNING *
    `;
    return rows[0] || null;
  } catch (error) {
    logger.error('PATIENT_LINK_WAID_ERROR', { patientId, waId, error: error.message });
    return null;
  }
}

export async function updateVisitLog(appointmentId, { consultationFee, treatmentCharges, medicineCharges, notes }) {
  const sql = getSql();
  if (!sql) return null;
  try {
    const rows = await sql`
      UPDATE appointments
      SET consultation_fee = ${consultationFee || 0},
          treatment_charges = ${treatmentCharges || 0},
          medicine_charges = ${medicineCharges || 0},
          notes = ${notes || ''},
          status = 'completed',
          updated_at = NOW()
      WHERE id = ${appointmentId}
        AND status = 'confirmed'
      RETURNING *
    `;
    return rows[0] || null;
  } catch (error) {
    logger.error('VISIT_LOG_UPDATE_ERROR', { appointmentId, error: error.message });
    return null;
  }
}

export async function getVisitsByPatientPhone(phone) {
  const sql = getSql();
  if (!sql) return [];
  try {
    const rows = await sql`
      SELECT DISTINCT ON (logical_id) *
      FROM appointments
      WHERE patient_phone = ${phone} OR wa_id = ${phone}
      ORDER BY logical_id, version DESC
    `;
    rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return rows;
  } catch (error) {
    logger.error('PATIENT_VISITS_BY_PHONE_ERROR', { phone, error: error.message });
    return [];
  }
}

export async function getVisitsByWaId(waId) {
  const sql = getSql();
  if (!sql) return [];
  try {
    const rows = await sql`
      SELECT DISTINCT ON (logical_id) *
      FROM appointments
      WHERE wa_id = ${waId}
      ORDER BY logical_id, version DESC
    `;
    rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return rows;
  } catch (error) {
    logger.error('PATIENT_VISITS_BY_WAID_ERROR', { waId, error: error.message });
    return [];
  }
}

export async function createAppointmentForPatient({ patientName, patientPhone, waId, date, time, treatment }) {
  const sql = getSql();
  if (!sql) return null;
  try {
    const rows = await sql`
      INSERT INTO appointments (logical_id, version, wa_id, patient_name, patient_phone, date, time, treatment, status)
      VALUES (gen_random_uuid(), 1, ${waId || null}, ${patientName}, ${patientPhone}, ${date}, ${time}, ${treatment || null}, 'confirmed')
      RETURNING *
    `;
    return rows[0] || null;
  } catch (error) {
    logger.error('APPOINTMENT_CREATE_FOR_PATIENT_ERROR', { patientName, error: error.message });
    return null;
  }
}

export async function findPatientsByWaId(waId) {
  if (!waId) return [];
  const sql = getSql();
  if (!sql) return [];
  try {
    const rows = await sql`
      SELECT * FROM patients WHERE wa_id = ${waId} ORDER BY created_at ASC
    `;
    return rows;
  } catch (error) {
    logger.error('PATIENT_FIND_BY_WAID_ERROR', { waId, error: error.message });
    return [];
  }
}

export async function updatePatient(id, fields) {
  const sql = getSql();
  if (!sql) return null;
  try {
    const setClauses = [];
    const values = [];
    let idx = 1;

    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined && ['name', 'age', 'sex', 'phone', 'location'].includes(key)) {
        setClauses.push(`${key} = $${idx++}`);
        values.push(key === 'age' ? (value || null) : value);
      }
    }

    if (setClauses.length === 0) return null;

    setClauses.push(`updated_at = NOW()`);
    values.push(id);

    const rows = await sql.query(
      `UPDATE patients SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return rows[0] || null;
  } catch (error) {
    logger.error('PATIENT_UPDATE_ERROR', { id, fields, error: error.message });
    return null;
  }
}
