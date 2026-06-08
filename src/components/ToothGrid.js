'use client';
import { useState, useMemo } from 'react';

const UPPER_R = [1,2,3,4,5,6,7,8];
const UPPER_L = [9,10,11,12,13,14,15,16];
const LOWER_R = [32,31,30,29,28,27,26,25];
const LOWER_L = [24,23,22,21,20,19,18,17];

const QUADRANT = {
  1: 'UR', 2: 'UR', 3: 'UR', 4: 'UR', 5: 'UR', 6: 'UR', 7: 'UR', 8: 'UR',
  9: 'UL', 10: 'UL', 11: 'UL', 12: 'UL', 13: 'UL', 14: 'UL', 15: 'UL', 16: 'UL',
  17: 'LL', 18: 'LL', 19: 'LL', 20: 'LL', 21: 'LL', 22: 'LL', 23: 'LL', 24: 'LL',
  25: 'LR', 26: 'LR', 27: 'LR', 28: 'LR', 29: 'LR', 30: 'LR', 31: 'LR', 32: 'LR',
};

const DIAG_COLORS = {
  'Caries': '#f59e0b',
  'Deep caries': '#ef4444',
  'Pocket': '#8b5cf6',
  'Periodontitis': '#7c3aed',
  'Periapical Abscess': '#dc2626',
  'Grossly Decayed': '#991b1b',
  'Missing': '#6b7280',
  'Mobility': '#f97316',
  'Lesion': '#ec4899',
  'Impacted': '#14b8a6',
  'Fractured Tooth / Cusp': '#f43f5e',
  'Gingivitis': '#22c55e',
  'Halitosis': '#a3e635',
  'Calculus': '#94a3b8',
  'Stains': '#d4d4d8',
  'Abrasion / Attrition / Erosion': '#a855f7',
  'Irregular Teeth': '#0ea5e9',
};

const FALLBACK_COLOR = '#3b82f6';

function toothColor(diagnoses) {
  if (!diagnoses?.length) return null;
  return DIAG_COLORS[diagnoses[0]] || FALLBACK_COLOR;
}

const MOLAR_PATH = `M6 5c1.5-1.5 3-1.5 4.5 0 1-1 2-1 3 0 1.5-1.5 3-1.5 4.5 0 1.5 1.5 2 3 2 4.5v2.5c0 3-1.5 4.5-2.5 6l-1.5 4a1 1 0 0 1-1.9.2L12 16.5l-2.1 5.7a1 1 0 0 1-1.9-.2l-1.5-4C5.5 16.5 4 15 4 12V9.5C4 8 4.5 6.5 6 5Z`;
const PREMOLAR_PATH = `M7.5 4c2-1 3.5-1 4.5 1 1-2 2.5-2 4.5-1 1.5.8 2 2 2 3.5v3.5c0 3.5-1 5-2 7l-1.5 3.5a1 1 0 0 1-1.8 0L12 18l-1.2 3.5a1 1 0 0 1-1.8 0L7.5 18C6.5 16 5.5 14.5 5.5 11V7.5c0-1.5.5-2.7 2-3.5Z`;
const CANINE_PATH = `M12 2l4 4.5v3.5c0 3.5-1.5 6-3 8l-2.5 3.5a1 1 0 0 1-1.6 0L6.5 18C5 16 3.5 13.5 3.5 10V6.5L12 2Z`;
const INCISOR_PATH = `M7 4h10c1.1 0 2 .9 2 2v4c0 3.5-1.5 6-3 8l-2.5 3.5a1 1 0 0 1-1.6 0L9.5 18C8 16 6.5 13.5 6.5 10V6c0-1.1.9-2 2-2Z`;

const TOOTH_VIEWBOX = {
  molar: '0 0 24 24',
  premolar: '0 0 24 24',
  canine: '0 0 24 24',
  incisor: '0 0 24 24',
};

function toothType(num) {
  const n = num % 16;
  if (n >= 1 && n <= 3) return 'molar';
  if (n === 4 || n === 5) return 'premolar';
  if (n === 6) return 'canine';
  if (n >= 7 && n <= 10) return 'incisor';
  if (n === 11) return 'canine';
  if (n === 12 || n === 13) return 'premolar';
  if (n >= 14 || n === 0) return 'molar';
  return 'molar';
}

function toothPath(num) {
  const t = toothType(num);
  if (t === 'molar') return MOLAR_PATH;
  if (t === 'premolar') return PREMOLAR_PATH;
  if (t === 'canine') return CANINE_PATH;
  return INCISOR_PATH;
}

export default function ToothGrid({ toothData = [], onToothSelect, selectedTooth }) {
  const [hoveredTooth, setHoveredTooth] = useState(null);

  const toothMap = useMemo(() => {
    const map = {};
    for (const entry of toothData) map[entry.tooth] = entry;
    return map;
  }, [toothData]);

  const diagnosesOnTooth = (num) => toothMap[num]?.diagnoses || [];

  function handleToothClick(num) {
    if (onToothSelect) onToothSelect(selectedTooth === num ? null : num);
  }

  function renderTooth(num) {
    const diagnoses = diagnosesOnTooth(num);
    const color = toothColor(diagnoses);
    const isActive = selectedTooth === num;
    const isHovered = hoveredTooth === num;
    const isMissing = diagnoses.includes('Missing');
    const path = toothPath(num);
    const tType = toothType(num);
    const vb = TOOTH_VIEWBOX[tType];
    const strokeColor = color || (isActive ? '#3b82f6' : '#9ca3af');

    return (
      <button
        key={num}
        type="button"
        onClick={() => handleToothClick(num)}
        onMouseEnter={() => setHoveredTooth(num)}
        onMouseLeave={() => setHoveredTooth(null)}
        className={`
          relative flex flex-col items-center justify-center w-full aspect-square
          rounded-lg transition-all duration-200 cursor-pointer
          ${isActive
            ? 'ring-2 ring-blue-500/50 ring-offset-1 dark:ring-offset-gray-900 scale-110 z-10 bg-blue-50 dark:bg-blue-900/15'
            : ''}
          ${isHovered && !isActive ? 'bg-gray-100 dark:bg-gray-800/60' : ''}
          ${isMissing ? 'opacity-45' : ''}
        `}
        title={`Tooth #${num} (${QUADRANT[num]})${diagnoses.length ? `\n${diagnoses.join(', ')}` : ''}`}
      >
        <svg viewBox={vb} className={'w-6 h-6 sm:w-7 sm:h-7 transition-all duration-200 overflow-visible drop-shadow-sm'}>
          <defs>
            <linearGradient id={`gr-${num}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color || '#e5e7eb'} stopOpacity="0.4" />
              <stop offset="100%" stopColor={color || '#d1d5db'} stopOpacity="0.15" />
            </linearGradient>
            <linearGradient id={`act-${num}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.03" />
            </linearGradient>
          </defs>
          {!color && <path d={path} fill="#f9fafb" stroke="none" className="dark:hidden" />}
          {!color && <path d={path} fill="#374151" stroke="none" className="hidden dark:block" />}
          {color && !isMissing && <path d={path} fill={`url(#gr-${num})`} stroke="none" />}
          {color && !isMissing && <path d={path} fill={color} opacity="0.1" stroke="none" />}
          {isActive && !color && <path d={path} fill={`url(#act-${num})`} stroke="none" />}
          {isMissing && (
            <>
              <line x1="5" y1="4" x2="19" y2="22" stroke={strokeColor} strokeWidth="1.8" strokeLinecap="round" opacity="0.5" />
              <line x1="19" y1="4" x2="5" y2="22" stroke={strokeColor} strokeWidth="1.8" strokeLinecap="round" opacity="0.5" />
            </>
          )}
          <path
            d={path}
            fill="none"
            stroke={strokeColor}
            strokeWidth={color && !isMissing ? 1.5 : 1}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={diagnoses.length === 0 || isMissing ? 'dark:stroke-gray-600' : ''}
          />
        </svg>
        <span className={`
          text-[7px] font-semibold leading-none select-none transition-colors mt-0.5
          ${isActive ? 'text-blue-600 dark:text-blue-400' : ''}
          ${color && !isActive && !isMissing ? 'text-gray-600 dark:text-gray-300' : ''}
          ${(!color || isMissing) && !isActive ? 'text-gray-400 dark:text-gray-500' : ''}
        `}>
          {num}
        </span>
        {diagnoses.length > 0 && !isMissing && (
          <div className="flex items-center gap-[1.5px] mt-[1px] h-[3px]">
            {diagnoses.slice(0, 3).map((d, i) => (
              <span key={i} className="w-[3px] h-[3px] rounded-full" style={{ backgroundColor: DIAG_COLORS[d] || FALLBACK_COLOR }} />
            ))}
            {diagnoses.length > 3 && <span className="text-[5px] font-medium text-gray-400 dark:text-gray-500 leading-none ml-[1px]">+{diagnoses.length - 3}</span>}
          </div>
        )}
      </button>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-3 sm:p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-blue-500" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">Dental Chart</span>
        </div>
        <span className="text-[9px] text-gray-400 dark:text-gray-500 font-medium">Universal #1-32</span>
      </div>

      {/* Upper jaw */}
      <div className="flex items-start gap-0.5">
        <div className="flex flex-col items-center pt-4 gap-2 w-5 shrink-0">
          <span className="text-[9px] font-bold text-gray-400 dark:text-gray-500">UR</span>
          <div className="w-px h-8 bg-gray-200 dark:bg-gray-700" />
        </div>
        <div className="flex-1 flex flex-col items-center">
          <div className="grid grid-cols-8 gap-[1px] sm:gap-0.5 w-full">
            {UPPER_R.map(renderTooth)}
          </div>
          <div className="relative w-full flex justify-center my-1.5 sm:my-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-px bg-gray-200 dark:bg-gray-700" />
              <span className="text-[7px] font-semibold uppercase tracking-[0.2em] text-gray-300 dark:text-gray-600">Maxilla</span>
              <div className="w-8 h-px bg-gray-200 dark:bg-gray-700" />
            </div>
          </div>
          <div className="grid grid-cols-8 gap-[1px] sm:gap-0.5 w-full">
            {UPPER_L.map(renderTooth)}
          </div>
        </div>
        <div className="flex flex-col items-center pt-4 gap-2 w-5 shrink-0">
          <span className="text-[9px] font-bold text-gray-400 dark:text-gray-500">UL</span>
          <div className="w-px h-8 bg-gray-200 dark:bg-gray-700" />
        </div>
      </div>

      {/* Midline gap with arch indicator */}
      <div className="h-3 sm:h-4 flex items-center justify-center">
        <svg viewBox="0 0 40 12" className="w-10 h-3 text-gray-200 dark:text-gray-700" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M2,10 C10,2 20,2 30,10 C32,12 34,12 36,12 L38,12" />
          <path d="M38,10 C30,2 20,2 10,10 C8,12 6,12 4,12 L2,12" />
        </svg>
      </div>

      {/* Lower jaw */}
      <div className="flex items-start gap-0.5">
        <div className="flex flex-col items-center pt-4 gap-2 w-5 shrink-0">
          <span className="text-[9px] font-bold text-gray-400 dark:text-gray-500">LR</span>
          <div className="w-px h-8 bg-gray-200 dark:bg-gray-700" />
        </div>
        <div className="flex-1 flex flex-col items-center">
          <div className="grid grid-cols-8 gap-[1px] sm:gap-0.5 w-full">
            {LOWER_R.map(renderTooth)}
          </div>
          <div className="relative w-full flex justify-center my-1.5 sm:my-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-px bg-gray-200 dark:bg-gray-700" />
              <span className="text-[7px] font-semibold uppercase tracking-[0.2em] text-gray-300 dark:text-gray-600">Mandible</span>
              <div className="w-8 h-px bg-gray-200 dark:bg-gray-700" />
            </div>
          </div>
          <div className="grid grid-cols-8 gap-[1px] sm:gap-0.5 w-full">
            {LOWER_L.map(renderTooth)}
          </div>
        </div>
        <div className="flex flex-col items-center pt-4 gap-2 w-5 shrink-0">
          <span className="text-[9px] font-bold text-gray-400 dark:text-gray-500">LL</span>
          <div className="w-px h-8 bg-gray-200 dark:bg-gray-700" />
        </div>
      </div>

      {/* Diagnosis legend */}
      {toothData.flatMap(d => d.diagnoses).filter(d => d !== 'Missing').length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-4 pt-3 border-t border-gray-100 dark:border-gray-800 text-[10px] text-gray-500 dark:text-gray-400 justify-center">
          {Array.from(new Set(toothData.flatMap(d => d.diagnoses).filter(d => d !== 'Missing'))).slice(0, 5).map(d => (
            <span key={d} className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: DIAG_COLORS[d] || FALLBACK_COLOR }} />
              {d}
            </span>
          ))}
          {toothData.flatMap(d => d.diagnoses).filter(d => d !== 'Missing').length > 5 && <span className="text-gray-400">+ more</span>}
        </div>
      )}

      {/* Type guide */}
      <div className="flex items-center justify-center gap-4 mt-2.5 text-[8px] text-gray-400 dark:text-gray-500">
        {[
          { path: MOLAR_PATH, label: 'Molar', vb: '0 0 24 24', cls: 'w-2.5 h-2.5' },
          { path: PREMOLAR_PATH, label: 'Premolar', vb: '0 0 24 24', cls: 'w-2.5 h-2.5' },
          { path: CANINE_PATH, label: 'Canine', vb: '0 0 24 24', cls: 'w-2.5 h-2.5' },
          { path: INCISOR_PATH, label: 'Incisor', vb: '0 0 24 24', cls: 'w-2.5 h-2.5' },
        ].map(({ path, label, vb, cls }) => (
          <span key={label} className="flex items-center gap-1">
            <svg viewBox={vb} className={`${cls} inline-block`}>
              <path d={path} fill="none" stroke="currentColor" strokeWidth="0.8" />
            </svg>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
