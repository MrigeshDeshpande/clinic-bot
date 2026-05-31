'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import Calendar from '@/components/Calendar';

function StatusBadge({ status, arrivalStatus }) {
  if (status === 'completed') return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">Completed</span>;
  if (status === 'no_show') return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">No Show</span>;
  if (arrivalStatus === 'called') return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">In Session</span>;
  if (arrivalStatus === 'arrived') return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">Waiting</span>;
  return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-50 text-gray-600 border border-gray-200">Scheduled</span>;
}

const STAT_CARDS = [
  { key: 'total', label: 'Total Appointments', color: 'gray', icon: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
  )},
  { key: 'waiting', label: 'Waiting', color: 'amber', icon: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  )},
  { key: 'in_session', label: 'In Session', color: 'blue', icon: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  )},
  { key: 'completed', label: 'Completed', color: 'green', icon: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  )},
];

const COLOR_MAP = {
  total: { text: 'text-gray-900', icon: 'text-gray-400', bg: 'bg-gray-50', ring: 'ring-gray-100' },
  waiting: { text: 'text-amber-600', icon: 'text-amber-400', bg: 'bg-amber-50', ring: 'ring-amber-100' },
  in_session: { text: 'text-blue-600', icon: 'text-blue-400', bg: 'bg-blue-50', ring: 'ring-blue-100' },
  completed: { text: 'text-green-600', icon: 'text-green-400', bg: 'bg-green-50', ring: 'ring-green-100' },
};

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  const [dotDates, setDotDates] = useState([]);
  const [showCalendar, setShowCalendar] = useState(false);
  const calRef = useRef();

  const fetchCalendarDots = useCallback(async (date) => {
    const d = new Date(date + 'T12:00:00');
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    try { const res = await fetch(`/api/dashboard/calendar?year=${year}&month=${month}`); const json = await res.json(); setDotDates(Object.keys(json.dates || {})); } catch {}
  }, []);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/dashboard/appointments?date=${selectedDate}`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { console.error('Dashboard fetch error:', e); setLoading(false); });
    fetchCalendarDots(selectedDate);
  }, [selectedDate, fetchCalendarDots]);

  useEffect(() => {
    function handleClick(e) { if (calRef.current && !calRef.current.contains(e.target)) setShowCalendar(false); }
    if (showCalendar) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showCalendar]);

  function handleDateSelect(date) { setSelectedDate(date); setShowCalendar(false); }

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="shimmer h-8 w-64 rounded-lg" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="shimmer h-28 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="shimmer h-64 rounded-xl" />
          <div className="shimmer h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  const totals = data?.totals || {};
  const appointments = data?.appointments || [];
  const confirmed = appointments.filter(a => a.status === 'confirmed');
  const completed = appointments.filter(a => a.status === 'completed');

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 mt-1">
            {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="relative" ref={calRef}>
          <button
            onClick={() => setShowCalendar(!showCalendar)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-gray-200 hover:border-blue-200 hover:shadow-sm transition-all text-sm text-gray-700"
          >
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </button>
          {showCalendar && (
            <div className="absolute right-0 top-full mt-2 z-50 w-72 animate-slide-down">
              <Calendar selectedDate={selectedDate} onDateSelect={handleDateSelect} dotDates={dotDates} onMonthChange={(y, m) => fetchCalendarDots(`${y}-${String(m).padStart(2,'0')}-01`)} />
            </div>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {STAT_CARDS.map(card => {
          const value = card.key === 'total' ? appointments.length : totals[card.key] || 0;
          const c = COLOR_MAP[card.key];
          return (
            <div key={card.key} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 group">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-gray-500 font-medium">{card.label}</p>
                <div className={`w-9 h-9 rounded-lg ${c.bg} flex items-center justify-center ring-1 ${c.ring} group-hover:scale-110 transition-transform duration-200`}>
                  <svg className={`w-5 h-5 ${c.icon}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">{card.icon}</svg>
                </div>
              </div>
              <p className={`text-3xl font-bold ${c.text}`}>{value}</p>
            </div>
          );
        })}
      </div>

      {/* Upcoming & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500 animate-dot-pulse" />
              <h2 className="text-lg font-semibold text-gray-900">Upcoming</h2>
            </div>
            <Link href="/dashboard/appointments" className="text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors">
              View all →
            </Link>
          </div>
          {confirmed.length === 0 ? (
            <p className="text-gray-400 text-sm py-8 text-center">No appointments for this date.</p>
          ) : (
            <div className="space-y-1">
              {confirmed.slice(0, 5).map((a, i) => (
                <div key={a.id} className="flex items-center justify-between py-3 px-3 -mx-3 rounded-lg hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center text-xs font-semibold text-blue-700">
                      {(a.patient_name || 'P')[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {a.is_priority ? '⭐ ' : ''}{a.patient_name || 'Patient'}
                      </p>
                      <p className="text-xs text-gray-400 truncate">{a.time?.slice(0, 5)} — {a.treatment || 'Visit'}</p>
                    </div>
                  </div>
                  <StatusBadge status={a.status} arrivalStatus={a.arrival_status} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-dot-pulse" />
            <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
          </div>
          {completed.length === 0 ? (
            <p className="text-gray-400 text-sm py-8 text-center">No completed visits for this date.</p>
          ) : (
            <div className="space-y-1">
              {completed.slice(0, 5).reverse().map(a => (
                <div key={a.id} className="flex items-center justify-between py-3 px-3 -mx-3 rounded-lg hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-green-50 to-green-100 flex items-center justify-center text-xs font-semibold text-green-700">
                      {(a.patient_name || 'P')[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{a.patient_name || 'Patient'}</p>
                      <p className="text-xs text-gray-400 truncate">{a.treatment || 'Visit'} — ₹{(a.consultation_fee || 0) + (a.treatment_charges || 0) + (a.medicine_charges || 0)}</p>
                    </div>
                  </div>
                  <StatusBadge status={a.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
