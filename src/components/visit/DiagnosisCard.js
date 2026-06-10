import React from 'react';
import { FileText } from 'lucide-react';

export default function DiagnosisCard({ diagnosisProps }) {
  const { form, setForm } = diagnosisProps;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-6 shadow-sm">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/30">
          <FileText className="w-4 h-4 text-blue-500 dark:text-blue-400" />
        </div>                
        <h2 className="font-bold text-gray-900 dark:text-gray-100 text-lg">Diagnosis / Observations</h2>
      </div>
      <textarea value={form.diagnosis} onChange={e => setForm(f => ({ ...f, diagnosis: e.target.value }))}
        rows={3} className="w-full px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 focus:border-blue-400 dark:focus:border-blue-500 transition-all resize-none"
        placeholder="Describe the diagnosis, observations, and any clinical notes..." />
    </div>
  );
}
