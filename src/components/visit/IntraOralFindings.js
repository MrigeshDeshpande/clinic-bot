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
      <h3 className="text-xl font-bold leading-7 text-gray-900 dark:text-gray-100 mb-3">Findings</h3>

      {keys.length === 0 && !notes ? (
        <p className="text-base leading-7 text-gray-400 dark:text-gray-500 italic">No findings yet. Chart teeth above to populate.</p>
      ) : (
        <div className="space-y-3">
          {keys.map(diagnosis => (
            <div key={diagnosis}>
              <span className="text-lg font-bold leading-7 text-gray-800 dark:text-gray-200">{diagnosis}</span>
              <div className="mt-1 ml-3 text-base text-gray-700 dark:text-gray-300 leading-7">
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
            <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
              <span className="text-base leading-7 text-gray-600 dark:text-gray-300">{notes}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
