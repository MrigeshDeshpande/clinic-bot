/**
 * Record a payment in the ledger and sync the appointment cache.
 *
 * Uses a single atomic CTE chain:
 *   1. INSERT into payments (conditional on appointment status)
 *   2. Compute net from ALL payments for this appointment
 *   3. UPDATE appointment cache (paid_amount, payment_status, paid_at)
 *
 * Idempotent via idempotency_key — same key → no duplicate row.
 */
export async function recordPayment(db, {
  appointmentId,
  paidAmount,
  method = null,
  kind = 'payment',
  direction = 'credit',
  idempotencyKey = null,
  notes = null,
  recordedBy = 'reception',
}) {
  const result = await db`
    WITH inserted AS (
      INSERT INTO payments (appointment_id, patient_id, amount, direction, kind, method, idempotency_key, notes, recorded_by)
      SELECT ${appointmentId}, a.patient_id, ${paidAmount}, ${direction}, ${kind}, ${method}, ${idempotencyKey}, ${notes}, ${recordedBy}
      FROM appointments a
      WHERE a.id = ${appointmentId}
        AND a.status IN ('completed', 'confirmed')
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING *
    ),
    net AS (
      SELECT COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount ELSE -amount END), 0) AS amount
      FROM payments WHERE appointment_id = ${appointmentId}
    ),
    sync AS (
      UPDATE appointments a SET
        paid_amount = net.amount,
        payment_status = CASE
          WHEN net.amount >= a.consultation_fee + a.treatment_charges + a.medicine_charges THEN 'paid'
          WHEN net.amount > 0 THEN 'partial' ELSE 'pending'
        END,
        paid_at = CASE WHEN net.amount > 0 THEN COALESCE(a.paid_at, NOW()) ELSE NULL END,
        payment_method = CASE WHEN ${kind} = 'payment' AND ${method} IS NOT NULL THEN ${method} ELSE a.payment_method END
      FROM net
      WHERE a.id = ${appointmentId}
      RETURNING a.id, a.paid_amount, a.payment_status, a.paid_at, a.payment_method
    )
    SELECT
      (SELECT row_to_json(inserted.*) FROM inserted) AS payment,
      (SELECT row_to_json(sync.*) FROM sync) AS appointment
  `;
  return result[0] || null;
}
