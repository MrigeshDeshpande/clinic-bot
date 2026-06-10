import React from 'react';

export default function ProvisionalDiagnosisCard({ diagnosisOptions = [], selectedDiagnoses = [], diagnosisNotes = '', onToggleDiagnosis, onNotesChange }) {
  if (diagnosisOptions.length === 0) return null;

  return (
    <div>
      <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Provisional Diagnosis</h3>
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {diagnosisOptions.map(item => {
            const isSelected = selectedDiagnoses.includes(item);
            return (
              <button key={item} type="button" onClick={() => onToggleDiagnosis(item)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all active:scale-95 ${
                  isSelected
                    ? 'bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-600 text-blue-800 dark:text-blue-200 ring-1 ring-blue-200 dark:ring-blue-700'
                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-blue-200 dark:hover:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                }`}>
                {item}
                {isSelected && <span className="ml-1.5 text-blue-600 dark:text-blue-400">✓</span>}
              </button>
            );
          })}
        </div>
        <textarea value={diagnosisNotes} onChange={e => onNotesChange(e.target.value)}
          rows={2} className="w-full px-2.5 py-1.5 text-[11px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 transition-all resize-none placeholder-gray-400"
          placeholder="Notes — e.g. Associated with 46 and 47 root apex..." />
      </div>
    </div>
  );
}
