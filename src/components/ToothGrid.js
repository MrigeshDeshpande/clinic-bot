'use client';
import { useMemo } from 'react';

const UPPER = [18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28];
const LOWER = [48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38];

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

function toothType(num) {
  const pos = num % 10;
  if (pos >= 6 || pos === 0) return 'molar';
  if (pos === 4 || pos === 5) return 'premolar';
  if (pos === 3) return 'canine';
  return 'incisor';
}

function toothQuadrant(num) {
  const q = Math.floor(num / 10);
  if (q === 1) return 'UR';
  if (q === 2) return 'UL';
  if (q === 3) return 'LL';
  if (q === 4) return 'LR';
  return '';
}

function toothPath(num) {
  const t = toothType(num);
  if (t === 'molar') return MOLAR_PATH;
  if (t === 'premolar') return PREMOLAR_PATH;
  if (t === 'canine') return CANINE_PATH;
  return INCISOR_PATH;
}

const MID_INDEX = 8;

export default function ToothGrid({ toothData = [], onToothSelect, selectedTooth }) {
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
    const isMissing = diagnoses.includes('Missing');
    const tType = toothType(num);
    const path = toothPath(num);
    const strokeColor = color || (isActive ? '#3b82f6' : '#9ca3af');
    const showDiagDot = diagnoses.length > 0 && !isMissing;

    return (
      <button
        key={num}
        type="button"
        onClick={() => handleToothClick(num)}
        className={`
          relative flex flex-col items-center justify-center
          p-px rounded transition-all duration-200 cursor-pointer
          ${isActive ? 'ring-1 ring-blue-500/40 z-10' : ''}
          ${isMissing ? 'opacity-40' : ''}
        `}
        title={`Tooth #${num} (${toothQuadrant(num)})${diagnoses.length ? `\n${diagnoses.join(', ')}` : ''}`}
      >
        <svg viewBox="0 0 24 24" className="w-full transition-all duration-200 overflow-visible drop-shadow-sm">
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
          text-[7px] sm:text-[8px] font-semibold leading-none select-none transition-colors mt-px
          ${isActive ? 'text-blue-600 dark:text-blue-400' : ''}
          ${color && !isActive && !isMissing ? 'text-gray-600 dark:text-gray-300' : ''}
          ${(!color || isMissing) && !isActive ? 'text-gray-400 dark:text-gray-500' : ''}
        `}>
          {num}
        </span>
        {showDiagDot && (
          <div className="flex items-center gap-[1.5px] mt-[2px] h-[3px]">
            {diagnoses.slice(0, 3).map((d, i) => (
              <span key={i} className="w-[3px] h-[3px] rounded-full" style={{ backgroundColor: DIAG_COLORS[d] || FALLBACK_COLOR }} />
            ))}
            {diagnoses.length > 3 && <span className="text-[5px] font-medium text-gray-400 dark:text-gray-500 leading-none ml-[1px]">+{diagnoses.length - 3}</span>}
          </div>
        )}
      </button>
    );
  }

  function renderRow(teeth, labelLeft, labelRight) {
    return (
      <div className="flex items-start gap-0">
        <div className="flex flex-col items-center pt-6 w-5 shrink-0">
          <span className="text-[8px] font-bold text-gray-400 dark:text-gray-500">{labelLeft}</span>
        </div>
        <div className="flex-1 grid" style={{ gridTemplateColumns: 'repeat(16, minmax(0, 1fr))', gap: 0 }}>
          {teeth.map(renderTooth)}
        </div>
        <div className="flex flex-col items-center pt-6 w-5 shrink-0">
          <span className="text-[8px] font-bold text-gray-400 dark:text-gray-500">{labelRight}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-3 sm:p-4">
      <div className="flex items-center justify-between mb-2 px-0.5">
        <span className="text-[9px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">Dental Chart</span>
        <span className="text-[8px] text-gray-400 dark:text-gray-500 font-medium">FDI</span>
      </div>

      {renderRow(UPPER, 'UR', 'UL')}

      <div className="flex items-center justify-center my-1">
        <div className="w-10 h-px bg-gray-200 dark:bg-gray-700" />
      </div>

      {renderRow(LOWER, 'LR', 'LL')}

      {toothData.flatMap(d => d.diagnoses).filter(d => d !== 'Missing').length > 0 && (
        <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 mt-2.5 pt-2 border-t border-gray-100 dark:border-gray-800 text-[9px] text-gray-500 dark:text-gray-400 justify-center">
          {Array.from(new Set(toothData.flatMap(d => d.diagnoses).filter(d => d !== 'Missing'))).slice(0, 5).map(d => (
            <span key={d} className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: DIAG_COLORS[d] || FALLBACK_COLOR }} />
              {d}
            </span>
          ))}
          {toothData.flatMap(d => d.diagnoses).filter(d => d !== 'Missing').length > 5 && <span className="text-gray-400">+ more</span>}
        </div>
      )}

      <div className="flex items-center justify-center gap-3 mt-2 text-[7px] text-gray-400 dark:text-gray-500">
        {[
          { path: MOLAR_PATH, label: 'Molar' },
          { path: PREMOLAR_PATH, label: 'Premolar' },
          { path: CANINE_PATH, label: 'Canine' },
          { path: INCISOR_PATH, label: 'Incisor' },
        ].map(({ path, label }) => (
          <span key={label} className="flex items-center gap-1">
            <svg viewBox="0 0 24 24" className="w-2 h-2 inline-block">
              <path d={path} fill="none" stroke="currentColor" strokeWidth="0.8" />
            </svg>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
