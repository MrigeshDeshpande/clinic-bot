'use client';

import { useState } from 'react';
import { TREATMENT_NAMES } from '@/lib/treatments';

const PRESET_FEES = [
  { label: 'General Checkup',     fee: 300,  icon: '🏥' },
  { label: 'Teeth Cleaning',      fee: 400,  icon: '✨' },
  { label: 'Root Canal',          fee: 3000, icon: '🔬' },
  { label: 'Dental Filling',      fee: 800,  icon: '🩹' },
  { label: 'Whitening',           fee: 2500, icon: '🦷' },
  { label: 'Implants',            fee: 8000, icon: '🦷' },
  { label: 'Braces Adjustment',   fee: 1500, icon: '😁' },
  { label: 'Crown',               fee: 3500, icon: '👑' },
  { label: 'Extraction',          fee: 600,  icon: '🦷' },
  { label: 'Scaling',             fee: 500,  icon: '🦷' },
  { label: 'Veneers',             fee: 5000, icon: '✨' },
  { label: 'Pediatric Dentistry', fee: 400,  icon: '🧒' },
  { label: 'Other',               fee: 500,  icon: '🩺' },
];

const FOLLOW_UP_SUGGEST = {
  'Root Canal': 7,
  'Scaling': 180,
  'Teeth Cleaning': 180,
  'Dental Filling': 365,
  'Extraction': 7,
  'Crown': 14,
  'Implants': 90,
  'Braces Adjustment': 30,
  'General Checkup': 180,
  'Whitening': 365,
  'Veneers': 365,
  'Pediatric Dentistry': 180,
};

const CONSULTATION_DEFAULT = 2000;
const CONSULTATION_STEP = 100;
const TREATMENT_STEP = 50;

function computeFollowUpDate(treatmentName) {
  const days = FOLLOW_UP_SUGGEST[treatmentName];
  if (!days) return '';
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function getDefaultFee(name) {
  const preset = PRESET_FEES.find(p => p.label === name);
  return preset?.fee || 0;
}

function AdjusterInput({ value, onChange, disabled }) {
  return (
    <div className="relative">
      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 dark:text-gray-500">₹</span>
      <input
        type="number"
        min="0"
        value={value}
        onChange={onChange}
        disabled={disabled}              className="w-20 pl-5 pr-2 py-1.5 text-xs text-center font-medium text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-200 dark:focus:ring-emerald-800 focus:border-emerald-400 dark:focus:border-emerald-500 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none disabled:opacity-50 disabled:cursor-not-allowed"
      />
    </div>
  );
}

function AdjusterButton({ onClick, disabled, label }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="w-5 h-5 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-200 transition-all flex items-center justify-center text-xs font-medium active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed shrink-0">
      {label}
    </button>
  );
}

export default function VisitCompleteModal({ appointment, onClose, onComplete, showToast }) {
  const [treatmentFees, setTreatmentFees] = useState(() => {
    const initial = {};
    const saved = [];
    if (Array.isArray(appointment?.treatments) && appointment.treatments.length > 0) {
      saved.push(...appointment.treatments);
    } else if (appointment?.treatment) {
      saved.push(appointment.treatment);
    }
    saved.forEach(name => {
      initial[name] = getDefaultFee(name);
    });
    return initial;
  });
  const [consultationFee, setConsultationFee] = useState(
    appointment?.consultation_fee || CONSULTATION_DEFAULT
  );
  const [medicineCharges, setMedicineCharges] = useState(String(appointment?.medicine_charges || ''));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [diagnosis, setDiagnosis] = useState('');
  const [followUpDate, setFollowUpDate] = useState(
    appointment?.treatment ? computeFollowUpDate(appointment.treatment) : ''
  );
  const [followUpInstructions, setFollowUpInstructions] = useState('');

  const selectedTreatments = Object.keys(treatmentFees);
  const treatmentCharges = Object.values(treatmentFees).reduce((sum, fee) => sum + fee, 0);
  const total = consultationFee + treatmentCharges + (Number(medicineCharges) || 0);

  function toggleTreatment(name) {
    setTreatmentFees(prev => {
      if (prev[name] !== undefined) {
        const next = { ...prev };
        delete next[name];
        return next;
      }
      const suggested = computeFollowUpDate(name);
      if (suggested) setFollowUpDate(suggested);
      return { ...prev, [name]: getDefaultFee(name) };
    });
  }

  function addCustomTreatment() {
    const name = prompt('Enter treatment name:');
    if (name && name.trim()) {
      setTreatmentFees(prev => {
        if (prev[name.trim()] !== undefined) return prev;
        return { ...prev, [name.trim()]: 0 };
      });
    }
  }

  function adjustConsultation(delta) {
    setConsultationFee(prev => Math.max(0, prev + delta));
  }

  function adjustTreatmentFee(name, delta) {
    setTreatmentFees(prev => ({
      ...prev,
      [name]: Math.max(0, (prev[name] || 0) + delta),
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (selectedTreatments.length === 0) { setError('Please select at least one treatment'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/dashboard/visit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointmentId: appointment.id,
          treatment: selectedTreatments[0],
          treatments: selectedTreatments,
          diagnosis: diagnosis.trim() || undefined,
          consultationFee,
          treatmentCharges,
          medicineCharges: Number(medicineCharges) || 0,
          followUpDate: followUpDate || undefined,
          followUpInstructions: followUpInstructions.trim() || undefined,
          status: 'completed',
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Visit completed successfully', 'success');
        onComplete(appointment.id);
      } else {
        setError(data.error || 'Failed to complete visit');
      }
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }

  if (!appointment) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center animate-backdrop-in">
      <div className="absolute inset-0 bg-black/30 dark:bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-900 rounded-lg shadow-2xl dark:shadow-gray-900/80 border border-gray-200 dark:border-gray-700 w-full max-w-2xl mx-4 animate-scale-in max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        
        {/* ── Header ── */}
        <div className="px-7 pt-5 pb-4 flex items-start justify-between border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-md shrink-0">
              <svg className="w-4.5 h-4.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">Complete Visit</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {appointment.patient_name || 'Patient'}
                {appointment.time && <span> · {appointment.time?.slice(0, 5)}</span>}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 -mr-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 dark:text-gray-500 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit}>

          {/* ── Book-like two-page spread ── */}
          <div className="flex flex-col sm:flex-row">
            
            {/* ═══ LEFT PAGE: Treatments Menu ═══ */}
            <div className="w-1/2 px-6 py-4 border-r border-gray-100 dark:border-gray-800 relative">
              {/* Page corner fold effect */}
              <div className="absolute -right-px top-0 w-3 h-3 bg-gradient-to-br from-transparent via-gray-50 dark:via-gray-800 to-gray-100 dark:to-gray-700 rounded-bl-sm" />

              <div className="flex items-center gap-1.5 mb-3">
                <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                <h4 className="text-xs font-semibold text-gray-800 dark:text-gray-200 uppercase tracking-wider">Treatments</h4>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-2.5">Tap to select — add all that apply</p>

              <div className="space-y-1 max-h-[320px] overflow-y-auto pr-1">
                {TREATMENT_NAMES.map(name => {
                  const isSelected = selectedTreatments.includes(name);
                  const preset = PRESET_FEES.find(p => p.label === name);
                  return (
                    <button key={name} type="button" onClick={() => toggleTreatment(name)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-xs font-medium border transition-all active:scale-[0.98] ${
                        isSelected
                          ? 'bg-emerald-50 dark:bg-emerald-900/25 border-emerald-200 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 ring-1 ring-emerald-200 dark:ring-emerald-700'
                          : 'bg-white dark:bg-gray-800/50 border-gray-150 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-emerald-200 dark:hover:border-emerald-600 hover:bg-emerald-50/30 dark:hover:bg-emerald-900/10'
                      }`}>
                      <span className="text-base shrink-0 w-6 text-center">{preset?.icon || '🩺'}</span>
                      <span className="flex-1 text-left">{name}</span>
                      {preset && (
                        <span className={`text-xs font-semibold shrink-0 ${isSelected ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 dark:text-gray-500'}`}>
                          ₹{preset.fee}
                        </span>
                      )}
                      {isSelected && (
                        <svg className="w-3.5 h-3.5 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  );
                })}
                <button type="button" onClick={addCustomTreatment}
                  className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-xs font-medium border border-dashed border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500 hover:border-gray-400 dark:hover:border-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-all">
                  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add custom treatment
                </button>
              </div>

              {selectedTreatments.length > 0 && (
                <div className="mt-2.5 pt-2 border-t border-gray-100 dark:border-gray-800">
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                    {selectedTreatments.length} treatment{selectedTreatments.length > 1 ? 's' : ''} selected
                  </p>
                </div>
              )}
            </div>

            {/* ═══ RIGHT PAGE: Bill Details ═══ */}
            <div className="w-1/2 px-6 py-4">
              <div className="flex items-center gap-1.5 mb-3">
                <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <h4 className="text-xs font-semibold text-gray-800 dark:text-gray-200 uppercase tracking-wider">Bill Details</h4>
              </div>

              <div className="space-y-2.5">
                {/* Consultation Fee */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Consultation</span>
                  <div className="flex items-center gap-1">
                    <AdjusterButton onClick={() => adjustConsultation(-CONSULTATION_STEP)} disabled={consultationFee <= 0} label="−" />
                    <AdjusterInput value={consultationFee} onChange={e => setConsultationFee(Math.max(0, Number(e.target.value) || 0))} />
                    <AdjusterButton onClick={() => adjustConsultation(CONSULTATION_STEP)} label="+" />
                  </div>
                </div>

                {/* Selected Treatments */}
                {selectedTreatments.length === 0 ? (
                  <div className="py-4 text-center">
                    <p className="text-xs text-gray-300 dark:text-gray-600 italic">No treatments selected yet</p>
                  </div>
                ) : (
                  <div className="max-h-[220px] overflow-y-auto space-y-1.5 pr-0.5">
                    {selectedTreatments.map(name => (
                      <div key={name} className="flex items-center justify-between py-0.5">
                        <span className="text-xs text-gray-600 dark:text-gray-400 truncate max-w-[90px]" title={name}>{name}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          <AdjusterButton onClick={() => adjustTreatmentFee(name, -TREATMENT_STEP)} disabled={(treatmentFees[name] || 0) <= 0} label="−" />
                          <AdjusterInput
                            value={treatmentFees[name] || 0}
                            onChange={e => adjustTreatmentFee(name, (Number(e.target.value) || 0) - (treatmentFees[name] || 0))}
                          />
                          <AdjusterButton onClick={() => adjustTreatmentFee(name, TREATMENT_STEP)} label="+" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Divider */}
                <div className="border-t border-gray-100 dark:border-gray-800" />

                {/* Medicine Charges */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Medicine</span>
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 dark:text-gray-500">₹</span>
                    <input type="number" min="0" value={medicineCharges} onChange={e => setMedicineCharges(e.target.value)}
                      className="w-20 pl-5 pr-2 py-1 text-xs text-center font-medium text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-200 dark:focus:ring-emerald-800 focus:border-emerald-400 dark:focus:border-emerald-500 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      placeholder="0" />
                  </div>
                </div>

                {/* Total */}
                <div className="flex items-center justify-between pt-2 border-t-2 border-gray-200 dark:border-gray-700">
                  <span className="text-sm font-bold text-gray-900 dark:text-gray-100">Total</span>
                  <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">₹{total.toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>

          </div>

          {/* ── Footer ── */}
          <div className="border-t border-gray-100 dark:border-gray-800 px-6 py-4 space-y-3">

            {/* Expandable diagnosis & follow-up */}
            {!showDetails && (
              <button type="button" onClick={() => setShowDetails(true)}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-all">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Add diagnosis & follow-up
              </button>
            )}

            {showDetails && (
              <div className="space-y-2.5 animate-slide-down">
                <div>
                  <label className="block text-xs font-medium text-gray-400 dark:text-gray-500 mb-1">Diagnosis / Observations</label>
                  <textarea value={diagnosis} onChange={e => setDiagnosis(e.target.value)}
                    rows={2} className="w-full px-2.5 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-200 dark:focus:ring-emerald-800 focus:border-emerald-400 dark:focus:border-emerald-500 transition-all resize-none"
                    placeholder="Brief diagnosis or observations..." />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 dark:text-gray-500 mb-1">Follow-up Date</label>
                    <input type="date" value={followUpDate} onChange={e => setFollowUpDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-200 dark:focus:ring-emerald-800 focus:border-emerald-400 dark:focus:border-emerald-500 transition-all" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 dark:text-gray-500 mb-1">Instructions</label>
                    <input type="text" value={followUpInstructions} onChange={e => setFollowUpInstructions(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-200 dark:focus:ring-emerald-800 focus:border-emerald-400 dark:focus:border-emerald-500 transition-all"
                      placeholder="e.g. Return in 2 weeks" />
                  </div>
                </div>
                {selectedTreatments.length > 0 && (
                  <p className="text-xs text-gray-400 dark:text-gray-500">💡 Follow-up auto-suggested for last selected treatment</p>
                )}
                <button type="button" onClick={() => setShowDetails(false)}
                  className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                  Hide details ↑
                </button>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 rounded-lg px-3 py-2 border border-red-100 dark:border-red-800">
                <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-1.5">
              <button type="button" onClick={onClose} className="flex-1 px-5 py-2.5 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-all">Cancel</button>
              <button type="submit" disabled={saving || selectedTreatments.length === 0}
                className="flex-1 px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white text-sm font-semibold rounded-lg hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] shadow-lg shadow-emerald-200 dark:shadow-emerald-900/50 flex items-center justify-center gap-2">
                {saving ? (
                  <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving...</>
                ) : (
                  <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> Complete — ₹{total.toLocaleString('en-IN')}</>
                )}
              </button>
            </div>
          </div>

        </form>
      </div>
    </div>
  );
}
