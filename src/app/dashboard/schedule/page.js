'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, XCircle, Calendar as CalendarIcon } from 'lucide-react';

export default function SchedulePage() {
  const [viewDate, setViewDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [blockedDates, setBlockedDates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(null);
  const [blockReason, setBlockReason] = useState('');
  const [saving, setSaving] = useState(false);

  const y = parseInt(viewDate.slice(0, 4), 10);
  const m = parseInt(viewDate.slice(5, 7), 10);
  const daysInMonth = new Date(y, m, 0).getDate();
  const firstDay = new Date(y, m - 1, 1).getDay();
  const todayStr = new Date().toISOString().slice(0, 10);

  const fetchBlocked = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/schedule');
      const data = await res.json();
      setBlockedDates(data.blockedDates || []);
    } catch (e) {
      console.error('Failed to fetch blocked dates', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchBlocked(); }, [fetchBlocked]);

  const blockedSet = new Set(blockedDates.map(b => b.date));
  const blockedReasons = {};
  blockedDates.forEach(b => { blockedReasons[b.date] = b.reason; });

  function goToMonth(dir) {
    const d = new Date(y, m - 1 + dir, 1);
    setViewDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  async function handleBlock(e) {
    e.preventDefault();
    if (!selectedDate) return;
    setSaving(true);
    try {
      await fetch('/api/dashboard/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate, reason: blockReason || null }),
      });
      setBlockReason('');
      setSelectedDate(null);
      await fetchBlocked();
    } catch (err) {
      console.error('Failed to block date', err);
    } finally {
      setSaving(false);
    }
  }

  async function handleUnblock(date) {
    try {
      await fetch(`/api/dashboard/schedule?date=${date}`, { method: 'DELETE' });
      setSelectedDate(null);
      await fetchBlocked();
    } catch (err) {
      console.error('Failed to unblock date', err);
    }
  }

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="animate-fade-in">
      <div className="flex items-center gap-4 mb-6">
        <div className="p-3 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg shadow-violet-200 dark:shadow-violet-900/50">
          <CalendarIcon className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">Schedule</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Manage blocked dates and clinic holidays</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-4">
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => goToMonth(-1)} className="p-1.5 rounded-lg text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">{monthNames[m - 1]} {y}</h3>
            <button onClick={() => goToMonth(1)} className="p-1.5 rounded-lg text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 mb-2">
            {dayNames.map(d => (
              <div key={d} className="text-center text-[11px] font-medium text-gray-400 dark:text-gray-500 py-0.5">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {Array.from({ length: firstDay }).map((_, i) => <div key={`e-${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const isBlocked = blockedSet.has(dateStr);
              const isSelected = selectedDate === dateStr;
              const isToday = dateStr === todayStr;

              return (
                <button
                  key={day}
                  onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                  className={`h-9 flex flex-col items-center justify-center text-xs transition-all rounded-lg mx-0.5 ${
                    isSelected
                      ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-medium'
                      : isBlocked
                      ? 'bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40'
                      : isToday
                      ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-medium'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  {isBlocked ? <span className="text-xs">✕</span> : <span>{day}</span>}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-center gap-4 mt-3 pt-2 border-t border-gray-100 dark:border-gray-800 text-[10px] text-gray-400 dark:text-gray-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400" /> Blocked</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-200 dark:bg-gray-600" /> Available</span>
          </div>
        </div>

        {/* Block/Unblock Panel */}
        <div className="lg:col-span-2 space-y-4">
          {selectedDate ? (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-5">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
                {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </h3>

              {blockedSet.has(selectedDate) ? (
                <div className="mt-4">
                  <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 border border-red-200 dark:border-red-800 mb-4">
                    <div className="flex items-center gap-2">
                      <XCircle className="w-4 h-4 text-red-500 dark:text-red-400" />
                      <span className="text-sm font-medium text-red-700 dark:text-red-400">Date is blocked</span>
                    </div>
                    {blockedReasons[selectedDate] && (
                      <p className="text-sm text-red-600 dark:text-red-400 mt-1 ml-6">Reason: {blockedReasons[selectedDate]}</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleUnblock(selectedDate)}
                    className="px-5 py-2.5 bg-white dark:bg-gray-800 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm font-medium rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                  >
                    Unblock this date
                  </button>
                </div>
              ) : (
                <form onSubmit={handleBlock} className="mt-4 space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Reason (optional)</label>
                    <input
                      type="text"
                      value={blockReason}
                      onChange={e => setBlockReason(e.target.value)}
                      placeholder="e.g. Holiday, Personal leave, Maintenance"
                      className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 dark:focus:ring-gray-600 focus:border-gray-300 dark:focus:border-gray-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 transition-colors"
                    />
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="submit"
                      disabled={saving}
                      className="px-5 py-2.5 bg-red-600 text-white text-sm font-medium rounded-xl hover:bg-red-700 transition-all disabled:opacity-50 flex items-center gap-2"
                    >
                      {saving ? 'Blocking...' : 'Block this date'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setSelectedDate(null); setBlockReason(''); }}
                      className="px-5 py-2.5 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-sm font-medium rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-8 text-center">
              <CalendarIcon className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-gray-700 dark:text-gray-300 mb-1">Select a date</h3>
              <p className="text-sm text-gray-400 dark:text-gray-500">Click on a date in the calendar to block or unblock it.</p>
            </div>
          )}

          {/* Blocked Dates List */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Blocked Dates</h3>
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">{blockedDates.length}</span>
            </div>
            {blockedDates.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-6">No blocked dates. All dates are available.</p>
            ) : (
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {blockedDates.map(b => (
                  <div key={b.date} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {new Date(b.date + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                      {b.reason && <span className="text-xs text-gray-400 dark:text-gray-500">— {b.reason}</span>}
                    </div>
                    <button
                      onClick={() => handleUnblock(b.date)}
                      className="text-xs text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                    >
                      Unblock
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
