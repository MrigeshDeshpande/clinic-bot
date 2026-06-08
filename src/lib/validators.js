import { CLINIC } from '@/config/clinic';
import { getClinicMinutes, getClinicDateStr, getClinicToday } from '@/lib/clinicTime';

function isSunday(date) {
  return date.getDay() === 0;
}

function daysBetween(a, b) {
  return Math.floor((b - a) / (1000 * 60 * 60 * 24));
}

function parseTimeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

const DAY_NAMES = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const DAY_LONG = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
const MONTH_MAP = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, september: 8,
  oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};

const HINGLISH_NUMBER_WORDS = {
  ek: 1,
  do: 2,
  teen: 3,
  char: 4,
  chaar: 4,
  chaaron: 4,
  paanch: 5,
  panch: 5,
  cheh: 6,
  chhe: 6,
  saat: 7,
  sat: 7,
  aath: 8,
  nau: 9,
  das: 10,
};

function addDays(n) {
  const d = getClinicToday();
  d.setDate(d.getDate() + n);
  return d;
}

function makeDate(year, month, day) {
  const y = year != null ? (year < 100 ? 2000 + year : year) : new Date().getFullYear();
  if (day < 1 || day > 31 || month < 0 || month > 11) return null;
  const d = new Date(y, month, day);
  if (d.getMonth() !== month || d.getDate() !== day) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function getDayIndex(name) {
  return DAY_LONG[name] ?? DAY_NAMES[name] ?? -1;
}

function normalizeIndicDigits(input) {
  if (!input) return input;
  const map = {
    '०': '0', '१': '1', '२': '2', '३': '3', '४': '4',
    '५': '5', '६': '6', '७': '7', '८': '8', '९': '9',
  };
  return input.replace(/[०-९]/g, (d) => map[d] || d);
}

export function validateDate(text) {
  if (!text) return { valid: false, reason: 'MISSING' };

  const lower = normalizeIndicDigits(text.toLowerCase());
  let parsedDate = null;

  // Ambiguous in common Hinglish usage: "kal" can mean yesterday or tomorrow.
  // Ask user to be explicit to avoid accidental wrong-date bookings.
  if ((/\bkal\b/.test(lower) || /कल/.test(lower)) && !/\btomorrow\b/.test(lower) && !/\bnext\b/.test(lower)) {
    return {
      valid: false,
      reason: 'AMBIGUOUS_KAL',
      suggestion: 'Did you mean tomorrow? Please type "tomorrow" or an exact date like "25 May".',
    };
  }

  // Absolute references
  if (/\btoday\b/.test(lower) || /\btonight\b/.test(lower) || /\baaj\b/.test(lower) || /आज/.test(lower)) parsedDate = addDays(0);
  else if (/\btomorrow\b/.test(lower) || /\btmrw\b/.test(lower) || /\bkal\b/.test(lower) || /कल/.test(lower)) parsedDate = addDays(1);
  else if (/\bday after tomorrow\b/.test(lower) || /\bparso\b/.test(lower) || /परसों|परसो/.test(lower)) parsedDate = addDays(2);

  // Relative day offsets: "2 din baad", "do din baad", "3 days later"
  if (!parsedDate) {
    const relNum = lower.match(/\b(\d{1,2})\s*(din|day|days)\s*(baad|later|after)\b/);
    if (relNum) {
      const n = parseInt(relNum[1], 10);
      if (n >= 1 && n <= CLINIC.bookingHorizonDays) parsedDate = addDays(n);
    }
  }

  if (!parsedDate) {
    const relWord = lower.match(/\b(ek|do|teen|char|chaar|paanch|panch|cheh|chhe|saat|sat|aath|nau|das)\s*(din|day|days)\s*(baad|later|after)\b/);
    if (relWord) {
      const n = HINGLISH_NUMBER_WORDS[relWord[1]];
      if (n >= 1 && n <= CLINIC.bookingHorizonDays) parsedDate = addDays(n);
    }
  }

  // Weekday references
  if (!parsedDate) {
    const weekdayMatch = lower.match(/\b((?:this|next|coming|agle|agla)\s+)?(mon(?:day)?|monday|tue(?:sday)?|tuesday|wed(?:nesday)?|wednesday|thu(?:rsday)?|thursday|fri(?:day)?|friday|sat(?:urday)?|saturday|sun(?:day)?|sunday)\b/);
    if (weekdayMatch) {
      const prefix = (weekdayMatch[1] || '').toLowerCase().trim();
      const targetDay = getDayIndex(weekdayMatch[2].toLowerCase());
      if (targetDay >= 0) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        let diff = targetDay - today.getDay();
        if (diff <= 0) diff += 7;
        if (prefix.includes('next')) diff += 7;
        parsedDate = addDays(diff);
      }
    }
  }

  // Spoken: "25 May", "May 25", "25th May 2026"
  if (!parsedDate) {
    const dmy = lower.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+(\d{2,4}))?\b/);
    if (dmy) {
      const month = MONTH_MAP[dmy[2].toLowerCase()];
      if (month != null) parsedDate = makeDate(dmy[3] ? parseInt(dmy[3], 10) : null, month, parseInt(dmy[1], 10));
    }
  }

  if (!parsedDate) {
    const mdy = lower.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?\b/);
    if (mdy) {
      const month = MONTH_MAP[mdy[1].toLowerCase()];
      if (month != null) parsedDate = makeDate(mdy[3] ? parseInt(mdy[3], 10) : null, month, parseInt(mdy[2], 10));
    }
  }

  // Numeric: YYYY-MM-DD, DD/MM/YYYY, DD/MM
  if (!parsedDate) {
    const iso = lower.match(/\b(\d{4})\s*-\s*(\d{1,2})\s*-\s*(\d{1,2})\b/);
    if (iso) parsedDate = makeDate(parseInt(iso[1], 10), parseInt(iso[2], 10) - 1, parseInt(iso[3], 10));
  }

  if (!parsedDate) {
    const dmyFull = lower.match(/\b(\d{1,2})\s*[\/\-\.]\s*(\d{1,2})\s*[\/\-\.]\s*(\d{4})\b/);
    if (dmyFull) parsedDate = makeDate(parseInt(dmyFull[3], 10), parseInt(dmyFull[2], 10) - 1, parseInt(dmyFull[1], 10));
  }

  if (!parsedDate) {
    const dmyShort = lower.match(/\b(\d{1,2})\s*[\/\-\.]\s*(\d{1,2})\b(?!\s*[\/\-\.]\s*\d)/);
    if (dmyShort) {
      const day = parseInt(dmyShort[1], 10);
      const month = parseInt(dmyShort[2], 10) - 1;
      if (day >= 1 && day <= 31 && month >= 0 && month <= 11) {
        parsedDate = makeDate(new Date().getFullYear(), month, day);
      }
    }
  }

  if (!parsedDate) return { valid: false, reason: 'PARSE_FAILED' };

  const clinicNow = getClinicToday();

  if (parsedDate < clinicNow) {
    return { valid: false, reason: 'PAST_DATE', parsed: parsedDate, suggestion: 'That date has passed. Please choose a future date.' };
  }

  if (daysBetween(clinicNow, parsedDate) > CLINIC.bookingHorizonDays) {
    return { valid: false, reason: 'BEYOND_HORIZON', parsed: parsedDate, suggestion: `We only book up to ${CLINIC.bookingHorizonDays} days ahead. Please choose a closer date.` };
  }

  return { valid: true, parsed: parsedDate };
}

export function validateTime(text, date) {
  if (!text) return { valid: false, reason: 'MISSING' };

  const lower = normalizeIndicDigits(text.toLowerCase());
  let parsedTime = null;

  // HH:MM am/pm or 24h
  const hhmm = lower.match(/\b(\d{1,2})\s*:\s*(\d{2})\s*(am|pm|a\.m\.|p\.m\.)?/i);
  if (hhmm) {
    let h = parseInt(hhmm[1], 10);
    const m = parseInt(hhmm[2], 10);
    const meridiem = hhmm[3];
    if (meridiem) {
      const ampm = meridiem.toLowerCase().replace(/\./g, '').replace(/^a$/, 'am').replace(/^p$/, 'pm');
      if (ampm === 'pm' && h < 12) h += 12;
      if (ampm === 'am' && h === 12) h = 0;
    }
    parsedTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  // "2pm", "2 pm"
  if (!parsedTime) {
    const hour12 = lower.match(/(?<!\d:\s*)\b(\d{1,2})\s*(am|pm|a\.m\.|p\.m\.)\b(?!\s*\d)/i);
    if (hour12) {
      let h = parseInt(hour12[1], 10);
      const ampm = hour12[2].toLowerCase().replace(/\./g, '');
      if (ampm === 'pm' && h < 12) h += 12;
      if (ampm === 'am' && h === 12) h = 0;
      parsedTime = `${String(h).padStart(2, '0')}:00`;
    }
  }

  // "after [number]", "after [number]pm", "before [number]", "after [time]"
  if (!parsedTime) {
    const afterNum = lower.match(/\b(?:(?:right\s+)?(?:after|before|by|around|about))\s+(\d{1,2})\s*(am|pm)?\b/i);
    if (afterNum) {
      let h = parseInt(afterNum[1], 10);
      const meridiem = afterNum[2];
      if (meridiem) {
        const ampm = meridiem.toLowerCase();
        if (ampm === 'pm' && h < 12) h += 12;
        if (ampm === 'am' && h === 12) h = 0;
      } else {
        // No AM/PM specified — default to PM for hours 1-6 (afternoon/evening context),
        // AM for hours 7-12 (morning context)
        if (h >= 1 && h <= 6) h += 12; // 1pm-6pm
        // 7-12 → keep as is (7am-12pm)
      }
      parsedTime = `${String(h).padStart(2, '0')}:00`;
    }
  }

  // Time-of-day words: morning → 10:00, afternoon → 14:00, evening → 17:00
  if (!parsedTime) {
    if (/\b(morning|breakfast|subah)\b/.test(lower) || /सुबह/.test(lower)) {
      parsedTime = '10:00';
    } else if (/\b(afternoon|lunch|dopahar)\b/.test(lower) || /दोपहर/.test(lower)) {
      parsedTime = '14:00';
    } else if (/\b(evening|night|dinner|shaam|raat)\b/.test(lower) || /शाम|रात/.test(lower)) {
      parsedTime = '17:00';
    }
  }

  // Hinglish: "5 baje", "7 bje", "5 baje shaam"
  if (!parsedTime) {
    const baje = lower.match(/\b(\d{1,2})\s*(baje|bje|बजे)\b(?:\s*(subah|shaam|raat|सुबह|शाम|रात|am|pm))?/i);
    if (baje) {
      let h = parseInt(baje[1], 10);
      const tod = (baje[3] || '').toLowerCase();
      if (tod === 'pm' || tod === 'shaam' || tod === 'raat' || tod === 'शाम' || tod === 'रात') {
        if (h < 12) h += 12;
      } else if (tod === 'am' || tod === 'subah' || tod === 'सुबह') {
        if (h === 12) h = 0;
      } else if (h >= 1 && h <= 6) {
        h += 12;
      }
      parsedTime = `${String(h).padStart(2, '0')}:00`;
    }
  }

  // Hinglish: "saade 5" (half past)
  if (!parsedTime) {
    const saade = lower.match(/\b(saade|sade|साढ़े|साढे)\s*(\d{1,2})\b/i);
    if (saade) {
      let h = parseInt(saade[2], 10);
      if (h >= 1 && h <= 6) h += 12;
      parsedTime = `${String(h).padStart(2, '0')}:30`;
    }
  }

  // "half past 2", "quarter to 3", "quarter past 2", "2 o'clock"
  if (!parsedTime) {
    const halfPast = lower.match(/\bhalf\s+past\s+(\d{1,2})\b/);
    if (halfPast) {
      let h = parseInt(halfPast[1], 10);
      if (h >= 1 && h <= 6) h += 12;
      parsedTime = `${String(h).padStart(2, '0')}:30`;
    }
  }

  if (!parsedTime) {
    const quarterPast = lower.match(/\bquarter\s+past\s+(\d{1,2})\b/);
    if (quarterPast) {
      let h = parseInt(quarterPast[1], 10);
      if (h >= 1 && h <= 6) h += 12;
      parsedTime = `${String(h).padStart(2, '0')}:15`;
    }
  }

  if (!parsedTime) {
    const quarterTo = lower.match(/\bquarter\s+to\s+(\d{1,2})\b/);
    if (quarterTo) {
      let h = parseInt(quarterTo[1], 10);
      if (h >= 1 && h <= 6) h += 12;
      h = h === 12 ? 1 : h + 1;
      parsedTime = `${String(h).padStart(2, '0')}:45`;
    }
  }

  if (!parsedTime) {
    const oclock = lower.match(/\b(\d{1,2})\s*o['\"]?\s*clock\b/i);
    if (oclock) {
      let h = parseInt(oclock[1], 10);
      if (h >= 1 && h <= 6) h += 12;
      parsedTime = `${String(h).padStart(2, '0')}:00`;
    }
  }

  if (!parsedTime) return { valid: false, reason: 'PARSE_FAILED' };

  // Validate against clinic hours
  const dayType = date && isSunday(new Date(date)) ? 'sunday' : 'weekday';
  const hours = CLINIC.hours[dayType];
  const slots = CLINIC.slots[dayType];

  const timeMinutes = parseTimeToMinutes(parsedTime);
  const openMinutes = parseTimeToMinutes(hours.open);
  const closeMinutes = parseTimeToMinutes(hours.close);

  if (timeMinutes < openMinutes) {
    return { valid: false, reason: 'BEFORE_OPENING', parsed: parsedTime, suggestion: `We open at ${hours.open}.` };
  }

  if (timeMinutes >= closeMinutes) {
    return { valid: false, reason: 'AFTER_CLOSING', parsed: parsedTime, suggestion: `We close at ${hours.close}.` };
  }

  // Slot alignment
  if (timeMinutes % 30 !== 0) {
    const roundedMinutes = Math.floor(timeMinutes / 30) * 30;
    const roundedHour = Math.floor(roundedMinutes / 60);
    const roundedMin = roundedMinutes % 60;
    const rounded = `${String(roundedHour).padStart(2, '0')}:${String(roundedMin).padStart(2, '0')}`;
    return { valid: false, reason: 'INVALID_SLOT', parsed: parsedTime, suggestion: `Slots are every 30 minutes. Try ${rounded}.` };
  }

  if (!slots.includes(parsedTime)) {
    return { valid: false, reason: 'SLOT_UNAVAILABLE', parsed: parsedTime, suggestion: `Try one of: ${slots.slice(0, 5).join(', ')}.` };
  }

  // Reject if the time has already passed for today (in clinic timezone)
  if (date) {
    const today = getClinicDateStr();
    const dateStr = date instanceof Date ? date.toLocaleDateString('en-CA', { timeZone: CLINIC.timeZone }) : String(date);
    if (dateStr === today) {
      const nowMinutes = getClinicMinutes();
      if (timeMinutes <= nowMinutes) {
        return { valid: false, reason: 'TIME_PASSED', parsed: parsedTime, suggestion: `That time has already passed. Please choose a later time.` };
      }
    }
  }

  return { valid: true, parsed: parsedTime };
}

export function validateTreatment(text) {
  if (!text) return { valid: false, reason: 'MISSING' };

  const lower = text.toLowerCase().trim();

  // Sort aliases by length (descending) so multi-word aliases match first
  const allAliases = [];
  for (const t of CLINIC.treatments) {
    for (const alias of t.aliases) {
      allAliases.push({ treatmentId: t.id, treatmentName: t.name, alias: alias.toLowerCase() });
    }
  }
  allAliases.sort((a, b) => b.alias.length - a.alias.length);

  for (const entry of allAliases) {
    const pattern = new RegExp(`\\b${entry.alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    if (pattern.test(lower)) {
      return { valid: true, parsed: entry.treatmentName };
    }
  }

  return { valid: false, reason: 'UNKNOWN', suggestion: `Available treatments: ${CLINIC.treatments.map(t => t.name).join(', ')}.` };
}

export function validatePhone(text) {
  if (!text) return { valid: false, reason: 'MISSING' };

  const cleaned = text.replace(/[^0-9]/g, '');

  // 10-digit Indian mobile numbers, optionally prefixed with 91 or 0.
  // Mobile numbers should start with 6-9.
  let digits = null;
  if (/^(91)?[6-9]\d{9}$/.test(cleaned)) {
    digits = cleaned.slice(-10);
  } else if (/^(0)[6-9]\d{9}$/.test(cleaned)) {
    digits = cleaned.slice(1);
  }

  if (digits && digits.length === 10) {
    return { valid: true, parsed: `+91${digits}` };
  }

  return { valid: false, reason: 'INVALID', suggestion: 'Please share a valid 10-digit mobile number.' };
}
