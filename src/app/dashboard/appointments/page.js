'use client';

import { useState, useEffect, useCallback, useRef, useContext } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileImage, Phone as PhoneIcon } from 'lucide-react';
import Calendar from '@/components/Calendar';
import { DateContext } from '../layout';

function StatusBadge({ status, arrivalStatus }) {
  if (status === 'completed') return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800">Completed</span>;
  if (status === 'no_show') return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800">No Show</span>;
  if (arrivalStatus === 'called') return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800">In Session</span>;
  if (arrivalStatus === 'arrived') return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">Waiting</span>;
  return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700">Scheduled</span>;
}

const TOTALS_CONFIG = [
  { key: 'confirmed', label: 'Confirmed', color: 'text-gray-900 dark:text-gray-100', bg: 'bg-gray-50 dark:bg-gray-800', ring: 'ring-gray-100 dark:ring-gray-700', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4" /> },
  { key: 'waiting', label: 'Waiting', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30', ring: 'ring-amber-100 dark:ring-amber-800', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /> },
  { key: 'in_session', label: 'In Session', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30', ring: 'ring-blue-100 dark:ring-blue-800', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /> },
  { key: 'completed', label: 'Completed', color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/30', ring: 'ring-green-100 dark:ring-green-800', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /> },
  { key: 'no_show', label: 'No Show', color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/30', ring: 'ring-red-100 dark:ring-red-800', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /> },
];

export default function AppointmentsPage() {
  const { selectedDate, setSelectedDate } = useContext(DateContext);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(null);
  const [error, setError] = useState('');
  const [arrivalUpdating, setArrivalUpdating] = useState(null);
  const [dotDates, setDotDates] = useState([]);
  const [showCalendar, setShowCalendar] = useState(false);
  const calRef = useRef();
  const router = useRouter();

  const fetchCalendarDots = useCallback(async (date) => {
    const d = new Date(date + 'T12:00:00');
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    try { const res = await fetch(`/api/dashboard/calendar?year=${year}&month=${month}`); const json = await res.json(); setDotDates(Object.keys(json.dates || {})); } catch {}
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;
    fetch(`/api/dashboard/appointments?date=${selectedDate}`, { signal })
      .then(r => { if (!signal.aborted) return r.json(); })
      .then(d => { if (!signal.aborted) { setData(d); setLoading(false); } })
      .catch(e => { if (!signal.aborted) { setError(e.message); setLoading(false); } });
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchCalendarDots(selectedDate);
    return () => controller.abort();
  }, [selectedDate, fetchCalendarDots]);

  useEffect(() => {
    function handleClick(e) { if (calRef.current && !calRef.current.contains(e.target)) setShowCalendar(false); }
    if (showCalendar) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showCalendar]);

  function handleDateSelect(date) { setSelectedDate(date); setShowCalendar(false); }

  async function handleStatusChange(appointmentId, newStatus) {
    setUpdating(appointmentId);
    await fetch('/api/dashboard/visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appointmentId, status: newStatus }),
    });
    setUpdating(null);
    fetch(`/api/dashboard/appointments?date=${selectedDate}`)
      .then(r => r.json())
      .then(d => setData(d))
      .catch(e => setError(e.message));
  }

  async function handleArrivalChange(appointmentId, arrivalStatus) {
    setArrivalUpdating(appointmentId);
    await fetch('/api/dashboard/arrival', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appointmentId, arrivalStatus }),
    });
    setArrivalUpdating(null);
    fetch(`/api/dashboard/appointments?date=${selectedDate}`)
      .then(r => r.json())
      .then(d => setData(d))
      .catch(e => setError(e.message));
  }

  function getMediaCount(a) {
    return a.chit_media?.length || 0;
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Appointments</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="relative" ref={calRef}>
          <button
            onClick={() => setShowCalendar(!showCalendar)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 hover:border-blue-200 dark:hover:border-blue-600 hover:shadow-sm transition-all text-sm text-gray-700 dark:text-gray-300"
          >
            <svg className="w-4 h-4 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </button>
          {showCalendar && (
            <>
              <div className="fixed inset-0 bg-black/20 dark:bg-black/50 z-40" onClick={() => setShowCalendar(false)} />
              <div className="absolute right-0 top-full mt-2 z-50 w-72 animate-slide-down shadow-xl">
                <Calendar selectedDate={selectedDate} onDateSelect={handleDateSelect} dotDates={dotDates} onMonthChange={(y, m) => fetchCalendarDots(`${y}-${String(m).padStart(2,'0')}-01`)} />
              </div>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="shimmer h-12 w-full rounded-xl" />
          <div className="shimmer h-64 w-full rounded-xl" />
        </div>
      ) : error ? (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 text-red-700 dark:text-red-400 text-sm">{error}</div>
      ) : (
        <div className="space-y-6">
          {/* Summary Cards */}
          {data?.totals && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {TOTALS_CONFIG.map(cfg => (
                <div key={cfg.key} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm p-4 hover:shadow-md dark:hover:shadow-gray-900/50 hover:-translate-y-0.5 transition-all duration-200 group">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{cfg.label}</p>
                    <div className={`w-7 h-7 rounded-lg ${cfg.bg} flex items-center justify-center ring-1 ${cfg.ring} group-hover:scale-110 transition-transform`}>
                      <svg className={`w-4 h-4 ${cfg.color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">{cfg.icon}</svg>
                    </div>
                  </div>
                  <p className={`text-2xl font-bold ${cfg.color}`}>{Number(data.totals[cfg.key] || 0)}</p>
                </div>
              ))}
            </div>
          )}

          {/* Bulk Actions */}
          {data?.totals?.confirmed > 1 && (
            <div className="flex items-center gap-2 px-1">
              <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Bulk Actions:</span>
              <button
                onClick={async () => {
                  if (!confirm(`Mark all ${data.totals.confirmed} confirmed appointments as completed?`)) return;
                  const res = await fetch(`/api/dashboard/appointments/bulk?date=${selectedDate}&action=complete_all`, { method: 'POST' });
                  const json = await res.json();
                  if (json.success) {
                    const r = await fetch(`/api/dashboard/appointments?date=${selectedDate}`);
                    const d = await r.json();
                    setData(d);
                  }
                }}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/50 border border-green-200 dark:border-green-800 transition-all hover:shadow-sm"
              >
                ✓ Complete All
              </button>
              <button
                onClick={async () => {
                  if (!confirm(`Cancel all ${data.totals.confirmed} confirmed appointments?`)) return;
                  const res = await fetch(`/api/dashboard/appointments/bulk?date=${selectedDate}&action=cancel_all`, { method: 'POST' });
                  const json = await res.json();
                  if (json.success) {
                    const r = await fetch(`/api/dashboard/appointments?date=${selectedDate}`);
                    const d = await r.json();
                    setData(d);
                  }
                }}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 border border-red-200 dark:border-red-800 transition-all hover:shadow-sm"
              >
                ✕ Cancel All
              </button>
            </div>
          )}

          {/* Appointments Table */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-800/80">
                    <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Time</th>
                    <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Patient</th>
                    <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Phone</th>
                    <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Treatment</th>
                    <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                    <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Amount</th>
                    <th className="text-right px-5 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.appointments || []).length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-16 text-center">
                        <div className="flex flex-col items-center gap-2">
                          <svg className="w-12 h-12 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <p className="text-gray-400 dark:text-gray-500 text-sm">No appointments for this date.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    (data?.appointments || []).map((a) => (
                      <tr key={a.id} className={`border-b border-gray-50 dark:border-gray-800 hover:bg-blue-50/30 dark:hover:bg-blue-900/10 transition-colors ${updating === a.id ? 'opacity-50 pointer-events-none' : ''}`}>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <span className={`w-1.5 h-1.5 rounded-full ${a.status === 'completed' ? 'bg-green-400' : a.status === 'no_show' ? 'bg-red-400' : 'bg-blue-400'}`} />
                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{a.time?.slice(0, 5)}</span>
                            {a.is_priority && <span className="text-xs">⭐</span>}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <span className="w-7 h-7 rounded-full bg-gradient-to-br from-gray-100 to-gray-50 dark:from-gray-700 dark:to-gray-600 flex items-center justify-center text-xs font-semibold text-gray-600 dark:text-gray-300 flex-shrink-0">
                              {(a.patient_name || 'P')[0].toUpperCase()}
                            </span>
                            {a.patient_id ? (
                              <Link href={`/dashboard/patients/${a.patient_id}`} className="text-sm text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 hover:underline truncate max-w-[160px]">
                                {a.patient_name || '—'}
                              </Link>
                            ) : (
                              <span className="text-sm text-gray-700 dark:text-gray-300 truncate max-w-[160px]">{a.patient_name || '—'}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-sm text-gray-500 dark:text-gray-400">
                          {a.patient_phone ? (
                            <span className="flex items-center gap-1">
                              <PhoneIcon className="w-3 h-3 text-gray-400 dark:text-gray-500" />
                              {a.patient_phone}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm text-gray-500 dark:text-gray-400">{a.treatment || '—'}</span>
                            {getMediaCount(a) > 0 && (
                              <Link
                                href={a.patient_id ? `/dashboard/patients/${a.patient_id}` : '#'}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs font-medium hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                                title={`${getMediaCount(a)} media file(s)`}
                              >
                                <FileImage className="w-3 h-3" />
                                {getMediaCount(a)}
                              </Link>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-4"><StatusBadge status={a.status} arrivalStatus={a.arrival_status} /></td>
                        <td className="px-5 py-4 text-sm font-medium text-gray-700 dark:text-gray-300">
                          ₹{(a.consultation_fee || 0) + (a.treatment_charges || 0) + (a.medicine_charges || 0)}
                        </td>
                        <td className="px-5 py-4 text-right">
                          {a.status === 'confirmed' && (
                            <div className="flex flex-col gap-1">
                              {/* Arrival management */}
                              <div className="flex gap-1 justify-end">
                                {a.arrival_status === 'scheduled' && (
                                  <button
                                    onClick={() => handleArrivalChange(a.id, 'arrived')}
                                    disabled={!!arrivalUpdating}
                                    className="px-2 py-1 text-[10px] font-medium rounded-lg bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/50 border border-amber-200 dark:border-amber-800 transition-all disabled:opacity-50"
                                  >
                                    📍 Mark Arrived
                                  </button>
                                )}
                                {a.arrival_status === 'arrived' && (
                                  <button
                                    onClick={() => handleArrivalChange(a.id, 'called')}
                                    disabled={!!arrivalUpdating}
                                    className="px-2 py-1 text-[10px] font-medium rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-800 transition-all disabled:opacity-50"
                                  >
                                    📞 Call Patient
                                  </button>
                                )}
                                {a.arrival_status === 'called' && (
                                  <button
                                    onClick={() => router.push(`/dashboard/visit?appointmentId=${a.id}&name=${encodeURIComponent(a.patient_name || '')}&treatment=${encodeURIComponent(a.treatment || '')}`)}
                                    className="px-2 py-1 text-[10px] font-medium rounded-lg bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/50 border border-green-200 dark:border-green-800 transition-all"
                                  >
                                    ✓ Start Visit
                                  </button>
                                )}
                              </div>
                              {/* Primary actions */}
                              <div className="flex gap-1 justify-end">
                                <button
                                  onClick={() => router.push(`/dashboard/visit?appointmentId=${a.id}&name=${encodeURIComponent(a.patient_name || '')}&treatment=${encodeURIComponent(a.treatment || '')}`)}
                                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/50 border border-green-200 dark:border-green-800 transition-all hover:shadow-sm"
                                >
                                  ✓ Complete
                                </button>
                                <button
                                  onClick={() => handleStatusChange(a.id, 'no_show')}
                                  disabled={!!updating}
                                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 border border-red-200 dark:border-red-800 transition-all hover:shadow-sm disabled:opacity-50"
                                >
                                  ✕ No Show
                                </button>
                            </div>
                            </div>
                          )}

                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
