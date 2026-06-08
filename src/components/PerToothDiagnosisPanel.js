'use client';
import { X } from 'lucide-react';

const SURFACE_OPTIONS = [
  { id: 'O', label: 'Occlusal' },
  { id: 'M', label: 'Mesial' },
  { id: 'D', label: 'Distal' },
  { id: 'B', label: 'Buccal' },
  { id: 'L', label: 'Lingual' },
  { id: 'MO', label: 'MO' },
  { id: 'DO', label: 'DO' },
  { id: 'MOD', label: 'MOD' },
  { id: 'BL', label: 'BL' },
];

const TOOTH_NAMES = {
  1: 'Central Incisor', 2: 'Lateral Incisor', 3: 'Canine',
  4: 'First Premolar', 5: 'Second Premolar',
  6: 'First Molar', 7: 'Second Molar', 8: 'Third Molar',
};

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

export default function PerToothDiagnosisPanel({
  toothNumber,
  currentEntry,
  diagnosisOptions = [],
  onSave,
  onClose,
}) {
  const selectedDiagnoses = currentEntry?.diagnoses || [];
  const selectedSurface = currentEntry?.surface || '';

  function toggleDiagnosis(item) {
    const exists = selectedDiagnoses.includes(item);
    const next = exists
      ? selectedDiagnoses.filter(d => d !== item)
      : [...selectedDiagnoses, item];
    onSave({ tooth: toothNumber, diagnoses: next, surface: selectedSurface });
  }

  function setSurface(surface) {
    onSave({ tooth: toothNumber, diagnoses: selectedDiagnoses, surface: surface === selectedSurface ? '' : surface });
  }

  function clearAll() {
    onSave({ tooth: toothNumber, diagnoses: [], surface: '' });
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-lg leading-none">🦷</span>
          <div>
            <h3 className="font-bold text-sm text-gray-900 dark:text-gray-100">
              Tooth #{toothNumber}
            </h3>
            <p className="text-[10px] text-gray-500 dark:text-gray-400">
              {toothQuadrant(toothNumber)} &middot; {toothName(toothNumber)}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 hover:bg-white/50 dark:hover:bg-gray-800 rounded-lg transition-colors"
        >
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Surface selector */}
        <div>
          <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">
            Tooth Surface
          </label>
          <div className="flex flex-wrap gap-1">
            {SURFACE_OPTIONS.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSurface(s.id)}
                className={`px-2 py-0.5 rounded-md text-[10px] font-medium border transition-all ${
                  selectedSurface === s.id
                    ? 'bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-600 text-blue-700 dark:text-blue-300 ring-1 ring-blue-200 dark:ring-blue-700'
                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-blue-300'
                }`}
              >
                {s.id}
                <span className="ml-1 text-[8px] opacity-60">{s.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Diagnosis checklist */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
              Conditions
            </label>
            {selectedDiagnoses.length > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="text-[10px] text-red-500 hover:text-red-600 transition-colors"
              >
                Clear all
              </button>
            )}
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

        {/* Summary */}
        {selectedDiagnoses.length > 0 && (
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl px-3 py-2">
            <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1">
              Tooth #{toothNumber} summary
            </p>
            <p className="text-xs text-gray-900 dark:text-gray-100">
              {selectedSurface && <span className="font-semibold">{selectedSurface} </span>}
              {selectedDiagnoses.join(', ')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
