export const CLINIC = {
  name: 'Shri Balaji Dental Clinic',
  phone: '+91 91833 74850',
  address: 'Ground Floor, MIG-1/321, Amdi Nagar, Hudco Colony, Hudco, Bhilai, Chhattisgarh 490009',
  mapsLink: 'https://share.google/a2jCV7O4P6KbgrQoo',
  hours: {
    weekday: { open: '10:00', close: '20:00', label: 'Mon\u2013Sat: 10:00 AM \u2013 8:00 PM' },
    sunday:  { open: '10:00', close: '14:00', label: 'Sunday: 10:00 AM \u2013 2:00 PM' },
  },
  bookingHorizonDays: 30,
  slotIntervalMinutes: 30,
  slots: {
    weekday: ['10:00','10:30','11:00','11:30','12:00','12:30',
              '14:00','14:30','15:00','15:30','16:00','16:30','17:00','17:30',
              '18:00','18:30','19:00','19:30'],
    sunday:  ['10:00','10:30','11:00','11:30','12:00','12:30','13:00','13:30'],
  },
  doctor: {
    name: 'Dr. Vishnu Vardhan',
    waId: process.env.DOCTOR_WA_ID || '',
  },
  receptionist: {
    waId: process.env.RECEPTIONIST_WA_ID || '',
  },
  treatments: [
    { id: 'general',   name: 'General Dentistry', aliases: ['general dentistry','general checkup','checkup','check-up','consultation','dental checkup','routine checkup','exam','examination'], symptom: 'Routine checkup', hinglish: 'Normal daant checkup' },
    { id: 'cleaning',  name: 'Teeth Cleaning',    aliases: ['cleaning','teeth cleaning','scaling','polishing','deep cleaning','stain cleaning','gum cleaning','plaque'], symptom: 'Cleaning and polishing', hinglish: 'Daant safai / scaling' },
    { id: 'rootcanal', name: 'Root Canal',         aliases: ['root canal','rct','rc','nerve treatment','root canal treatment','tooth pain','toothache','sensitive','decay','cavity','nerve','throbbing'], symptom: 'Tooth pain when chewing', hinglish: 'Nerve treatment' },
    { id: 'whitening', name: 'Whitening',          aliases: ['whitening','teeth whitening','bleaching','stain','yellow','discolored','bright','smile','cosmetic'], symptom: 'Stained or yellow teeth', hinglish: 'Daant safed karna' },
    { id: 'implants',  name: 'Implants',           aliases: ['implant','implants','dental implant','missing tooth','replacement','gap'], symptom: 'Missing tooth', hinglish: 'Toota/na hone wala daant' },
    { id: 'braces',    name: 'Braces',             aliases: ['braces','orthodontic','aligners','invisalign','crooked','misaligned','overbite','underbite','straight'], symptom: 'Crooked teeth or gaps', hinglish: 'Tedhe daant seedhe' },
    { id: 'crowns',    name: 'Crowns',             aliases: ['crown','crowns','cap','bridge','cracked','broken tooth','chip','damage','fracture'], symptom: 'Cracked or broken tooth', hinglish: 'Toote daant ki cap' },
    { id: 'pediatric', name: 'Pediatric Dentistry',aliases: ['pediatric','child','children','kids','baby teeth','kids dentist','first visit','toddler'], symptom: "Child's dental visit", hinglish: 'Bachchon ka dental care' },
  ],
};
