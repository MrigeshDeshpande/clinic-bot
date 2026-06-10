'use client';
import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { getTreatmentName } from '@/lib/treatments';

export default function VisitSummary({ form, toothDiagnoses = [], selectedTreatments = [], treatmentFees = {}, consultationFee, medicines = [] }) {
  const [open, setOpen] = useState(false);

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
    const name = getTreatmentName(p.treatment);
    if (!groups[name]) groups[name] = [];
    groups[name].push(`Tooth ${p.tooth}`);
  }
  for (const g of generalProcs) {
    const name = getTreatmentName(g);
    if (!groups[name]) groups[name] = [];
    groups[name].push('General');
  }

  const procSummary = Object.entries(groups).map(([name, items]) => `${name} — ${items.join(', ')}`).join('; ');

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
      <button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-2 w-full text-left mb-3">
        {open
          ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
          : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
        }
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Visit Summary</span>
      </button>
      {open && (
        <div className="space-y-1.5 text-sm">
          {form.chiefComplaint && (
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 w-20 shrink-0">CC</span>
              <span className="text-gray-900 dark:text-gray-100">{form.chiefComplaint}</span>
            </div>
          )}
          {Object.keys(findings).length > 0 && (
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 w-20 shrink-0">Findings</span>
              <span className="text-gray-700 dark:text-gray-300">
                {Object.entries(findings).map(([diag, teeth]) => `${diag} (${teeth.join(', ')})`).join('; ')}
              </span>
            </div>
          )}
          {(form.diagnosisSelected?.length > 0 || form.diagnosis) && (
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 w-20 shrink-0">Diagnosis</span>
              <span className="text-gray-900 dark:text-gray-100">
                {form.diagnosisSelected?.join(', ')}{form.diagnosis ? ` — ${form.diagnosis}` : ''}
              </span>
            </div>
          )}
          {procSummary && (
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 w-20 shrink-0">Procedures</span>
              <span className="text-gray-700 dark:text-gray-300">{procSummary}</span>
            </div>
          )}
          {medicines.length > 0 && (
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 w-20 shrink-0">Rx</span>
              <span className="text-gray-900 dark:text-gray-100">{medicines.length} medicine{medicines.length > 1 ? 's' : ''}</span>
            </div>
          )}
          {form.adviceSelected?.length > 0 && (
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 w-20 shrink-0">Advice</span>
              <span className="text-gray-900 dark:text-gray-100">{form.adviceSelected.length} items</span>
            </div>
          )}
          {form.followUpDate && (
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 w-20 shrink-0">Follow-up</span>
              <span className="text-gray-900 dark:text-gray-100">{form.followUpDate}{form.followUpInstructions ? ` — ${form.followUpInstructions}` : ''}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
