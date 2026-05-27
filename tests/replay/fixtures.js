// ───────────────────────────────────────────────
// Replay Test Fixtures
//
// Each fixture represents a realistic conversational
// scenario with chaotic human behavior patterns.
//
// Format:
//   { name, messages: [{ text, type? }, ...], expectations }
//
// The test runner processes each message through the
// engine and asserts the expectations at each step.
// ───────────────────────────────────────────────

export const FIXTURES = [

  // ── 1. Happy Path Booking ──
  {
    name: 'Happy Path Booking',
    messages: [
      { text: 'Hi', intent: 'greeting' },
      { text: '1', intent: 'appointment' },
      { text: 'Tomorrow', intent: 'provide_date' },
      { text: '10am', intent: 'provide_time' },
      { text: 'Cleaning', intent: 'provide_treatment' },
      { text: 'Confirm', intent: 'confirm' },
    ],
    expectations: {
      finalState: 'BOOKED',
      finalBooking: { date: 'expect_future', time: '10:00', treatment: 'Teeth Cleaning' },
    },
  },

  // ── 2. Correction During Booking Flow ──
  // "Actually Wednesday" corrects the date mid-flow
  {
    name: 'Correction During Booking Flow — "Actually Wednesday"',
    messages: [
      { text: 'Hi', intent: 'greeting' },
      { text: 'Book appointment', intent: 'appointment' },
      { text: 'Tomorrow', intent: 'provide_date' },
      { text: 'Actually Wednesday', intent: 'correction_date' },
      { text: '2pm', intent: 'provide_time' },
      { text: 'Root canal', intent: 'provide_treatment' },
      { text: 'Confirm', intent: 'confirm' },
    ],
    expectations: {
      finalBooking: { time: '14:00', treatment: 'Root Canal' },
    },
  },

  // ── 3. Correction With "No" Prefix ──
  // "No evening" corrects the time from 10am to 17:00
  {
    name: 'Correction With "No" Prefix',
    messages: [
      { text: 'Hi', intent: 'greeting' },
      { text: 'Book', intent: 'appointment' },
      { text: 'Tomorrow', intent: 'provide_date' },
      { text: '10am', intent: 'provide_time' },
      { text: 'No evening', intent: 'correction_time' },
      { text: 'General Dentistry', intent: 'provide_treatment' },
      { text: 'Confirm', intent: 'confirm' },
    ],
    expectations: {
      bookingHasTime: true,
    },
  },

  // ── 4. Fragmented Messages (progressive filling) ──
  // "Tomorrow" + "after 5" + "RCT" across 3 messages before bot replies
  {
    name: 'Fragmented Messages — Sequential',
    messages: [
      { text: 'Hi', intent: 'greeting' },
      { text: 'Book', intent: 'appointment' },
      { text: 'Tomorrow', intent: 'provide_date' },
      { text: 'after 5', intent: 'provide_time' },
      { text: 'RCT', intent: 'provide_treatment' },
    ],
    expectations: {
      finalState: 'BOOKING_CONFIRMATION',
    },
  },

  // ── 5. Single Message With All Details (dense entity packing) ──
  {
    name: 'Single Message All Details',
    messages: [
      { text: 'Book appointment tomorrow at 10am for cleaning', intent: 'appointment', checkState: 'MAIN_MENU' },
    ],
    expectations: {},
    skip: true,
  },

  // ── 6. Escalation During Booking ──
  {
    name: 'Escalation During Booking',
    messages: [
      { text: 'Hi', intent: 'greeting' },
      { text: 'Book', intent: 'appointment' },
      { text: 'Tomorrow', intent: 'provide_date' },
      { text: 'Talk to agent', intent: 'escalate' },
    ],
    expectations: {
      finalState: 'HUMAN_ESCALATION',
    },
  },

  // ── 7. Cancel During Booking ──
  {
    name: 'Cancel During Booking',
    messages: [
      { text: 'Hi', intent: 'greeting' },
      { text: 'Book', intent: 'appointment' },
      { text: 'Tomorrow', intent: 'provide_date' },
      { text: 'Nevermind', intent: 'cancel' },
    ],
    expectations: {
      finalState: 'MAIN_MENU',
    },
  },

  // ── 8. Repeated Greetings ──
  {
    name: 'Repeated Greetings',
    messages: [
      { text: 'Hi', intent: 'greeting' },
      { text: 'Hello', intent: 'greeting' },
      { text: 'Hey', intent: 'greeting' },
      { text: 'Book', intent: 'appointment' },
    ],
    expectations: {
      finalState: 'BOOKING_COLLECTION',
    },
  },

  // ── 9. Invalid Then Corrected Input ──
  {
    name: 'Invalid Then Corrected Input',
    messages: [
      { text: 'Hi', intent: 'greeting' },
      { text: 'Book', intent: 'appointment' },
      { text: 'Banana', intent: 'unknown' },
      { text: 'Tomorrow', intent: 'provide_date' },
      { text: 'O\'clock', intent: 'unknown' },
      { text: '10am', intent: 'provide_time' },
      { text: 'Zebra', intent: 'unknown' },
      { text: 'cleaning', intent: 'provide_treatment' },
      { text: 'Confirm', intent: 'confirm' },
    ],
    expectations: {
      finalState: 'BOOKED',
    },
  },

  // ── 10. Contradictory Rapid Messages ──
  // "10am" then "2pm" — last write wins
  {
    name: 'Contradictory Rapid Messages',
    messages: [
      { text: 'Hi', intent: 'greeting' },
      { text: 'Book', intent: 'appointment' },
      { text: 'Tomorrow', intent: 'provide_date' },
      { text: '10am', intent: 'provide_time' },
      { text: '2pm', intent: 'provide_time' },
      { text: 'Cleaning', intent: 'provide_treatment' },
    ],
    expectations: {
      finalBooking: { time: '14:00', treatment: 'Teeth Cleaning' },
    },
  },

  // ── 11. Interrupted Booking → Resume ──
  {
    name: 'Interrupted Booking Flow — Services Check Then Resume',
    messages: [
      { text: 'Hi', intent: 'greeting' },
      { text: 'Book', intent: 'appointment' },
      { text: 'Tomorrow', intent: 'provide_date' },
      { text: '2', intent: 'services' },
      { text: 'Back', intent: 'back' },
      { text: '2pm', intent: 'provide_time' },
      { text: 'Whitening', intent: 'provide_treatment' },
      { text: 'Confirm', intent: 'confirm' },
    ],
    expectations: {
      finalState: 'BOOKED',
    },
    skip: true,
  },

  // ── 12. Menu Interruption During Booking ──
  {
    name: 'Menu Interruption During Booking',
    messages: [
      { text: 'Hi', intent: 'greeting' },
      { text: 'Book', intent: 'appointment' },
      { text: 'Tomorrow', intent: 'provide_date' },
      { text: 'Menu', intent: 'main_menu' },
      { text: 'Book', intent: 'appointment' },
      { text: 'Next Monday', intent: 'provide_date' },
      { text: '10am', intent: 'provide_time' },
      { text: 'Root Canal', intent: 'provide_treatment' },
      { text: 'Confirm', intent: 'confirm' },
    ],
    expectations: {
      finalState: 'BOOKED',
    },
  },

  // ── 13. Correction At Confirmation Step ──
  {
    name: 'Correction At Confirmation Step',
    messages: [
      { text: 'Hi', intent: 'greeting' },
      { text: 'Book', intent: 'appointment' },
      { text: 'Tomorrow', intent: 'provide_date' },
      { text: '10am', intent: 'provide_time' },
      { text: 'Cleaning', intent: 'provide_treatment' },
      { text: 'Change date', intent: 'edit_date' },
      { text: 'Next Monday', intent: 'provide_date' },
      { text: 'Confirm', intent: 'confirm' },
    ],
    expectations: {
      finalState: 'BOOKED',
    },
  },

  // ── 14. Back Navigation Through Booking ──
  {
    name: 'Back Navigation Through Booking',
    messages: [
      { text: 'Hi', intent: 'greeting' },
      { text: 'Book', intent: 'appointment' },
      { text: 'Tomorrow', intent: 'provide_date' },
      { text: '10am', intent: 'provide_time' },
      { text: 'Back', intent: 'back' },
      { text: '2pm', intent: 'provide_time' },
      { text: 'Braces', intent: 'provide_treatment' },
      { text: 'Confirm', intent: 'confirm' },
    ],
    expectations: {
      finalState: 'BOOKED',
    },
  },

  // ── 15. Phone Number Entry ──
  {
    name: 'Callback Phone Request',
    messages: [
      { text: 'Hi', intent: 'greeting' },
      { text: 'Callback', intent: 'callback' },
      { text: '9876543210', intent: 'provide_phone' },
    ],
    expectations: {
      finalState: 'MAIN_MENU',
    },
  },
];
