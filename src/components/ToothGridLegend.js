'use client';
import { useMemo, useState } from 'react';

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

const MOLAR_PATH = `M6 5c1.5-1.5 3-1.5 4.5 0 1-1 2-1 3 0 1.5-1.5 3-1.5 4.5 0 1.5 1.5 2 3 2 4.5v2.5c0 3-1.5 4.5-2.5 6l-1.5 4a1 1 0 0 1-1.9.2L12 16.5l-2.1 5.7a1 1 0 0 1-1.9-.2l-1.5-4C5.5 16.5 4 15 4 12V9.5C4 8 4.5 6.5 6 5Z`;
const PREMOLAR_PATH = `M7.5 4c2-1 3.5-1 4.5 1 1-2 2.5-2 4.5-1 1.5.8 2 2 2 3.5v3.5c0 3.5-1 5-2 7l-1.5 3.5a1 1 0 0 1-1.8 0L12 18l-1.2 3.5a1 1 0 0 1-1.8 0L7.5 18C6.5 16 5.5 14.5 5.5 11V7.5c0-1.5.5-2.7 2-3.5Z`;
const CANINE_PATH = `M12 2l4 4.5v3.5c0 3.5-1.5 6-3 8l-2.5 3.5a1 1 0 0 1-1.6 0L6.5 18C5 16 3.5 13.5 3.5 10V6.5L12 2Z`;
const INCISOR_PATH = `M7 4h10c1.1 0 2 .9 2 2v4c0 3.5-1.5 6-3 8l-2.5 3.5a1 1 0 0 1-1.6 0L9.5 18C8 16 6.5 13.5 6.5 10V6c0-1.1.9-2 2-2Z`;

export default function ToothGridLegend({ toothData = [] }) {
  const [showAll, setShowAll] = useState(false);

  const allDiagnoses = useMemo(() => {
    const set = new Set();
    for (const d of toothData) {
      for (const diag of (d.diagnoses || [])) {
        if (diag !== 'Missing') set.add(diag);
      }
    }
    return Array.from(set);
  }, [toothData]);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4">
      <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-3 uppercase tracking-wider">Legend</h4>

      {/* Status colors */}
      <div className="space-y-1.5 mb-3">
        <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Status</p>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-sm bg-amber-500 shrink-0" />
          <span className="text-xs text-gray-600 dark:text-gray-400">Active Disease</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-sm bg-blue-500 shrink-0" />
          <span className="text-xs text-gray-600 dark:text-gray-400">Treatment Planned</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-sm bg-green-500 shrink-0" />
          <span className="text-xs text-gray-600 dark:text-gray-400">Completed</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-sm bg-red-500 shrink-0" />
          <span className="text-xs text-gray-600 dark:text-gray-400">Urgent (Severe)</span>
        </div>
      </div>

      {/* Diagnosis colors */}
      {allDiagnoses.length > 0 && (
        <div className="space-y-1.5 mb-3">
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
            Diagnoses {allDiagnoses.length > 5 && (
              <button type="button" onClick={() => setShowAll(!showAll)}
                className="ml-1 text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 transition-colors cursor-pointer normal-case font-normal">
                {showAll ? 'less' : `+${allDiagnoses.length - 5}`}
              </button>
            )}
          </p>
          {(showAll ? allDiagnoses : allDiagnoses.slice(0, 5)).map(d => (
            <div key={d} className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: DIAG_COLORS[d] || FALLBACK_COLOR }} />
              <span className="text-xs text-gray-600 dark:text-gray-400 truncate">{d}</span>
            </div>
          ))}
        </div>
      )}

      {/* Tooth types */}
      <div className="space-y-1.5 mb-3">
        <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Tooth Types</p>
        {[
          { path: MOLAR_PATH, label: 'Molar' },
          { path: PREMOLAR_PATH, label: 'Premolar' },
          { path: CANINE_PATH, label: 'Canine' },
          { path: INCISOR_PATH, label: 'Incisor' },
        ].map(({ path, label }) => (
          <div key={label} className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" className="w-3 h-3 shrink-0">
              <path d={path} fill="none" stroke="currentColor" strokeWidth="0.8" className="text-gray-400" />
            </svg>
            <span className="text-xs text-gray-500">{label}</span>
          </div>
        ))}
      </div>

      {/* Status dots */}
      <div className="space-y-1.5">
        <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Indicators</p>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-green-500 opacity-70 shrink-0" />
          <span className="text-xs text-gray-600 dark:text-gray-400">Treated</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-500 opacity-70 shrink-0" />
          <span className="text-xs text-gray-600 dark:text-gray-400">In Progress</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-sm bg-gray-400 shrink-0 opacity-40" />
          <span className="text-xs text-gray-600 dark:text-gray-400">Healthy / No Data</span>
        </div>
      </div>
    </div>
  );
}
