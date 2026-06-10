import React from 'react';
import Link from 'next/link';

export default function AdviceCard({ adviceProps }) {
  const { adviceOptions, form, setForm } = adviceProps;

  if (adviceOptions.length === 0) return null;

  return (
    <div>
      <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Advice</h3>
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
              className={`px-2 py-0.5 rounded-lg text-[10px] font-medium border transition-all active:scale-95 ${
                selected
                  ? 'bg-emerald-100 dark:bg-emerald-900/40 border-emerald-300 dark:border-emerald-600 text-emerald-800 dark:text-emerald-200'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-emerald-200 dark:hover:border-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
              }`}>
              {item}
            </button>
          );
        })}
      </div>
    </div>
  );
}
