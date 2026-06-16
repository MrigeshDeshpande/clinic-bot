export const RATING_CATEGORIES = [
  { key: 'behaviour', label: 'Behaviour' },
  { key: 'cooperative_treatment', label: 'Cooperative to Treatment' },
  { key: 'timely_appointment', label: 'Timely Appointment' },
  { key: 'payment_time', label: 'Payment on Time' },
  { key: 'oral_hygiene', label: 'Oral Hygiene' },
  { key: 'pain_tolerance', label: 'Pain Tolerance' },
  { key: 'treatment_compliance', label: 'Treatment Compliance' },
];

export const VALID_RATING_KEYS = RATING_CATEGORIES.map(c => c.key);

export function cleanRatings(ratings) {
  if (!ratings || typeof ratings !== 'object') return {};
  const cleaned = {};
  for (const key of VALID_RATING_KEYS) {
    const val = ratings[key];
    const n = Number(val);
    if (Number.isInteger(n) && n >= 1 && n <= 5) {
      cleaned[key] = n;
    }
  }
  return cleaned;
}

export function safeAvg(ratings) {
  const vals = Object.values(ratings || {}).reduce((acc, v) => {
    const n = Number(v);
    if (Number.isInteger(n) && n >= 1 && n <= 5) acc.push(n);
    return acc;
  }, []);
  return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
}
