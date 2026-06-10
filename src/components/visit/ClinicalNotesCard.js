import React from 'react';
import { Activity } from 'lucide-react';

export default function ClinicalNotesCard({ clinicalNotesProps }) {
  const {
    patientProfile,
    form,
    setForm
  } = clinicalNotesProps;

  if (!patientProfile) return null;

  return (
    <>
      {/* ── General Examination ── */}
      <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="p-1.5 rounded-lg bg-teal-50 dark:bg-teal-900/30"><Activity className="w-4 h-4 text-teal-500 dark:text-teal-400" /></div>
          <h2 className="font-bold text-gray-900 dark:text-gray-100 text-lg">General Examination</h2>
        </div>
        <textarea value={form.generalExamination} onChange={e => setForm(f => ({ ...f, generalExamination: e.target.value }))}
          rows={2} className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-200 dark:focus:ring-teal-800 focus:border-teal-400 dark:focus:border-teal-500 transition-all resize-none placeholder-gray-400"
          placeholder="e.g. Pallor, anemia, vitals stable" />
      </div>

      {/* ── Extra-Oral Examination ── */}
      <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="p-1.5 rounded-lg bg-violet-50 dark:bg-violet-900/30"><Activity className="w-4 h-4 text-violet-500 dark:text-violet-400" /></div>
          <h2 className="font-bold text-gray-900 dark:text-gray-100 text-lg">Extra-Oral Examination</h2>
        </div>
        <textarea value={form.extraOralExamination} onChange={e => setForm(f => ({ ...f, extraOralExamination: e.target.value }))}
          rows={2} className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-200 dark:focus:ring-violet-800 focus:border-violet-400 dark:focus:border-violet-500 transition-all resize-none placeholder-gray-400"
          placeholder="e.g. Swelling, lymphadenopathy" />
      </div>
    </>
  );
}
