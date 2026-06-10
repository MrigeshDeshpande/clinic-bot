import React from 'react';

export default function ClinicalNotesCard({ clinicalNotesProps }) {
  const {
    patientProfile,
    form,
    setForm
  } = clinicalNotesProps;

  if (!patientProfile) return null;

  return (
    <div className="space-y-2.5">
      <div>
        <textarea value={form.generalExamination} onChange={e => setForm(f => ({ ...f, generalExamination: e.target.value }))}
          rows={2} className="w-full px-2.5 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-200 dark:focus:ring-teal-800 focus:border-teal-400 dark:focus:border-teal-500 transition-all resize-none placeholder-gray-400"
          placeholder="General Examination — e.g. Pallor, anemia, vitals stable" />
      </div>
      <div>
        <textarea value={form.extraOralExamination} onChange={e => setForm(f => ({ ...f, extraOralExamination: e.target.value }))}
          rows={2} className="w-full px-2.5 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-200 dark:focus:ring-violet-800 focus:border-violet-400 dark:focus:border-violet-500 transition-all resize-none placeholder-gray-400"
          placeholder="Extra-Oral Examination — e.g. Swelling, lymphadenopathy" />
      </div>
    </div>
  );
}
