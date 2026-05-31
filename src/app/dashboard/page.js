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

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [dotDates, setDotDates] = useState([]);
  const [showCalendar, setShowCalendar] = useState(false);
  const calRef = useRef();

  const fetchCalendarDots = useCallback(async (date) => {
    const d = new Date(date + 'T12:00:00');
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    try {
      const res = await fetch(`/api/dashboard/calendar?year=${year}&month=${month}`);
      const json = await res.json();
      setDotDates(Object.keys(json.dates || {}));
    } catch {}
  }, []);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/dashboard/appointments?date=${selectedDate}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { console.error('Dashboard fetch error:', e); setLoading(false); });
    fetchCalendarDots(selectedDate);
  }, [selectedDate, fetchCalendarDots]);

  useEffect(() => {
    function handleClick(e) {
      if (calRef.current && !calRef.current.contains(e.target)) setShowCalendar(false);
    }
    if (showCalendar) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showCalendar]);

  function handleDateSelect(date) {
    setSelectedDate(date);
    setShowCalendar(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full" />
      </div>
    );
  }

  const totals = data?.totals || {};
  const appointments = data?.appointments || [];
  const confirmed = appointments.filter(a => a.status === 'confirmed');
  const completed = appointments.filter(a => a.status === 'completed');

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 mt-1">
            {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="relative" ref={calRef}>
          <button
            onClick={() => setShowCalendar(!showCalendar)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 hover:bg-gray-50 transition text-sm text-gray-700"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </button>
          {showCalendar && (
            <div className="absolute right-0 top-full mt-2 z-50 w-72">
              <Calendar selectedDate={selectedDate} onDateSelect={handleDateSelect} dotDates={dotDates} />
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <p className="text-sm text-gray-500 mb-1">Total Appointments</p>
          <p className="text-3xl font-bold text-gray-900">{appointments.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <p className="text-sm text-gray-500 mb-1">Waiting</p>
          <p className="text-3xl font-bold text-amber-600">{totals.waiting || 0}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <p className="text-sm text-gray-500 mb-1">In Session</p>
          <p className="text-3xl font-bold text-blue-600">{totals.in_session || 0}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <p className="text-sm text-gray-500 mb-1">Completed</p>
          <p className="text-3xl font-bold text-green-600">{totals.completed || 0}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Upcoming</h2>
            <Link href="/dashboard/appointments" className="text-sm text-blue-600 hover:text-blue-700 font-medium">
              View all →
            </Link>
          </div>
          {confirmed.length === 0 ? (
            <p className="text-gray-400 text-sm py-4 text-center">No appointments for this date.</p>
          ) : (
            <div className="space-y-3">
              {confirmed.slice(0, 5).map(a => (
                <div key={a.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {a.is_priority ? '⭐ ' : ''}{a.patient_name || 'Patient'}
                    </p>
                    <p className="text-xs text-gray-400">{a.time?.slice(0, 5)} — {a.treatment || 'Visit'}</p>
                  </div>
                  <StatusBadge status={a.status} arrivalStatus={a.arrival_status} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
          </div>
          {completed.length === 0 ? (
            <p className="text-gray-400 text-sm py-4 text-center">No completed visits for this date.</p>
          ) : (
            <div className="space-y-3">
              {completed.slice(0, 5).reverse().map(a => (
                <div key={a.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{a.patient_name || 'Patient'}</p>
                    <p className="text-xs text-gray-400">{a.treatment || 'Visit'} — ₹{(a.consultation_fee || 0) + (a.treatment_charges || 0) + (a.medicine_charges || 0)}</p>
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
