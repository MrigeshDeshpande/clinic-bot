'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Calendar from '@/components/Calendar';

function StatusBadge({ status, arrivalStatus }) {
  if (status === 'completed') return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">Completed</span>;
  if (status === 'no_show') return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">No Show</span>;
  if (arrivalStatus === 'called') return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">In Session</span>;
  if (arrivalStatus === 'arrived') return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">Waiting</span>;
  return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-50 text-gray-600 border border-gray-200">Scheduled</span>;
}

export default function AppointmentsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [dotDates, setDotDates] = useState([]);
  const [showCalendar, setShowCalendar] = useState(false);
  const calRef = useRef();

  function fetchData(date) {
    setLoading(true);
    fetch(`/api/dashboard/appointments?date=${date}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }

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

  useEffect(() => { fetchData(selectedDate); fetchCalendarDots(selectedDate); }, [selectedDate, fetchCalendarDots]);

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

  function handleStatusChange(appointmentId, newStatus) {
    fetch('/api/dashboard/visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appointmentId, status: newStatus }),
    }).then(() => fetchData(selectedDate));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Appointments</h1>
          <p className="text-gray-500 mt-1">View and manage today&apos;s appointments</p>
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
              <Calendar selectedDate={selectedDate} onDateSelect={handleDateSelect} dotDates={dotDates} onMonthChange={(y, m) => fetchCalendarDots(`${y}-${String(m).padStart(2,'0')}-01`)} />
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full" />
        </div>
      ) : error ? (
        <p className="text-red-500">{error}</p>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Time</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Patient</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Treatment</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Amount</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(data?.appointments || []).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center text-gray-400 text-sm">No appointments for this date.</td>
                  </tr>
                ) : (
                  (data?.appointments || []).map(a => (
                    <tr key={a.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition">
                      <td className="px-5 py-4 text-sm font-medium text-gray-900 whitespace-nowrap">
                        {a.is_priority && <span className="mr-1">⭐</span>}
                        {a.time?.slice(0, 5)}
                      </td>
                      <td className="px-5 py-4 text-sm text-gray-700">{a.patient_name || '—'}</td>
                      <td className="px-5 py-4 text-sm text-gray-500">{a.treatment || '—'}</td>
                      <td className="px-5 py-4"><StatusBadge status={a.status} arrivalStatus={a.arrival_status} /></td>
                      <td className="px-5 py-4 text-sm text-gray-700">
                        ₹{(a.consultation_fee || 0) + (a.treatment_charges || 0) + (a.medicine_charges || 0)}
                      </td>
                      <td className="px-5 py-4 text-right">
                        {a.status === 'confirmed' && (
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => handleStatusChange(a.id, 'completed')}
                              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 transition"
                            >
                              Complete
                            </button>
                            <button
                              onClick={() => handleStatusChange(a.id, 'no_show')}
                              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 transition"
                            >
                              No Show
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {data?.totals && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-6">
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
                <p className="text-2xl font-bold text-gray-900">{data.totals.confirmed || 0}</p>
                <p className="text-xs text-gray-500 mt-1">Confirmed</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
                <p className="text-2xl font-bold text-amber-600">{data.totals.waiting || 0}</p>
                <p className="text-xs text-gray-500 mt-1">Waiting</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
                <p className="text-2xl font-bold text-blue-600">{data.totals.in_session || 0}</p>
                <p className="text-xs text-gray-500 mt-1">In Session</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
                <p className="text-2xl font-bold text-green-600">{data.totals.completed || 0}</p>
                <p className="text-xs text-gray-500 mt-1">Completed</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
                <p className="text-2xl font-bold text-red-600">{data.totals.no_show || 0}</p>
                <p className="text-xs text-gray-500 mt-1">No Show</p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
