import React from 'react';

export default function Findings({ toothDiagnoses = [], notes, onToothSelect }) {
  const groups = {};
  for (const entry of toothDiagnoses) {
    for (const d of (entry.diagnoses || [])) {
      if (!groups[d]) groups[d] = [];
      if (!groups[d].includes(entry.tooth)) groups[d].push(entry.tooth);
    }
  }
  const keys = Object.keys(groups);

  return (
    <div className="bg-gray-50 dark:bg-gray-800/40 rounded-xl px-4 py-3">
      <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-3">Findings</h3>

      {keys.length === 0 && !notes ? (
        <p className="text-xs text-gray-400 dark:text-gray-500 italic">No findings yet. Chart teeth above to populate.</p>
      ) : (
        <div className="space-y-2">
          {keys.map(diagnosis => (
            <div key={diagnosis}>
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">{diagnosis}</span>
              <div className="mt-0.5 ml-3 text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
                {groups[diagnosis].map((tooth, i) => (
                  <React.Fragment key={tooth}>
                    {i > 0 && <span className="text-gray-300 dark:text-gray-600">, </span>}
                    <button type="button" onClick={() => onToothSelect?.(tooth)}
                      className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer">
                      {tooth}
                    </button>
                  </React.Fragment>
                ))}
              </div>
            </div>
          ))}
          {notes && (
            <div className="mt-1 pt-1 border-t border-gray-200 dark:border-gray-700">
              <span className="text-xs text-gray-500 dark:text-gray-400">{notes}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
