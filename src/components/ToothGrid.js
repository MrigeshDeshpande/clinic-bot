'use client';
import { useMemo, useRef, useState, useEffect, useCallback, memo } from 'react';

const UPPER = [18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28];
const LOWER = [48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38];
const ALL_TEETH = [...UPPER, ...LOWER];

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

function toothStatusColor(entry) {
  if (!entry) return null;
  const diagnoses = entry.diagnoses || [];
  const severity = entry.severity || '';
  const status = entry.status || 'active';
  const outcome = entry.outcome || '';

  if (diagnoses.includes('Missing')) return null;

  if (status === 'treated' || outcome === 'successful') return '#22c55e';

  if (severity === 'severe') return '#ef4444';

  if (entry.treatment || status === 'wip') return '#3b82f6';

  if (diagnoses.length > 0) return '#f59e0b';

  return null;
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

const ToothButton = memo(function ToothButton({
  num, entry, isActive, isSelected, multiSelect, onToothSelect, onContextMenu,
  selectedTeeth, setSelectedTeeth, onQuickDiagnosis,
}) {
  const diagnoses = entry?.diagnoses || [];
  const severity = entry?.severity || '';
  const treatment = entry?.treatment || '';
  const status = entry?.status || 'active';
  const color = toothStatusColor(entry);
  const isMissing = diagnoses.includes('Missing');
  const path = toothPath(num);
  const strokeColor = color || (isActive ? '#3b82f6' : '#9ca3af');
  const showDiagDot = diagnoses.length > 0 && !isMissing;
  const opacity = severityOpacity(severity);

  function handleClick(e) {
    if (multiSelect) {
      setSelectedTeeth(prev => {
        const next = new Set(prev);
        if (next.has(num)) next.delete(num);
        else next.add(num);
        return next;
      });
      return;
    }
    if (onToothSelect) onToothSelect(isActive ? null : num);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      onContextMenu={(e) => onContextMenu?.(num, e)}
      className={`
        relative flex flex-col items-center justify-center
        p-px rounded-lg transition-all duration-150 cursor-pointer min-w-[80px]
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
          <pattern id={`p-mild-${num}`} width="4" height="4" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="0.8" fill="currentColor" opacity="0.35" />
          </pattern>
          <pattern id={`p-moderate-${num}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="currentColor" strokeWidth="1.2" opacity="0.45" />
          </pattern>
          <pattern id={`p-severe-${num}`} width="8" height="8" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="0" y2="8" stroke="currentColor" strokeWidth="1.5" opacity="0.55" />
            <line x1="0" y1="0" x2="8" y2="0" stroke="currentColor" strokeWidth="1.5" opacity="0.55" />
          </pattern>
        </defs>
        {!color && <path d={path} fill="#f9fafb" stroke="none" className="dark:hidden" />}
        {!color && <path d={path} fill="#374151" stroke="none" className="hidden dark:block" />}
        {color && !isMissing && <path d={path} fill={`url(#gr-${num})`} stroke="none" />}
        {color && !isMissing && <path d={path} fill={color} opacity={opacity} stroke="none" />}
        {!isMissing && diagnoses.slice(1).map((d, i) => {
          const ringColor = DIAG_COLORS[d] || FALLBACK_COLOR;
          const s = 1 - (i + 1) * 0.12;
          return <path key={i} d={path} fill="none" stroke={ringColor} strokeWidth={0.7} opacity={0.5} transform={`translate(12,12) scale(${s}) translate(-12,-12)`} />;
        })}
        {severity && color && !isMissing && (
          <path d={path} fill={`url(#p-${severity}-${num})`} stroke="none" style={{ color }} />
        )}
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
        text-sm sm:text-base font-semibold leading-none select-none transition-colors mt-px
        ${isActive && !multiSelect ? 'text-blue-600 dark:text-blue-400' : ''}
        ${isSelected ? 'text-violet-600 dark:text-violet-400' : ''}
        ${color && !isActive && !isSelected && !isMissing ? 'text-gray-600 dark:text-gray-300' : ''}
        ${(!color || isMissing) && !isActive && !isSelected ? 'text-gray-400 dark:text-gray-500' : ''}
      `}>
        {num}
      </span>
      {showDiagDot && (
        <div className="flex items-center gap-[2.5px] mt-[3px] h-[4.5px]">
          {diagnoses.slice(0, 3).map((d, i) => (
            <span key={i} className="w-[4.5px] h-[4.5px] rounded-full" style={{ backgroundColor: DIAG_COLORS[d] || FALLBACK_COLOR }} />
          ))}
          {diagnoses.length > 3 && <span className="text-xs font-medium text-gray-400 dark:text-gray-500 leading-none ml-[2px]">+{diagnoses.length - 3}</span>}
        </div>
      )}
      {treatment && !isMissing && (
        <span className="text-xs text-emerald-500 dark:text-emerald-400 leading-none mt-[2px] font-medium truncate max-w-full px-0.5">
          {treatment}
        </span>
      )}
    </button>
  );
}, (prev, next) => {
  if (prev.num !== next.num) return false;
  if (prev.isActive !== next.isActive) return false;
  if (prev.isSelected !== next.isSelected) return false;
  if (prev.multiSelect !== next.multiSelect) return false;
  const pd = prev.entry?.diagnoses;
  const nd = next.entry?.diagnoses;
  if (pd?.length !== nd?.length) return false;
  if (pd && nd) { for (let i = 0; i < pd.length; i++) { if (pd[i] !== nd[i]) return false; } }
  if (prev.entry?.severity !== next.entry?.severity) return false;
  if (prev.entry?.treatment !== next.entry?.treatment) return false;
  if (prev.entry?.status !== next.entry?.status) return false;
  return true;
});

function LoadingSkeleton() {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-3 sm:p-4">
      <div className="flex items-center justify-between mb-2 px-0.5">
        <span className="text-base font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">Dental Chart</span>
        <div className="w-10 h-4 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
      </div>
      <div className="space-y-1">
        <div className="grid grid-cols-16 gap-0">
          {UPPER.map(num => (
            <div key={num} className="p-px">
              <div className="bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" style={{ paddingBottom: '85%' }} />
            </div>
          ))}
        </div>
        <div className="flex justify-center my-1">
          <div className="w-10 h-px bg-gray-200 dark:bg-gray-700" />
        </div>
        <div className="grid grid-cols-16 gap-0">
          {LOWER.map(num => (
            <div key={num} className="p-px">
              <div className="bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" style={{ paddingBottom: '85%' }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ToothGrid({
  toothData = [],
  onToothSelect,
  selectedTooth,
  diagnosisOptions = [],
  onQuickDiagnosis,
  onToothEntryUpdate,
  loading,
}) {
  const [contextMenu, setContextMenu] = useState(null);
  const [multiSelect, setMultiSelect] = useState(false);
  const [selectedTeeth, setSelectedTeeth] = useState(new Set());
  const [menuStyle, setMenuStyle] = useState({});

  const [undoSnapshot, setUndoSnapshot] = useState(null);
  const menuRef = useRef(null);
  const gridRef = useRef(null);

  const toothMap = useMemo(() => {
    const map = {};
    for (const entry of toothData) map[entry.tooth] = entry;
    return map;
  }, [toothData]);

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

  // Keyboard navigation
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || multiSelect) return;
    function handleKeyDown(e) {
      if (selectedTooth == null) return;
      const idx = ALL_TEETH.indexOf(selectedTooth);
      if (idx === -1) return;
      let next = idx;
      if (e.key === 'ArrowRight') { e.preventDefault(); next = Math.min(idx + 1, ALL_TEETH.length - 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); next = Math.max(idx - 1, 0); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); next = idx < 16 ? idx + 16 : idx; }
      else if (e.key === 'ArrowUp') { e.preventDefault(); next = idx >= 16 ? idx - 16 : idx; }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToothSelect(selectedTooth); return; }
      else return;
      if (next !== idx) onToothSelect(ALL_TEETH[next]);
    }
    grid.addEventListener('keydown', handleKeyDown);
    return () => grid.removeEventListener('keydown', handleKeyDown);
  }, [selectedTooth, multiSelect, onToothSelect]);

  function handleContextMenu(num, e) {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const menuW = 160, menuH = 230;
    let left = rect.left + window.scrollX;
    let top = rect.top + window.scrollY;
    if (left + menuW > window.innerWidth - 8) left = window.innerWidth - menuW - 8;
    if (left < 8) left = 8;
    if (top + menuH > window.innerHeight - 8) top = window.innerHeight - menuH - 8;
    if (top < 8) top = 8;
    setMenuStyle({ top, left });
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
    const prevEntry = toothMap[num];
    if (prevEntry) setUndoSnapshot({ [num]: { ...prevEntry } });
    if (onQuickDiagnosis) onQuickDiagnosis(num, null);
    setContextMenu(null);
  }

  function undoClear() {
    if (!undoSnapshot) return;
    for (const [tooth, entry] of Object.entries(undoSnapshot)) {
      if (onToothEntryUpdate) onToothEntryUpdate(Number(tooth), entry);
    }
    setUndoSnapshot(null);
  }

  function bulkAction(diag) {
    for (const num of selectedTeeth) {
      if (diag === null) {
        const prevEntry = toothMap[num];
        if (prevEntry) setUndoSnapshot(s => ({ ...s, [num]: { ...prevEntry } }));
      }
      onQuickDiagnosis?.(num, diag);
    }
    setSelectedTeeth(new Set());
  }

  function handleBulkClear() {
    const snap = {};
    for (const num of selectedTeeth) {
      const entry = toothMap[num];
      if (entry) snap[num] = { ...entry };
    }
    if (Object.keys(snap).length > 0) setUndoSnapshot(snap);
    for (const num of selectedTeeth) onQuickDiagnosis?.(num, null);
    setSelectedTeeth(new Set());
  }

  function handleSelectAll() {
    setSelectedTeeth(new Set(ALL_TEETH));
  }

  function handleDeselectAll() {
    setSelectedTeeth(new Set());
  }

  if (loading) return <LoadingSkeleton />;

  function renderRow(teeth, labelLeft, labelRight) {
    return (
      <div className="flex items-start gap-0">
        <div className="flex flex-col items-center pt-6 w-5 shrink-0">
          <span className="text-xs font-bold text-gray-400 dark:text-gray-500">{labelLeft}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="grid grid-cols-16 gap-0">
            {teeth.map(num => (
              <ToothButton
                key={num}
                num={num}
                entry={toothMap[num]}
                isActive={selectedTooth === num}
                isSelected={selectedTeeth.has(num)}
                multiSelect={multiSelect}
                onToothSelect={onToothSelect}
                onContextMenu={handleContextMenu}
                selectedTeeth={selectedTeeth}
                setSelectedTeeth={setSelectedTeeth}
                onQuickDiagnosis={onQuickDiagnosis}
              />
            ))}
          </div>
        </div>
        <div className="flex flex-col items-center pt-6 w-5 shrink-0">
          <span className="text-xs font-bold text-gray-400 dark:text-gray-500">{labelRight}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-3 sm:p-4" ref={gridRef} tabIndex={multiSelect ? -1 : 0} onKeyDown={() => {}}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2 px-0.5">
        <span className="text-base font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">Dental Chart</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { setMultiSelect(!multiSelect); setSelectedTeeth(new Set()); }}
            className={`text-sm font-medium px-3 py-1 rounded-md border transition-all ${
              multiSelect
                ? 'bg-violet-100 dark:bg-violet-900/40 border-violet-300 dark:border-violet-600 text-violet-700 dark:text-violet-300'
                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:border-violet-300'
            }`}
          >
            {multiSelect ? 'Exit Multi' : 'Multi'}
          </button>
          <span className="text-sm text-gray-400 dark:text-gray-500 font-medium">FDI</span>
        </div>
      </div>

      {/* Swipe Hint for Mobile */}
      <div className="flex md:hidden items-center justify-center gap-1.5 mb-2 px-1 py-1 bg-gray-50 dark:bg-gray-800/40 rounded-lg text-[10px] font-medium text-gray-450 dark:text-gray-500">
        <span>↔ Swipe horizontally to view full chart</span>
      </div>

      {/* Scrollable grid area wrapping both rows */}
      <div className="overflow-x-auto scrollbar-thin snap-x snap-mandatory pb-1">
        <div className="min-w-[880px] md:min-w-0">
          {renderRow(UPPER, 'UR', 'UL')}

          <div className="flex items-center justify-center my-1.5">
            <div className="w-16 h-px bg-gray-200 dark:bg-gray-800" />
          </div>

          {renderRow(LOWER, 'LR', 'LL')}
        </div>
      </div>

      {/* Bulk action bar */}
      {multiSelect && selectedTeeth.size > 0 && (
        <div className="mt-2 flex items-center gap-2 px-2 py-1.5 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-lg flex-wrap">
          <span className="text-xs font-medium text-violet-700 dark:text-violet-300 shrink-0">{selectedTeeth.size} selected</span>
          <div className="flex gap-1 flex-wrap">
            {QUICK_DIAG.slice(0, 4).map(d => (
              <button
                key={d}
                type="button"
                onClick={() => bulkAction(d)}
                className="px-2 py-0.5 text-xs font-medium bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md text-gray-600 dark:text-gray-400 hover:border-blue-300 transition-all"
              >
                {d}
              </button>
            ))}
          </div>
          <div className="flex gap-1 ml-auto">
            {selectedTeeth.size < ALL_TEETH.length && (
              <button
                type="button"
                onClick={handleSelectAll}
                className="px-2 py-0.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 rounded-md transition-all"
              >
                Select all
              </button>
            )}
            {selectedTeeth.size > 0 && (
              <button
                type="button"
                onClick={handleDeselectAll}
                className="px-2 py-0.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 rounded-md transition-all"
              >
                Deselect all
              </button>
            )}
            <button
              type="button"
              onClick={handleBulkClear}
              className="px-2 py-0.5 text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-all"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl py-1 w-40"
          style={{ top: menuStyle.top, left: menuStyle.left }}
        >
          <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
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

      {/* Undo toast */}
      {undoSnapshot && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] animate-in slide-in-from-bottom-2 fade-in duration-200">
          <div className="flex items-center gap-3 px-4 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl shadow-2xl text-xs font-medium">
            <span>Tooth cleared</span>
            <button
              type="button"
              onClick={undoClear}
              className="px-3 py-1 bg-white/20 dark:bg-gray-900/20 rounded-lg hover:bg-white/30 dark:hover:bg-gray-900/30 transition-all font-semibold"
            >
              Undo
            </button>
            <button
              type="button"
              onClick={() => setUndoSnapshot(null)}
              className="p-1 hover:bg-white/10 dark:hover:bg-gray-900/10 rounded-lg transition-all"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
