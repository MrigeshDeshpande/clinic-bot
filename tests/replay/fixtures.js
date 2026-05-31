export const FIXTURES = [
  {
    name: 'Patient Happy Path Booking',
    messages: [
      { text: 'Hi', intent: 'greeting' },
      { text: '1', intent: 'appointment' },
      { text: 'Tomorrow', intent: 'provide_date' },
      { text: '10am', intent: 'provide_time' },
      { text: 'Cleaning', intent: 'provide_treatment' },
      { text: 'ok', intent: 'affirm' },
      { text: 'confirm', intent: 'confirm' },
    ],
    expectations: { finalState: 'BOOKED' },
  },
  {
    name: 'Patient Correction During Booking',
    messages: [
      { text: 'Hi', intent: 'greeting' },
      { text: 'Book appointment', intent: 'appointment' },
      { text: 'Tomorrow', intent: 'provide_date' },
      { text: 'Actually Wednesday', intent: 'correction_date' },
      { text: '2pm', intent: 'provide_time' },
      { text: 'Root canal', intent: 'provide_treatment' },
      { text: 'ok', intent: 'affirm' },
      { text: 'confirm', intent: 'confirm' },
    ],
    expectations: { finalState: 'BOOKED' },
  },
  {
    name: 'Patient Invalid Then Corrected',
    messages: [
      { text: 'Hi', intent: 'greeting' },
      { text: 'Book', intent: 'appointment' },
      { text: 'Banana', intent: 'unknown' },
      { text: 'Tomorrow', intent: 'provide_date' },
      { text: "O'clock", intent: 'unknown' },
      { text: '10am', intent: 'provide_time' },
      { text: 'Zebra', intent: 'unknown' },
      { text: 'General Dentistry', intent: 'provide_treatment' },
      { text: 'ok', intent: 'affirm' },
      { text: 'confirm', intent: 'confirm' },
    ],
    expectations: { finalState: 'BOOKED' },
  },
  {
    name: 'Patient Menu Interruption and Resume',
    messages: [
      { text: 'Hi', intent: 'greeting' },
      { text: 'Book', intent: 'appointment' },
      { text: 'Tomorrow', intent: 'provide_date' },
      { text: 'Menu', intent: 'main_menu' },
      { text: 'Book', intent: 'appointment' },
      { text: 'Next Monday', intent: 'provide_date' },
      { text: '10am', intent: 'provide_time' },
      { text: 'Root Canal', intent: 'provide_treatment' },
      { text: 'ok', intent: 'affirm' },
      { text: 'confirm', intent: 'confirm' },
    ],
    expectations: { finalState: 'BOOKED' },
  },
  {
    name: 'Patient Escalation During Booking',
    messages: [
      { text: 'Hi', intent: 'greeting' },
      { text: 'Book', intent: 'appointment' },
      { text: 'Tomorrow', intent: 'provide_date' },
      { text: 'Talk to agent', intent: 'escalate' },
    ],
    expectations: { finalState: 'HUMAN_ESCALATION' },
  },
  {
    name: 'Patient Cancel During Booking',
    messages: [
      { text: 'Hi', intent: 'greeting' },
      { text: 'Book', intent: 'appointment' },
      { text: 'Tomorrow', intent: 'provide_date' },
      { text: 'Nevermind', intent: 'cancel' },
    ],
    expectations: { finalState: 'MAIN_MENU' },
  },
  {
    name: 'Patient Callback Flow',
    messages: [
      { text: 'Hi', intent: 'greeting' },
      { text: 'Callback', intent: 'callback' },
      { text: '9876543210', intent: 'provide_phone' },
    ],
    expectations: { finalState: 'MAIN_MENU' },
  },
  {
    name: 'Doctor Greeting to Main Menu',
    role: 'doctor',
    messages: [
      { text: 'Hi', intent: 'greeting' },
    ],
    expectations: { finalState: 'DOCTOR_MAIN_MENU' },
  },
  {
    name: 'Doctor View Today (Positive)',
    role: 'doctor',
    messages: [
      { text: 'Hi', intent: 'greeting' },
      { text: "Today's Appointments", type: 'interactive', interactiveId: 'doc_today', intent: 'doctor_view_today' },
    ],
    expectations: { finalState: 'DOCTOR_APPOINTMENT_LIST' },
  },
  {
    name: 'Doctor Manage Schedule (Positive)',
    role: 'doctor',
    messages: [
      { text: 'Hi', intent: 'greeting' },
      { text: 'Manage Schedule', type: 'interactive', interactiveId: 'doc_schedule', intent: 'doctor_manage_schedule' },
    ],
    expectations: { finalState: 'DOCTOR_MANAGE_SCHEDULE' },
  },
  {
    name: 'Doctor Stats (Positive)',
    role: 'doctor',
    messages: [
      { text: 'Back', type: 'interactive', interactiveId: 'back', intent: 'back' },
      { text: 'View Stats', type: 'interactive', interactiveId: 'doc_stats', intent: 'doctor_view_stats' },
    ],
    expectations: { finalState: 'DOCTOR_STATS' },
  },
  {
    name: 'Doctor Invalid Date Input (Negative)',
    role: 'doctor',
    messages: [
      { text: 'Back', type: 'interactive', interactiveId: 'back', intent: 'back' },
      { text: 'View by Date', type: 'interactive', interactiveId: 'doc_by_date', intent: 'doctor_view_by_date' },
      { text: 'banana', intent: 'unknown' },
    ],
    expectations: { finalState: 'DOCTOR_VIEW_DATE' },
  },
  {
    name: 'Doctor Unknown Input Stays Menu (Negative)',
    role: 'doctor',
    messages: [
      { text: 'Back', type: 'interactive', interactiveId: 'back', intent: 'back' },
      { text: 'abracadabra', intent: 'unknown' },
    ],
    expectations: { finalState: 'DOCTOR_MAIN_MENU' },
  },
];
