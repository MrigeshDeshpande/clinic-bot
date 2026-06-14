'use client';

import { useState, useEffect, useCallback, useContext } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, Phone, UserCheck, ArrowRight, Star } from 'lucide-react';
import { DateContext, ToastContext } from '../layout';
import { formatDateLong } from '@/lib/date';
import { fetchCached, invalidateFetchCache } from '@/lib/clientFetchCache';

export default function QueuePage() {
  const { selectedDate, setSelectedDate } = useContext(DateContext);
  const { showToast } = useContext(ToastContext);
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const router = useRouter();

  const fetchQueue = useCallback(async (isManual) => {
    if (isManual) setRefreshing(true);
    try {
      const data = await fetchCached('/api/dashboard/appointments?date=' + selectedDate);
      setQueue(data.appointments || []);
    } catch (e) {
      console.error('Failed to fetch queue', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedDate]);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);

  // Auto-refresh every 30 seconds (paused when tab is backgrounded)
  useEffect(() => {
    let visible = !document.hidden;
    const handler = () => { visible = !document.hidden; };
    document.addEventListener('visibilitychange', handler);
    const interval = setInterval(() => { if (visible) fetchQueue(); }, 30000);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', handler); };
  }, [fetchQueue]);

  async function handleArrival(appointmentId, status) {
    setActionLoading(appointmentId);
    try {
      const res = await fetch('/api/dashboard/arrival', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId, arrivalStatus: status }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(status === 'arrived' ? 'Patient has arrived' : 'Patient called in', 'success');
      } else {
        showToast(data.error || 'Failed to update status', 'error');
      }
    } catch {
      showToast('Network error', 'error');
    }
    setActionLoading(null);
    invalidateFetchCache('/api/dashboard/appointments?date=' + selectedDate);
    fetchQueue();
  }

  const waiting = queue.filter(a => a.status === 'confirmed' && a.arrival_status === 'scheduled');
  const arrived = queue.filter(a => a.status === 'confirmed' && a.arrival_status === 'arrived');
  const inSession = queue.filter(a => a.status === 'confirmed' && a.arrival_status === 'called');
  const completed = queue.filter(a => a.status === 'completed');

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="shimmer h-8 w-48 rounded-lg" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="shimmer h-64 rounded-xl" />)}
        </div>
      </div>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const isToday = selectedDate === today;
  const totalRevenue = completed.reduce((sum, a) => sum + Number(a.consultation_fee || 0) + Number(a.treatment_charges || 0) + Number(a.medicine_charges || 0), 0);

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Queue Board</h1>
            {isToday && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800">Today</span>}
          </div>
          <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
            {formatDateLong(selectedDate)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-200 transition-all"
          />
          <button
            onClick={() => fetchQueue(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            <svg className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Summary Bar */}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
          <Clock className="w-3.5 h-3.5" /> Waiting {waiting.length}
        </span>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
          <UserCheck className="w-3.5 h-3.5" /> In Session {arrived.length + inSession.length}
        </span>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800">
          ✓ Completed {completed.length}
        </span>
        {totalRevenue > 0 && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 font-semibold ml-auto">
            ₹{totalRevenue.toLocaleString('en-IN')}
          </span>
        )}
      </div>

      {/* Columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Waiting Column */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500" />
              <h2 className="font-semibold text-gray-900 dark:text-gray-100 text-base">Waiting</h2>
            </div>
            <span className="text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded-full">{waiting.length}</span>
          </div>
          <div className="p-3 space-y-2 min-h-[200px]">
            {waiting.length === 0 ? (
              <p className="text-gray-400 dark:text-gray-500 text-xs text-center py-8">No patients waiting</p>
            ) : (
              waiting.map(a => (
                <div key={a.id} className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 border border-gray-100 dark:border-gray-700">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      {a.is_priority && <Star className="w-3 h-3 text-amber-400 fill-amber-400" />}
                      <span className="font-medium text-gray-900 dark:text-gray-100 text-base">{a.patient_name || 'Patient'}</span>
                    </div>
                    <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">{a.time?.slice(0, 5) || 'Walk-in'}</span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{a.treatment || 'Visit'}</p>
                  <button
                    onClick={() => handleArrival(a.id, 'arrived')}
                    disabled={actionLoading === a.id}
                    className="w-full py-3 text-sm font-medium rounded-lg bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/50 border border-amber-200 dark:border-amber-800 transition-all disabled:opacity-50 flex items-center justify-center gap-1"
                  >
                    <UserCheck className="w-4 h-4" /> Mark Arrived
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* In Session Column */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-blue-500" />
              <h2 className="font-semibold text-gray-900 dark:text-gray-100 text-base">In Session</h2>
            </div>
            <span className="text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-full">
              {arrived.length + inSession.length}
            </span>
          </div>
          <div className="p-3 space-y-2 min-h-[200px]">
            {arrived.length === 0 && inSession.length === 0 ? (
              <p className="text-gray-400 dark:text-gray-500 text-xs text-center py-8">No patients in session</p>
            ) : (
              <>
                {arrived.map(a => (
                  <div key={a.id} className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 border border-amber-200 dark:border-amber-800">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-gray-900 dark:text-gray-100 text-base">{a.patient_name || 'Patient'}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">Arrived {a.arrived_at ? new Date(a.arrived_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{a.treatment || 'Visit'}</p>
                    <button
                    onClick={() => handleArrival(a.id, 'called')}
                    disabled={actionLoading === a.id}
                    className="w-full py-3 text-sm font-medium rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-800 transition-all disabled:opacity-50 flex items-center justify-center gap-1"
                  >
                    <Phone className="w-4 h-4" /> Call Patient
                  </button>
                  </div>
                ))}
                {inSession.map(a => (
                  <div key={a.id} className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 border border-blue-200 dark:border-blue-800 ring-1 ring-blue-300 dark:ring-blue-700">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-gray-900 dark:text-gray-100 text-base">{a.patient_name || 'Patient'}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">{a.time?.slice(0, 5) || 'Walk-in'}</span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{a.treatment || 'Visit'}</p>
                    <button
                    onClick={() => router.push(`/dashboard/visit?appointmentId=${a.id}&name=${encodeURIComponent(a.patient_name || '')}&treatment=${encodeURIComponent(a.treatment || '')}&returnTo=queue&mode=completeAppointment`)}
                    className="w-full py-3 text-sm font-medium rounded-lg bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/50 border border-green-200 dark:border-green-800 transition-all flex items-center justify-center gap-1"
                  >
                    <ArrowRight className="w-4 h-4" /> Start Visit
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        {/* Completed Column */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-green-500" />
              <h2 className="font-semibold text-gray-900 dark:text-gray-100 text-base">Completed</h2>
            </div>
            <span className="text-xs font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-2 py-0.5 rounded-full">{completed.length}</span>
          </div>
          <div className="p-3 space-y-2 min-h-[200px]">
            {completed.length === 0 ? (
              <p className="text-gray-400 dark:text-gray-500 text-xs text-center py-8">No completed visits</p>
            ) : (
              completed.slice(0, 8).map(a => (
                <div key={a.id} className="bg-green-50/50 dark:bg-green-900/10 rounded-lg p-3 border border-green-100 dark:border-green-800">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900 dark:text-gray-100 text-sm">{a.patient_name || 'Patient'}</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">{a.time?.slice(0, 5) || 'Walk-in'}</span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{a.treatment || 'Visit'}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
