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
    handleToothClose,
    patientVisits = []
  } = toothChartProps;

  // Tooth history — filter visits for the selected tooth
  const toothHistory = selectedTooth
    ? (patientVisits || [])
        .filter(v => {
          const td = v.tooth_diagnoses;
          return td && Array.isArray(td) && td.some(e => e.tooth === selectedTooth);
        })
    : [];

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Tooth Chart</h2>
      </div>

      {diagnosisOptions.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-4 italic">
          No diagnosis items configured. Add them in{' '}
          <Link href="/dashboard/settings" className="text-blue-500 hover:text-blue-600 underline">Settings</Link>.
        </p>
      ) : (
        <div className="space-y-4">
          {/* Chart — always full size */}
          <ToothGrid
            toothData={form.toothDiagnoses}
            onToothSelect={stableSetSelectedTooth}
            selectedTooth={selectedTooth}
            diagnosisOptions={diagnosisOptions}
            onQuickDiagnosis={handleQuickDiagnosis}
            onToothEntryUpdate={handleToothEntryUpdate}
            loading={appointmentId && !appointmentMeta && !form.toothDiagnoses.length}
          />

          {/* Editor — only when tooth selected, no layout shift */}
          {selectedTooth && (
            <>
              <div id="per-tooth-editor" className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <PerToothDiagnosisPanel
                  toothNumber={selectedTooth}
                  currentEntry={form.toothDiagnoses.find(t => t.tooth === selectedTooth)}
                  diagnosisOptions={diagnosisOptions}
                  onSave={handleToothSave}
                  onClose={handleToothClose}
                />
              </div>
            </>
          )}

          {/* Summary chips — always show when there are diagnoses */}
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

          {/* ── Tooth History — read-only timeline ── */}
          {toothHistory.length > 0 && (
            <div className="border-t border-gray-100 dark:border-gray-800 pt-3">
              <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-2">History</p>
              <div className="space-y-2">
                {toothHistory.map(v => {
                  const entries = (v.tooth_diagnoses || []).filter(e => e.tooth === selectedTooth);
                  return entries.map((e, i) => (
                    <div key={`${v.id}-${i}`} className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <span className="shrink-0 w-14 text-[10px] text-gray-400 dark:text-gray-500 font-mono">
                        {v.date?.slice(0, 4) || '--'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <span className="text-gray-700 dark:text-gray-300">
                          {e.diagnoses?.join(', ') || v.diagnosis || ''}
                        </span>
                        {e.treatment && (
                          <span className="text-emerald-600 dark:text-emerald-400 ml-1">
                            — {e.treatment}
                          </span>
                        )}
                      </div>
                    </div>
                  ));
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
