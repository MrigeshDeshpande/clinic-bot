import React from 'react';
import Link from 'next/link';
import ToothGrid from '@/components/ToothGrid';

export default function ToothChartCard({ toothChartProps }) {
  const {
    diagnosisOptions,
    form,
    stableSetSelectedTooth,
    selectedTooth,
    handleQuickDiagnosis,
    handleToothEntryUpdate,
    appointmentId,
    appointmentMeta,
  } = toothChartProps;

  return (
    <div>
      {diagnosisOptions.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-4 italic">
          No diagnosis items configured. Add them in{' '}
          <Link href="/dashboard/settings" className="text-blue-500 hover:text-blue-600 underline">Settings</Link>.
        </p>
      ) : (
        <ToothGrid
          toothData={form.toothDiagnoses}
          onToothSelect={stableSetSelectedTooth}
          selectedTooth={selectedTooth}
          diagnosisOptions={diagnosisOptions}
          onQuickDiagnosis={handleQuickDiagnosis}
          onToothEntryUpdate={handleToothEntryUpdate}
          loading={appointmentId && !appointmentMeta && !form.toothDiagnoses.length}
        />
      )}
    </div>
  );
}
