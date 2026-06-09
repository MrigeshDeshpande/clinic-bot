import { getSql } from '@/db/pool';
import { logger } from '@/lib/logger';

function normalizePhone(phone) {
  return phone ? phone.replace(/\D/g, '') : phone;
}

export async function createPatient({ name, age, sex, phone, waId, location }) {
  const sql = getSql();
  if (!sql) return null;
  const cleanPhone = normalizePhone(phone);
  try {
    const rows = await sql`
      INSERT INTO patients (name, age, sex, phone, wa_id, location)
      VALUES (${name}, ${age || null}, ${sex || null}, ${cleanPhone}, ${waId || null}, ${location || null})
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
    logger.error('PATIENT_CREATE_ERROR', { name, phone: cleanPhone, error: error.message });
    return null;
  }
}

export async function findPatientByPhone(phone) {
  const sql = getSql();
  if (!sql) return null;
  try {
    const rows = await sql`
      SELECT * FROM patients WHERE phone = ${normalizePhone(phone)}
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
    const start = performance.now();
    const term = `%${query}%`;
    const cleanedPhone = normalizePhone(query);
    let rows;
    if (cleanedPhone) {
      const phoneTerm = `%${cleanedPhone}%`;
      rows = await sql`
        SELECT * FROM patients
        WHERE name ILIKE ${term} OR phone ILIKE ${phoneTerm}
        LIMIT 10
      `;
    } else {
      rows = await sql`
        SELECT * FROM patients
        WHERE name ILIKE ${term}
        LIMIT 10
      `;
    }
    const elapsed = performance.now() - start;
    if (elapsed > 100) logger.warn('SLOW_PATIENT_SEARCH', { query, elapsed: `${elapsed.toFixed(0)}ms` });
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

export async function updateVisitLog(appointmentId, { consultationFee, treatmentCharges, medicineCharges, notes, treatment, treatments, nextVisit, followUpInstructions }) {
  const sql = getSql();
  if (!sql) return null;
  try {
    const rows = await sql`
      UPDATE appointments
      SET consultation_fee = ${consultationFee || 0},
          treatment_charges = ${treatmentCharges || 0},
          medicine_charges = ${medicineCharges || 0},
          notes = ${notes || ''},
          treatment = ${treatment || null},
          treatments = ${treatments ? JSON.stringify(treatments) : null},
          follow_up_date = ${nextVisit?.date || null}::date,
          follow_up_instructions = ${followUpInstructions || (nextVisit?.date ? 'Follow-up visit scheduled' : '') || ''},
          status = 'completed',
          updated_at = NOW()
      WHERE id = ${appointmentId}
        AND status IN ('confirmed', 'completed')
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

export async function createAppointmentForPatient({ patientName, patientPhone, waId, date, time, treatment, treatments }) {
  const sql = getSql();
  if (!sql) return null;

  // Derive treatments array from single treatment string if not explicitly provided
  const treatmentsArr = treatments && treatments.length > 0
    ? treatments
    : (treatment ? [treatment] : []);

  try {
    const rows = await sql`
      INSERT INTO appointments (logical_id, version, wa_id, patient_name, patient_phone, date, time, treatment, treatments, status)
      VALUES (gen_random_uuid(), 1, ${waId || null}, ${patientName}, ${patientPhone}, ${date}, ${time}, ${treatment || null}, ${JSON.stringify(treatmentsArr)}, 'confirmed')
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
