export const STATES = [
  'IDLE','MAIN_MENU','BOOKING_COLLECTION',
  'BOOKING_CONFIRMATION','BOOKED','SERVICES','LOCATION','TIMINGS',
  'EMERGENCY','HUMAN_ESCALATION','CALLBACK_REQUESTED','CANCEL_CONFIRM',
  'DONE','ABANDONED'
];

export const TRANSITIONS = {
  IDLE:                 ['greeting','appointment','services','location','timings','emergency','escalate'],
  MAIN_MENU:            ['appointment','services','location','timings','emergency','escalate','callback'],
  BOOKING_COLLECTION:   ['provide_date','provide_time','provide_treatment','cancel','emergency','escalate','back',
                          'correction_date','correction_time','correction_treatment',
                          'affirm','date_custom','time_custom','treatment_help'],
  BOOKING_CONFIRMATION: ['confirm','edit_date','edit_time','cancel','emergency','escalate'],
  BOOKED:               ['appointment','cancel_appointment','reschedule','main_menu','emergency','escalate'],
  SERVICES:             ['appointment','main_menu','emergency','escalate'],
  LOCATION:             ['main_menu','emergency','escalate'],
  TIMINGS:              ['main_menu','emergency','escalate'],
  EMERGENCY:            ['main_menu','escalate'],
  HUMAN_ESCALATION:     ['main_menu'],
  CALLBACK_REQUESTED:   ['provide_phone','cancel','emergency','escalate'],
  CANCEL_CONFIRM:       ['confirm_cancel','back','main_menu','emergency','escalate'],
  ABANDONED:            ['main_menu','greeting'],
  DONE:                 ['main_menu','greeting'],
};
