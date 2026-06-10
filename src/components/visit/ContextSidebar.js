'use client';
import React, { useState } from 'react';
import { AlertTriangle, Heart, ChevronDown, ChevronRight, CheckCircle2, Clock } from 'lucide-react';

function CollapsibleSection({ title, defaultOpen, children }) {
  const [open, setOpen] = useState(defaultOpen || false);
  return (
    <div className="border-t border-gray-100 dark:border-gray-800">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-1.5 px-4 py-2 text-[11px] font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
        {open ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
        {title}
      </button>
      {open && <div className="px-4 pb-3 space-y-1">{children}</div>}
    </div>
  );
}

function DetailRow({ label, value }) {
  if (!value) return null;
  return (
    <p className="text-[11px] text-gray-600 dark:text-gray-400">
      <span className="font-medium text-gray-500 dark:text-gray-500">{label}: </span>
      {value}
    </p>
  );
}

function AlertBadge({ icon: Icon, label, severity }) {
  const styles = {
    critical: 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300',
    chronic: 'bg-orange-50 dark:bg-orange-900/30 border-orange-200 dark:border-orange-800 text-orange-700 dark:text-orange-300',
    note: 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300',
  };
  const icons = {
    critical: '🔴',
    chronic: '🟠',
    note: '🟡',
  };
  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-medium border ${styles[severity] || styles.note}`}>
      <span className="text-xs">{icons[severity] || '🟡'}</span>
      <Icon className="w-3 h-3 shrink-0 opacity-70" />
      <span className="truncate">{label}</span>
    </div>
  );
}

function severityOf(label, source) {
  if (source === 'allergy') return 'critical';
  if (source === 'chronic') return 'chronic';
  return 'note';
}

export default function ContextSidebar({
  patientProfile,
  patientVisits,
  medicalHistory,
  form, setForm,
  submitting, isEdit,
  visitSaved, onCheckout,
  selectedTreatments, treatmentFees, totalFees,
  consultationFee,
  medicines = [],
  onEditPatient,
}) {
  const mh = medicalHistory || {};
  const habits = mh.habits || {};
  const activeHabits = Object.keys(habits).filter(k => habits[k]);
  const lastVisit = patientVisits?.[0];
  const visitCount = patientVisits?.length || 0;
  const medicinesCount = medicines.length || 0;

  // Always-visible critical alerts
  const alerts = [];
  if (mh.allergies) alerts.push({ icon: AlertTriangle, label: mh.allergies, severity: severityOf(mh.allergies, 'allergy') });
  if (mh.chronicConditions) alerts.push({ icon: Heart, label: mh.chronicConditions, severity: severityOf(mh.chronicConditions, 'chronic') });

  return (
    <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
      {/* ── PATIENT ── */}
      <div className="p-4 pb-2">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
            {(patientProfile?.name || '?')[0].toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-bold text-gray-900 dark:text-gray-100 text-sm truncate">{patientProfile?.name || 'Patient'}</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {patientProfile?.age ? `${patientProfile.age} ${patientProfile?.sex?.[0]?.toUpperCase() || ''}` : ''}
              {patientProfile?.phone ? ` · ${patientProfile.phone}` : ''}
            </p>
          </div>
        </div>

        {/* Critical alerts — always visible */}
        {alerts.length > 0 && (
          <div className="space-y-1 mb-1.5">
            {alerts.map((a, i) => (
              <AlertBadge key={i} icon={a.icon} label={a.label} severity={a.severity} />
            ))}
          </div>
        )}

        <button type="button" onClick={onEditPatient}
          className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors">
          Edit demographics
        </button>
      </div>

      {/* ── Collapsible patient context ── */}
      <CollapsibleSection title="Medical">
        <DetailRow label="Chronic" value={mh.chronicConditions} />
        <DetailRow label="Allergies" value={mh.allergies} />
        <DetailRow label="Blood Group" value={mh.bloodGroup} />
        <DetailRow label="BP" value={mh.bp} />
        <DetailRow label="Weight" value={mh.weight} />
        <DetailRow label="Medications" value={mh.medications} />
      </CollapsibleSection>

      <CollapsibleSection title="Dental">
        <DetailRow label="Dental History" value={mh.dentalHistory} />
        <DetailRow label="Previous RCT" value={null} />
        <DetailRow label="Caps" value={null} />
      </CollapsibleSection>

      <CollapsibleSection title="Habits">
        {activeHabits.length > 0 ? (
          <p className="text-[11px] text-gray-600 dark:text-gray-400">{activeHabits.map(h => h.charAt(0).toUpperCase() + h.slice(1)).join(', ')}</p>
        ) : (
          <p className="text-[11px] text-gray-400 dark:text-gray-500 italic">No habits recorded</p>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Family">
        <DetailRow label="Family History" value={mh.familyHistory} />
        <DetailRow label="Address" value={mh.address} />
        <DetailRow label="Occupation" value={mh.occupation} />
      </CollapsibleSection>

      <hr className="border-gray-100 dark:border-gray-800" />

      {/* ── PROJECTED BILL — read-only for doctor ── */}
      <div className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Projected Bill</span>
          <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400">₹{totalFees.toLocaleString('en-IN')}</span>
        </div>

        {selectedTreatments.length > 0 && (
          <div className="space-y-1 pt-1">
            {selectedTreatments.map(key => {
              const item = treatmentFees[key];
              const displayName = item.quantity > 1 ? `${item.label} ×${item.quantity}` : item.label;
              return (
                <div key={key} className="flex items-center gap-2 text-xs">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500 dark:text-emerald-400 shrink-0" />
                  <span className="flex-1 text-gray-700 dark:text-gray-300">{displayName}</span>
                  <span className="text-xs font-medium text-gray-900 dark:text-gray-100">₹{(item.amount || 0).toLocaleString('en-IN')}</span>
                </div>
              );
            })}
            <div className="flex items-center gap-2 text-xs pt-0.5">
              <CheckCircle2 className="w-3 h-3 text-emerald-500 dark:text-emerald-400 shrink-0" />
              <span className="flex-1 text-gray-500 dark:text-gray-400">Consultation</span>
              <span className="text-xs font-medium text-gray-900 dark:text-gray-100">₹{consultationFee.toLocaleString('en-IN')}</span>
            </div>
            {medicinesCount > 0 && (
              <div className="flex items-center gap-2 text-xs">
                <CheckCircle2 className="w-3 h-3 text-emerald-500 dark:text-emerald-400 shrink-0" />
                <span className="flex-1 text-gray-500 dark:text-gray-400">Medicines ({medicinesCount})</span>
                <span className="text-xs text-gray-400">—</span>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between pt-1.5 border-t border-gray-100 dark:border-gray-800">
          <span className="text-sm font-bold text-gray-900 dark:text-gray-100">Total</span>
          <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">₹{totalFees.toLocaleString('en-IN')}</span>
        </div>
      </div>

      <hr className="border-gray-100 dark:border-gray-800" />

      {/* ── FOLLOW-UP ── */}
      <div className="p-4 pb-2">
        <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-0.5">
          <Clock className="w-3 h-3 inline mr-1" />
          Follow-up
        </label>
        <div className="flex gap-1.5">
          <input type="date" value={form.followUpDate} onChange={e => setForm(f => ({ ...f, followUpDate: e.target.value }))}
            className="flex-1 px-1.5 py-0.5 text-[10px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded" />
          <input type="text" value={form.followUpInstructions} onChange={e => setForm(f => ({ ...f, followUpInstructions: e.target.value }))}
            placeholder="Instructions"
            className="flex-[2] px-1.5 py-0.5 text-[10px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded" />
        </div>
      </div>

      <hr className="border-gray-100 dark:border-gray-800" />

      {/* ── SAVE / CHECKOUT ── */}
      <div className="p-4 space-y-2">
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
