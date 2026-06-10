import React from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import ToothGrid from '@/components/ToothGrid';
import PerToothDiagnosisPanel from '@/components/PerToothDiagnosisPanel';

export default function ToothChartCard({ toothChartProps }) {
  const {
    diagnosisOptions,
    form,
    setForm,
    stableSetSelectedTooth,
    selectedTooth,
    setSelectedTooth,
    handleQuickDiagnosis,
    handleToothEntryUpdate,
    appointmentId,
    appointmentMeta,
    handleToothSave,
    handleToothClose
  } = toothChartProps;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-6 shadow-sm">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/30">
          <svg className="w-4 h-4 text-blue-500 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
        </div>
        <h2 className="font-bold text-gray-900 dark:text-gray-100 text-lg">Tooth Chart</h2>
        <span className="text-xs text-gray-500 dark:text-gray-400 font-normal">Tap a tooth to add diagnosis</span>
      </div>

      {diagnosisOptions.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-4 italic">
          No diagnosis items configured. Add them in{' '}
          <Link href="/dashboard/settings" className="text-blue-500 hover:text-blue-600 underline">Settings</Link>.
        </p>
      ) : (
        <div className="space-y-3">
          <ToothGrid
            toothData={form.toothDiagnoses}
            onToothSelect={stableSetSelectedTooth}
            selectedTooth={selectedTooth}
            diagnosisOptions={diagnosisOptions}
            onQuickDiagnosis={handleQuickDiagnosis}
            onToothEntryUpdate={handleToothEntryUpdate}
            loading={appointmentId && !appointmentMeta && !form.toothDiagnoses.length}
          />

          {selectedTooth && (
            <div className="mt-3">
              <PerToothDiagnosisPanel
                toothNumber={selectedTooth}
                currentEntry={form.toothDiagnoses.find(t => t.tooth === selectedTooth)}
                diagnosisOptions={diagnosisOptions}
                onSave={handleToothSave}
                onClose={handleToothClose}
              />
            </div>
          )}

          {/* Summary of all tooth entries */}
          {form.toothDiagnoses.length > 0 && (
            <div className="border-t border-gray-100 dark:border-gray-800 pt-3 mt-3">
              <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-2">
                {form.toothDiagnoses.length} tooth/teeth affected
              </p>
              <div className="flex flex-wrap gap-2">
                {form.toothDiagnoses.map(entry => (
                  <button
                    key={entry.tooth}
                    type="button"
                    onClick={() => setSelectedTooth(entry.tooth)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                      selectedTooth === entry.tooth
                        ? 'bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-600 text-blue-700 dark:text-blue-300'
                        : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-blue-200'
                    }`}
                  >
                    <span>#{entry.tooth}</span>
                    {entry.surface && <span className="opacity-60">{entry.surface}</span>}
                    <span className="opacity-75">{entry.diagnoses.slice(0, 2).join(', ')}{entry.diagnoses.length > 2 ? ` +${entry.diagnoses.length - 2}` : ''}</span>
                    {entry.treatment && <span className="text-[9px] text-emerald-500 dark:text-emerald-400 font-medium">{entry.treatment}</span>}
                    {entry.severity && <span className={`text-[9px] font-medium ${entry.severity === 'severe' ? 'text-red-500' : entry.severity === 'moderate' ? 'text-orange-500' : 'text-amber-500'}`}>{entry.severity}</span>}
                    <X className="w-3 h-3 ml-0.5 opacity-40 hover:opacity-100" onClick={(e) => {
                      e.stopPropagation();
                      setForm(f => ({ ...f, toothDiagnoses: f.toothDiagnoses.filter(t => t.tooth !== entry.tooth) }));
                      if (selectedTooth === entry.tooth) setSelectedTooth(null);
                    }} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
