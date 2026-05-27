export const CLINIC = {
  name: 'Shri Balaji Dental Clinic',
  phone: '+91 91833 74850',
  address: 'Ground Floor, MIG-1/321, Amdi Nagar, Hudco Colony, Hudco, Bhilai, Chhattisgarh 490009',
  mapsLink: 'https://share.google/a2jCV7O4P6KbgrQoo',
  hours: {
    weekday: { open: '09:00', close: '20:00', label: 'Mon\u2013Sat: 9:00 AM \u2013 8:00 PM' },
    sunday:  { open: '10:00', close: '14:00', label: 'Sunday: 10:00 AM \u2013 2:00 PM' },
  },
  bookingHorizonDays: 30,
  slotIntervalMinutes: 30,
  slots: {
    weekday: ['09:00','09:30','10:00','10:30','11:00','11:30','12:00','12:30',
              '14:00','14:30','15:00','15:30','16:00','16:30','17:00','17:30',
              '18:00','18:30','19:00','19:30'],
    sunday:  ['10:00','10:30','11:00','11:30','12:00','12:30','13:00','13:30'],
  },
  treatments: [
    { id: 'general',   name: 'General Dentistry',  aliases: ['checkup','consultation','general dentistry','dental checkup'], symptom: 'Routine checkup' },
    { id: 'cleaning',  name: 'Teeth Cleaning',     aliases: ['cleaning','scaling','teeth cleaning','clean'], symptom: 'Bleeding gums or plaque' },
    { id: 'rootcanal', name: 'Root Canal',         aliases: ['root canal','rct','rc','nerve treatment','root canal treatment'], symptom: 'Tooth pain when chewing' },
    { id: 'whitening', name: 'Whitening',          aliases: ['whitening','teeth whitening','bleaching'], symptom: 'Stained or yellow teeth' },
    { id: 'implants',  name: 'Implants',           aliases: ['implant','implants','dental implant'], symptom: 'Missing tooth' },
    { id: 'braces',    name: 'Braces',             aliases: ['braces','orthodontic','aligners','invisalign'], symptom: 'Crooked teeth or gaps' },
    { id: 'crowns',    name: 'Crowns',             aliases: ['crown','crowns','cap','bridge'], symptom: 'Cracked or broken tooth' },
    { id: 'pediatric', name: 'Pediatric Dentistry',aliases: ['pediatric','child','children','kids','baby teeth'], symptom: "Child's dental visit" },
  ],
};
