'use client';

import { useState } from 'react';
import { X } from 'lucide-react';

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash', icon: '\u{1F4B5}' },
  { value: 'upi', label: 'UPI', icon: '\u{1F4F1}' },
  { value: 'card', label: 'Card', icon: '\u{1F4B3}' },
  { value: 'other', label: 'Other', icon: '\u{1FA99}' },
];

export default function QuickCheckoutModal({ appointment, onClose, onSuccess, showToast }) {
  const [treatmentFee, setTreatmentFee] = useState(appointment.treatment_charges || 0);
  const [medicineFee, setMedicineFee] = useState(appointment.medicine_charges || 0);
  const consultationFee = appointment.consultation_fee || 0;
  
  const subtotal = treatmentFee + medicineFee + consultationFee;
  const [paid, setPaid] = useState(subtotal);
  const [method, setMethod] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const outstanding = Math.max(0, subtotal - paid);
  const canComplete = subtotal > 0;

  function getPaymentStatus() {
    if (paid >= subtotal) return 'paid';
    if (paid > 0) return 'partial';
    return 'pending';
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (paid > 0 && !method) { setError('Select a payment method'); return; }
    setSaving(true);
    setError('');
    try {
      const payload = {
        appointmentId: appointment.id,
        treatmentCharges: treatmentFee,
        medicineCharges: medicineFee,
        paidAmount: paid,
        paymentStatus: getPaymentStatus(),
        status: 'completed',
        notes: notes.trim() || undefined,
      };
      if (paid > 0) {
        payload.paymentMethod = method;
      }
      const res = await fetch('/api/dashboard/visit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        showToast?.('Visit completed', 'success');
        onSuccess?.(appointment.id);
      } else {
        setError(data.error || 'Failed to complete');
      }
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center animate-backdrop-in">
      <div className="absolute inset-0 bg-black/30 dark:bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl dark:shadow-gray-900/80 border border-gray-200 dark:border-gray-700 w-full max-w-sm mx-4 animate-scale-in overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">Quick Checkout</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{appointment.patient_name || 'Patient'} · {appointment.treatment || 'Visit'}</p>
          </div>
          <button onClick={onClose} className="p-1 -mr-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 dark:text-gray-500 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Treatment Fee</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 dark:text-gray-500 font-medium">₹</span>
                <input
                  type="number"
                  min="0"
                  value={treatmentFee}
                  onChange={e => setTreatmentFee(Math.max(0, Number(e.target.value) || 0))}
                  className="w-full pl-8 pr-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl text-sm font-medium text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-200 dark:focus:ring-gray-600 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Medicine Fee</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 dark:text-gray-500 font-medium">₹</span>
                <input
                  type="number"
                  min="0"
                  value={medicineFee}
                  onChange={e => setMedicineFee(Math.max(0, Number(e.target.value) || 0))}
                  className="w-full pl-8 pr-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl text-sm font-medium text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-200 dark:focus:ring-gray-600 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
            </div>
          </div>
          
          {consultationFee > 0 && (
            <div className="flex items-center justify-between px-1">
              <span className="text-xs text-gray-500 dark:text-gray-400">Consultation</span>
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">₹{consultationFee}</span>
            </div>
          )}
          
          <div className="flex items-center justify-between px-1 pt-1 border-t border-gray-100 dark:border-gray-800">
            <span className="text-xs font-bold text-gray-700 dark:text-gray-300">Total Bill</span>
            <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">₹{subtotal.toLocaleString('en-IN')}</span>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Paid</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 dark:text-gray-500 font-medium">₹</span>
              <input
                type="number"
                min="0"
                value={paid}
                onChange={e => setPaid(Math.max(0, Number(e.target.value) || 0))}
                className="w-full pl-8 pr-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl text-sm font-medium text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-200 dark:focus:ring-gray-600 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
          </div>

          {outstanding > 0 && (
            <div className="flex items-center justify-between px-3 py-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
              <span className="text-xs font-medium text-amber-700 dark:text-amber-400">Outstanding</span>
              <span className="text-sm font-bold text-amber-800 dark:text-amber-300">₹{outstanding.toLocaleString('en-IN')}</span>
            </div>
          )}

          <div>
            <label className={`block text-xs font-medium mb-1.5 ${paid > 0 ? 'text-gray-500 dark:text-gray-400' : 'text-gray-400 dark:text-gray-500'}`}>Payment Mode</label>
            <div className="flex gap-2">
              {PAYMENT_METHODS.map(m => (
                <button
                  key={m.value}
                  type="button"
                  disabled={paid === 0}
                  onClick={() => setMethod(m.value)}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                    method === m.value
                      ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-gray-900 dark:border-white'
                      : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                  } ${paid === 0 ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <span className="text-base">{m.icon}</span>
                  {m.label}
                </button>
              ))}
            </div>
            {paid === 0 && <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">Set paid amount to select payment method</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Notes <span className="text-gray-400 dark:text-gray-500 font-normal">(optional)</span></label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Paid by spouse, will pay remaining Friday..."
              className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-200 dark:focus:ring-gray-600 transition-colors placeholder-gray-400 dark:placeholder-gray-500"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 rounded-lg px-3 py-2 border border-red-100 dark:border-red-800">
              <X className="w-3 h-3 shrink-0" />
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 text-sm font-medium rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-all">Cancel</button>
            <button
              type="submit"
              disabled={saving || !canComplete}
              className="flex-1 px-4 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold rounded-xl hover:bg-gray-800 dark:hover:bg-gray-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-[0.98]"
            >
              {saving ? (
                <><div className="w-4 h-4 border-2 border-white/30 dark:border-gray-900/30 border-t-white dark:border-t-gray-900 rounded-full animate-spin" /> Saving...</>
              ) : (
                <>{paid > 0 ? `Complete & Collect ₹${paid.toLocaleString('en-IN')}` : 'Complete (No Payment)'}</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
