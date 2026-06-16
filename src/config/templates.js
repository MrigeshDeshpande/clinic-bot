// WhatsApp Message Template Registry
//
// These templates must be created in Meta Business Manager (WABA) before use:
// https://business.facebook.com/wa/manage/message-templates/
//
// Template names here must match the registered name exactly (case-sensitive).
// Body parameters use {{1}}, {{2}}, etc. — order must match.

export const TEMPLATES = {
  appointment_reminder: {
    name: 'appointment_reminder',
    params: ['patient_name', 'date', 'time', 'treatment', 'clinic_name', 'location'],
    category: 'utility',  // faster approval
    description: '24h reminder for upcoming appointment',
  },

  feedback_request: {
    name: 'feedback_request',
    params: ['patient_name', 'clinic_name'],
    category: 'utility',
    description: 'Post-visit feedback request',
  },

  // Reserved for future use. Not currently sent.
  booking_confirmation: {
    name: 'booking_confirmation',
    params: ['patient_name', 'date', 'time', 'treatment', 'clinic_name'],
    category: 'utility',
    description: 'Confirmation after successful booking',
  },

  // Reserved for future use. Not currently sent.
  visit_summary: {
    name: 'visit_summary',
    params: ['patient_name', 'date', 'treatment', 'total_fees', 'clinic_name'],
    category: 'utility',
    description: 'Post-visit summary with fees',
  },

  due_reminder: {
    name: 'due_reminder',
    params: ['patient_name', 'clinic_name', 'due_amount', 'upi_id'],
    category: 'utility',
    description: 'Payment due reminder with outstanding amount',
  },

  payment_reminder: {
    name: 'payment_reminder',
    params: ['patient_name', 'amount', 'payment_link'],
    category: 'utility',
    description: 'Payment reminder with UPI link for outstanding balance',
  },
};
