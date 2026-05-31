'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function Calendar({ onMonthChange, hideHeader, selectedDate, onDateSelect, dotDates }) {
  const [viewDate, setViewDate] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  const [dots, setDots] = useState({});
  const [loading, setLoading] = useState(false);

  const y = parseInt(viewDate.slice(0, 4), 10);
  const m = parseInt(viewDate.slice(5, 7), 10);
  const daysInMonth = new Date(y, m, 0).getDate();
  const firstDay = new Date(y, m - 1, 1).getDay();

  const fetchDots = useCallback(async (year, month) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard/calendar?year=${year}&month=${month}`);
      const data = await res.json();
      setDots(data.dates || {});
    } catch (e) {
      console.error('Failed to fetch calendar dots', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDots(y, m);
  }, [y, m, fetchDots]);

  function goToMonth(dir) {
    const d = new Date(y, m - 1 + dir, 1);
    const yStr = d.getFullYear();
    const mStr = String(d.getMonth() + 1).padStart(2, '0');
    setViewDate(`${yStr}-${mStr}-01`);
    onMonthChange?.(yStr, d.getMonth() + 1);
  }

  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function isToday(day) {
    const date = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return date === todayStr();
  }

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="w-full bg-white rounded-xl border border-gray-200 shadow-md p-3">
      {!hideHeader && (
        <div className="flex items-center justify-between mb-5">
          <button
            onClick={() => goToMonth(-1)}
            className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all active:scale-90"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <h3 className="text-base font-bold text-gray-900">{monthNames[m - 1]} {y}</h3>
            <button
              onClick={() => setViewDate(todayStr())}
              className="px-2.5 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-all active:scale-95"
            >
              Today
            </button>
          </div>
          <button
            onClick={() => goToMonth(1)}
            className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all active:scale-90"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      )}

      {loading && (
        <div className="flex justify-center mb-3">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-2">
        {dayNames.map(d => (
          <div key={d} className="text-center text-xs font-semibold text-gray-400 py-1">{d}</div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`empty-${i}`} className="aspect-square" />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const dotCount = dotDates && dotDates.length > 0
            ? (dotDates.includes(dateStr) ? 1 : 0)
            : (dots[dateStr] || 0);
          const today = isToday(day);
          const isSelected = selectedDate === dateStr;

          return (
            <button
              key={day}
              onClick={() => onDateSelect?.(dateStr)}
              className={`aspect-square rounded-xl flex flex-col items-center justify-center text-sm font-medium transition-all duration-150 active:scale-90 ${
                isSelected
                  ? 'bg-blue-600 text-white shadow-sm'
                  : today
                  ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-md shadow-blue-200'
                  : dotCount > 0
                  ? 'text-gray-700 hover:bg-blue-50 hover:text-blue-700'
                  : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              <span>{day}</span>
              {dotCount > 0 && (
                <div className="flex gap-0.5 mt-0.5">
                  <div
                    className={`w-1 h-1 rounded-full ${
                      today || isSelected ? 'bg-white/80' : 'bg-blue-400'
                    }`}
                  />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
