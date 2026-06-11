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
        <span className="text-xl font-bold leading-7 text-gray-900 dark:text-gray-100">Visit Summary</span>
      </button>
      {open && (
        <div className="space-y-2 text-base leading-7">
          {form.chiefComplaint && (
            <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-baseline gap-3">
              <span className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">CC</span>
              <span className="text-gray-900 dark:text-gray-100">{form.chiefComplaint}</span>
            </div>
          )}
          {Object.keys(findings).length > 0 && (
            <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-baseline gap-3">
              <span className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Findings</span>
              <span className="text-gray-700 dark:text-gray-300">
                {Object.entries(findings).map(([diag, teeth]) => `${diag} (${teeth.join(', ')})`).join('; ')}
              </span>
            </div>
          )}
          {(form.diagnosisSelected?.length > 0 || form.diagnosis) && (
            <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-baseline gap-3">
              <span className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Diagnosis</span>
              <span className="text-gray-900 dark:text-gray-100">
                {form.diagnosisSelected?.join(', ')}{form.diagnosis ? ` — ${form.diagnosis}` : ''}
              </span>
            </div>
          )}
          {procSummary && (
            <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-baseline gap-3">
              <span className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Procedures</span>
              <span className="text-gray-700 dark:text-gray-300">{procSummary}</span>
            </div>
          )}
          {medicines.length > 0 && (
            <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-baseline gap-3">
              <span className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Rx</span>
              <span className="text-gray-900 dark:text-gray-100">{medicines.length} medicine{medicines.length > 1 ? 's' : ''}</span>
            </div>
          )}
          {form.adviceSelected?.length > 0 && (
            <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-baseline gap-3">
              <span className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Advice</span>
              <span className="text-gray-900 dark:text-gray-100">{form.adviceSelected.length} items</span>
            </div>
          )}
          {form.followUpDate && (
            <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-baseline gap-3">
              <span className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Follow-up</span>
              <span className="text-gray-900 dark:text-gray-100">{form.followUpDate}{form.followUpInstructions ? ` — ${form.followUpInstructions}` : ''}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
