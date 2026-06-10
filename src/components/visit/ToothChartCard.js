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
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Tooth Chart</h2>
      </div>

      {diagnosisOptions.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-4 italic">
          No diagnosis items configured. Add them in{' '}
          <Link href="/dashboard/settings" className="text-blue-500 hover:text-blue-600 underline">Settings</Link>.
        </p>
      ) : (
        <div className="space-y-4">
          <ToothGrid
            toothData={form.toothDiagnoses}
            onToothSelect={stableSetSelectedTooth}
            selectedTooth={selectedTooth}
            diagnosisOptions={diagnosisOptions}
            onQuickDiagnosis={handleQuickDiagnosis}
            onToothEntryUpdate={handleToothEntryUpdate}
            loading={appointmentId && !appointmentMeta && !form.toothDiagnoses.length}
          />

          {/* Always-visible selected tooth panel */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            {selectedTooth ? (
              <PerToothDiagnosisPanel
                toothNumber={selectedTooth}
                currentEntry={form.toothDiagnoses.find(t => t.tooth === selectedTooth)}
                diagnosisOptions={diagnosisOptions}
                onSave={handleToothSave}
                onClose={handleToothClose}
              />
            ) : (
              <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-3 italic">
                Tap a tooth above to begin diagnosis
              </p>
            )}
          </div>

          {/* Summary chips */}
          {form.toothDiagnoses.length > 0 && (
            <div className="border-t border-gray-100 dark:border-gray-800 pt-3">
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
