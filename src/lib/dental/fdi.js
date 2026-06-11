const QUADRANT_LABELS = {
  1: 'Maxillary Right',
  2: 'Maxillary Left',
  3: 'Mandibular Left',
  4: 'Mandibular Right',
};

const QUADRANT_SHORT = {
  1: 'UR', 2: 'UL', 3: 'LL', 4: 'LR',
};

const POSITION_NAMES = {
  1: 'Central Incisor', 2: 'Lateral Incisor', 3: 'Canine',
  4: 'First Premolar', 5: 'Second Premolar',
  6: 'First Molar', 7: 'Second Molar', 8: 'Third Molar',
};

export function getToothQuadrant(num) {
  return Math.floor(num / 10);
}

export function getToothPosition(num) {
  return num % 10;
}

export function getToothQuadrantLabel(num) {
  return QUADRANT_SHORT[getToothQuadrant(num)] || '';
}

export function getToothType(num) {
  const pos = getToothPosition(num);
  if (pos >= 6 || pos === 0) return 'molar';
  if (pos === 4 || pos === 5) return 'premolar';
  if (pos === 3) return 'canine';
  return 'incisor';
}

export function getToothTypeLabel(num) {
  const t = getToothType(num);
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function getToothName(num) {
  return POSITION_NAMES[getToothPosition(num)] || '';
}

export function getToothAnatomicalName(num) {
  const q = getToothQuadrant(num);
  const quad = QUADRANT_LABELS[q];
  const pos = POSITION_NAMES[getToothPosition(num)];
  if (!quad || !pos) return `Tooth ${num}`;
  return `${quad} ${pos}`;
}

export function getToothShortLabel(num) {
  return `#${num} · ${getToothAnatomicalName(num)}`;
}

export function surfaceLabel(surface, toothNumber) {
  const type = getToothType(toothNumber);
  const quad = getToothQuadrant(toothNumber);
  switch (surface) {
    case 'O': return type === 'incisor' || type === 'canine' ? 'Incisal' : 'Occlusal';
    case 'M': return 'Mesial';
    case 'D': return 'Distal';
    case 'B': return 'Buccal';
    case 'L': return quad === 1 || quad === 2 ? 'Palatal' : 'Lingual';
    case 'R': return 'Root';
    default: return surface;
  }
}

export function toothPath(num) {
  const type = getToothType(num);
  // 24×24 viewBox paths for each tooth type
  const PATHS = {
    molar: 'M5 3h14v18H5zm0 0v18H5V3m0 0H3v18h2m14-18h2v18h-2',
    premolar: 'M6 4h12v16H6zm0 0H4v16h2m12-16h2v16h-2',
    canine: 'M7 5l5-3 5 3v16H7zm0 0H5v16h2m12-16h2v16h-2',
    incisor: 'M8 4l4-2 4 2v18H8zm0 0H6v18h2m12-18h2v18h-2',
  };
  return PATHS[type] || PATHS.incisor;
}
