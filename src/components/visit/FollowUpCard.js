import React from 'react';
import { Calendar, FileText } from 'lucide-react';

export default function FollowUpCard({ followUpProps }) {
  const { form, setForm } = followUpProps;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-6 shadow-sm">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/30"><Calendar className="w-4 h-4 text-amber-500 dark:text-amber-400" /></div>
          <h2 className="font-bold text-gray-900 dark:text-gray-100 text-lg">Follow-up</h2>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Follow-up Date</label>
            <input type="date" value={form.followUpDate} onChange={e => setForm(f => ({ ...f, followUpDate: e.target.value }))}
              className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 focus:border-blue-400 dark:focus:border-blue-500 transition-all" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Instructions</label>
            <input type="text" value={form.followUpInstructions} onChange={e => setForm(f => ({ ...f, followUpInstructions: e.target.value }))}
              className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 focus:border-blue-400 dark:focus:border-blue-500 transition-all"
              placeholder="e.g. Return in 2 weeks" />
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-6 shadow-sm">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="p-1.5 rounded-lg bg-gray-100 dark:bg-gray-800"><FileText className="w-4 h-4 text-gray-500 dark:text-gray-400" /></div>
          <h2 className="font-bold text-gray-900 dark:text-gray-100 text-lg">Additional Notes</h2>
        </div>
        <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          rows={3} className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 focus:border-blue-400 dark:focus:border-blue-500 transition-all resize-none"
          placeholder="Any additional notes or instructions..." />
      </div>
    </div>
  );
}
