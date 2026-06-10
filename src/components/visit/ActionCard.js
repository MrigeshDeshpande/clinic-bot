import React from 'react';
import { ClipboardCheck } from 'lucide-react';

export default function ActionCard({ actionProps }) {
  const { submitting, isEdit, appointmentId } = actionProps;

  return (
    <button type="submit" disabled={submitting}
      className="block mx-auto w-full sm:w-auto sm:min-w-[360px] py-3.5 sm:py-3 px-8 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white text-sm font-semibold rounded-xl hover:from-emerald-600 hover:to-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:opacity-60 disabled:cursor-not-allowed transition-all active:scale-[0.99] shadow-lg shadow-emerald-200 dark:shadow-emerald-900/50">
      {submitting ? (
        <span className="flex items-center justify-center gap-2">
          <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
          Saving...
        </span>
      ) : (
        <span className="flex items-center justify-center gap-2">
          <ClipboardCheck className="w-4 h-4" />
          {isEdit ? 'Save Changes' : appointmentId ? 'Complete & Save Visit' : 'Log Visit'}
        </span>
      )}
    </button>
  );
}
