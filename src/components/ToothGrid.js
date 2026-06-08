'use client';
import { useMemo, useRef, useState, useEffect, useCallback } from 'react';

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

const QUICK_DIAG = ['Caries', 'Pocket', 'Mobility', 'Fractured Tooth / Cusp', 'Missing'];

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

function toothColor(diagnoses, severity, color) {
  if (color) return color;
  if (!diagnoses?.length) return null;
  const base = DIAG_COLORS[diagnoses[0]] || FALLBACK_COLOR;
  if (!severity) return base;
  return base;
}

function severityOpacity(severity) {
  if (severity === 'mild') return 0.15;
  if (severity === 'moderate') return 0.3;
  if (severity === 'severe') return 0.5;
  return 0.1;
}

function toothPath(num) {
  const t = toothType(num);
  if (t === 'molar') return MOLAR_PATH;
  if (t === 'premolar') return PREMOLAR_PATH;
  if (t === 'canine') return CANINE_PATH;
  return INCISOR_PATH;
}

export default function ToothGrid({
  toothData = [],
  onToothSelect,
  selectedTooth,
  diagnosisOptions = [],
  onQuickDiagnosis,
}) {
  const [contextMenu, setContextMenu] = useState(null);
  const [multiSelect, setMultiSelect] = useState(false);
  const [selectedTeeth, setSelectedTeeth] = useState(new Set());
  const [menuStyle, setMenuStyle] = useState({});
  const menuRef = useRef(null);

  const toothMap = useMemo(() => {
    const map = {};
    for (const entry of toothData) map[entry.tooth] = entry;
    return map;
  }, [toothData]);

  // Close menu on click outside or Esc
  useEffect(() => {
    if (!contextMenu) return;
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setContextMenu(null);
      }
    }
    function handleKey(e) {
      if (e.key === 'Escape') setContextMenu(null);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [contextMenu]);

  const diagnosesOnTooth = useCallback((num) => toothMap[num]?.diagnoses || [], [toothMap]);

  function handleClick(num, e) {
    if (multiSelect) {
      setSelectedTeeth(prev => {
        const next = new Set(prev);
        if (next.has(num)) next.delete(num);
        else next.add(num);
        return next;
      });
      return;
    }
    if (onToothSelect) onToothSelect(selectedTooth === num ? null : num);
  }

  function handleContextMenu(num, e) {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    setMenuStyle({
      top: rect.top + window.scrollY,
      left: Math.min(rect.left + window.scrollX, window.innerWidth - 160),
    });
    setContextMenu(num);
  }

  function applyQuickDiagnosis(diag) {
    if (!contextMenu) return;
    const num = contextMenu;
    if (onQuickDiagnosis) {
      onQuickDiagnosis(num, diag);
    }
    setContextMenu(null);
  }

  function clearTooth() {
    if (!contextMenu) return;
    const num = contextMenu;
    if (onQuickDiagnosis) {
      onQuickDiagnosis(num, null);
    }
    setContextMenu(null);
  }

  const allSelectedEntries = [...selectedTeeth].map(n => toothMap[n]).filter(Boolean);

  function renderTooth(num) {
    const diagnoses = diagnosesOnTooth(num);
    const entry = toothMap[num];
    const severity = entry?.severity || '';
    const treatment = entry?.treatment || '';
    const status = entry?.status || 'active';
    const color = toothColor(diagnoses, severity, null);
    const isActive = selectedTooth === num;
    const isSelected = selectedTeeth.has(num);
    const isMissing = diagnoses.includes('Missing');
    const path = toothPath(num);
    const strokeColor = color || (isActive ? '#3b82f6' : '#9ca3af');
    const showDiagDot = diagnoses.length > 0 && !isMissing;
    const opacity = severityOpacity(severity);

    return (
      <button
        key={num}
        type="button"
        onClick={(e) => handleClick(num, e)}
        onContextMenu={(e) => handleContextMenu(num, e)}
        className={`
          relative flex flex-col items-center justify-center
          p-px rounded-lg transition-all duration-150 cursor-pointer
          ${!multiSelect ? 'hover:scale-110 hover:z-10 hover:drop-shadow-lg active:scale-95' : ''}
          ${isActive && !multiSelect ? 'scale-110 z-10 ring-2 ring-blue-500/50 ring-offset-1 dark:ring-offset-gray-900 drop-shadow-lg' : ''}
          ${isSelected ? 'ring-2 ring-violet-500/60 ring-offset-1 dark:ring-offset-gray-900' : ''}
          ${isMissing ? 'opacity-40' : ''}
          ${multiSelect ? 'hover:ring-2 hover:ring-violet-300 dark:hover:ring-violet-600' : ''}
        `}
        title={`Tooth #${num} (${toothQuadrant(num)})${diagnoses.length ? `\n${diagnoses.join(', ')}` : ''}${treatment ? `\nPlan: ${treatment}` : ''}${severity ? `\nSeverity: ${severity}` : ''}`}
      >
        <svg viewBox="0 0 24 24" className="w-full transition-all duration-150 overflow-visible">
          <defs>
            <linearGradient id={`gr-${num}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color || '#e5e7eb'} stopOpacity="0.4" />
              <stop offset="100%" stopColor={color || '#d1d5db'} stopOpacity="0.15" />
            </linearGradient>
          </defs>
          {!color && <path d={path} fill="#f9fafb" stroke="none" className="dark:hidden" />}
          {!color && <path d={path} fill="#374151" stroke="none" className="hidden dark:block" />}
          {color && !isMissing && <path d={path} fill={`url(#gr-${num})`} stroke="none" />}
          {color && !isMissing && <path d={path} fill={color} opacity={opacity} stroke="none" />}
          {isActive && !color && !multiSelect && <path d={path} fill="#3b82f6" opacity="0.06" stroke="none" />}
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
          {!isMissing && status === 'treated' && (
            <circle cx="18" cy="5" r="2" fill="#22c55e" opacity="0.7" />
          )}
          {!isMissing && status === 'wip' && (
            <circle cx="18" cy="5" r="2" fill="#3b82f6" opacity="0.7" />
          )}
        </svg>
        <span className={`
          text-[7px] sm:text-[8px] font-semibold leading-none select-none transition-colors mt-px
          ${isActive && !multiSelect ? 'text-blue-600 dark:text-blue-400' : ''}
          ${isSelected ? 'text-violet-600 dark:text-violet-400' : ''}
          ${color && !isActive && !isSelected && !isMissing ? 'text-gray-600 dark:text-gray-300' : ''}
          ${(!color || isMissing) && !isActive && !isSelected ? 'text-gray-400 dark:text-gray-500' : ''}
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
        {treatment && !isMissing && (
          <span className="text-[5px] text-emerald-500 dark:text-emerald-400 leading-none mt-[1px] font-medium truncate max-w-full px-0.5">
            {treatment}
          </span>
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
      {/* Header */}
      <div className="flex items-center justify-between mb-2 px-0.5">
        <span className="text-[9px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">Dental Chart</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { setMultiSelect(!multiSelect); setSelectedTeeth(new Set()); }}
            className={`text-[8px] font-medium px-2 py-0.5 rounded-md border transition-all ${
              multiSelect
                ? 'bg-violet-100 dark:bg-violet-900/40 border-violet-300 dark:border-violet-600 text-violet-700 dark:text-violet-300'
                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:border-violet-300'
            }`}
          >
            {multiSelect ? 'Exit Multi' : 'Multi'}
          </button>
          <span className="text-[8px] text-gray-400 dark:text-gray-500 font-medium">FDI</span>
        </div>
      </div>

      {renderRow(UPPER, 'UR', 'UL')}

      <div className="flex items-center justify-center my-1">
        <div className="w-10 h-px bg-gray-200 dark:bg-gray-700" />
      </div>

      {renderRow(LOWER, 'LR', 'LL')}

      {/* Bulk action bar */}
      {multiSelect && selectedTeeth.size > 0 && (
        <div className="mt-2 flex items-center gap-2 px-2 py-1.5 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-lg">
          <span className="text-[10px] font-medium text-violet-700 dark:text-violet-300 shrink-0">{selectedTeeth.size} selected</span>
          <div className="flex gap-1">
            {QUICK_DIAG.slice(0, 4).map(d => (
              <button
                key={d}
                type="button"
                onClick={() => {
                  for (const num of selectedTeeth) {
                    onQuickDiagnosis?.(num, d);
                  }
                  setSelectedTeeth(new Set());
                }}
                className="px-2 py-0.5 text-[9px] font-medium bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md text-gray-600 dark:text-gray-400 hover:border-blue-300 transition-all"
              >
                {d}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              for (const num of selectedTeeth) {
                onQuickDiagnosis?.(num, null);
              }
              setSelectedTeeth(new Set());
            }}
            className="px-2 py-0.5 text-[9px] font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-all ml-auto"
          >
            Clear
          </button>
        </div>
      )}

      {/* Legend */}
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

      {/* Tooth type legend */}
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
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 opacity-50 inline-block" />
          Treated
        </span>
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 opacity-50 inline-block" />
          WIP
        </span>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl py-1 w-40"
          style={{ top: menuStyle.top, left: menuStyle.left }}
        >
          <div className="px-3 py-1.5 text-[9px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
            Tooth #{contextMenu}
          </div>
          {QUICK_DIAG.map(d => (
            <button
              key={d}
              type="button"
              onClick={() => applyQuickDiagnosis(d)}
              className="w-full text-left px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2"
            >
              <span className="w-2 h-2 rounded-full inline-block shrink-0" style={{ backgroundColor: DIAG_COLORS[d] || FALLBACK_COLOR }} />
              {d}
            </button>
          ))}
          <div className="border-t border-gray-100 dark:border-gray-700 mt-1 pt-1">
            <button
              type="button"
              onClick={clearTooth}
              className="w-full text-left px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              Clear all
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
