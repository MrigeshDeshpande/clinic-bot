'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, ExternalLink, IndianRupee, Ban } from 'lucide-react';

export default function AppointmentDetailsModal({ appointment, onClose, onQuickCheckout, showToast }) {
  const router = useRouter();
  const [cancelling, setCancelling] = useState(false);

  async function handleCancel() {
    if (!confirm('Cancel this appointment?')) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/dashboard/appointments`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: appointment.id, status: 'cancelled' }),
      });
      if (res.ok) {
        showToast?.('Appointment cancelled', 'info');
        onClose?.();
      } else {
        const data = await res.json();
        showToast?.(data.error || 'Failed to cancel', 'error');
      }
    } catch {
      showToast?.('Network error', 'error');
    } finally {
      setCancelling(false);
    }
  }

  const arrivalLabel = {
    scheduled: 'Scheduled',
    arrived: 'Arrived',
    called: 'In Session',
  }[appointment.arrival_status] || 'Scheduled';

  const arrivalColor = {
    scheduled: 'text-gray-500 dark:text-gray-400',
    arrived: 'text-amber-600 dark:text-amber-400',
    called: 'text-blue-600 dark:text-blue-400',
  }[appointment.arrival_status] || 'text-gray-500 dark:text-gray-400';

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center animate-backdrop-in">
      <div className="absolute inset-0 bg-black/30 dark:bg-black/60 backdrop-blur-sm cursor-pointer" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl dark:shadow-gray-900/80 border border-gray-200 dark:border-gray-700 w-full max-w-sm mx-4 animate-scale-in overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-600 flex items-center justify-center text-sm font-bold text-gray-600 dark:text-gray-300 shrink-0">
              {(appointment.patient_name || '?')[0].toUpperCase()}
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">{appointment.patient_name || 'Patient'}</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {appointment.time?.slice(0, 5)} · {appointment.treatment || 'Visit'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 -mr-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 dark:text-gray-500 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${appointment.status === 'confirmed' ? 'bg-emerald-500' : 'bg-gray-400'}`} />
            <span className="text-sm text-gray-700 dark:text-gray-300 capitalize">{appointment.status}</span>
            <span className="text-gray-300 dark:text-gray-600">·</span>
            <span className={`text-sm ${arrivalColor}`}>{arrivalLabel}</span>
          </div>

          {appointment.date && (
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {new Date(appointment.date + 'T' + (appointment.time || '00:00')).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          )}
        </div>

        <div className="px-5 pb-5 space-y-2">
          {appointment.status === 'confirmed' && (
            <>
              <button
                onClick={() => { router.push(`/dashboard/visit?appointmentId=${appointment.id}`); }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-all active:scale-[0.98]"
              >
                <ExternalLink className="w-4 h-4" />
                Edit Visit
              </button>

              <button
                onClick={() => { onQuickCheckout?.(appointment); }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold rounded-xl hover:bg-gray-800 dark:hover:bg-gray-100 transition-all active:scale-[0.98]"
              >
                <IndianRupee className="w-4 h-4" />
                Quick Checkout
              </button>

              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm font-medium rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-all active:scale-[0.98] disabled:opacity-50"
              >
                <Ban className="w-4 h-4" />
                {cancelling ? 'Cancelling...' : 'Cancel Appointment'}
              </button>
            </>
          )}

          {appointment.status !== 'confirmed' && (
            <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-2">This appointment is {appointment.status}</p>
          )}
        </div>
      </div>
    </div>
  );
}
