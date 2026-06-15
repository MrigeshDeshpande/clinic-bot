export const VISIT_MODES = {
  COMPLETE_APPOINTMENT: 'completeAppointment',
  EDIT_COMPLETED_VISIT: 'editCompletedVisit',
  CREATE_WALK_IN: 'createWalkIn',
};

export function deriveVisitMode(searchParams, appointmentMeta) {
  const modeParam = searchParams.get('mode');
  if (modeParam) {
    if (Object.values(VISIT_MODES).includes(modeParam)) return modeParam;
    return null;
  }

  const appointmentId = searchParams.get('appointmentId');
  const isEdit = searchParams.get('edit') === 'true';
  const hasPatientId = searchParams.get('patientId');

  if (!appointmentId && hasPatientId) return VISIT_MODES.CREATE_WALK_IN;
  if (!appointmentId) return null;
  if (isEdit) return VISIT_MODES.EDIT_COMPLETED_VISIT;
  return VISIT_MODES.COMPLETE_APPOINTMENT;
}

export function getVisitModeLabel(mode, appointmentStatus) {
  if (mode === VISIT_MODES.COMPLETE_APPOINTMENT) return 'Complete Visit';
  if (mode === VISIT_MODES.EDIT_COMPLETED_VISIT) return 'Save Visit Changes';
  if (mode === VISIT_MODES.CREATE_WALK_IN) return 'Save Visit';
  return appointmentStatus === 'completed' ? 'Save Visit Changes' : 'Complete Visit';
}

export function getSubmitButtonLabel(mode, appointmentStatus, hasPayment) {
  const label = getVisitModeLabel(mode, appointmentStatus);
  const prefix = hasPayment ? '' : '';
  return prefix + label;
}
