import React from 'react';

export default function IntraOralFindings({ toothDiagnoses = [], notes, onNotesChange, onToothSelect }) {
  const groups = {};
  for (const entry of toothDiagnoses) {
    for (const d of (entry.diagnoses || [])) {
      if (!groups[d]) groups[d] = [];
      if (!groups[d].includes(entry.tooth)) groups[d].push(entry.tooth);
    }
  }
  const keys = Object.keys(groups);

  return (
    <div>
      <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Intra-Oral Findings</h3>

      {keys.length === 0 && !notes ? (
        <p className="text-xs text-gray-400 dark:text-gray-500 italic">
          No intra-oral findings yet. Chart teeth above to populate.
        </p>
      ) : (
        <div className="space-y-2">
          {keys.length > 0 && (
            <div className="space-y-1.5">
              {keys.map(diagnosis => (
                <div key={diagnosis}>
                  <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">{diagnosis}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    {groups[diagnosis].map((tooth, i) => (
                      <React.Fragment key={tooth}>
                        {i > 0 && <span className="text-gray-300 dark:text-gray-600">, </span>}
                        <button type="button" onClick={() => onToothSelect?.(tooth)}
                          className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer">
                          {tooth}
                        </button>
                      </React.Fragment>
                    ))}
                  </p>
                </div>
              ))}
            </div>
          )}

          <div>
            <p className="text-[10px] font-medium text-gray-400 dark:text-gray-500 mb-1">Additional Observations</p>
            <textarea value={notes} onChange={e => onNotesChange(e.target.value)}
              rows={2} className="w-full px-2.5 py-1.5 text-[11px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:focus:ring-sky-800 transition-all resize-none placeholder-gray-400"
              placeholder="e.g. Buccal cortical expansion, high frenum attachment, suspicious white lesion..." />
          </div>
        </div>
      )}
    </div>
  );
}
