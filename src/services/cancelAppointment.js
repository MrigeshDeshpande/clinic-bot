export async function cancelAppointment(sql, id, reason) {
  const [appointment] = await sql`
    UPDATE appointments SET
      status = 'cancelled',
      cancelled_at = NOW(),
      cancellation_reason = ${reason || null},
      prescription_key = NULL,
      compiled_document_key = NULL,
      updated_at = NOW()
    WHERE id = ${id} AND status = 'confirmed'
    RETURNING id, status, cancelled_at, cancellation_reason
  `;
  if (!appointment) {
    throw Object.assign(
      new Error('Appointment already cancelled, completed, or not found'),
      { status: 400 }
    );
  }
  return appointment;
}
