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
    { id: 'general',   name: 'General Dentistry',  aliases: ['checkup','consultation','general dentistry','dental checkup'] },
    { id: 'cleaning',  name: 'Teeth Cleaning',     aliases: ['cleaning','scaling','teeth cleaning','clean'] },
    { id: 'rootcanal', name: 'Root Canal',         aliases: ['root canal','rct','rc','nerve treatment','root canal treatment'] },
    { id: 'whitening', name: 'Whitening',          aliases: ['whitening','teeth whitening','bleaching'] },
    { id: 'implants',  name: 'Implants',           aliases: ['implant','implants','dental implant'] },
    { id: 'braces',    name: 'Braces',             aliases: ['braces','orthodontic','aligners','invisalign'] },
    { id: 'crowns',    name: 'Crowns',             aliases: ['crown','crowns','cap','bridge'] },
    { id: 'pediatric', name: 'Pediatric Dentistry',aliases: ['pediatric','child','children','kids','baby teeth'] },
  ],
};
