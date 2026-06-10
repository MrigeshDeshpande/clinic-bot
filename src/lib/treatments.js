// ──────────────────────────────────────────────
// Domain catalog — single source of truth for all treatments
// ──────────────────────────────────────────────

export const CATEGORIES = [
  { id: 'diagnostic',     label: 'Diagnostic',     order: 0 },
  { id: 'preventive',     label: 'Preventive',     order: 1 },
  { id: 'restorative',    label: 'Restorative',    order: 2 },
  { id: 'endodontics',    label: 'Endodontics',    order: 3 },
  { id: 'periodontics',   label: 'Periodontics',   order: 4 },
  { id: 'oral-surgery',   label: 'Oral Surgery',   order: 5 },
  { id: 'orthodontics',   label: 'Orthodontics',   order: 6 },
  { id: 'cosmetic',       label: 'Cosmetic',       order: 7 },
];

export const TREATMENTS = [
  // ── Diagnostic ──
  { id: 'general',   name: 'General Checkup',   category: 'diagnostic',   isPerTooth: false, isGeneral: true,  defaultFee: 500,   aliases: ['general dentistry','general checkup','checkup','check-up','consultation','dental checkup','routine checkup','exam','examination'], symptom: 'Routine checkup' },
  { id: 'comprehensive-checkup', name: 'Comprehensive Checkup', category: 'diagnostic', isPerTooth: false, isGeneral: true, defaultFee: 800, aliases: ['comprehensive exam','full mouth exam','detailed checkup','full checkup'], symptom: 'Full mouth evaluation' },
  { id: 'pediatric', name: 'Pediatric Consultation', category: 'diagnostic', isPerTooth: false, isGeneral: true, defaultFee: 800, aliases: ['pediatric','child','children','kids','baby teeth','kids dentist','first visit','toddler'], symptom: "Child's dental visit" },
  { id: 'other',     name: 'Other',              category: 'diagnostic',   isPerTooth: false, isGeneral: true,  defaultFee: 500,   aliases: ['other','pain','swelling','infection','abscess','gum','ulcer','mouth'], symptom: 'Other issue' },

  // ── Preventive ──
  { id: 'cleaning',  name: 'Teeth Cleaning',    category: 'preventive',   isPerTooth: false, isGeneral: true,  defaultFee: 1000,  aliases: ['cleaning','teeth cleaning','scaling','polishing','deep cleaning','stain cleaning','gum cleaning','plaque'], symptom: 'Cleaning and polishing' },
  { id: 'scaling',   name: 'Scaling',            category: 'preventive',   isPerTooth: false, isGeneral: true,  defaultFee: 1500,  aliases: ['scaling','deep cleaning','gum cleaning','plaque removal','tartar','calculus'], symptom: 'Gum bleeding or plaque' },
  { id: 'fluoride',  name: 'Fluoride Application', category: 'preventive', isPerTooth: false, isGeneral: true, defaultFee: 500,   aliases: ['fluoride','fluoride treatment','fluoride varnish','fluoride gel','cavity prevention'], symptom: 'Fluoride treatment' },

  // ── Restorative ──
  { id: 'filling',   name: 'Composite Filling',  category: 'restorative',  isPerTooth: true,  isGeneral: false, defaultFee: 1500,  aliases: ['filling','dental filling','cavity filling','tooth filling','composite','white filling','silver filling','amalgam'], symptom: 'Cavity or hole in tooth' },
  { id: 'gic-filling', name: 'GIC Filling',      category: 'restorative',  isPerTooth: true,  isGeneral: false, defaultFee: 1200,  aliases: ['gic','glass ionomer','gic filling','glass ionomer filling'], symptom: 'Cavity requiring GIC' },
  { id: 'crowns',    name: 'Dental Crown',        category: 'restorative',  isPerTooth: true,  isGeneral: false, defaultFee: 3500,  aliases: ['crown','crowns','cap','bridge','cracked','broken tooth','chip','damage','fracture','dental crown'], symptom: 'Cracked or broken tooth' },
  { id: 'veneers',   name: 'Veneers',            category: 'restorative',  isPerTooth: true,  isGeneral: false, defaultFee: 5000,  aliases: ['veneers','porcelain','smile makeover','cosmetic','laminate','veneer'], symptom: 'Cosmetic improvement' },

  // ── Endodontics ──
  { id: 'rootcanal', name: 'Root Canal',         category: 'endodontics',  isPerTooth: true,  isGeneral: false, defaultFee: 4500,  aliases: ['root canal','rct','rc','nerve treatment','root canal treatment','tooth pain','toothache','sensitive','decay','cavity','nerve','throbbing'], symptom: 'Tooth pain when chewing' },
  { id: 're-rct',    name: 'Re-RCT',             category: 'endodontics',  isPerTooth: true,  isGeneral: false, defaultFee: 5500,  aliases: ['re rct','retreatment','root canal retreatment','repeat rct','failed rct','re-root canal'], symptom: 'Failed root canal' },
  { id: 'pulpotomy', name: 'Pulpotomy',          category: 'endodontics',  isPerTooth: true,  isGeneral: false, defaultFee: 2500,  aliases: ['pulpotomy','partial pulpectomy','pulp therapy','baby root canal','pulpal'], symptom: 'Pulp involvement' },

  // ── Periodontics ──
  { id: 'deep-cleaning', name: 'Deep Cleaning',  category: 'periodontics', isPerTooth: false, isGeneral: true, defaultFee: 2500,  aliases: ['deep cleaning','root planing','scaling and root planing','srp','periodontal cleaning','gum treatment'], symptom: 'Gum disease treatment' },
  { id: 'periodontal-therapy', name: 'Periodontal Therapy', category: 'periodontics', isPerTooth: false, isGeneral: true, defaultFee: 3000, aliases: ['periodontal therapy','gum therapy','periodontal treatment','gum surgery','periodontal maintenance'], symptom: 'Periodontal disease' },

  // ── Oral Surgery ──
  { id: 'extraction', name: 'Extraction',         category: 'oral-surgery', isPerTooth: true,  isGeneral: false, defaultFee: 1000,  aliases: ['extraction','tooth extraction','pull','remove','wisdom tooth','removal'], symptom: 'Tooth removal needed' },
  { id: 'surgical-extraction', name: 'Surgical Extraction', category: 'oral-surgery', isPerTooth: true, isGeneral: false, defaultFee: 3000, aliases: ['surgical extraction','surgical removal','impacted extraction','wisdom tooth surgery','transalveolar'], symptom: 'Surgical tooth removal' },
  { id: 'implants',  name: 'Dental Implant',     category: 'oral-surgery', isPerTooth: true,  isGeneral: false, defaultFee: 25000, aliases: ['implant','implants','dental implant','missing tooth','replacement','gap','implant placement'], symptom: 'Missing tooth' },

  // ── Orthodontics ──
  { id: 'braces',    name: 'Braces',             category: 'orthodontics', isPerTooth: false, isGeneral: true,  defaultFee: 1500,  aliases: ['braces','orthodontic','aligners','invisalign','crooked','misaligned','overbite','underbite','straight'], symptom: 'Crooked teeth or gaps' },
  { id: 'braces-adjustment', name: 'Braces Adjustment', category: 'orthodontics', isPerTooth: false, isGeneral: true, defaultFee: 1500, aliases: ['braces adjustment','adjustment','wire change','elastic change','ortho adjustment','braces tightening'], symptom: 'Routine braces adjustment' },

  // ── Cosmetic ──
  { id: 'whitening', name: 'Whitening',          category: 'cosmetic',     isPerTooth: false, isGeneral: true,  defaultFee: 3000,  aliases: ['whitening','teeth whitening','bleaching','stain','yellow','discolored','bright','smile','cosmetic'], symptom: 'Stained or yellow teeth' },
];

// ── Derived structures ──

export const TREATMENT_NAMES = TREATMENTS.map(t => t.name);
export const TREATMENT_IDS = TREATMENTS.map(t => t.id);

const CATEGORY_MAP = {};
for (const c of CATEGORIES) CATEGORY_MAP[c.id] = c;

export function getCategory(id) {
  return CATEGORY_MAP[id] || null;
}

// Build TREATMENT_CATEGORIES — { categoryId: [treatments...] }
const groups = {};
for (const t of TREATMENTS) {
  if (!groups[t.category]) groups[t.category] = [];
  groups[t.category].push(t);
}
export const TREATMENT_CATEGORIES = groups;

// ── Lookup helpers ──

export function getTreatmentById(id) {
  return TREATMENTS.find(t => t.id === id) || null;
}

export function getTreatmentCategory(id) {
  const t = getTreatmentById(id);
  return t?.category || null;
}

export function getTreatmentName(id) {
  const t = getTreatmentById(id);
  return t ? t.name : id;
}

export function getDefaultFee(id) {
  const t = getTreatmentById(id);
  return t?.defaultFee || 0;
}

/**
 * Normalize a treatment value to its canonical ID.
 * Accepts an ID string, a name string, or an object.
 */
export function resolveTreatmentId(value) {
  if (!value) return null;
  if (typeof value === 'object' && value?.treatmentId) return value.treatmentId;
  if (typeof value === 'object' && value?.id) return value.id;
  if (typeof value !== 'string') return null;
  // Already an ID?
  if (getTreatmentById(value)) return value;
  // Try name match
  const byName = TREATMENTS.find(t => t.name.toLowerCase() === value.toLowerCase());
  if (byName) return byName.id;
  // Try alias match
  const byAlias = TREATMENTS.find(t => t.aliases.some(a => a.toLowerCase() === value.toLowerCase()));
  if (byAlias) return byAlias.id;
  // Give up — return as-is
  return value;
}

// ── Symptom / text matching (kept from original) ──

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

// ── Fee normalization helper (moved from visit/page.js) ──

export function normalizeTreatmentFee(value, key) {
  if (typeof value === 'number') {
    return { amount: value, quantity: 1, source: 'manual', label: getTreatmentName(key) };
  }
  return {
    amount: value?.amount ?? 0,
    quantity: value?.quantity ?? 1,
    source: value?.source ?? 'manual',
    label: value?.label ?? getTreatmentName(key),
  };
}
