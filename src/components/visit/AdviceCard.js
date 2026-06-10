import React from 'react';
import Link from 'next/link';

export default function AdviceCard({ adviceProps }) {
  const { adviceOptions, form, setForm } = adviceProps;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-6 shadow-sm">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="p-1.5 rounded-lg bg-orange-50 dark:bg-orange-900/30">
          <svg className="w-4 h-4 text-orange-500 dark:text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
        </div>
        <h2 className="font-bold text-gray-900 dark:text-gray-100 text-lg">Diet & Advice</h2>
        <span className="text-xs text-gray-500 dark:text-gray-400 font-normal">Select relevant advice for this patient</span>
      </div>
      {adviceOptions.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-4 italic">
          No advice items configured. Add them in{' '}
          <Link href="/dashboard/settings" className="text-blue-500 hover:text-blue-600 underline">Settings</Link>.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {adviceOptions.map((item, i) => {
            const selected = form.adviceSelected.includes(item);
            return (
              <button key={i} type="button" onClick={() => {
                setForm(f => ({
                  ...f,
                  adviceSelected: selected
                    ? f.adviceSelected.filter(a => a !== item)
                    : [...f.adviceSelected, item],
                }));
              }}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all active:scale-95 ${
                  selected
                    ? 'bg-emerald-100 dark:bg-emerald-900/40 border-emerald-300 dark:border-emerald-600 text-emerald-800 dark:text-emerald-200 ring-1 ring-emerald-200 dark:ring-emerald-700'
                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-emerald-200 dark:hover:border-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                }`}>
                {item}
                {selected && <span className="ml-1.5 text-emerald-600 dark:text-emerald-400">✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
