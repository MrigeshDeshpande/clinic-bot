// ───────────────────────────────────────────────
// Patient-facing translations: English & Hindi
// ───────────────────────────────────────────────
// Use with t(lang, key, replacements) from handlers.js
// All {placeholders} are replaced at runtime.

export const T = {
  // ── Greeting & Main Menu ──
  welcome: {
    en: 'Welcome to {clinic} \u{1F9B7}\nHow can I help you today?',
    hi: '{clinic} me swagat hai \u{1F9B7}\nAaj main aapki kaise help karun?',
  },
  select_option: {
    en: 'Select option',
    hi: 'Option chunein',
  },
  menu_section: {
    en: 'Menu',
    hi: 'Menu',
  },
  menu_book: {
    en: 'Book Appointment',
    hi: 'Appointment book karein',
  },
  menu_book_desc: {
    en: 'Schedule a visit',
    hi: 'Naya appointment',
  },
  menu_services: {
    en: 'Dental Services',
    hi: 'Dental Services',
  },
  menu_services_desc: {
    en: 'What we offer',
    hi: 'Hamari sevaayein',
  },
  menu_location: {
    en: 'Clinic Location',
    hi: 'Clinic ka pata',
  },
  menu_location_desc: {
    en: 'Address & directions',
    hi: 'Pata aur direction',
  },
  menu_timings: {
    en: 'Clinic Timings',
    hi: 'Clinic ka samay',
  },
  menu_timings_desc: {
    en: 'Opening hours',
    hi: 'Khulne ka samay',
  },
  welcome_back_short: {
    en: 'Welcome back!',
    hi: 'Phir se swagat hai!',
  },
  welcome_back: {
    en: 'Welcome back.',
    hi: 'Phir se swagat hai.',
  },
  what_next: {
    en: 'What would you like to do?',
    hi: 'Aap aage kya karna chahenge?',
  },
  what_next_instead: {
    en: 'No problem. What would you like to do instead?',
    hi: 'Koi baat nahi. Aap aage kya karna chahenge?',
  },

  // ── Booking: Date ──
  ask_date: {
    en: 'Which date works for you?',
    hi: 'Aapko kaunsi date theek hai?',
  },
  ask_date_custom: {
    en: 'Please type your preferred date.\n\nExamples: "tomorrow", "next Monday", "28 May"',
    hi: 'Apni date type karein.\n\nJaise: "kal", "aane wala Monday", "28 May"',
  },
  today: { en: 'Today', hi: 'Aaj' },
  tomorrow: { en: 'Tomorrow', hi: 'Kal' },
  next_monday: { en: 'Next Monday', hi: 'Aane wala Monday' },
  more_dates: { en: 'More dates\u2026', hi: 'Aur dates\u2026' },
  type_date: { en: 'Type a different date', hi: 'Koi aur date type karein' },
  back: { en: '\u2190 Back', hi: '\u2190 Peechhe' },
  cancel: { en: 'Cancel', hi: 'Cancel karein' },
  select_date: { en: 'Select date', hi: 'Date chunein' },
  ask_date_for_name: { en: 'For *{name}* — what date works?', hi: '*{name}* ke liye kaunsi date theek hai?' },
  pick_a_date: {
    en: 'Here are more available dates:',
    hi: 'Aur maujood dates:',
  },
  ask_date_again: {
    en: 'What date would you like instead?',
    hi: 'Aap kaunsi date chahenge?',
  },
  ask_date_reschedule: {
    en: "Sure! Let's reschedule.\n\nWhat date works for you?",
    hi: "Theek hai! Naya date set karte hain.\n\nAapko kaunsi date theek hai?",
  },
  ask_date_quick: {
    en: 'Sure! What date works for you?',
    hi: 'Theek hai! Kaunsi date theek rahegi?',
  },

  // ── Booking: Time ──
  ask_time: {
    en: 'What time works for you?',
    hi: 'Aapko kaunsa samay theek hai?',
  },
  ask_time_custom: {
    en: 'Please type your preferred time.\n\nExamples: "10am", "2:30pm"\nSlots are every 30 minutes.',
    hi: 'Apna samay type karein.\n\nJaise: "10am", "2:30pm"\nSlots har 30 minute me hain.',
  },
  time_slots_available: {
    en: 'What time works for you?\nSlots every 30 minutes.',
    hi: 'Kaunsa samay theek hai?\nHar 30 minute me slot hai.',
  },
  type_time: { en: 'Type a different time', hi: 'Koi aur time type karein' },
  select_time: { en: 'Select time', hi: 'Samay chunein' },
  ask_time_again: { en: 'Which time works better?', hi: 'Kaunsa samay theek rahega?' },
  slots_remaining: {
    en: '{booked} slot(s) already booked \u2014 {avail} remaining.',
    hi: '{booked} slot already book hain \u2014 {avail} bache hain.',
  },
  sunday_warning: {
    en: '\u26A0\uFE0F Sunday hours: 10:00 AM \u2013 2:00 PM only.',
    hi: '\u26A0\uFE0F Sunday ka samay: 10:00 AM se 2:00 PM tak.',
  },
  no_slots_today: {
    en: 'Sorry, no slots available today.\n\nNext available: {day}, {date}\n{suggestions}\n\nTap a time, pick another date, or type a different time.',
    hi: 'Sorry, aaj koi slot available nahi hai.\n\nAgli available: {day}, {date}\n{suggestions}\n\nTime chunein, koi aur date choose karein, ya alag time type karein.',
  },
  no_slots_later: {
    en: 'Sorry, {time} is already booked and no later slots are available today. Please pick another date.',
    hi: 'Sorry, {time} already booked hai aur aaj baad me koi slot nahi hai. Koi aur date choose karein.',
  },
  slot_booked: {
    en: 'Sorry, {time} is already booked.\n\nNext available:\n{suggestions}\n\nTap one or type a different time.',
    hi: 'Sorry, {time} already booked hai.\n\nAgle available:\n{suggestions}\n\nEk chunein ya alag time type karein.',
  },

  // ── Booking: Treatment ──
  ask_treatment: {
    en: 'What problem are you facing? Pick the closest option.',
    hi: 'Aapko kya problem hai? Sabse milta-julta option chunein.',
  },
  treatments_title: { en: 'Available Treatments', hi: 'Available treatments' },
  not_sure: { en: "I'm not sure \u2014 help me choose", hi: "Mujhe nahi pata \u2014 mujhe choose karne me madad karein" },
  describe_symptoms: { en: 'Describe your symptoms', hi: 'Apni symptoms batayein' },
  symptoms_title: { en: 'What brings you in?', hi: 'Aap kyun aaye hain?' },
  tell_more: { en: "Something else \u2014 tell me more", hi: "Kuch aur \u2014 mujhe aur batayein" },
  unmatched_symptoms: {
    en: "I'm not quite sure based on what you described. Pick the closest symptom or tell me more:",
    hi: 'Aapne jo bataya usse main clearly nahi samajh paaya. Sabse milta-julta symptom chunein ya aur batayein:',
  },
  treatment_selected: {
    en: '\u2705 {treatment} selected.\n\nTap "Add Another" to add more or "Done" when finished.',
    hi: '\u2705 {treatment} select ho gaya.\n\nAur add karne ke liye "Add Another" ya "Done" dabayein.',
  },
  add_another: { en: '\u2795 Add Another', hi: '\u2795 Aur Add karein' },
  add_done: { en: '\u2705 Done', hi: '\u2705 Done' },
  treatment_help: {
    en: 'Tell me your symptoms and I will try to suggest a treatment.',
    hi: 'Apni symptoms batayein, main treatment suggest karunga.',
  },

  // ── Booking: Patient Name ──
  ask_name: {
    en: 'What name should I use for this appointment?',
    hi: 'Is appointment ke liye kaunsa naam use karun?',
  },
  name_default: {
    en: '(default: {name} \u2014 type "ok" to use this)',
    hi: '(default: {name} \u2014 "ok" type karein iske liye)',
  },

  // ── Booking Confirmation ──
  booking_summary: {
    en: '\uD83D\uDCCB {name}, here\u2019s your booking:\n\n\uD83D\uDCC5 {date}\n\u23F0 {time}\n\u{1F9B7} {treatment} with {doctor}\n\uD83D\uDCCD {clinic}',
    hi: '\uD83D\uDCCB {name}, aapka booking:\n\n\uD83D\uDCC5 {date}\n\u23F0 {time}\n\u{1F9B7} {treatment} {doctor} ke saath\n\uD83D\uDCCD {clinic}',
  },
  confirm_btn: { en: 'Confirm \u2713', hi: 'Confirm \u2713' },
  change_btn: { en: 'Change', hi: 'Badle' },
  cancel_btn: { en: 'Cancel', hi: 'Cancel' },
  confirm_section: { en: 'Confirm', hi: 'Confirm karein' },
  confirm_desc: { en: 'Book this appointment', hi: 'Ye appointment book karein' },
  change_date: { en: 'Change Date', hi: 'Date badle' },
  change_date_desc: { en: 'Pick a different date', hi: 'Koi aur date chunein' },
  change_time: { en: 'Change Time', hi: 'Samay badle' },
  change_time_desc: { en: 'Pick a different time', hi: 'Koi aur samay chunein' },
  change_treatment: { en: 'Change Treatment', hi: 'Treatment badle' },
  cancel_section: { en: 'Cancel', hi: 'Cancel karein' },
  cancel_desc: { en: 'Start over', hi: 'Naye suru karein' },
  what_to_change: { en: 'What would you like to change?', hi: 'Aap kya badalna chahenge?' },
  change_treatment_q: { en: 'Which treatment would you like instead?', hi: 'Aap kaunsa treatment chahenge?' },

  // ── Appointment Booked ──
  confirmed: {
    en: '\u2705 Confirmed!\n\n\uD83D\uDCC5 {date}\n\u23F0 {time}\n\u{1F9B7} {treatment} with {doctor}\n\uD83D\uDCCD {clinic}\n\nWe look forward to seeing you!',
    hi: '\u2705 Confirm ho gaya!\n\n\uD83D\uDCC5 {date}\n\u23F0 {time}\n\u{1F9B7} {treatment} {doctor} ke saath\n\uD83D\uDCCD {clinic}\n\nAapka swagat hai!',
  },
  rescheduled: {
    en: '\u2705 Rescheduled!\n\n\uD83D\uDCC5 {date}\n\u23F0 {time}\n\u{1F9B7} {treatment} with {doctor}\n\uD83D\uDCCD {clinic}\n\nWe look forward to seeing you!',
    hi: '\u2705 Reschedule ho gaya!\n\n\uD83D\uDCC5 {date}\n\u23F0 {time}\n\u{1F9B7} {treatment} {doctor} ke saath\n\uD83D\uDCCD {clinic}\n\nAapka swagat hai!',
  },
  book_another: { en: 'Book Another', hi: 'Aur book karein' },
  book_another_desc: { en: 'Schedule a new appointment', hi: 'Naya appointment book karein' },
  reschedule_action: { en: 'Reschedule', hi: 'Reschedule' },
  reschedule_action_desc: { en: 'Change date, time, or treatment', hi: 'Date, samay, ya treatment badle' },
  cancel_action: { en: 'Cancel', hi: 'Cancel karein' },
  cancel_action_desc: { en: 'Cancel this appointment', hi: 'Ye appointment cancel karein' },
  main_menu_action: { en: 'Main Menu', hi: 'Main Menu' },
  main_menu_action_desc: { en: 'Back to home', hi: 'Home par jayein' },
  your_appt: {
    en: '\uD83D\uDCCB Your Appointment\n\nDate: {date}\nTime: {time}\nTreatment: {treatment}',
    hi: '\uD83D\uDCCB Aapka Appointment\n\nDate: {date}\nTime: {time}\nTreatment: {treatment}',
  },
  confirmed_short: {
    en: 'Great! Your appointment on {date} at {time} is confirmed. See you then!',
    hi: 'Badhiya! Aapka appointment {date} ko {time} par confirm ho gaya. Phir milte hain!',
  },

  // ── Cancel Flow ──
  confirm_cancel: {
    en: 'Do you want to cancel this appointment?',
    hi: 'Kya aap ye appointment cancel karna chahte hain?',
  },
  yes_cancel: { en: 'Yes, Cancel It', hi: 'Haan, Cancel karein' },
  no_keep: { en: 'No, Keep It', hi: 'Nahi, rakhein' },
  cancelled: {
    en: '\u2705 Your appointment is cancelled.\n\nNo worries. I can help you book another time.',
    hi: '\u2705 Aapka appointment cancel ho gaya.\n\nKoi baat nahi. Main naye appointment me help kar sakta hoon.',
  },
  cancel_failed: {
    en: 'Sorry, could not cancel it. Please call {phone} or try again.',
    hi: 'Sorry, cancel nahi ho paya. Kripya {phone} par call karein ya phir try karein.',
  },
  sure_cancel: {
    en: 'Are you sure you want to cancel this appointment?',
    hi: 'Kya aap sach me ye appointment cancel karna chahte hain?',
  },

  // ── Validation & Errors ──
  date_unavailable: {
    en: 'Sorry, that date is not available now. Please pick another date.',
    hi: 'Sorry, wo date ab available nahi hai. Koi aur date chunein.',
  },
  booking_failed: {
    en: 'Sorry, could not save your appointment due to a technical issue. Please try again.',
    hi: 'Sorry, technical issue ki vajah se appointment save nahi ho paya. Phir try karein.',
  },
  state_hint_collecting: { en: 'Try a date, time, or treatment name.', hi: 'Date, samay, ya treatment name type karein.' },
  state_hint_confirming: { en: 'Reply "confirm" to book or "change" to adjust.', hi: '"confirm" reply karein book karne ke liye ya "change" badalne ke liye.' },
  state_hint_options: { en: 'Tap an option or type your choice.', hi: 'Ek option chunein ya apni choice type karein.' },
  state_hint_cancelling: { en: 'Tap "Yes, Cancel It" or "No, Keep It".', hi: '"Yes, Cancel It" ya "No, Keep It" dabayein.' },
  state_hint_default: { en: 'Try typing a date, time, or your concern.', hi: 'Date, samay, ya apni problem type karein.' },
  fallback: {
    en: 'Sorry, I missed that. {hint}',
    hi: 'Sorry, samajh nahi aaya. {hint}',
  },
  escalate: {
    en: 'Would you like me to connect you with our team? Please call {phone} or I can book a callback.',
    hi: 'Kya main aapko hamari team se connect karun? Kripya {phone} par call karein ya main callback book kar sakta hoon.',
  },
  escalation_failed: {
    en: 'I may be getting this wrong. Let me connect you to someone who can help. Please call {phone}.',
    hi: 'Lagta hai main sahi samajh nahi pa raha. Main aapko kisi aur se connect kar raha hoon jo help kar sakta hai. Kripya {phone} par call karein.',
  },
  help_intro: {
    en: 'I can help with booking, services, location, and timings. {hint}',
    hi: 'Main booking, services, location aur timings me help kar sakta hoon. {hint}',
  },

  // ── Services / Location / Timings ──
  our_services: { en: '\u{1F9B7} Our Services:\n\n{services}', hi: '\u{1F9B7} Hamari Services:\n\n{services}' },
  our_location: {
    en: '\uD83D\uDCCD {clinic}\n{address}\n\nPhone: {phone}\n\uD83D\uDCCD Maps: {maps}',
    hi: '\uD83D\uDCCD {clinic}\n{address}\n\nPhone: {phone}\n\uD83D\uDCCD Maps: {maps}',
  },
  clinic_hours: {
    en: '\uD83D\uDD50 Clinic Hours\n\n{weekdays}\n{sunday}',
    hi: '\uD83D\uDD50 Clinic ka samay\n\n{weekdays}\n{sunday}',
  },
  book_from_info: { en: 'Book Appointment', hi: 'Appointment book karein' },
  book_from_info_desc: { en: 'Schedule a visit', hi: 'Naya appointment' },

  // ── Emergency / Escalation / Callback ──
  emergency: {
    en: '\u26A0\uFE0F *DENTAL EMERGENCY*\n\nPlease call us immediately at {phone}\nOr visit us at:\n{address}\n\nIf you cannot reach us, please go to the nearest hospital.',
    hi: '\u26A0\uFE0F *DENTAL EMERGENCY*\n\nKripya turant {phone} par call karein\nYa clinic aayein:\n{address}\n\nAgar hum tak nahi pahuch paayein to nearest hospital jayein.',
  },
  callback_requested: {
    en: "We've noted your request. Someone from {clinic} will call you back shortly.",
    hi: 'Aapka request note kar liya. {clinic} se koi aapko jald call karega.',
  },
  human_escalation: {
    en: 'Let me connect you to our team. Please call {phone} or expect a call back shortly.',
    hi: 'Main aapko hamari team se connect kar raha hoon. Kripya {phone} par call karein ya hum aapko call karenge.',
  },
  callback_success: {
    en: 'Thanks! We will call you back at {phone} during clinic hours.\n\nIs there anything else I can help with?',
    hi: 'Shukriya! Hum aapko {phone} par clinic hours me call karenge.\n\nKya main aur kuch help kar sakta hoon?',
  },
  ask_phone: {
    en: 'Please share your 10-digit phone number, and we will call you back.',
    hi: 'Kripya apna 10-digit phone number bhejiye, hum aapko callback karenge.',
  },
  ask_phone_hi: {
    en: 'Please share your 10-digit phone number, and we will call you back.',
    hi: 'Please apna 10-digit phone number bhejiye, hum callback karenge.',
  },

  // ── Feedback ──
  feedback_poor: {
    en: "We're sorry your experience wasn't great. Would you like someone to call you?",
    hi: "Hum afsos hain ki aapka experience achha nahi raha. Kya koi aapko call kare?",
  },
  feedback_yes_call: { en: '\u2705 Yes, Call Me', hi: '\u2705 Haan, Call karein' },
  feedback_no_thanks: { en: 'No, Thanks', hi: 'Nahi, thanks' },
  feedback_thanks: {
    en: 'Thank you for your feedback! \u{1F60A} We\u2019re glad you had a good experience.',
    hi: 'Aapke feedback ke liye dhanyavaad! \u{1F60A} Humein khushi hai ki aapka experience achha raha.',
  },
  no_appointments: {
    en: 'You have no upcoming appointments.\n\nWould you like to book one now?',
    hi: 'Aapka koi upcoming appointment nahi hai.\n\nKya aap abhi book karna chahenge?',
  },

  // ── Manual mode (dashboard-sent) ──
  manual_mode: {
    en: 'Your message has been forwarded to the clinic. Doctor will respond shortly.',
    hi: 'Aapka message clinic ko forward kar diya gaya hai. Doctor jald respond karenge.',
  },

  // ── Cron: Reminder ──
  reminder_fallback: {
    en: '{name} Just a reminder:\n\n\uD83D\uDCC5 Tomorrow \u2014 {date} at {time}\n\u{1F9B7} {treatment}{doctor}\n\uD83D\uDCCD {clinic}, Bhilai\n\nReply *confirm* to keep it or *cancel* to cancel.',
    hi: '{name} Bas ek reminder:\n\n\uD83D\uDCC5 Kal \u2014 {date} ko {time} par\n\u{1F9B7} {treatment}{doctor}\n\uD83D\uDCCD {clinic}, Bhilai\n\n*confirm* reply karein rakhne ke liye ya *cancel* cancel karne ke liye.',
  },

  // ── Cron: Feedback ──
  feedback_fallback: {
    en: 'Hi {name}! \u{1F44B}\n\nHow was your visit to {clinic}?\n\nYour feedback helps us serve you better.',
    hi: 'Namaste {name}! \u{1F44B}\n\n{clinic} mein aapka visit kaisa tha?\n\nAapka feedback humein behtar seva karne me madad karta hai.',
  },
  feedback_great: { en: '\u{1F60A} Great', hi: '\u{1F60A} Bahut achha' },
  feedback_okay: { en: '\u{1F642} Okay', hi: '\u{1F642} Theek tha' },
  feedback_poor_label: { en: '\u{1F61E} Poor', hi: '\u{1F61E} Kharab' },

  // ── Blocked date ──
  blocked_date: {
    en: '\u26A0\uFE0F *{clinic}*\n\nDoctor is unavailable on {date}. Please pick a new date by booking online.',
    hi: '\u26A0\uFE0F *{clinic}*\n\nDoctor {date} ko unavailable hain. Kripya online booking karke nayi date chunein.',
  },

  // ── Visit Summary (post-visit) ──
  visit_summary: {
    en: '\u{1F3E5} *{clinic}*\n\n\uD83D\uDCC5 {date}{time}\n\u{1F9B7} *{treatment}*\n\n\uD83D\uDCB0 Consultation: \u20B9{consultation}\n   Treatment: \u20B9{treatmentFee}\n   Medicines: \u20B9{medicines}\n   \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n   *Total: \u20B9{total}*\n\n{nextVisit}{notes}',
    hi: '\u{1F3E5} *{clinic}*\n\n\uD83D\uDCC5 {date}{time}\n\u{1F9B7} *{treatment}*\n\n\uD83D\uDCB0 Consultation: \u20B9{consultation}\n   Treatment: \u20B9{treatmentFee}\n   Medicines: \u20B9{medicines}\n   \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n   *Total: \u20B9{total}*\n\n{nextVisit}{notes}',
  },
  upcoming_dates: { en: 'Upcoming Dates', hi: 'Aane wali dates' },
  quick_pick: { en: 'Quick Pick', hi: 'Quick Pick' },
  more_dates: { en: 'More dates\u2026', hi: 'Aur dates\u2026' },
  navigation: { en: 'Navigation', hi: 'Navigation' },
  treatment_help_desc: { en: "Describe what you're feeling", hi: 'Apni problem batayein' },
  tomorrow_prefix: { en: 'Tomorrow', hi: 'Kal' },
  next_monday_prefix: { en: 'Next Monday', hi: 'Aane wala Monday' },
  more_dates_btn: { en: 'More dates\u2026', hi: 'Aur dates\u2026' },
  type_date_btn: { en: 'Type a different date', hi: 'Koi aur date type karein' },
  type_time_btn: { en: 'Type a different time', hi: 'Koi aur time type karein' },
  thanks_reply: { en: "You're welcome! Let me know if you need anything else.", hi: 'Aapka swagat hai! Agar aur kuch chahiye to batayein.' },
  treatment_help_prompt: {
    en: "No problem! Tell me a bit about what you're experiencing:\n\n\u2022 Tooth pain or sensitivity?\n\u2022 Need a routine checkup?\n\u2022 Looking for cosmetic treatment (whitening, braces)?\n\u2022 Something else?\n\nJust describe your symptoms and I'll recommend the right treatment.",
    hi: "Koi baat nahi! Apni problem thoda batayein:\n\n\u2022 Dant me dard ya sensitivity?\n\u2022 Routine checkup chahiye?\n\u2022 Cosmetic treatment (whitening, braces)?\n\u2022 Kuch aur?\n\nApni symptoms batayein, main sahi treatment suggest karunga.",
  },
  next_visit_label: {
    en: '\uD83D\uDDD3 Next visit: {date}{time}',
    hi: '\uD83D\uDDD3 Agli visit: {date}{time}',
  },
  notes_label: { en: '\uD83D\uDCDD Note: {notes}', hi: '\uD83D\uDCDD Note: {notes}' },
};
