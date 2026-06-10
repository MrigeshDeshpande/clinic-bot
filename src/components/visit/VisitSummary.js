import React from 'react';
import { getTreatmentName } from '@/lib/treatments';

export default function VisitSummary({ form, toothDiagnoses = [], selectedTreatments = [], treatmentFees = {}, consultationFee, medicines = [] }) {
  const findings = {};
  for (const entry of toothDiagnoses) {
    for (const d of (entry.diagnoses || [])) {
      if (!findings[d]) findings[d] = [];
      if (!findings[d].includes(entry.tooth)) findings[d].push(entry.tooth);
    }
  }

  const perToothProcs = toothDiagnoses.filter(e => e.treatment).map(e => ({ tooth: e.tooth, treatment: e.treatment }));
  const toothTreatmentIds = new Set(toothDiagnoses.map(e => e.treatment).filter(Boolean));
  const generalProcs = selectedTreatments.filter(t => !toothTreatmentIds.has(t));

  const hasAny = form.chiefComplaint || Object.keys(findings).length > 0 || form.diagnosisSelected?.length > 0 || form.diagnosis || perToothProcs.length > 0 || generalProcs.length > 0 || medicines.length > 0 || form.adviceSelected?.length > 0 || form.followUpDate;

  if (!hasAny) return null;

  const groups = {};
  for (const p of perToothProcs) {
    if (!groups[p.treatment]) groups[p.treatment] = [];
    groups[p.treatment].push(`Tooth ${p.tooth}`);
  }
  for (const g of generalProcs) {
    const name = getTreatmentName(g);
    if (!groups[name]) groups[name] = [];
    groups[name].push('General');
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 space-y-3 shadow-sm">
      <p className="text-sm font-bold text-gray-800 dark:text-gray-200">Visit Summary</p>

      {form.chiefComplaint && (
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Chief Complaint</p>
          <p className="text-sm text-gray-900 dark:text-gray-100 mt-0.5">{form.chiefComplaint}</p>
        </div>
      )}

      {Object.keys(findings).length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Clinical Findings</p>
          <div className="space-y-1 mt-1">
            {Object.entries(findings).map(([diag, teeth]) => (
              <div key={diag} className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0 mt-1.5" />
                <div>
                  <span className="text-xs font-semibold text-gray-800 dark:text-gray-200 uppercase">{diag}</span>
                  <span className="text-sm text-gray-600 dark:text-gray-400"> {teeth.join(', ')}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(form.diagnosisSelected?.length > 0 || form.diagnosis) && (
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Diagnosis</p>
          {form.diagnosisSelected?.length > 0 && (
            <p className="text-sm text-gray-900 dark:text-gray-100 mt-0.5">{form.diagnosisSelected.join(', ')}</p>
          )}
          {form.diagnosis && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{form.diagnosis}</p>
          )}
        </div>
      )}

      {Object.keys(groups).length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Procedures</p>
          <div className="space-y-1 mt-1 ml-1">
            {Object.entries(groups).map(([treatment, items]) => (
              <p key={treatment} className="text-sm text-gray-800 dark:text-gray-200">
                <span className="font-semibold">{treatment}</span>
                {' — '}{items.join(', ')}
              </p>
            ))}
          </div>
        </div>
      )}

      {medicines.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Rx</p>
          <p className="text-sm text-gray-900 dark:text-gray-100 mt-0.5">{medicines.length} medicine{medicines.length > 1 ? 's' : ''}</p>
        </div>
      )}

      {form.adviceSelected?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Advice</p>
          <p className="text-sm text-gray-900 dark:text-gray-100 mt-0.5">{form.adviceSelected.length} selected</p>
        </div>
      )}

      {form.followUpDate && (
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Follow-up</p>
          <p className="text-sm text-gray-900 dark:text-gray-100 mt-0.5">
            {form.followUpDate}{form.followUpInstructions ? ` — ${form.followUpInstructions}` : ''}
          </p>
        </div>
      )}
    </div>
  );
}
