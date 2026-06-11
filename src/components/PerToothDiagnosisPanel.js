'use client';
import { useState, useRef, useEffect, useMemo } from 'react';
import { X, Search, ChevronDown, ChevronRight, Star, Plus } from 'lucide-react';
import { CATEGORIES, TREATMENTS, TREATMENT_CATEGORIES, getTreatmentById, getTreatmentName } from '@/lib/treatments';
import { getToothAnatomicalName, getToothTypeLabel, getToothType, toothPath, surfaceLabel } from '@/lib/dental/fdi';

const SEVERITY_LEVELS = [
  { id: 'mild', label: 'Mild', color: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700' },
  { id: 'moderate', label: 'Moderate', color: 'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-700' },
  { id: 'severe', label: 'Severe', color: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700' },
];

const STATUS_OPTIONS = [
  { id: 'active', label: 'Active', color: 'bg-amber-100 text-amber-700 border-amber-300' },
  { id: 'treated', label: 'Treated', color: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
  { id: 'wip', label: 'In Progress', color: 'bg-blue-100 text-blue-700 border-blue-300' },
];

const OUTCOME_OPTIONS = [
  { id: 'successful', label: '✓ Successful', color: 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400' },
  { id: 'complication', label: '⚠ Complication', color: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400' },
  { id: 'ongoing', label: '⟳ Ongoing', color: 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400' },
  { id: 'failed', label: '✕ Failed', color: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400' },
];

// ── Category-based treatment selector component ──
function TreatmentsSelector({ favorites = [], customTreatments = [], selected, onSelect }) {
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState(() => {
    const initial = {};
    for (const cat of CATEGORIES) initial[cat.id] = true;
    return initial;
  });
  const inputRef = useRef(null);

  const allTreatments = useMemo(() => {
    const custom = customTreatments.map(ct => ({
      id: ct.id,
      name: ct.name || 'Unnamed',
      category: ct.category || 'other',
      defaultFee: ct.fee || 0,
      aliases: [ct.name || ''],
      isCustom: true,
    }));
    return [...custom, ...TREATMENTS];
  }, [customTreatments]);

  const filtered = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase().trim();
    return allTreatments.filter(t =>
      t.id.toLowerCase().includes(q) ||
      t.name.toLowerCase().includes(q) ||
      t.aliases.some(a => a.toLowerCase().includes(q))
    );
  }, [search, allTreatments]);

  function handleClick(id) {
    onSelect(id);
    setSearch('');
  }

  const toggleCategory = (catId) => {
    setCollapsed(prev => ({ ...prev, [catId]: !prev[catId] }));
  };

  const renderTreatment = (t) => {
    const isSelected = selected === t.id;
    return (
      <button
        key={t.id}
        type="button"
        onClick={() => handleClick(t.id)}
        className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all active:scale-[0.98] text-left ${
          isSelected
            ? 'bg-emerald-100 dark:bg-emerald-900/40 border-emerald-300 dark:border-emerald-600 text-emerald-800 dark:text-emerald-200 ring-1 ring-emerald-200 dark:ring-emerald-700'
            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-emerald-200 dark:hover:border-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
        }`}
      >
        {isSelected && <Star className="w-3 h-3 shrink-0 text-emerald-500" />}
        <span className="flex-1">{t.name}</span>
        <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">₹{t.defaultFee}</span>
      </button>
    );
  };

  if (filtered) {
    return (
      <div className="space-y-1.5">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search treatments..."
            className="w-full pl-6 pr-2 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-200 dark:focus:ring-emerald-800"
            autoFocus
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        <div className="max-h-48 overflow-y-auto space-y-1">
          {filtered.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-3">No treatments match &quot;{search}&quot;</p>
          ) : (
            filtered.map(t => renderTreatment(t))
          )}
        </div>
      </div>
    );
  }

  const customById = {};
  for (const ct of customTreatments) customById[ct.id] = { ...ct, defaultFee: ct.fee, isCustom: true };
  const favTreatments = favorites.map(id => getTreatmentById(id) || customById[id]).filter(Boolean);
  const favIds = new Set(favorites);

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search treatments..."
          className="w-full pl-6 pr-2 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-200 dark:focus:ring-emerald-800"
          autoFocus
        />
      </div>
      <div className="max-h-52 overflow-y-auto space-y-1.5">
        {favTreatments.length > 0 && (
          <div className="mb-2">
            <div className="flex items-center gap-1.5 mb-1 px-1">
              <Star className="w-3 h-3 text-amber-500" />
              <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider">Favorites</span>
            </div>
            <div className="space-y-1">
              {favTreatments.map(t => renderTreatment(t))}
            </div>
          </div>
        )}
        {CATEGORIES.map(cat => {
          const catTreatments = TREATMENT_CATEGORIES[cat.id] || [];
          const customInCat = customTreatments.filter(ct => !favIds.has(ct.id) && (ct.category === cat.id));
          const combined = [...catTreatments, ...customInCat.map(ct => ({ ...ct, defaultFee: ct.fee, isCustom: true, aliases: [ct.name || ''] }))];
          if (combined.length === 0) return null;
          const nonFav = combined.filter(t => !favIds.has(t.id));
          if (nonFav.length === 0 && favTreatments.length > 0) return null;
          const isCollapsed = collapsed[cat.id];
          return (
            <div key={cat.id}>
              <button type="button" onClick={() => toggleCategory(cat.id)}
                className="flex items-center gap-1.5 w-full px-1 py-1 rounded hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                {isCollapsed ? <ChevronRight className="w-3 h-3 text-gray-400" /> : <ChevronDown className="w-3 h-3 text-gray-400" />}
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{cat.label}</span>
                <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto">{nonFav.length}</span>
              </button>
              {!isCollapsed && (
                <div className="space-y-1 ml-1 mt-1">
                  {nonFav.map(t => renderTreatment(t))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const ZONE_POSITIONS = {
  molar: [
    { id: 'O', x: 20, y: 3 },
    { id: 'M', x: 5, y: 17 },
    { id: 'B', x: 20, y: 19 },
    { id: 'D', x: 35, y: 17 },
    { id: 'L', x: 10, y: 33 },
    { id: 'R', x: 30, y: 33 },
  ],
  premolar: [
    { id: 'O', x: 20, y: 3 },
    { id: 'M', x: 7, y: 17 },
    { id: 'B', x: 20, y: 19 },
    { id: 'D', x: 33, y: 17 },
    { id: 'L', x: 10, y: 33 },
    { id: 'R', x: 30, y: 33 },
  ],
  canine: [
    { id: 'O', x: 18, y: 3 },
    { id: 'M', x: 6, y: 17 },
    { id: 'B', x: 18, y: 20 },
    { id: 'D', x: 30, y: 17 },
    { id: 'L', x: 8, y: 33 },
    { id: 'R', x: 28, y: 33 },
  ],
  incisor: [
    { id: 'O', x: 20, y: 3 },
    { id: 'M', x: 8, y: 17 },
    { id: 'B', x: 20, y: 19 },
    { id: 'D', x: 32, y: 17 },
    { id: 'L', x: 10, y: 33 },
    { id: 'R', x: 30, y: 33 },
  ],
};

const MOLAR_PATH = `M6 5c1.5-1.5 3-1.5 4.5 0 1-1 2-1 3 0 1.5-1.5 3-1.5 4.5 0 1.5 1.5 2 3 2 4.5v2.5c0 3-1.5 4.5-2.5 6l-1.5 4a1 1 0 0 1-1.9.2L12 16.5l-2.1 5.7a1 1 0 0 1-1.9-.2l-1.5-4C5.5 16.5 4 15 4 12V9.5C4 8 4.5 6.5 6 5Z`;
const PREMOLAR_PATH = `M7.5 4c2-1 3.5-1 4.5 1 1-2 2.5-2 4.5-1 1.5.8 2 2 2 3.5v3.5c0 3.5-1 5-2 7l-1.5 3.5a1 1 0 0 1-1.8 0L12 18l-1.2 3.5a1 1 0 0 1-1.8 0L7.5 18C6.5 16 5.5 14.5 5.5 11V7.5c0-1.5.5-2.7 2-3.5Z`;
const CANINE_PATH = `M12 2l4 4.5v3.5c0 3.5-1.5 6-3 8l-2.5 3.5a1 1 0 0 1-1.6 0L6.5 18C5 16 3.5 13.5 3.5 10V6.5L12 2Z`;
const INCISOR_PATH = `M7 4h10c1.1 0 2 .9 2 2v4c0 3.5-1.5 6-3 8l-2.5 3.5a1 1 0 0 1-1.6 0L9.5 18C8 16 6.5 13.5 6.5 10V6c0-1.1.9-2 2-2Z`;

function getToothPath(num) {
  const t = getToothType(num);
  if (t === 'molar') return MOLAR_PATH;
  if (t === 'premolar') return PREMOLAR_PATH;
  if (t === 'canine') return CANINE_PATH;
  return INCISOR_PATH;
}

function SurfaceDiagram({ toothNumber, selected, onChange }) {
  const shape = getToothPath(toothNumber);
  const t = getToothType(toothNumber);
  const zones = ZONE_POSITIONS[t];
  const zoneSize = 22;
  const half = zoneSize / 2;
  const selectedSurfaces = selected ? selected.split(',').map(s => s.trim()).filter(Boolean) : [];

  function handleZoneClick(id, e) {
    if (e.ctrlKey || e.metaKey) {
      // Multi-select
      const next = selectedSurfaces.includes(id)
        ? selectedSurfaces.filter(s => s !== id)
        : [...selectedSurfaces, id];
      onChange(next.join(','));
    } else {
      // Single toggle
      onChange(selected === id ? '' : id);
    }
  }

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 40 40" className="w-28 h-28">
        <g transform="translate(8, 8) scale(1)">
          <path d={shape} fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1.2"
            className="dark:fill-gray-800 dark:stroke-gray-600" />
        </g>
        {zones.map(z => {
          const isSel = selectedSurfaces.includes(z.id);
          return (
            <g key={z.id} onClick={(e) => handleZoneClick(z.id, e)} className="cursor-pointer group">
              <rect x={z.x - half} y={z.y - half} width={zoneSize} height={zoneSize} rx="4"
                fill={isSel ? '#3b82f6' : 'transparent'}
                fillOpacity={isSel ? 0.25 : 0}
                className="group-hover:fill-blue-500/10 dark:group-hover:fill-blue-400/15 transition-colors" />
              <text x={z.x} y={z.y + 4} textAnchor="middle" fontSize="12" fontWeight="700"
                fill={isSel ? '#1e40af' : '#94a3b8'}
                className="select-none pointer-events-none transition-colors">
                {z.id}
              </text>
            </g>
          );
        })}
      </svg>
      {selected && (
        <div className="text-sm font-medium text-blue-600 dark:text-blue-400 mt-1.5">
          {selectedSurfaces.map(s => surfaceLabel(s, toothNumber)).join(', ')}
        </div>
      )}
    </div>
  );
}

export default function PerToothDiagnosisPanel({
  toothNumber,
  currentEntry,
  diagnosisOptions = [],
  treatmentsFavorites = [],
  customTreatments = [],
  history = [],
  onSave,
  onClose,
}) {
  const selectedDiagnoses = currentEntry?.diagnoses || [];
  const selectedSurface = currentEntry?.surface || '';
  const selectedTreatment = currentEntry?.treatment || '';
  const selectedSeverity = currentEntry?.severity || '';
  const selectedStatus = currentEntry?.status || 'active';
  const selectedOutcome = currentEntry?.outcome || '';
  const selectedNotes = currentEntry?.notes || '';

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [diagnosisInput, setDiagnosisInput] = useState('');
  const [showDiagnosisSuggestions, setShowDiagnosisSuggestions] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const diagnosisInputRef = useRef(null);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    setIsMobile(mq.matches);
    function handler(e) { setIsMobile(e.matches); }
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  function buildEntry(overrides = {}) {
    return {
      tooth: toothNumber,
      diagnoses: overrides.diagnoses !== undefined ? overrides.diagnoses : selectedDiagnoses,
      surface: overrides.surface !== undefined ? overrides.surface : selectedSurface,
      treatment: overrides.treatment !== undefined ? overrides.treatment : selectedTreatment,
      severity: overrides.severity !== undefined ? overrides.severity : selectedSeverity,
      status: overrides.status !== undefined ? overrides.status : selectedStatus,
      outcome: overrides.outcome !== undefined ? overrides.outcome : selectedOutcome,
      notes: overrides.notes !== undefined ? overrides.notes : selectedNotes,
    };
  }

  function setSurface(surface) {
    onSave(buildEntry({ surface }));
  }

  function addDiagnosis(d) {
    if (!d.trim()) return;
    if (!selectedDiagnoses.includes(d)) {
      onSave(buildEntry({ diagnoses: [...selectedDiagnoses, d] }));
    }
    setDiagnosisInput('');
    setShowDiagnosisSuggestions(false);
  }

  function removeDiagnosis(d) {
    onSave(buildEntry({ diagnoses: selectedDiagnoses.filter(item => item !== d) }));
  }

  function handleDiagnosisKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addDiagnosis(diagnosisInput);
    }
    if (e.key === 'Backspace' && !diagnosisInput && selectedDiagnoses.length > 0) {
      removeDiagnosis(selectedDiagnoses[selectedDiagnoses.length - 1]);
    }
  }

  const filteredSuggestions = useMemo(() => {
    if (!diagnosisInput.trim()) return [];
    const q = diagnosisInput.toLowerCase();
    return diagnosisOptions.filter(d => d.toLowerCase().includes(q) && !selectedDiagnoses.includes(d));
  }, [diagnosisInput, diagnosisOptions, selectedDiagnoses]);

  function setTreatment(treatment) {
    onSave(buildEntry({ treatment: treatment === selectedTreatment ? '' : treatment }));
  }

  function setSeverity(severity) {
    onSave(buildEntry({ severity: severity === selectedSeverity ? '' : severity }));
  }

  function setStatus(status) {
    onSave(buildEntry({ status }));
  }

  function setOutcome(outcome) {
    onSave(buildEntry({ outcome: outcome === selectedOutcome ? '' : outcome }));
  }

  function setNotes(notes) {
    onSave(buildEntry({ notes }));
  }

  // Build history timeline: group by year
  const timeline = useMemo(() => {
    const grouped = {};
    for (const h of history) {
      const year = h.year || h.date?.slice(0, 4) || '--';
      if (!grouped[year]) grouped[year] = [];
      grouped[year].push(h.text || h.diagnoses?.join(', ') || h.diagnosis || '');
    }
    return Object.entries(grouped).sort(([a], [b]) => b.localeCompare(a));
  }, [history]);

  const panelContent = (
    <>
      {/* ── Hero Header ── */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">🦷 Tooth {toothNumber}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">{getToothAnatomicalName(toothNumber)}</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* ── History (prominent, second only to header) ── */}
        {timeline.length > 0 && (
          <div className="bg-gray-50 dark:bg-gray-800/40 rounded-xl px-3 py-2.5">
            <h4 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">History</h4>
            <div className="space-y-1">
              {timeline.map(([year, entries]) => (
                entries.map((text, i) => (
                  <div key={`${year}-${i}`} className={`flex items-center gap-2 text-xs ${i === entries.length - 1 && year === timeline[0]?.[0] ? 'font-semibold text-gray-900 dark:text-gray-100' : 'text-gray-600 dark:text-gray-400'}`}>
                    <span className="text-xs font-mono text-gray-400 dark:text-gray-500 w-10 shrink-0">{year}</span>
                    <span>{text}</span>
                  </div>
                ))
              ))}
            </div>
          </div>
        )}

        {/* ── Surface SVG ── */}
        <div className="flex flex-col items-center">
          <SurfaceDiagram toothNumber={toothNumber} selected={selectedSurface} onChange={setSurface} />
        </div>

        {/* ── Diagnosis (autocomplete + free text) ── */}
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">Diagnosis</label>
          <div className="relative">
            <div className="flex flex-wrap gap-1 mb-1.5">
              {selectedDiagnoses.map(d => (
                <span key={d} className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 rounded-lg text-sm font-medium">
                  {d}
                  <button type="button" onClick={() => removeDiagnosis(d)} className="hover:text-blue-600 dark:hover:text-blue-300 transition-colors">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <input
              ref={diagnosisInputRef}
              type="text"
              value={diagnosisInput}
              onChange={e => { setDiagnosisInput(e.target.value); setShowDiagnosisSuggestions(true); }}
              onFocus={() => setShowDiagnosisSuggestions(true)}
              onBlur={() => setTimeout(() => setShowDiagnosisSuggestions(false), 200)}
              onKeyDown={handleDiagnosisKeyDown}
              placeholder={selectedDiagnoses.length === 0 ? 'Search or type diagnosis...' : 'Add another diagnosis...'}
              className="w-full px-3 py-1.5 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 placeholder-gray-400"
            />
            {showDiagnosisSuggestions && filteredSuggestions.length > 0 && (
              <div className="absolute z-10 left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-32 overflow-y-auto">
                {filteredSuggestions.map(s => (
                  <button key={s} type="button" onMouseDown={() => addDiagnosis(s)}
                    className="w-full text-left px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Treatment ── */}
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">Treatment</label>
          <TreatmentsSelector
            favorites={treatmentsFavorites}
            customTreatments={customTreatments}
            selected={selectedTreatment}
            onSelect={setTreatment}
          />
        </div>

        {/* ── Notes ── */}
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">Notes</label>
          <textarea value={selectedNotes} onChange={e => setNotes(e.target.value)}
            rows={2} className="w-full px-3 py-1.5 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 transition-all resize-none placeholder-gray-400"
            placeholder="e.g. patient reports pain on cold, tooth tender to percussion..." />
        </div>

        {/* ── Advanced ── */}
        <div>
          <button type="button" onClick={() => setShowAdvanced(o => !o)}
            className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
            {showAdvanced ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            Advanced
          </button>
          {showAdvanced && (
            <div className="mt-3 space-y-3">
              {/* Severity */}
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Severity</label>
                <div className="flex gap-1.5">
                  {SEVERITY_LEVELS.map(s => (
                    <button key={s.id} type="button" onClick={() => setSeverity(s.id)}
                      className={`px-3 py-1 rounded-lg text-xs font-medium border transition-all active:scale-95 ${
                        selectedSeverity === s.id
                          ? s.color + ' ring-1 ring-inset'
                          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300'
                      }`}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
              {/* Status */}
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Status</label>
                <div className="flex gap-1.5">
                  {STATUS_OPTIONS.map(s => (
                    <button key={s.id} type="button" onClick={() => setStatus(s.id)}
                      className={`px-3 py-1 rounded-lg text-xs font-medium border transition-all active:scale-95 ${
                        selectedStatus === s.id
                          ? s.color + ' ring-1 ring-inset'
                          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300'
                      }`}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
              {/* Outcome */}
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Outcome</label>
                <div className="flex gap-1.5">
                  {OUTCOME_OPTIONS.map(o => (
                    <button key={o.id} type="button" onClick={() => setOutcome(o.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all active:scale-95 ${
                        selectedOutcome === o.id
                          ? o.color + ' ring-1 ring-inset'
                          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300'
                      }`}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );

  if (isMobile) {
    return (
      <div className="fixed inset-x-0 bottom-0 z-50 flex flex-col max-h-[85vh] bg-white dark:bg-gray-900 rounded-t-2xl border-t border-gray-200 dark:border-gray-700 shadow-2xl animate-in slide-in-from-bottom duration-300">
        <div className="flex justify-center pt-2 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
        </div>
        <div className="overflow-y-auto flex-1">
          {panelContent}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border-2 border-blue-200 dark:border-blue-800 shadow-lg overflow-hidden">
      {panelContent}
    </div>
  );
}
