'use client';
import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Clock, Activity } from 'lucide-react';

const MEDICAL_SECTIONS = [
  {
    id: 'demographics',
    title: 'Demographics',
    fields: [
      { label: 'Address', key: 'address', type: 'text' },
      { label: 'Occupation', key: 'occupation', type: 'text' },
      { label: 'Blood Group', key: 'bloodGroup', type: 'text' },
      { label: 'Weight (kg)', key: 'weight', type: 'text' },
      { label: 'BP', key: 'bp', type: 'text' },
    ],
  },
  {
    id: 'medical',
    title: 'Medical',
    fields: [
      { label: 'Chronic Conditions', key: 'chronicConditions', type: 'text' },
      { label: 'Allergies', key: 'allergies', type: 'text' },
      { label: 'Current Medications', key: 'medications', type: 'text' },
    ],
  },
  {
    id: 'dental',
    title: 'Dental',
    fields: [
      { label: 'Dental History', key: 'dentalHistory', type: 'textarea' },
    ],
  },
  {
    id: 'habits',
    title: 'Habits',
    nestedKey: 'habits',
    fields: [
      { label: 'Smoking', key: 'smoking', type: 'select', options: ['No', 'Occasional', 'Yes', 'Former', 'Current'] },
      { label: 'Alcohol', key: 'alcohol', type: 'select', options: ['No', 'Occasional', 'Yes'] },
      { label: 'Tobacco', key: 'tobacco', type: 'select', options: ['No', 'Yes'] },
      { label: 'Paan', key: 'paan', type: 'select', options: ['No', 'Yes'] },
      { label: 'Brushing', key: 'brushing', type: 'select', options: ['Once daily', 'Twice daily', 'Never'] },
    ],
  },
  {
    id: 'family',
    title: 'Family',
    fields: [
      { label: 'Family History', key: 'familyHistory', type: 'textarea' },
    ],
  },
];

function AlertBadge({ label, severity }) {
  const styles = {
    critical: 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300',
    chronic: 'bg-orange-50 dark:bg-orange-900/30 border-orange-200 dark:border-orange-800 text-orange-700 dark:text-orange-300',
    note: 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300',
  };
  const icons = { critical: '🔴', chronic: '🟠', note: '🟡' };
  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium border ${styles[severity] || styles.note}`}>
      <span>{icons[severity] || '🟡'}</span>
      <span>{label}</span>
    </div>
  );
}

function severityOf(source) {
  if (source === 'allergy') return 'critical';
  if (source === 'chronic') return 'chronic';
  return 'note';
}

function MedicalHistoryPanel({ medicalHistory, onMedicalHistorySave }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [values, setValues] = useState({});
  const [editingSection, setEditingSection] = useState(null);

  const mh = medicalHistory || {};

  function getValue(section, field) {
    if (section.nestedKey) {
      return mh[section.nestedKey]?.[field.key] || '';
    }
    return mh[field.key] || '';
  }

  function startEdit(section) {
    const initial = {};
    for (const field of section.fields) {
      initial[field.key] = getValue(section, field);
    }
    setValues(initial);
    setEditingSection(section.id);
  }

  async function handleSave(section) {
    if (!onMedicalHistorySave) return;
    setSaving(true);
    try {
      const payload = {};
      if (section.nestedKey) {
        const nested = { ...(mh[section.nestedKey] || {}) };
        for (const field of section.fields) {
          nested[field.key] = values[field.key] || '';
        }
        payload[section.nestedKey] = nested;
      } else {
        for (const field of section.fields) {
          payload[field.key] = values[field.key] || '';
        }
      }
      await onMedicalHistorySave(payload);
      setEditingSection(null);
    } catch {
      // handled by parent
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border-t border-gray-100 dark:border-gray-800">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 w-full px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors">
        {open ? <ChevronDown className="w-3.5 h-3.5 shrink-0 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0 text-gray-400" />}
        <Activity className="w-3.5 h-3.5 text-gray-400" />
        Medical History
      </button>
      {open && (
        <div className="px-4 pb-3 space-y-3">
          {MEDICAL_SECTIONS.map(section => {
            const isEditing = editingSection === section.id;
            const hasValues = section.fields.some(f => getValue(section, f));
            return (
              <div key={section.id}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{section.title}</span>
                  {!isEditing && (
                    <button type="button" onClick={() => startEdit(section)}
                      className="text-[10px] font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors">
                      {hasValues ? 'Edit' : 'Add'}
                    </button>
                  )}
                </div>
                {!isEditing ? (
                  hasValues ? (
                    <div className="space-y-0.5">
                      {section.fields.map(field => {
                        const val = getValue(section, field);
                        if (!val) return null;
                        if (field.type === 'textarea') {
                          return <p key={field.key} className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap leading-relaxed">{val}</p>;
                        }
                        return (
                          <div key={field.key} className="flex items-start gap-2">
                            <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0 w-20">{field.label}</span>
                            <span className="text-sm text-gray-900 dark:text-gray-100">{val}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 dark:text-gray-500 italic">None recorded</p>
                  )
                ) : (
                  <div className="space-y-2">
                    {section.fields.map(field => {
                      const val = values[field.key] || '';
                      if (field.type === 'select') {
                        return (
                          <div key={field.key}>
                            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5 block">{field.label}</label>
                            <select value={val} onChange={e => setValues(v => ({ ...v, [field.key]: e.target.value }))}
                              className="w-full px-2 py-1 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800">
                              <option value="">—</option>
                              {field.options.map(opt => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          </div>
                        );
                      }
                      if (field.type === 'textarea') {
                        return (
                          <div key={field.key}>
                            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5 block">{field.label}</label>
                            <textarea value={val} onChange={e => setValues(v => ({ ...v, [field.key]: e.target.value }))}
                              rows={2} className="w-full px-2 py-1 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 resize-none" />
                          </div>
                        );
                      }
                      return (
                        <div key={field.key}>
                          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5 block">{field.label}</label>
                          <input type="text" value={val} onChange={e => setValues(v => ({ ...v, [field.key]: e.target.value }))}
                            className="w-full px-2 py-1 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800" />
                        </div>
                      );
                    })}
                    <div className="flex items-center gap-2 pt-1">
                      <button type="button" onClick={() => handleSave(section)} disabled={saving}
                        className="px-3 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50">
                        {saving ? 'Saving...' : 'Save'}
                      </button>
                      <button type="button" onClick={() => setEditingSection(null)}
                        className="px-3 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ContextSidebar({
  patientProfile,
  medicalHistory,
  form, setForm,
  submitting, isEdit,
  visitSaved, onCheckout,
  selectedTreatments, treatmentFees, totalFees,
  consultationFee,
  medicines = [],
  onEditPatient,
  onMedicalHistorySave,
}) {
  const mh = medicalHistory || {};

  const alerts = [];
  if (mh.allergies) alerts.push({ label: `Allergy: ${mh.allergies}`, severity: severityOf('allergy') });
  if (mh.chronicConditions) alerts.push({ label: `Chronic: ${mh.chronicConditions}`, severity: severityOf('chronic') });

  const medicinesCount = medicines.length || 0;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">

      {/* ── PATIENT ── */}
      <div className="p-4">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-base font-bold shrink-0">
            {(patientProfile?.name || '?')[0].toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-bold text-gray-900 dark:text-gray-100 text-base truncate">{patientProfile?.name || 'Patient'}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {patientProfile?.age ? `${patientProfile.age} ${(patientProfile?.sex || '')?.[0]?.toUpperCase() || ''}` : ''}
              {patientProfile?.phone ? ` · ${patientProfile.phone}` : ''}
            </p>
          </div>
        </div>

        {/* Alerts */}
        {alerts.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {alerts.map((a, i) => (
              <AlertBadge key={i} label={a.label} severity={a.severity} />
            ))}
          </div>
        )}
      </div>

      {/* ── PROJECTED BILL ── */}
      <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-semibold text-gray-500 dark:text-gray-400">Current Bill</span>
          <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">₹{totalFees.toLocaleString('en-IN')}</span>
        </div>
        {selectedTreatments.length > 0 && (
          <div className="space-y-0.5">
            {selectedTreatments.map(key => {
              const item = treatmentFees[key];
              return (
                <div key={key} className="flex items-center gap-2 text-xs">
                  <span className="flex-1 text-gray-600 dark:text-gray-400 truncate">{item.label}{item.quantity > 1 ? ` ×${item.quantity}` : ''}</span>
                  <span className="font-medium text-gray-800 dark:text-gray-200">₹{(item.amount || 0).toLocaleString('en-IN')}</span>
                </div>
              );
            })}
            <div className="flex items-center gap-2 text-xs">
              <span className="flex-1 text-gray-400">Consultation</span>
              <span className="font-medium text-gray-800 dark:text-gray-200">₹{consultationFee.toLocaleString('en-IN')}</span>
            </div>
            {medicinesCount > 0 && (
              <div className="flex items-center gap-2 text-xs">
                <span className="flex-1 text-gray-400">Medicines ({medicinesCount})</span>
                <span className="text-gray-400">—</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── MEDICAL HISTORY (collapsible) ── */}
      <MedicalHistoryPanel
        medicalHistory={mh}
        onMedicalHistorySave={onMedicalHistorySave}
      />

      {/* ── FOLLOW-UP ── */}
      <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800">
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
          <Clock className="w-3 h-3 inline mr-1" />
          Follow-up
        </label>
        <div className="flex gap-2">
          <input type="date" value={form.followUpDate} onChange={e => setForm(f => ({ ...f, followUpDate: e.target.value }))}
            className="flex-1 px-2 py-1 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800" />
          <input type="text" value={form.followUpInstructions} onChange={e => setForm(f => ({ ...f, followUpInstructions: e.target.value }))}
            placeholder="Instructions"
            className="flex-[2] px-2 py-1 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 placeholder-gray-400" />
        </div>
      </div>

      {/* ── SAVE / CHECKOUT ── */}
      <div className="p-4 space-y-2 border-t border-gray-100 dark:border-gray-800">
        <button type="submit" disabled={submitting}
          className={`w-full py-2.5 text-sm font-semibold rounded-xl transition-all active:scale-[0.99] ${
            submitting
              ? 'bg-gray-400 text-white cursor-not-allowed'
              : visitSaved
                ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                : 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white hover:from-emerald-600 hover:to-emerald-700 shadow-lg shadow-emerald-200 dark:shadow-emerald-900/50'
          }`}>
          {submitting ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              Saving...
            </span>
          ) : visitSaved ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              Clinical Record Saved
            </span>
          ) : (
            <span>{isEdit ? 'Save Changes' : 'Save Clinical Record'}</span>
          )}
        </button>

        {visitSaved && (
          <button type="button" onClick={onCheckout}
            className="w-full py-2.5 text-sm font-semibold rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white hover:from-emerald-600 hover:to-emerald-700 shadow-lg shadow-emerald-200 dark:shadow-emerald-900/50 transition-all active:scale-[0.99]">
            Checkout Patient
          </button>
        )}
      </div>
    </div>
  );
}
