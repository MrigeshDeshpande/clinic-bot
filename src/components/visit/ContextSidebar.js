'use client';
import React, { useState } from 'react';
import { AlertTriangle, Heart, Calendar, Download, Users } from 'lucide-react';

const COLORS = [
  { name: 'Post Extraction', color: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700' },
  { name: 'Root Canal', color: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700' },
  { name: 'Scaling', color: 'bg-violet-100 text-violet-800 border-violet-300 dark:bg-violet-900/40 dark:text-violet-300 dark:border-violet-700' },
  { name: 'Pain', color: 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-700' },
];

export default function ContextSidebar({
  patientProfile,
  patientVisits,
  medicalHistory,
  billingProjectionProps,
  form, setForm,
  submitting, isEdit, appointmentId,
  visitSaved, onCheckout,
  selectedTreatments, treatmentFees, totalFees,
  consultationFee, setConsultationFee,
  paymentStatus, setPaymentStatus,
  paidAmount, setPaidAmount,
  paymentMethod, setPaymentMethod,
  transactionId, setTransactionId,
  onEditPatient,
  CONSULTATION_STEP, TREATMENT_STEP
}) {
  const mh = medicalHistory || {};
  const alerts = [];
  if (mh.allergies) alerts.push({ icon: AlertTriangle, label: mh.allergies, color: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' });
  if (mh.chronicConditions) alerts.push({ icon: Heart, label: mh.chronicConditions, color: 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800' });

  const lastVisit = patientVisits?.[0];

  return (
    <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
      {/* ── PATIENT ── */}
      <div className="p-4">
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

        {alerts.length > 0 && (
          <div className="space-y-1 mb-2">
            {alerts.map((a, i) => (
              <div key={i} className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-medium border ${a.color}`}>
                <a.icon className="w-3 h-3 shrink-0" />
                <span className="truncate">{a.label}</span>
              </div>
            ))}
          </div>
        )}

        {lastVisit?.date && (
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-2">Last visit: {lastVisit.date?.slice(0, 10)}</p>
        )}

        <button type="button" onClick={onEditPatient}
          className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors">
          Edit demographics
        </button>
      </div>

      <hr className="border-gray-100 dark:border-gray-800" />

      {/* ── TODAY ── */}
      <div className="p-4 space-y-2.5">
        {/* Treatment line items */}
        {selectedTreatments.length === 0 ? (
          <p className="text-xs text-gray-400 dark:text-gray-500 italic">No treatments selected</p>
        ) : (
          <div className="space-y-1">
            {selectedTreatments.map(key => {
              const item = treatmentFees[key];
              const displayName = item.quantity > 1 ? `${item.label} ×${item.quantity}` : item.label;
              return (
                <div key={key} className="flex items-center justify-between text-xs">
                  <span className="text-gray-700 dark:text-gray-300 truncate">{displayName}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button type="button" onClick={() => {
                      const prev = billingProjectionProps.adjustTreatmentFee;
                      prev(key, -TREATMENT_STEP);
                    }} disabled={(item.amount || 0) <= 0}
                      className="w-4 h-4 rounded-full border border-gray-200 dark:border-gray-700 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center text-[10px] font-medium disabled:opacity-30">−</button>
                    <span className="text-xs font-medium text-gray-900 dark:text-gray-100 min-w-[3rem] text-right">₹{(item.amount || 0).toLocaleString('en-IN')}</span>
                    <button type="button" onClick={() => {
                      const prev = billingProjectionProps.adjustTreatmentFee;
                      prev(key, TREATMENT_STEP);
                    }}
                      className="w-4 h-4 rounded-full border border-gray-200 dark:border-gray-700 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center text-[10px] font-medium">+</button>
                  </div>
                </div>
              );
            })}
            <div className="flex items-center justify-between text-xs pt-1">
              <span className="text-gray-500 dark:text-gray-400">Consultation</span>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setConsultationFee(Math.max(0, consultationFee - CONSULTATION_STEP))} disabled={consultationFee <= 0}
                  className="w-4 h-4 rounded-full border border-gray-200 dark:border-gray-700 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center text-[10px] font-medium disabled:opacity-30">−</button>
                <span className="text-xs font-medium text-gray-900 dark:text-gray-100 min-w-[3rem] text-right">₹{consultationFee.toLocaleString('en-IN')}</span>
                <button type="button" onClick={() => setConsultationFee(consultationFee + CONSULTATION_STEP)}
                  className="w-4 h-4 rounded-full border border-gray-200 dark:border-gray-700 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center text-[10px] font-medium">+</button>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-1.5 border-t border-gray-100 dark:border-gray-800">
          <span className="text-sm font-bold text-gray-900 dark:text-gray-100">Total</span>
          <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">₹{totalFees.toLocaleString('en-IN')}</span>
        </div>

        {/* Payment */}
        <div>
          <div className="flex items-center gap-1 mb-1.5">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Payment</span>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => { setPaymentStatus('paid'); setPaidAmount(totalFees); if (!paymentMethod) setPaymentMethod('cash'); }}
              className={`flex-1 py-1 rounded text-[10px] font-medium border transition-all ${
                paymentStatus === 'paid'
                  ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-300 dark:border-emerald-600 text-emerald-700 dark:text-emerald-300'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400'
              }`}>Paid</button>
            <button type="button" onClick={() => { setPaymentStatus('partial'); setPaidAmount(paidAmount || Math.round(totalFees / 2)); if (!paymentMethod) setPaymentMethod('cash'); }}
              className={`flex-1 py-1 rounded text-[10px] font-medium border transition-all ${
                paymentStatus === 'partial'
                  ? 'bg-orange-50 dark:bg-orange-900/30 border-orange-300 dark:border-orange-600 text-orange-700 dark:text-orange-300'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400'
              }`}>Partial</button>
            <button type="button" onClick={() => setPaymentStatus('pending')}
              className={`flex-1 py-1 rounded text-[10px] font-medium border transition-all ${
                paymentStatus === 'pending'
                  ? 'bg-amber-50 dark:bg-amber-900/30 border-amber-300 dark:border-amber-600 text-amber-700 dark:text-amber-300'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400'
              }`}>Pending</button>
          </div>
          {(paymentStatus === 'paid' || paymentStatus === 'partial') && (
            <div className="mt-1.5 space-y-1">
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-gray-500 dark:text-gray-400">Paid</span>
                <input type="number" value={paidAmount} onChange={e => setPaidAmount(Number(e.target.value) || 0)} min={0} max={totalFees}
                  className="w-16 px-1.5 py-0.5 text-xs text-right bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded" />
                {paidAmount < totalFees && (
                  <span className="text-[10px] text-red-500 dark:text-red-400">Due ₹{(totalFees - paidAmount).toLocaleString('en-IN')}</span>
                )}
              </div>
              <div className="flex gap-1">
                {[{ value: 'cash', label: 'Cash' }, { value: 'upi', label: 'UPI' }, { value: 'card', label: 'Card' }].map(m => (
                  <button key={m.value} type="button" onClick={() => setPaymentMethod(m.value)}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-medium border transition-all ${
                      paymentMethod === m.value
                        ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-300 text-emerald-700 dark:text-emerald-300'
                        : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400'
                    }`}>{m.label}</button>
                ))}
              </div>
              <input type="text" value={transactionId} onChange={e => setTransactionId(e.target.value)}
                placeholder="Txn ID (optional)"
                className="w-full px-1.5 py-0.5 text-[10px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded" />
            </div>
          )}
        </div>

        {/* Follow-up */}
        <div>
          <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-0.5">Follow-up</label>
          <div className="flex gap-1.5">
            <input type="date" value={form.followUpDate} onChange={e => setForm(f => ({ ...f, followUpDate: e.target.value }))}
              className="flex-1 px-1.5 py-0.5 text-[10px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded" />
            <input type="text" value={form.followUpInstructions} onChange={e => setForm(f => ({ ...f, followUpInstructions: e.target.value }))}
              placeholder="Instructions"
              className="flex-[2] px-1.5 py-0.5 text-[10px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded" />
          </div>
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
