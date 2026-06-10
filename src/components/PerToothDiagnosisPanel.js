'use client';
import { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';

const TOOTH_NAMES = {
  1: 'Central Incisor', 2: 'Lateral Incisor', 3: 'Canine',
  4: 'First Premolar', 5: 'Second Premolar',
  6: 'First Molar', 7: 'Second Molar', 8: 'Third Molar',
};

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
  { id: '', label: 'Not set', color: 'text-gray-400' },
  { id: 'successful', label: '✓ Successful', color: 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400' },
  { id: 'complication', label: '⚠ Complication', color: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400' },
  { id: 'ongoing', label: '⟳ Ongoing', color: 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400' },
  { id: 'failed', label: '✕ Failed', color: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400' },
];

const TREATMENT_OPTIONS = [
  'Filling', 'RCT', 'Extraction', 'Crown', 'Scaling',
  'Fluoride Application', 'Sealant', 'Pulpotomy',
  'Implant', 'Veneer', 'Bleaching', 'Orthodontic Treatment',
  'Observe / Monitor',
];

function toothQuadrant(num) {
  const q = Math.floor(num / 10);
  if (q === 1) return 'UR';
  if (q === 2) return 'UL';
  if (q === 3) return 'LL';
  if (q === 4) return 'LR';
  return '';
}

function toothName(num) {
  const pos = num % 10;
  return TOOTH_NAMES[pos] || '';
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

function toothTypeLabel(num) {
  const t = toothType(num);
  if (t === 'molar') return 'Molar';
  if (t === 'premolar') return 'Premolar';
  if (t === 'canine') return 'Canine';
  return 'Incisor';
}

function toothPath(num) {
  const t = toothType(num);
  if (t === 'molar') return MOLAR_PATH;
  if (t === 'premolar') return PREMOLAR_PATH;
  if (t === 'canine') return CANINE_PATH;
  return INCISOR_PATH;
}

function surfaceLabel(id, num) {
  const t = toothType(num);
  const q = Math.floor(num / 10);
  const isUpper = q === 1 || q === 2;
  if (id === 'O') return t === 'incisor' || t === 'canine' ? 'Incisal' : 'Occlusal';
  if (id === 'M') return 'Mesial';
  if (id === 'D') return 'Distal';
  if (id === 'B') return 'Buccal';
  if (id === 'L') return isUpper ? 'Palatal' : 'Lingual';
  if (id === 'R') return 'Root';
  return '';
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

function SurfaceDiagram({ toothNumber, selected, onChange }) {
  const shape = toothPath(toothNumber);
  const t = toothType(toothNumber);
  const zones = ZONE_POSITIONS[t];
  const zoneSize = 22;
  const half = zoneSize / 2;

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 40 40" className="w-16 h-16">
        <g transform="translate(8, 8) scale(1)">
          <path
            d={shape}
            fill="#f8fafc"
            stroke="#cbd5e1"
            strokeWidth="1.2"
            className="dark:fill-gray-800 dark:stroke-gray-600"
          />
        </g>
        {zones.map(z => {
          const isSel = selected === z.id;
          return (
            <g key={z.id} onClick={() => onChange(z.id)} className="cursor-pointer group">
              <rect
                x={z.x - half}
                y={z.y - half}
                width={zoneSize}
                height={zoneSize}
                rx="4"
                fill="transparent"
                className="group-hover:fill-blue-500/10 dark:group-hover:fill-blue-400/15 transition-colors"
              />
              <text
                x={z.x}
                y={z.y + 4}
                textAnchor="middle"
                fontSize="10"
                fontWeight="700"
                fill={isSel ? '#1e40af' : '#94a3b8'}
                className="select-none pointer-events-none transition-colors"
              >
                {z.id}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="text-[9px] font-semibold text-gray-500 dark:text-gray-400 mt-0.5">
        #{toothNumber} — {toothTypeLabel(toothNumber)} ({toothQuadrant(toothNumber)})
      </div>
      {selected && (
        <div className="text-[9px] font-medium text-blue-600 dark:text-blue-400 mt-0.5">
          {selected} = {surfaceLabel(selected, toothNumber)}
        </div>
      )}
    </div>
  );
}

export default function PerToothDiagnosisPanel({
  toothNumber,
  currentEntry,
  diagnosisOptions = [],
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
  const [showTreatmentInput, setShowTreatmentInput] = useState(false);
  const [customTreatment, setCustomTreatment] = useState('');
  const [treatmentInput, setTreatmentInput] = useState('');
  const [undoSnapshot, setUndoSnapshot] = useState(null);
  const [isMobile, setIsMobile] = useState(false);
  const diagnosesRef = useRef(null);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    setIsMobile(mq.matches);
    function handler(e) { setIsMobile(e.matches); }
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  function buildEntry(overrides = {}) {
    const e = {
      tooth: toothNumber,
      diagnoses: overrides.diagnoses !== undefined ? overrides.diagnoses : selectedDiagnoses,
      surface: overrides.surface !== undefined ? overrides.surface : selectedSurface,
      treatment: overrides.treatment !== undefined ? overrides.treatment : selectedTreatment,
      severity: overrides.severity !== undefined ? overrides.severity : selectedSeverity,
      status: overrides.status !== undefined ? overrides.status : selectedStatus,
      outcome: overrides.outcome !== undefined ? overrides.outcome : selectedOutcome,
      notes: overrides.notes !== undefined ? overrides.notes : selectedNotes,
    };
    return e;
  }

  function toggleDiagnosis(item) {
    const exists = selectedDiagnoses.includes(item);
    const next = exists
      ? selectedDiagnoses.filter(d => d !== item)
      : [...selectedDiagnoses, item];
    onSave(buildEntry({ diagnoses: next }));
  }

  function setSurface(surface) {
    onSave(buildEntry({ surface: surface === selectedSurface ? '' : surface }));
    diagnosesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function setTreatment(treatment) {
    setShowTreatmentInput(false);
    setTreatmentInput('');
    onSave(buildEntry({ treatment: treatment === selectedTreatment ? '' : treatment }));
  }

  function handleTreatmentKeyDown(e) {
    if (e.key === 'Enter' && treatmentInput.trim()) {
      e.preventDefault();
      const match = TREATMENT_OPTIONS.find(t => t.toLowerCase() === treatmentInput.trim().toLowerCase());
      setTreatment(match || treatmentInput.trim());
    }
  }

  function handleAddCustomTreatment() {
    if (customTreatment.trim()) {
      setTreatment(customTreatment.trim());
      setCustomTreatment('');
    }
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

  function clearAll() {
    if (currentEntry) setUndoSnapshot({ ...currentEntry });
    onSave({ tooth: toothNumber, diagnoses: [], surface: '', treatment: '', severity: '', status: 'active', outcome: '', notes: '' });
  }

  function undoClear() {
    if (undoSnapshot) {
      onSave(undoSnapshot);
      setUndoSnapshot(null);
    }
  }

  const panelContent = (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <div>
            <h3 className="font-bold text-sm text-gray-900 dark:text-gray-100">
              Tooth #{toothNumber}
            </h3>
            <p className="text-[10px] text-gray-500 dark:text-gray-400">
              {toothQuadrant(toothNumber)} &middot; {toothName(toothNumber)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selectedDiagnoses.length > 0 && (
            <button type="button" onClick={clearAll} className="text-[10px] text-red-500 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
              Clear
            </button>
          )}
          <button type="button" onClick={onClose} className="p-1 hover:bg-white/50 dark:hover:bg-gray-800 rounded-lg transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Visual surface diagram + Surface selector */}
        <div className="flex flex-col items-center gap-2">
          <SurfaceDiagram toothNumber={toothNumber} selected={selectedSurface} onChange={setSurface} />
        </div>

        {/* Diagnosis checklist */}
        <div ref={diagnosesRef}>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Conditions</label>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {diagnosisOptions.map((item) => {
              const isSelected = selectedDiagnoses.includes(item);
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => toggleDiagnosis(item)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all active:scale-95 ${
                    isSelected
                      ? 'bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-600 text-blue-800 dark:text-blue-200 ring-1 ring-blue-200 dark:ring-blue-700'
                      : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-blue-200 dark:hover:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                  }`}
                >
                  {item}
                  {isSelected && <span className="ml-1.5 text-blue-600 dark:text-blue-400">✓</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Severity */}
        {selectedDiagnoses.length > 0 && (
          <div>
            <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">Severity</label>
            <div className="flex gap-1.5">
              {SEVERITY_LEVELS.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSeverity(s.id)}
                  className={`px-3 py-1 rounded-lg text-[10px] font-medium border transition-all active:scale-95 ${
                    selectedSeverity === s.id
                      ? s.color + ' ring-1 ring-inset'
                      : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Treatment plan */}
        {selectedDiagnoses.length > 0 && (
          <div>
            <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">Treatment Plan</label>
            <div className="flex flex-wrap gap-1.5">
              {TREATMENT_OPTIONS.map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTreatment(t)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-medium border transition-all active:scale-95 ${
                    selectedTreatment === t
                      ? 'bg-emerald-100 dark:bg-emerald-900/40 border-emerald-300 dark:border-emerald-600 text-emerald-800 dark:text-emerald-200 ring-1 ring-emerald-200 dark:ring-emerald-700'
                      : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-emerald-200 dark:hover:border-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                  }`}
                >
                  {t}
                  {selectedTreatment === t && <span className="ml-1.5 text-emerald-600 dark:text-emerald-400">✓</span>}
                </button>
              ))}
              {showTreatmentInput ? (
                <div className="flex items-center gap-1 w-full mt-1">
                  <input
                    type="text"
                    value={customTreatment}
                    onChange={e => setCustomTreatment(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleAddCustomTreatment(); }}
                    placeholder="Type custom treatment..."
                    className="flex-1 px-2 py-1 text-[10px] border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                    autoFocus
                  />
                  <button onClick={handleAddCustomTreatment} className="px-2 py-1 text-[10px] font-medium bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 transition-colors">Add</button>
                  <button onClick={() => setShowTreatmentInput(false)} className="px-2 py-1 text-[10px] text-gray-400 hover:text-gray-600">✕</button>
                </div>
              ) : (
                <>
                  <input
                    list="treatment-suggestions"
                    value={treatmentInput}
                    onChange={e => setTreatmentInput(e.target.value)}
                    onKeyDown={handleTreatmentKeyDown}
                    placeholder="Type to search or + Custom..."
                    className="px-2 py-1 rounded-lg text-[10px] font-medium border border-dashed border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500 placeholder-gray-400 dark:placeholder-gray-500 hover:border-emerald-300 hover:text-emerald-500 transition-all w-32 bg-transparent focus:outline-none focus:ring-1 focus:ring-emerald-200"
                  />
                  <datalist id="treatment-suggestions">
                    {TREATMENT_OPTIONS.map(t => (
                      <option key={t} value={t} />
                    ))}
                  </datalist>
                  <button
                    type="button"
                    onClick={() => { setShowTreatmentInput(true); setTreatmentInput(''); }}
                    className="px-2 py-1 rounded-lg text-[10px] font-medium border border-dashed border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500 hover:border-emerald-300 hover:text-emerald-500 transition-all"
                  >
                    + Custom
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Status */}
        {selectedDiagnoses.length > 0 && (
          <div>
            <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">Status</label>
            <div className="flex gap-1.5">
              {STATUS_OPTIONS.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setStatus(s.id)}
                  className={`px-3 py-1 rounded-lg text-[10px] font-medium border transition-all active:scale-95 ${
                    selectedStatus === s.id
                      ? s.color + ' ring-1 ring-inset'
                      : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Outcome */}
        {selectedDiagnoses.length > 0 && (
          <div>
            <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">Outcome</label>
            <div className="flex gap-1.5">
              {OUTCOME_OPTIONS.filter(o => o.id).map(o => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setOutcome(o.id)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-medium border transition-all active:scale-95 ${
                    selectedOutcome === o.id
                      ? o.color + ' ring-1 ring-inset'
                      : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Tooth Notes */}
        {selectedDiagnoses.length > 0 && (
          <div>
            <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">Tooth Notes</label>
            <textarea
              value={selectedNotes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="w-full px-2.5 py-1.5 text-[11px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 transition-all resize-none placeholder-gray-400"
              placeholder="e.g. patient reports pain on cold, tooth tender to percussion..."
            />
          </div>
        )}

        {/* Summary */}
        {selectedDiagnoses.length > 0 && (
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl px-3 py-2 space-y-1">
            <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400">Tooth #{toothNumber} summary</p>
            <p className="text-xs text-gray-900 dark:text-gray-100">
              {selectedSurface && <span className="font-semibold">{selectedSurface} </span>}
              {selectedDiagnoses.join(', ')}
            </p>
            {selectedTreatment && (
              <p className="text-[10px] text-emerald-600 dark:text-emerald-400">
                Plan: {selectedTreatment}
                {selectedSeverity && <span className="text-gray-400 ml-1">· {selectedSeverity}</span>}
              </p>
            )}
            {selectedStatus && selectedStatus !== 'active' && (
              <span className={`inline-block text-[9px] font-medium px-1.5 py-0.5 rounded-full ${
                selectedStatus === 'treated' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
              }`}>
                {STATUS_OPTIONS.find(s => s.id === selectedStatus)?.label}
              </span>
            )}
            {selectedOutcome && (
              <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400">
                Outcome: {OUTCOME_OPTIONS.find(o => o.id === selectedOutcome)?.label}
              </p>
            )}
            {selectedNotes && (
              <p className="text-[10px] text-gray-500 dark:text-gray-400 italic leading-relaxed">{selectedNotes}</p>
            )}
          </div>
        )}
      </div>

      {/* Undo toast */}
      {undoSnapshot && (
        <div className="px-4 pb-4">
          <div className="flex items-center justify-between px-3 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl shadow-lg text-xs font-medium">
            <span>Tooth cleared</span>
            <div className="flex items-center gap-2">
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
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      )}
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
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-lg overflow-hidden">
      {panelContent}
    </div>
  );
}
