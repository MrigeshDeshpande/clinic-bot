'use client';

import { useState, useEffect, useCallback, useRef, useContext, Suspense } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { FileImage, Phone as PhoneIcon, Download } from 'lucide-react';
import { parseDateOnly, formatDateLong, formatDateShort } from '@/lib/date';
import Calendar from '@/components/Calendar';
import QuickCheckoutModal from '@/components/QuickCheckoutModal';
import RescheduleModal from './RescheduleModal';
import { DateContext, ToastContext } from '../layout';
import { fetchCached, invalidateFetchCache } from '@/lib/clientFetchCache';
import { VISIT_MODES } from '@/lib/visitModes';

function StatusBadge({ status, arrivalStatus }) {
  if (status === 'completed') return <span className="px-3 py-1 rounded-full text-sm font-medium bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800">Completed</span>;
  if (status === 'no_show') return <span className="px-3 py-1 rounded-full text-sm font-medium bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800">No Show</span>;
  if (status === 'cancelled') return <span className="px-3 py-1 rounded-full text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 line-through">Cancelled</span>;
  if (arrivalStatus === 'called') return <span className="px-3 py-1 rounded-full text-sm font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800">In Session</span>;
  if (arrivalStatus === 'arrived') return <span className="px-3 py-1 rounded-full text-sm font-medium bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">Waiting</span>;
  return <span className="px-3 py-1 rounded-full text-sm font-medium bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700">Scheduled</span>;
}

function getTreatments(a) {
  if (Array.isArray(a?.treatments) && a.treatments.length > 0) return a.treatments;
  if (a?.treatment) return [a.treatment];
  return [];
}

function TreatmentPills({ appointment }) {
  const treatments = getTreatments(appointment);
  if (treatments.length === 0) return <span className="text-sm text-gray-400 dark:text-gray-500">—</span>;
  if (treatments.length === 1) return <span className="text-sm text-gray-500 dark:text-gray-400">{treatments[0]}</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {treatments.map((t, i) => (
        <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded-md text-xs font-medium bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
          {t}
        </span>
      ))}
      <span className="text-xs text-gray-400 dark:text-gray-500 self-center">×{treatments.length}</span>
    </div>
  );
}

const TOTALS_CONFIG = [
  { key: 'confirmed', label: 'Confirmed', color: 'text-gray-900 dark:text-gray-100', bg: 'bg-gray-50 dark:bg-gray-800', ring: 'ring-gray-100 dark:ring-gray-700', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4" /> },
  { key: 'waiting', label: 'Waiting', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30', ring: 'ring-amber-100 dark:ring-amber-800', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /> },
  { key: 'in_session', label: 'In Session', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30', ring: 'ring-blue-100 dark:ring-blue-800', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /> },
  { key: 'completed', label: 'Completed', color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/30', ring: 'ring-green-100 dark:ring-green-800', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /> },
  { key: 'no_show', label: 'No Show', color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/30', ring: 'ring-red-100 dark:ring-red-800', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /> },
];

function AppointmentsPageFallback() {
  return <div className="p-8 text-center text-gray-400">Loading appointments...</div>;
}

function AppointmentsContent() {
  return (
    <Suspense fallback={<AppointmentsPageFallback />}>
      <AppointmentsContentInner />
    </Suspense>
  );
}

function AppointmentsContentInner() {
  const { selectedDate, setSelectedDate } = useContext(DateContext);
  const { showToast } = useContext(ToastContext);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(null);
  const [error, setError] = useState('');
  const [arrivalUpdating, setArrivalUpdating] = useState(null);
  const [dotDates, setDotDates] = useState([]);
  const [showCalendar, setShowCalendar] = useState(false);
  const [scope, setScope] = useState('day');
  const [filterKey, setFilterKey] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const lastAction = useRef(null);
  const calRef = useRef();
  const router = useRouter();

  const todayRevenue = (data?.appointments || [])
    .filter(a => a.status === 'completed')
    .reduce((sum, a) => sum + Number(a.consultation_fee || 0) + Number(a.treatment_charges || 0) + Number(a.medicine_charges || 0), 0);

  const filteredAppointments = (data?.appointments || []).filter(a => {
    if (filterKey === 'completed') return a.status === 'completed';
    if (filterKey === 'no_show') return a.status === 'no_show';
    if (filterKey === 'waiting') return a.status === 'confirmed' && a.arrival_status !== 'called';
    if (filterKey === 'in_session') return a.status === 'confirmed' && a.arrival_status === 'called';
    if (filterKey === 'arrived') return a.arrival_status === 'arrived';
    return true;
  }).filter(a => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (a.patient_name || '').toLowerCase().includes(q)
        || (a.patient_phone || '').includes(q);
  });

  const noFilter = !filterKey;

  const fetchCalendarDots = useCallback(async (date) => {
    const d = parseDateOnly(date) || new Date();
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    try { const json = await fetchCached(`/api/dashboard/calendar?year=${year}&month=${month}`); setDotDates(Object.keys(json.dates || {})); } catch {}
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;
    const scopeParam = scope === 'future' ? 'scope=future' : `date=${selectedDate}`;
    fetchCached(`/api/dashboard/appointments?${scopeParam}`)
      .then(d => { if (!signal.aborted) { setData(d); setLoading(false); } })
      .catch(e => { if (!signal.aborted) { setError(e.message); setLoading(false); } });
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchCalendarDots(selectedDate);
    return () => controller.abort();
  }, [selectedDate, scope, fetchCalendarDots]);

  useEffect(() => {
    function handleClick(e) { if (calRef.current && !calRef.current.contains(e.target)) setShowCalendar(false); }
    if (showCalendar) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showCalendar]);

  function handleDateSelect(date) { setSelectedDate(date); setShowCalendar(false); }

  async function handleStatusChange(appointmentId, newStatus) {
    const appt = data?.appointments?.find(a => a.id === appointmentId);
    const prevStatus = appt?.status;
    const prevArrival = appt?.arrival_status;
    setUpdating(appointmentId);
    try {
      if (newStatus === 'no_show') {
        const res = await fetch(`/api/dashboard/appointments/${appointmentId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'no_show' }),
        });
        if (res.ok) {
          lastAction.current = { id: appointmentId, status: prevStatus, arrivalStatus: prevArrival, source: newStatus };
          showToast(
            <span className="flex items-center gap-3">
              <span>✕ No Show</span>
              <button onClick={undoLastAction}
                className="ml-2 px-2.5 py-1 text-xs font-medium rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors">
                Undo
              </button>
            </span>,
            'success', { duration: 6000 }
          );
        } else {
          const data = await res.json();
          showToast(data.error || 'Failed to update status', 'error');
        }
      } else {
        const res = await fetch('/api/dashboard/visit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: VISIT_MODES.COMPLETE_APPOINTMENT, appointmentId, status: newStatus }),
        });
        const data = await res.json();
        if (res.ok) {
          lastAction.current = { id: appointmentId, status: prevStatus, arrivalStatus: prevArrival, source: newStatus };
          showToast(
            <span className="flex items-center gap-3">
              <span>✓ Completed</span>
              <button onClick={undoLastAction}
                className="ml-2 px-2.5 py-1 text-xs font-medium rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors">
                Undo
              </button>
            </span>,
            'success', { duration: 6000 }
          );
        } else {
          showToast(data.error || 'Failed to update status', 'error');
        }
      }
    } catch {
      showToast('Network error', 'error');
    }
    setUpdating(null);
    invalidateFetchCache(`/api/dashboard/appointments?date=${selectedDate}`);
    fetchCached(`/api/dashboard/appointments?date=${selectedDate}`)
      .then(d => { if (d) setData(d); })
      .catch(e => setError(e.message));
  }

  async function undoLastAction() {
    const action = lastAction.current;
    if (!action) return;
    lastAction.current = null;
    setUpdating(action.id);
    try {
      const res = await fetch(`/api/dashboard/appointments/${action.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: action.status }),
      });
      if (res.ok) {
        showToast('Change undone', 'success');
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to undo', 'error');
      }
    } catch {
      showToast('Failed to undo', 'error');
    }
    setUpdating(null);
    invalidateFetchCache(`/api/dashboard/appointments?date=${selectedDate}`);
    fetchCached(`/api/dashboard/appointments?date=${selectedDate}`)
      .then(d => { if (d) setData(d); })
      .catch(e => setError(e.message));
  }

  async function handleArrivalChange(appointmentId, arrivalStatus) {
    setArrivalUpdating(appointmentId);
    try {
      const res = await fetch('/api/dashboard/arrival', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId, arrivalStatus }),
      });
      const data = await res.json();
      if (res.ok) {
        const label = arrivalStatus === 'arrived' ? 'Marked as arrived' : 'Marked as in session';
        showToast(label, 'success');
      } else {
        showToast(data.error || 'Failed to update arrival', 'error');
      }
    } catch {
      showToast('Network error', 'error');
    }
    setArrivalUpdating(null);
    invalidateFetchCache(`/api/dashboard/appointments?date=${selectedDate}`);
    fetchCached(`/api/dashboard/appointments?date=${selectedDate}`)
      .then(d => { if (d) setData(d); })
      .catch(e => setError(e.message));
  }

  function getVisitUrl(a) {
    if (a.status === 'confirmed') return `/dashboard/visit?appointmentId=${a.id}&mode=${VISIT_MODES.COMPLETE_APPOINTMENT}`;
    if (a.status === 'completed') return `/dashboard/visit?appointmentId=${a.id}&mode=${VISIT_MODES.EDIT_COMPLETED_VISIT}`;
    return null;
  }

  const [quickCheckoutModal, setQuickCheckoutModal] = useState(null);
  const [rescheduleModal, setRescheduleModal] = useState(null);
  const [cancelUpdating, setCancelUpdating] = useState(null);
  const [editing, setEditing] = useState(null);
  const [editValue, setEditValue] = useState('');
  const editRef = useRef(null);

  async function handleCancel(appointmentId) {
    if (!confirm('Cancel this appointment? This action cannot be undone.')) return;
    setCancelUpdating(appointmentId);
    try {
      const res = await fetch(`/api/dashboard/appointments/${appointmentId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Cancelled from dashboard' }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Appointment cancelled', 'success');
      } else {
        showToast(data.error || 'Failed to cancel', 'error');
      }
    } catch {
      showToast('Network error', 'error');
    }
    setCancelUpdating(null);
    invalidateFetchCache(`/api/dashboard/appointments?date=${selectedDate}`);
    fetchCached(`/api/dashboard/appointments?date=${selectedDate}`)
      .then(d => { if (d) setData(d); })
      .catch(e => setError(e.message));
  }

  function getMediaCount(a) {
    return a.chit_media?.length || 0;
  }

  async function handleInlineSave(appointmentId, field, value) {
    setEditing(null);
    const res = await fetch(`/api/dashboard/appointments/${appointmentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    });
    if (res.ok) {
      const json = await res.json();
      setData(prev => ({
        ...prev,
        appointments: (prev?.appointments || []).map(a =>
          a.id === appointmentId ? { ...a, ...json.appointment } : a
        ),
      }));
    }
  }

  function startEdit(id, field, currentValue) {
    setEditing(`${id}::${field}`);
    setEditValue(String(currentValue ?? ''));
    setTimeout(() => editRef.current?.select(), 0);
  }

  function InlineEdit({ appointmentId, field, value, display, className }) {
    const key = `${appointmentId}::${field}`;
    if (editing === key) {
      return (
        <input
          ref={editRef}
          type="text"
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={() => handleInlineSave(appointmentId, field, editValue)}
          onKeyDown={e => {
            if (e.key === 'Enter') handleInlineSave(appointmentId, field, editValue);
            if (e.key === 'Escape') setEditing(null);
          }}
          className="w-full px-1 py-0.5 text-sm border border-blue-400 rounded bg-blue-50 dark:bg-blue-900/30 dark:border-blue-600 outline-none"
          autoFocus
        />
      );
    }
    return (
      <span onClick={() => startEdit(appointmentId, field, value)}
        className={`cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 px-1 -mx-1 rounded transition-colors ${className || ''}`}>
        {display ?? value ?? '—'}
      </span>
    );
  }

  return (
    <>
      <div className="animate-fade-in">
        <div className="sticky top-14 md:top-0 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md z-10 py-4 mb-6 -mx-4 md:-mx-8 px-4 md:px-8 border-b border-gray-100 dark:border-gray-900 transition-all">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-black tracking-tight text-gray-900 dark:text-gray-100 flex items-center gap-2">
                Appointments
                {data?.totals?.confirmed > 0 && (
                  <span className="inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold rounded-full bg-blue-500 text-white animate-pulse">
                    {data.totals.confirmed}
                  </span>
                )}
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mt-0.5">
                {scope === 'future' ? 'All upcoming visits' : formatDateLong(selectedDate)}
                {todayRevenue > 0 && (
                  <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 font-bold border border-emerald-150 dark:border-emerald-800">
                    ₹{todayRevenue.toLocaleString('en-IN')}
                  </span>
                )}
              </p>
            </div>
              <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
              {/* Segmented Tab Control */}
              <div className="flex items-center bg-gray-150/70 dark:bg-gray-900/60 p-1 rounded-2xl border border-gray-200/50 dark:border-gray-800/80 shrink-0 w-full xs:w-auto">
                <button
                  onClick={() => setScope('day')}
                  className={`flex-1 xs:flex-initial flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black transition-all duration-200 cursor-pointer ${
                    scope === 'day'
                      ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-405 shadow-sm border border-gray-200/30 dark:border-gray-700'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 border border-transparent'
                  }`}
                >
                  Day View
                </button>
                <button
                  onClick={() => setScope('future')}
                  className={`flex-1 xs:flex-initial flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black transition-all duration-200 cursor-pointer ${
                    scope === 'future'
                      ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-405 shadow-sm border border-gray-200/30 dark:border-gray-700'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 border border-transparent'
                  }`}
                >
                  All Future
                </button>
              </div>

              {/* Date Selector */}
              {scope === 'day' && (
                <div className="relative flex-1 xs:flex-initial" ref={calRef}>
                  <button
                    onClick={() => setShowCalendar(!showCalendar)}
                    className="w-full xs:w-auto flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-blue-50/50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 shadow-sm border border-blue-100/50 dark:border-blue-900/50 text-xs font-black hover:bg-blue-100/50 transition-all cursor-pointer"
                  >
                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    {formatDateShort(selectedDate)}
                  </button>
                  
                  {showCalendar && (
                    <>
                      <div className="fixed inset-0 bg-black/45 dark:bg-black/65 backdrop-blur-sm z-40 cursor-pointer animate-backdrop-in" onClick={() => setShowCalendar(false)} />
                      <div className="fixed md:absolute inset-x-4 top-1/2 -translate-y-1/2 md:inset-auto md:translate-y-0 md:right-0 md:top-full md:mt-2 z-50 flex justify-center md:block pointer-events-none">
                        <div className="w-full max-w-[320px] md:w-72 bg-white dark:bg-gray-900 rounded-3xl border border-gray-150/70 dark:border-gray-800 shadow-2xl p-1 md:p-0 animate-scale-in md:animate-slide-down pointer-events-auto">
                          <Calendar selectedDate={selectedDate} onDateSelect={handleDateSelect} dotDates={dotDates} onMonthChange={(y, m) => fetchCalendarDots(`${y}-${String(m).padStart(2,'0')}-01`)} />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

      {/* Search */}
      <div className="relative mb-6">
        <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search by patient name or phone..."
          className="w-full pl-11 pr-10 py-3 rounded-2xl bg-white dark:bg-gray-900 border border-gray-150 dark:border-gray-800 text-sm text-gray-900 dark:text-gray-150 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 dark:focus:ring-blue-400/20 dark:focus:border-blue-400 transition-all shadow-sm"
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery('')}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors cursor-pointer">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
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
            <div className="flex gap-2.5 overflow-x-auto pb-3 -mx-4 px-4 md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] md:grid md:grid-cols-5 md:overflow-visible shrink-0">
              {TOTALS_CONFIG.map(cfg => {
                const isActive = cfg.key === 'confirmed' ? noFilter : filterKey === cfg.key;
                return (
                <button key={cfg.key} onClick={() => setFilterKey(isActive ? null : cfg.key)}
                  className={`flex-shrink-0 w-[115px] md:w-auto text-left rounded-2xl border shadow-sm p-3 transition-all duration-300 group cursor-pointer active:scale-[0.97] ${
                    isActive 
                      ? 'bg-blue-50/45 dark:bg-blue-900/15 border-blue-500 dark:border-blue-400 ring-4 ring-blue-500/10 dark:ring-blue-400/10 -translate-y-0.5 shadow-md' 
                      : 'bg-white dark:bg-gray-900 border-gray-150/70 dark:border-gray-850 hover:border-gray-300 dark:hover:border-gray-750 hover:shadow-md hover:-translate-y-0.5'
                  }`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className={`text-[10px] font-bold uppercase tracking-wider truncate ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`}>{cfg.label}</p>
                    <div className={`w-5.5 h-5.5 rounded-lg ${cfg.bg} flex items-center justify-center ring-2 ring-white dark:ring-gray-900 shadow-sm shrink-0 group-hover:scale-110 transition-transform`}>
                      <svg className={`w-3 h-3 ${cfg.color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">{cfg.icon}</svg>
                    </div>
                  </div>
                  <p className={`text-2xl font-black tracking-tight leading-none ${cfg.color}`}>{Number(data.totals[cfg.key] || 0)}</p>
                </button>
                );
              })}
            </div>
          )}

          {/* Bulk Actions */}
          {data?.totals?.confirmed > 1 && (
            <div className="flex items-center gap-2 px-1 py-1 bg-gray-50 dark:bg-gray-900/30 rounded-xl border border-gray-150/40 dark:border-gray-850 w-full overflow-x-auto shrink-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              <span className="text-xs text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wider pl-2 shrink-0">Bulk:</span>
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
                className="px-2.5 py-1 text-xs font-bold rounded-lg bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/50 border border-green-200/50 dark:border-green-800 transition-all shrink-0 cursor-pointer active:scale-95"
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
                className="px-2.5 py-1 text-xs font-bold rounded-lg bg-red-50 dark:bg-red-955/20 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 border border-red-200/50 dark:border-red-800 transition-all shrink-0 cursor-pointer active:scale-95"
              >
                ✕ Cancel All
              </button>
            </div>
          )}

          {/* Appointm          {/* Appointments Table - Desktop Only */}
          <div className="hidden md:block bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-800/80">
                    <th className="text-left px-5 py-3.5 text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Time</th>
                    <th className="text-left px-5 py-3.5 text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Patient</th>
                    <th className="text-left px-5 py-3.5 text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Phone</th>
                    <th className="text-left px-5 py-3.5 text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Location</th>
                    <th className="text-left px-5 py-3.5 text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Treatment</th>
                    <th className="text-left px-5 py-3.5 text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                    <th className="text-left px-5 py-3.5 text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Amount</th>
                    <th className="text-right px-5 py-3.5 text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.appointments || []).length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-5 py-16 text-center">
                        <div className="flex flex-col items-center gap-2">
                          <svg className="w-12 h-12 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <p className="text-gray-400 dark:text-gray-500 text-sm">No appointments for this date.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredAppointments.map((a) => (
                      <tr key={a.id} onClick={e => { if (e.target.closest('button, a, input, [contenteditable]')) return; const url = getVisitUrl(a); if (url) { router.push(url); } else { showToast('This appointment cannot be edited from here.', 'info'); } }} className={`cursor-pointer border-b border-gray-50 dark:border-gray-800 hover:bg-blue-50/30 dark:hover:bg-blue-900/10 transition-colors ${updating === a.id ? 'opacity-50 pointer-events-none' : ''}`}>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <span className={`w-1.5 h-1.5 rounded-full ${a.status === 'completed' ? 'bg-green-400' : a.status === 'no_show' ? 'bg-red-400' : 'bg-blue-400'}`} />
                            <span className="text-base font-medium text-gray-900 dark:text-gray-100">{a.time?.slice(0, 5) || <span className="text-gray-400 dark:text-gray-500 text-sm font-normal">Walk-in</span>}</span>
                            {a.is_priority && <span className="text-xs">⭐</span>}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <span className="w-7 h-7 rounded-full bg-gradient-to-br from-gray-100 to-gray-50 dark:from-gray-700 dark:to-gray-600 flex items-center justify-center text-xs font-semibold text-gray-600 dark:text-gray-300 flex-shrink-0">
                              {(a.patient_name || 'P')[0].toUpperCase()}
                            </span>
                            {a.patient_id ? (
                              <Link href={`/dashboard/patients/${a.patient_id}`} className="text-base text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 hover:underline truncate max-w-[160px]">
                                {a.patient_name || '—'}
                              </Link>
                            ) : (
                              <span className="text-base text-gray-700 dark:text-gray-300 truncate max-w-[160px]">{a.patient_name || '—'}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-base text-gray-500 dark:text-gray-400">
                          <InlineEdit
                            appointmentId={a.id}
                            field="patient_phone"
                            value={a.patient_phone || ''}
                            display={a.patient_phone ? (
                              <span className="flex items-center gap-1">
                                <PhoneIcon className="w-3 h-3 text-gray-400 dark:text-gray-500" />
                                {a.patient_phone}
                              </span>
                            ) : '—'}
                          />
                        </td>
                        <td className="px-5 py-4 text-base text-gray-500 dark:text-gray-400">
                          <InlineEdit
                            appointmentId={a.id}
                            field="location"
                            value={a.location || ''}
                            display={a.patient_location || a.location || '—'}
                          />
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-1.5 max-w-[180px]">
                            <TreatmentPills appointment={a} />
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
                            {a.prescription_key && (
                              <a href={`/api/dashboard/media/signed?key=${encodeURIComponent(a.prescription_key)}`} target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 text-xs font-medium hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
                                title="Download Prescription">
                                <Download className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-4"><StatusBadge status={a.status} arrivalStatus={a.arrival_status} /></td>
                        <td className="px-5 py-4 text-base font-medium text-gray-700 dark:text-gray-300">
                          {editing === `${a.id}::fees` ? (
                            <div className="flex gap-1 items-center min-w-[200px]">
                              <input type="number" value={editValue.split(',')[0] || ''} onChange={e => setEditValue(`${e.target.value},${editValue.split(',')[1] || ''},${editValue.split(',')[2] || ''}`)}
                                className="w-14 px-1 py-0.5 text-xs border border-blue-400 rounded bg-blue-50 dark:bg-blue-900/30 dark:border-blue-600 outline-none text-center" placeholder="C"
                                onKeyDown={e => { if (e.key === 'Enter') handleInlineSave(a.id, 'consultation_fee', editValue.split(',')[0]) }} />
                              <input type="number" value={editValue.split(',')[1] || ''} onChange={e => setEditValue(`${editValue.split(',')[0] || ''},${e.target.value},${editValue.split(',')[2] || ''}`)}
                                className="w-14 px-1 py-0.5 text-xs border border-blue-400 rounded bg-blue-50 dark:bg-blue-900/30 dark:border-blue-600 outline-none text-center" placeholder="T"
                                onKeyDown={e => { if (e.key === 'Enter') handleInlineSave(a.id, 'treatment_charges', editValue.split(',')[1]) }} />
                              <input type="number" value={editValue.split(',')[2] || ''} onChange={e => setEditValue(`${editValue.split(',')[0] || ''},${editValue.split(',')[1] || ''},${e.target.value}`)}
                                className="w-14 px-1 py-0.5 text-xs border border-blue-400 rounded bg-blue-50 dark:bg-blue-900/30 dark:border-blue-605 outline-none text-center" placeholder="M"
                                onKeyDown={e => { if (e.key === 'Enter') handleInlineSave(a.id, 'medicine_charges', editValue.split(',')[2]) }}
                                onBlur={async () => {
                                  await handleInlineSave(a.id, 'consultation_fee', editValue.split(',')[0]);
                                  await handleInlineSave(a.id, 'treatment_charges', editValue.split(',')[1]);
                                  await handleInlineSave(a.id, 'medicine_charges', editValue.split(',')[2]);
                                }} />
                            </div>
                          ) : (
                            <span onClick={() => startEdit(a.id, 'fees', `${a.consultation_fee || 0},${a.treatment_charges || 0},${a.medicine_charges || 0}`)}
                              className="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 px-1 -mx-1 rounded transition-colors">
                              ₹{(a.consultation_fee || 0) + (a.treatment_charges || 0) + (a.medicine_charges || 0)}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex gap-1 justify-end">
                            {a.status === 'confirmed' && a.arrival_status === 'scheduled' && (
                              <button onClick={() => handleArrivalChange(a.id, 'arrived')} disabled={!!arrivalUpdating}
                                className="px-3 py-1.5 text-sm font-medium rounded-lg bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/50 border border-amber-200 dark:border-amber-800 transition-all disabled:opacity-50">
                                📍 Arrived
                              </button>
                            )}
                            {a.status === 'confirmed' && a.arrival_status === 'arrived' && (
                              <button onClick={() => handleArrivalChange(a.id, 'called')} disabled={!!arrivalUpdating}
                                className="px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-800 transition-all disabled:opacity-50">
                                📞 Call
                              </button>
                            )}
                            {a.status === 'confirmed' && (
                              <button onClick={() => setQuickCheckoutModal(a)}
                                className="px-3 py-1.5 text-sm font-medium rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-800 transition-all">
                                ₹ Quick Checkout
                              </button>
                            )}
                            {a.status === 'confirmed' && (
                              <button onClick={() => handleStatusChange(a.id, 'no_show')} disabled={!!updating}
                                className="px-3 py-1.5 text-sm font-medium rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 border border-red-200 dark:border-red-800 transition-all disabled:opacity-50">
                                ✕ No Show
                              </button>
                            )}
                            {a.status === 'confirmed' && (
                              <button onClick={() => setRescheduleModal(a)} disabled={!!cancelUpdating}
                                className="px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-800 transition-all disabled:opacity-50">
                                ↻ Reschedule
                              </button>
                            )}
                            {a.status === 'confirmed' && (
                              <button onClick={() => handleCancel(a.id)} disabled={!!cancelUpdating}
                                className="px-3 py-1.5 text-sm font-medium rounded-lg bg-gray-50 dark:bg-gray-850 text-gray-600 dark:text-gray-405 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 border border-gray-200 dark:border-gray-700 hover:border-red-200 dark:hover:border-red-800 transition-all disabled:opacity-50">
                                ✕ Cancel
                              </button>
                            )}
                            {a.status === 'completed' && (
                              <span className="inline-flex items-center gap-1 text-sm text-green-600 dark:text-green-400 font-medium">
                                ✓ Completed
                                {!a.prescription_key && (
                                  <button onClick={async (e) => {
                                    e.stopPropagation();
                                    try {
                                      const res = await fetch(`/api/dashboard/visits/${a.id}/prescription`, { method: 'POST' });
                                      const data = await res.json();
                                      if (res.ok && data.url) window.open(data.url, '_blank');
                                    } catch {}
                                  }}
                                    className="px-1 py-0.5 rounded bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-xs">
                                    Rx
                                  </button>
                                )}
                                <button onClick={async (e) => {
                                  e.stopPropagation();
                                  try {
                                    const res = await fetch(`/api/dashboard/visits/${a.id}/compile`, { method: 'POST' });
                                    const data = await res.json();
                                    if (res.ok && data.url) window.open(data.url, '_blank');
                                  } catch {}
                                }}
                                  className="px-1 py-0.5 rounded bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-900/50 text-xs cursor-pointer"
                                  title="Compile & download visit summary">
                                  📄
                                </button>
                              </span>
                            )}
                            {a.status === 'no_show' && (
                              <span className="text-sm text-red-600 dark:text-red-400 font-medium">✕ No Show</span>
                            )}
                            {a.status === 'cancelled' && (
                              <span className="text-sm text-gray-400 dark:text-gray-550 font-medium line-through">Cancelled</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Card list for Mobile/Tablet */}
          <div className="block md:hidden space-y-4">
            {(data?.appointments || []).length === 0 ? (
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-150/70 dark:border-gray-850 shadow-sm p-12 text-center">
                <div className="w-16 h-16 bg-blue-50 dark:bg-blue-950/20 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-blue-100 dark:border-blue-900/50">
                  <svg className="w-8 h-8 text-blue-500 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-gray-950 dark:text-gray-50 mb-1">No appointments</h3>
                <p className="text-gray-400 dark:text-gray-550 text-xs max-w-[200px] mx-auto">There are no visits scheduled for the selected date.</p>
              </div>
            ) : (
              filteredAppointments.map((a) => (
                <div
                  key={a.id}
                  onClick={e => {
                    if (e.target.closest('button, a, input, [contenteditable]')) return;
                    const url = getVisitUrl(a);
                    if (url) { router.push(url); } else { showToast('This appointment cannot be edited from here.', 'info'); }
                  }}
                  className={`bg-white dark:bg-gray-900 rounded-2xl border border-gray-150/70 dark:border-gray-850 shadow-sm p-4 space-y-3.5 transition-all active:scale-[0.99] hover:border-blue-200 dark:hover:border-blue-800 cursor-pointer ${
                    updating === a.id ? 'opacity-50 pointer-events-none' : ''
                  }`}
                >
                  {/* Card Header: Time & Status */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${a.status === 'completed' ? 'bg-emerald-500' : a.status === 'no_show' ? 'bg-red-500' : 'bg-blue-500 animate-pulse'}`} />
                      <span className="text-base font-black text-gray-950 dark:text-gray-50">
                        {a.time?.slice(0, 5) || <span className="text-gray-400 dark:text-gray-500 text-xs font-normal">Walk-in</span>}
                      </span>
                      {a.is_priority && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 text-[9px] font-extrabold uppercase tracking-wide border border-amber-200 dark:border-amber-800">
                          ⭐ Priority
                        </span>
                      )}
                    </div>
                    <StatusBadge status={a.status} arrivalStatus={a.arrival_status} />
                  </div>

                  {/* Patient Info */}
                  <div className="flex items-start gap-3.5 pt-1">
                    <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-50 to-gray-50 dark:from-gray-800 dark:to-gray-905 flex items-center justify-center text-sm font-black text-blue-600 dark:text-blue-400 flex-shrink-0 shadow-sm border border-gray-200/50 dark:border-gray-750">
                      {(a.patient_name || 'P')[0].toUpperCase()}
                    </span>
                    <div className="flex-1 min-w-0">
                      {a.patient_id ? (
                        <Link href={`/dashboard/patients/${a.patient_id}`} className="text-base font-bold text-gray-900 dark:text-gray-50 hover:text-blue-600 dark:hover:text-blue-450 hover:underline block truncate">
                          {a.patient_name || '—'}
                        </Link>
                      ) : (
                        <span className="text-base font-bold text-gray-900 dark:text-gray-50 block truncate">{a.patient_name || '—'}</span>
                      )}
                      
                      {/* Sub-info: Phone & Location */}
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1 text-xs text-gray-400 dark:text-gray-500">
                        <span className="flex items-center gap-1 font-medium">
                          <PhoneIcon className="w-3.5 h-3.5 text-gray-450 dark:text-gray-500 shrink-0" />
                          <InlineEdit
                            appointmentId={a.id}
                            field="patient_phone"
                            value={a.patient_phone || ''}
                            display={a.patient_phone || '—'}
                            className="hover:underline text-gray-500 dark:text-gray-400"
                          />
                        </span>
                        <span className="text-gray-300 dark:text-gray-800">•</span>
                        <span className="flex items-center gap-1 font-medium">
                          <span className="text-xs shrink-0">📍</span>
                          <InlineEdit
                            appointmentId={a.id}
                            field="location"
                            value={a.location || ''}
                            display={a.patient_location || a.location || '—'}
                            className="truncate max-w-[120px] text-gray-500 dark:text-gray-400"
                          />
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Treatments & Files */}
                  <div className="flex flex-wrap items-center justify-between gap-2.5 pt-3 border-t border-gray-100 dark:border-gray-850/60">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-bold mr-0.5">Tx:</span>
                      <TreatmentPills appointment={a} />
                      {getMediaCount(a) > 0 && (
                        <Link
                          href={a.patient_id ? `/dashboard/patients/${a.patient_id}` : '#'}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs font-semibold hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors border border-blue-100 dark:border-blue-800"
                        >
                          <FileImage className="w-3.5 h-3.5" />
                          {getMediaCount(a)}
                        </Link>
                      )}
                      {a.prescription_key && (
                        <a href={`/api/dashboard/media/signed?key=${encodeURIComponent(a.prescription_key)}`} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 text-xs font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors border border-emerald-100 dark:border-emerald-800"
                          title="Download Prescription">
                          <Download className="w-3.5 h-3.5" /> Rx PDF
                        </a>
                      )}
                    </div>

                    {/* Fees / Amount section */}
                    <div className="text-right shrink-0">
                      <span className="text-[9px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-bold block leading-none mb-0.5">Total Fee</span>
                      {editing === `${a.id}::fees` ? (
                        <div className="flex gap-1 items-center mt-1">
                          <input type="number" value={editValue.split(',')[0] || ''} onChange={e => setEditValue(`${e.target.value},${editValue.split(',')[1] || ''},${editValue.split(',')[2] || ''}`)}
                            className="w-11 px-1 py-0.5 text-xs border border-blue-400 rounded bg-blue-50 dark:bg-blue-900/30 dark:border-blue-600 outline-none text-center font-bold text-gray-800 dark:text-gray-150" placeholder="C"
                            onKeyDown={e => { if (e.key === 'Enter') handleInlineSave(a.id, 'consultation_fee', editValue.split(',')[0]) }} />
                          <input type="number" value={editValue.split(',')[1] || ''} onChange={e => setEditValue(`${editValue.split(',')[0] || ''},${e.target.value},${editValue.split(',')[2] || ''}`)}
                            className="w-11 px-1 py-0.5 text-xs border border-blue-400 rounded bg-blue-50 dark:bg-blue-900/30 dark:border-blue-605 outline-none text-center font-bold text-gray-800 dark:text-gray-150" placeholder="T"
                            onKeyDown={e => { if (e.key === 'Enter') handleInlineSave(a.id, 'treatment_charges', editValue.split(',')[1]) }} />
                          <input type="number" value={editValue.split(',')[2] || ''} onChange={e => setEditValue(`${editValue.split(',')[0] || ''},${editValue.split(',')[1] || ''},${e.target.value}`)}
                            className="w-11 px-1 py-0.5 text-xs border border-blue-400 rounded bg-blue-50 dark:bg-blue-900/30 dark:border-blue-605 outline-none text-center font-bold text-gray-800 dark:text-gray-150" placeholder="M"
                            onKeyDown={e => { if (e.key === 'Enter') handleInlineSave(a.id, 'medicine_charges', editValue.split(',')[2]) }}
                            onBlur={async () => {
                              await handleInlineSave(a.id, 'consultation_fee', editValue.split(',')[0]);
                              await handleInlineSave(a.id, 'treatment_charges', editValue.split(',')[1]);
                              await handleInlineSave(a.id, 'medicine_charges', editValue.split(',')[2]);
                            }} />
                        </div>
                      ) : (
                        <span
                          onClick={() => startEdit(a.id, 'fees', `${a.consultation_fee || 0},${a.treatment_charges || 0},${a.medicine_charges || 0}`)}
                          className="text-base font-black text-blue-600 dark:text-blue-400 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 px-1.5 py-0.5 rounded transition-colors"
                        >
                          ₹{(a.consultation_fee || 0) + (a.treatment_charges || 0) + (a.medicine_charges || 0)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions Section */}
                  <div className="flex flex-wrap gap-2.5 pt-3 border-t border-gray-100 dark:border-gray-850/60">
                    {a.status === 'confirmed' && a.arrival_status === 'scheduled' && (
                      <button onClick={() => handleArrivalChange(a.id, 'arrived')} disabled={!!arrivalUpdating}
                        className="flex-1 min-w-[90px] py-2.5 text-xs font-bold rounded-xl bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 hover:bg-amber-100/50 border border-amber-200 dark:border-amber-800 active:scale-95 transition-all disabled:opacity-50 cursor-pointer text-center">
                        📍 Arrived
                      </button>
                    )}
                    {a.status === 'confirmed' && a.arrival_status === 'arrived' && (
                      <button onClick={() => handleArrivalChange(a.id, 'called')} disabled={!!arrivalUpdating}
                        className="flex-1 min-w-[90px] py-2.5 text-xs font-bold rounded-xl bg-blue-50 dark:bg-blue-955/20 text-blue-700 dark:text-blue-400 hover:bg-blue-100/50 border border-blue-200 dark:border-blue-800 active:scale-95 transition-all disabled:opacity-50 cursor-pointer text-center">
                        📞 Call
                      </button>
                    )}
                    {a.status === 'confirmed' && (
                      <button onClick={() => setQuickCheckoutModal(a)}
                        className="flex-1 min-w-[120px] py-2.5 text-xs font-black rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm shadow-emerald-500/10 active:scale-95 transition-all cursor-pointer text-center border border-transparent">
                        ₹ Quick Checkout
                      </button>
                    )}
                    {a.status === 'confirmed' && (
                      <button onClick={() => handleStatusChange(a.id, 'no_show')} disabled={!!updating}
                        className="flex-1 min-w-[90px] py-2.5 text-xs font-bold rounded-xl bg-red-50 dark:bg-red-955/20 text-red-700 dark:text-red-400 hover:bg-red-100/50 border border-red-200 dark:border-red-800 active:scale-95 transition-all disabled:opacity-50 cursor-pointer text-center">
                        ✕ No Show
                      </button>
                    )}
                    {a.status === 'confirmed' && (
                      <button onClick={() => setRescheduleModal(a)} disabled={!!cancelUpdating}
                        className="flex-1 min-w-[95px] py-2.5 text-xs font-bold rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-750 border border-gray-200 dark:border-gray-700 active:scale-95 transition-all disabled:opacity-50 cursor-pointer text-center">
                        ↻ Reschedule
                      </button>
                    )}
                    {a.status === 'confirmed' && (
                      <button onClick={() => handleCancel(a.id)} disabled={!!cancelUpdating}
                        className="flex-1 min-w-[85px] py-2.5 text-xs font-bold rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-650 dark:text-gray-400 hover:bg-red-50 dark:hover:bg-red-950/20 hover:text-red-600 dark:hover:text-red-400 border border-gray-200 dark:border-gray-700 hover:border-red-250/50 dark:hover:border-red-800 active:scale-95 transition-all disabled:opacity-50 cursor-pointer text-center">
                        ✕ Cancel
                      </button>
                    )}
                    {a.status === 'completed' && (
                      <div className="flex items-center gap-2.5 w-full justify-between bg-gray-50 dark:bg-gray-850/40 px-3.5 py-2.5 rounded-xl border border-gray-100 dark:border-gray-850">
                        <span className="text-xs text-green-600 dark:text-green-400 font-extrabold flex items-center gap-1.5">
                          ✓ Completed
                        </span>
                        <div className="flex gap-2">
                          {!a.prescription_key && (
                            <button onClick={async (e) => {
                              e.stopPropagation();
                              try {
                                const res = await fetch(`/api/dashboard/visits/${a.id}/prescription`, { method: 'POST' });
                                const data = await res.json();
                                if (res.ok && data.url) window.open(data.url, '_blank');
                              } catch {}
                            }}
                              className="px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100/50 text-xs font-bold border border-emerald-200/50 dark:border-emerald-800 active:scale-95 cursor-pointer">
                              Rx PDF
                            </button>
                          )}
                          <button onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              const res = await fetch(`/api/dashboard/visits/${a.id}/compile`, { method: 'POST' });
                              const data = await res.json();
                              if (res.ok && data.url) window.open(data.url, '_blank');
                            } catch {}
                          }}
                            className="px-3 py-1.5 rounded-xl bg-violet-50 dark:bg-violet-950/30 text-violet-600 dark:text-violet-400 hover:bg-violet-100/50 text-xs font-bold border border-violet-200/50 dark:border-violet-800 active:scale-95 cursor-pointer flex items-center gap-1.5"
                            title="Compile & download visit summary">
                            📄 Summary
                          </button>
                        </div>
                      </div>
                    )}
                    {a.status === 'no_show' && (
                      <span className="w-full text-center py-2.5 text-xs font-extrabold text-red-650 dark:text-red-400 bg-red-50/50 dark:bg-red-950/20 rounded-xl border border-red-105 dark:border-red-900/50 uppercase tracking-wider">✕ No Show</span>
                    )}
                    {a.status === 'cancelled' && (
                      <span className="w-full text-center py-2.5 text-xs font-extrabold text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-750 line-through uppercase tracking-wider">Cancelled</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>

      {/* Reschedule Modal */}
      {typeof window !== 'undefined' && rescheduleModal && createPortal(
        <RescheduleModal
          appointment={rescheduleModal}
          onClose={() => setRescheduleModal(null)}
          onReschedule={() => {
            setRescheduleModal(null);
            invalidateFetchCache(`/api/dashboard/appointments?date=${selectedDate}`);
            fetchCached(`/api/dashboard/appointments?date=${selectedDate}`)
              .then(d => { if (d) setData(d); })
              .catch(e => setError(e.message));
          }}
          showToast={showToast}
        />,
        document.body
      )}

      {/* Quick Checkout Modal */}
      {typeof window !== 'undefined' && quickCheckoutModal && createPortal(
        <QuickCheckoutModal
          appointment={quickCheckoutModal}
          onClose={() => setQuickCheckoutModal(null)}
          onSuccess={(appointmentId) => {
            setQuickCheckoutModal(null);
            setData(prev => ({
              ...prev,
              appointments: (prev?.appointments || []).map(a =>
                a.id === appointmentId ? { ...a, status: 'completed' } : a
              ),
            }));
            invalidateFetchCache(`/api/dashboard/appointments?date=${selectedDate}`);
            fetchCached(`/api/dashboard/appointments?date=${selectedDate}`)
              .then(d => { if (d) setData(d); })
              .catch(e => setError(e.message));
          }}
          showToast={showToast}
        />,
        document.body
      )}
    </>
  );
}

export default AppointmentsContent;
