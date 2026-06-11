import React from 'react';
import { AlertCircle } from 'lucide-react';

export default function PatientHeader({ patientProfile }) {
  const { name, age, medicalAlerts = [], lastVisit } = patientProfile || {};
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 mb-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{name || 'Patient'}</h2>
          {age && <p className="text-sm text-gray-600 dark:text-gray-400">Age {age}</p>}
        </div>
        {medicalAlerts.length > 0 && (
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-5 h-5 text-red-500" />
            <ul className="text-sm text-red-600 dark:text-red-400 list-disc list-inside">
              {medicalAlerts.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {lastVisit && (
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Last Visit: {new Date(lastVisit).toLocaleDateString()}
        </p>
      )}
    </div>
  );
}
