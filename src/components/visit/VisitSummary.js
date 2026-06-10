import React from 'react';
import { TREATMENTS } from '@/lib/treatments';

function getTreatmentName(idOrName) {
  const t = TREATMENTS.find(t => t.id === idOrName || t.name === idOrName);
  return t ? t.name : idOrName;
}

function SummaryBlock({ label, children }) {
  if (!children || (Array.isArray(children) && children.length === 0)) return null;
  return (
    <div>
      <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-0.5">{label}</p>
      <div className="text-xs text-gray-800 dark:text-gray-200 leading-relaxed">{children}</div>
    </div>
  );
}

export default function VisitSummary({ form, toothDiagnoses = [], selectedTreatments = [], treatmentFees = {}, consultationFee, medicines = [] }) {
  // Derived intra-oral findings
  const findings = {};
  for (const entry of toothDiagnoses) {
    for (const d of (entry.diagnoses || [])) {
      if (!findings[d]) findings[d] = [];
      if (!findings[d].includes(entry.tooth)) findings[d].push(entry.tooth);
    }
  }

  // Derived planned procedures (per-tooth)
  const perToothProcs = toothDiagnoses.filter(e => e.treatment).map(e => ({ tooth: e.tooth, treatment: e.treatment }));

  // Derived planned procedures (general — treatments not tied to any tooth)
  const toothTreatmentIds = new Set(toothDiagnoses.map(e => e.treatment).filter(Boolean));
  const generalProcs = selectedTreatments.filter(t => !toothTreatmentIds.has(t));

  const hasAny = form.chiefComplaint || Object.keys(findings).length > 0 || form.diagnosisSelected?.length > 0 || form.diagnosis || perToothProcs.length > 0 || generalProcs.length > 0 || medicines.length > 0 || form.adviceSelected?.length > 0 || form.followUpDate;

  if (!hasAny) return null;

  return (
    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-2">
      <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Visit Summary</p>

      <SummaryBlock label="Chief Complaint">
        {form.chiefComplaint}
      </SummaryBlock>

      <SummaryBlock label="Clinical Findings">
        {Object.keys(findings).length > 0 && (
          <div className="space-y-1.5">
            {Object.entries(findings).map(([diag, teeth]) => (
              <div key={diag}>
                <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">{diag}</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">{teeth.join(', ')}</p>
              </div>
            ))}
          </div>
        )}
      </SummaryBlock>

      <SummaryBlock label="Diagnosis">
        {form.diagnosisSelected?.length > 0 && (
          <p>{form.diagnosisSelected.join(', ')}</p>
        )}
        {form.diagnosis && (
          <p className="text-gray-500 dark:text-gray-400">{form.diagnosis}</p>
        )}
      </SummaryBlock>

      <SummaryBlock label="Planned Procedures">
        {(() => {
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
          const entries = Object.entries(groups);
          if (entries.length === 0) return null;
          return (
            <div className="space-y-1.5">
              {entries.map(([treatment, items]) => (
                <div key={treatment}>
                  <p className="text-[11px] font-semibold text-gray-800 dark:text-gray-200">{treatment}</p>
                  <div className="space-y-0.5 ml-1">
                    {items.map((item, i) => (
                      <p key={i} className="text-xs text-gray-600 dark:text-gray-400">• {item}</p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
      </SummaryBlock>

      <SummaryBlock label="Prescription">
        {medicines.length > 0 && (
          <div className="space-y-0.5">
            {medicines.map((m, i) => (
              <p key={i}>{m.name} {m.dosage ? `(${m.dosage})` : ''} — {m.frequency || ''} {m.duration ? `× ${m.duration}d` : ''} {m.timing ? m.timing : ''}</p>
            ))}
          </div>
        )}
      </SummaryBlock>

      <SummaryBlock label="Advice">
        {form.adviceSelected?.length > 0 && (
          <p>{form.adviceSelected.join(' · ')}</p>
        )}
      </SummaryBlock>

      <SummaryBlock label="Follow-up">
        {form.followUpDate && (
          <p>{form.followUpDate}{form.followUpInstructions ? ` — ${form.followUpInstructions}` : ''}</p>
        )}
      </SummaryBlock>
    </div>
  );
}
