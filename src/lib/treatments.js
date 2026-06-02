export const TREATMENTS = [
  { id: 'general',   name: 'General Checkup',   aliases: ['general dentistry','general checkup','checkup','check-up','consultation','dental checkup','routine checkup','exam','examination'], symptom: 'Routine checkup' },
  { id: 'cleaning',  name: 'Teeth Cleaning',    aliases: ['cleaning','teeth cleaning','scaling','polishing','deep cleaning','stain cleaning','gum cleaning','plaque'], symptom: 'Cleaning and polishing' },
  { id: 'rootcanal', name: 'Root Canal',         aliases: ['root canal','rct','rc','nerve treatment','root canal treatment','tooth pain','toothache','sensitive','decay','cavity','nerve','throbbing'], symptom: 'Tooth pain when chewing' },
  { id: 'filling',   name: 'Dental Filling',     aliases: ['filling','dental filling','cavity filling','tooth filling','silver filling','composite'], symptom: 'Cavity or hole in tooth' },
  { id: 'whitening', name: 'Whitening',          aliases: ['whitening','teeth whitening','bleaching','stain','yellow','discolored','bright','smile','cosmetic'], symptom: 'Stained or yellow teeth' },
  { id: 'implants',  name: 'Implants',           aliases: ['implant','implants','dental implant','missing tooth','replacement','gap'], symptom: 'Missing tooth' },
  { id: 'braces',    name: 'Braces Adjustment',  aliases: ['braces','orthodontic','aligners','invisalign','crooked','misaligned','overbite','underbite','straight','adjustment'], symptom: 'Crooked teeth or gaps' },
  { id: 'crowns',    name: 'Crown',              aliases: ['crown','crowns','cap','bridge','cracked','broken tooth','chip','damage','fracture'], symptom: 'Cracked or broken tooth' },
  { id: 'extraction',name: 'Extraction',         aliases: ['extraction','tooth extraction','pull','remove','wisdom tooth','removal'], symptom: 'Tooth removal needed' },
  { id: 'scaling',   name: 'Scaling',            aliases: ['scaling','deep cleaning','gum cleaning','plaque removal','tartar','calculus'], symptom: 'Gum bleeding or plaque' },
  { id: 'veneers',   name: 'Veneers',            aliases: ['veneers','porcelain','smile makeover','cosmetic','laminate'], symptom: 'Cosmetic improvement' },
  { id: 'pediatric', name: 'Pediatric Dentistry',aliases: ['pediatric','child','children','kids','baby teeth','kids dentist','first visit','toddler'], symptom: "Child's dental visit" },
  { id: 'other',     name: 'Other',              aliases: ['other','pain','swelling','infection','abscess','gum','ulcer','mouth'], symptom: 'Other issue' },
];

export const TREATMENT_NAMES = TREATMENTS.map(t => t.name);

export function suggestTreatment(text) {
  if (!text || text.trim().length < 2) return [];
  const lower = text.toLowerCase();
  const matches = TREATMENTS.map(t => {
    const matched = t.aliases.filter(a => {
      const escaped = a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp('\\b' + escaped + '\\b', 'i').test(lower);
    }).length;
    return { ...t, score: matched };
  }).filter(m => m.score > 0);
  matches.sort((a, b) => b.score - a.score);
  return matches.length > 0 ? matches : [];
}

export function bestTreatmentMatch(text) {
  const suggestions = suggestTreatment(text);
  return suggestions.length > 0 ? suggestions[0] : null;
}
