'use client';
import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Clock, Activity, Search, X, Plus, Minus } from 'lucide-react';
import { TREATMENTS, getTreatmentName } from '@/lib/treatments';
import { VISIT_MODES, getVisitModeLabel } from '@/lib/visitModes';

const MEDICAL_SECTIONS = [
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
    <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold leading-5 border ${styles[severity] || styles.note}`}>
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
        className="flex items-center gap-2 w-full px-4 py-3 text-sm font-semibold leading-5 text-gray-800 dark:text-gray-200 hover:text-gray-950 dark:hover:text-gray-50 transition-colors">
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
                  <span className="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">{section.title}</span>
                  {!isEditing && (
                    <button type="button" onClick={() => startEdit(section)}
                      className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors">
                      {hasValues ? 'Edit' : 'Add'}
                    </button>
                  )}
                </div>
                {!isEditing ? (
                  hasValues ? (
                    <div className="space-y-1">
                      {section.fields.map(field => {
                        const val = getValue(section, field);
                        if (!val) return null;
                        if (field.type === 'textarea') {
                          return <p key={field.key} className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap leading-6">{val}</p>;
                        }
                        return (
                          <div key={field.key} className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-start gap-2">
                            <span className="text-xs font-medium leading-5 text-gray-500 dark:text-gray-400">{field.label}</span>
                            <span className="text-sm leading-5 text-gray-900 dark:text-gray-100">{val}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm leading-5 text-gray-400 dark:text-gray-500 italic">None recorded</p>
                  )
                ) : (
                  <div className="space-y-2">
                    {section.fields.map(field => {
                      const val = values[field.key] || '';
                      if (field.type === 'select') {
                        return (
                          <div key={field.key}>
                            <label className="text-xs font-semibold leading-5 text-gray-600 dark:text-gray-300 mb-1 block">{field.label}</label>
                            <select value={val} onChange={e => setValues(v => ({ ...v, [field.key]: e.target.value }))}
                              className="w-full px-2.5 py-1.5 text-sm leading-5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800">
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
                            <label className="text-xs font-semibold leading-5 text-gray-600 dark:text-gray-300 mb-1 block">{field.label}</label>
                            <textarea value={val} onChange={e => setValues(v => ({ ...v, [field.key]: e.target.value }))}
                              rows={2} className="w-full px-2.5 py-1.5 text-sm leading-5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 resize-none" />
                          </div>
                        );
                      }
                      return (
                        <div key={field.key}>
                          <label className="text-xs font-semibold leading-5 text-gray-600 dark:text-gray-300 mb-1 block">{field.label}</label>
                          <input type="text" value={val} onChange={e => setValues(v => ({ ...v, [field.key]: e.target.value }))}
                            className="w-full px-2.5 py-1.5 text-sm leading-5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800" />
                        </div>
                      );
                    })}
                    <div className="flex items-center gap-2 pt-1">
                      <button type="button" onClick={() => handleSave(section)} disabled={saving}
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50">
                        {saving ? 'Saving...' : 'Save'}
                      </button>
                      <button type="button" onClick={() => setEditingSection(null)}
                        className="px-3 py-1.5 text-xs font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors">
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
  patientVisits,
  form, setForm,
  submitting, visitMode,
  visitSaved,
  selectedTreatments, treatmentFees, totalFees,
  consultationFee,
  medicines = [],
  medicineCharges = 0,
  onUpdateTreatmentFee,
  onUpdateConsultationFee,
  onEditPatient,
  onMedicalHistorySave,
  onToggleTreatment,
  onAdjustQuantity,
  getFee,
  // Payment props
  paymentStatus, setPaymentStatus,
  paidAmount, setPaidAmount,
  paymentMethod, setPaymentMethod,
  transactionId, setTransactionId,
  sendingPaymentLink, sendPaymentLink,
  upiDeepLink, PAYMENT_METHODS, withPhonePrefix,
}) {
  const submitLabel = getVisitModeLabel(visitMode);
  const mh = medicalHistory || {};

  // Last visit date
  const lastVisitRaw = (patientVisits || []).length > 0
    ? patientVisits.reduce((latest, v) => v.date > latest ? v.date : latest, '')
    : null;
  const lastVisit = lastVisitRaw ? new Date(lastVisitRaw).toLocaleDateString() : null;
  const visitCount = (patientVisits || []).length;

  const alerts = [];
  if (mh.allergies) alerts.push({ label: `Allergy: ${mh.allergies}`, severity: severityOf('allergy') });
  if (mh.chronicConditions) alerts.push({ label: `Chronic: ${mh.chronicConditions}`, severity: severityOf('chronic') });

  const medicinesCount = medicines.length || 0;

  const [showAddTreatment, setShowAddTreatment] = useState(false);
  const [treatmentSearch, setTreatmentSearch] = useState('');
  const filteredAdd = treatmentSearch.trim()
    ? TREATMENTS.filter(t => {
        const q = treatmentSearch.toLowerCase();
        return t.name.toLowerCase().includes(q) || t.id.includes(q) || t.aliases.some(a => a.toLowerCase().includes(q));
      }).slice(0, 8)
    : [];

  function handleSelectAdd(id) {
    onToggleTreatment(id);
    setTreatmentSearch('');
    setShowAddTreatment(false);
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">

      {/* ── PATIENT ── */}
      <div className="p-4">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-base font-bold shrink-0">
            {(patientProfile?.name || '?')[0].toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-bold text-gray-950 dark:text-gray-50 text-lg leading-6 truncate">{patientProfile?.name || 'Patient'}</h2>
            <p className="text-sm leading-5 text-gray-600 dark:text-gray-300">
              {patientProfile?.age ? `${patientProfile.age} ${(patientProfile?.sex || '')?.[0]?.toUpperCase() || ''}` : ''}
              {patientProfile?.phone ? ` · ${patientProfile.phone}` : ''}
            </p>
            <p className="text-xs leading-5 text-gray-500 dark:text-gray-400">
              {lastVisit ? `Last Visit: ${lastVisit}` : 'No prior visits'}
              {visitCount > 0 ? ` · Visits: ${visitCount}` : ''}
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
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">Projected Bill</span>
          <span className="text-lg leading-6 font-bold text-emerald-600 dark:text-emerald-400">₹{totalFees.toLocaleString('en-IN')}</span>
        </div>
        <div className="space-y-1.5">
          {selectedTreatments.map(key => {
            const item = treatmentFees[key];
            const unitFee = item.source === 'auto' && item.quantity > 0
              ? Math.round(item.amount / item.quantity)
              : getFee ? getFee(key) : (item.amount || 0);
            return (
              <div key={key} className="flex items-center gap-1.5 text-sm leading-5">
                <span className="flex-1 text-gray-700 dark:text-gray-300 truncate min-w-0">{item.label}</span>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button type="button" onClick={() => onAdjustQuantity(key, -1)}
                    className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                    <Minus className="w-2.5 h-2.5" />
                  </button>
                  <span className="w-6 text-center font-semibold text-gray-800 dark:text-gray-200 text-xs">×{item.quantity || 1}</span>
                  <button type="button" onClick={() => onAdjustQuantity(key, 1)}
                    className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                    <Plus className="w-2.5 h-2.5" />
                  </button>
                </div>
                <div className="relative shrink-0">
                  <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 dark:text-gray-500 pointer-events-none">₹</span>
                  <input type="text" inputMode="numeric" value={item.amount || 0}
                    onChange={e => onUpdateTreatmentFee(key, e.target.value)}
                    className="w-20 pl-4 pr-1 py-0.5 text-sm text-right font-semibold text-gray-900 dark:text-gray-100 bg-transparent border border-transparent hover:border-gray-200 dark:hover:border-gray-700 focus:border-blue-300 dark:focus:border-blue-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-200 transition-colors" />
                </div>
                <button type="button" onClick={() => onToggleTreatment(key)}
                  className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-300 hover:text-red-500 transition-colors shrink-0">
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
          <div className="flex items-center gap-2 text-sm leading-5">
            <span className="flex-1 text-gray-500 dark:text-gray-400">Consultation</span>
            <div className="relative">
              <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 dark:text-gray-500 pointer-events-none">₹</span>
              <input type="text" inputMode="numeric" value={consultationFee}
                onChange={e => onUpdateConsultationFee(e.target.value)}
                className="w-20 pl-4 pr-1 py-0.5 text-sm text-right font-semibold text-gray-900 dark:text-gray-100 bg-transparent border border-transparent hover:border-gray-200 dark:hover:border-gray-700 focus:border-blue-300 dark:focus:border-blue-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-200 transition-colors" />
            </div>
          </div>
          {medicinesCount > 0 && (
            <div className="flex items-center gap-2 text-sm leading-5">
              <span className="flex-1 text-gray-500 dark:text-gray-400">Medicines ({medicinesCount})</span>
              <div className="relative">
                <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 dark:text-gray-500 pointer-events-none">₹</span>
                <input type="text" inputMode="numeric" value={medicineCharges}
                  onChange={e => setForm(f => ({ ...f, medicineCharges: e.target.value }))}
                  className="w-20 pl-4 pr-1 py-0.5 text-sm text-right font-semibold text-gray-900 dark:text-gray-100 bg-transparent border border-transparent hover:border-gray-200 dark:hover:border-gray-700 focus:border-blue-300 dark:focus:border-blue-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-200 transition-colors" />
              </div>
            </div>
          )}
        </div>

        {/* ── Inline Add Treatment ── */}
        <div className="mt-2">
          {!showAddTreatment ? (
            <button type="button" onClick={() => setShowAddTreatment(true)}
              className="flex items-center gap-1.5 text-sm leading-5 font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors">
              <Plus className="w-3 h-3" />
              Add Treatment
            </button>
          ) : (
            <div className="relative">
              <div className="flex items-center gap-1">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
                <input type="text" value={treatmentSearch} onChange={e => setTreatmentSearch(e.target.value)}
                  autoFocus placeholder="Search treatments..."
                  className="w-full pl-6 pr-2.5 py-1.5 text-sm leading-5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 placeholder-gray-400" />
                <button type="button" onClick={() => { setShowAddTreatment(false); setTreatmentSearch(''); }}
                  className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                  <X className="w-3 h-3 text-gray-400" />
                </button>
              </div>
              {filteredAdd.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
                  {filteredAdd.map(t => (
                    <button key={t.id} type="button" onClick={() => handleSelectAdd(t.id)}
                      className="w-full text-left px-3 py-2 text-sm leading-5 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center gap-2">
                      <span className="text-gray-700 dark:text-gray-300">{t.name}</span>
                      <span className="ml-auto text-gray-500 dark:text-gray-400 font-mono text-xs">₹{t.defaultFee}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── PAYMENT ── */}
      <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-1.5 mb-3">
          <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <span className="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">Payment</span>
        </div>

        <div className="flex items-center gap-1.5 mb-2">
          <button type="button" onClick={() => { setPaymentStatus('paid'); setPaidAmount(totalFees); if (!paymentMethod) setPaymentMethod('cash'); }}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              paymentStatus === 'paid'
                ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-300 dark:border-emerald-600 text-emerald-700 dark:text-emerald-300'
                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-emerald-200'
            }`}>
            <span className="flex items-center justify-center gap-1">{'\u2713'} Paid</span>
          </button>
          <button type="button" onClick={() => { setPaymentStatus('partial'); setPaidAmount(paidAmount || Math.round(totalFees / 2)); if (!paymentMethod) setPaymentMethod('cash'); }}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              paymentStatus === 'partial'
                ? 'bg-orange-50 dark:bg-orange-900/30 border-orange-300 dark:border-orange-600 text-orange-700 dark:text-orange-300'
                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-orange-200'
            }`}>
            <span className="flex items-center justify-center gap-1">{'\u00BD'} Partial</span>
          </button>
          <button type="button" onClick={() => setPaymentStatus('pending')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              paymentStatus === 'pending'
                ? 'bg-amber-50 dark:bg-amber-900/30 border-amber-300 dark:border-amber-600 text-amber-700 dark:text-amber-300'
                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-amber-200'
            }`}>
            <span className="flex items-center justify-center gap-1">{'\u23F3'} Pending</span>
          </button>
        </div>

        {(paymentStatus === 'paid' || paymentStatus === 'partial') && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5">Amount Paid</label>
                <input type="number" value={paidAmount} onChange={e => setPaidAmount(Number(e.target.value) || 0)}
                  min={0} max={totalFees}
                  className="w-full px-2.5 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-200 dark:focus:ring-emerald-800 transition-all placeholder-gray-400" />
              </div>
              {paidAmount < totalFees && (
                <div className="flex-shrink-0 text-right">
                  <div className="text-xs text-gray-400 dark:text-gray-500">Due</div>
                  <div className="text-xs font-semibold text-red-500 dark:text-red-400">₹{(totalFees - paidAmount).toLocaleString('en-IN')}</div>
                </div>
              )}
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {PAYMENT_METHODS.map(m => (
                <button key={m.value} type="button" onClick={() => setPaymentMethod(m.value)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                    paymentMethod === m.value
                      ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-300 dark:border-emerald-600 text-emerald-700 dark:text-emerald-300'
                      : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300'
                  }`}>
                  {m.icon} {m.label}
                </button>
              ))}
            </div>
            <div className="relative">
              <input type="text" value={transactionId} onChange={e => setTransactionId(e.target.value)}
                placeholder="Transaction ID / ref (optional)"
                className="w-full px-2.5 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-200 dark:focus:ring-emerald-800 transition-all placeholder-gray-400" />
            </div>
            {paymentMethod === 'upi' && paidAmount > 0 && (
              <button type="button"
                onClick={() => {
                  const url = upiDeepLink(paidAmount, transactionId || Date.now().toString(36), `${form.patientName || 'Patient'} Payment`);
                  window.open(url, '_blank', 'noopener,noreferrer');
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium rounded-lg border border-blue-200 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-all">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                UPI Link
              </button>
            )}
          </div>
        )}

        {(paymentStatus === 'pending' || (paymentStatus === 'partial' && paidAmount < totalFees)) && (patientProfile?.phone || withPhonePrefix?.(form.patientPhone)) && (
          <button type="button" onClick={sendPaymentLink} disabled={sendingPaymentLink}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-xs font-medium rounded-lg border border-green-200 dark:border-green-700 hover:bg-green-100 dark:hover:bg-green-900/50 transition-all disabled:opacity-50 w-full justify-center mt-2">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            {sendingPaymentLink ? 'Sending...' : `Send Payment Link on WhatsApp${paymentStatus === 'partial' ? ' (Due ₹' + (totalFees - paidAmount).toLocaleString('en-IN') + ')' : ''}`}
          </button>
        )}
      </div>

      {/* ── MEDICAL HISTORY (collapsible) ── */}
      <MedicalHistoryPanel
        medicalHistory={mh}
        onMedicalHistorySave={onMedicalHistorySave}
      />

      {/* ── FOLLOW-UP ── */}
      <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800">
        <label className="block text-sm font-semibold leading-5 text-gray-700 dark:text-gray-300 mb-2">
          <Clock className="w-3 h-3 inline mr-1" />
          Follow-up
        </label>
        <div className="flex gap-2">
          <input type="date" value={form.followUpDate} onChange={e => setForm(f => ({ ...f, followUpDate: e.target.value }))}
            className="flex-1 px-2.5 py-1.5 text-sm leading-5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800" />
          <input type="text" value={form.followUpInstructions} onChange={e => setForm(f => ({ ...f, followUpInstructions: e.target.value }))}
            placeholder="Instructions"
            className="flex-[2] px-2.5 py-1.5 text-sm leading-5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 placeholder-gray-400" />
        </div>
      </div>

      {/* ── SAVE ── */}
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
              Visit Saved
            </span>
          ) : (
            <span>{submitLabel}</span>
          )}
        </button>
      </div>
    </div>
  );
}
