'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function Calendar({ onMonthChange, hideHeader, selectedDate, onDateSelect, datesData, dotDates /* kept for backward compat */ }) {
  const [viewDate, setViewDate] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  const [fetchedData, setFetchedData] = useState(null);
  const [loading, setLoading] = useState(false);

  const y = parseInt(viewDate.slice(0, 4), 10);
  const m = parseInt(viewDate.slice(5, 7), 10);
  const daysInMonth = new Date(y, m, 0).getDate();
  const firstDay = new Date(y, m - 1, 1).getDay();
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const fetchData = useCallback(async (year, month) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard/calendar?year=${year}&month=${month}`);
      const data = await res.json();
      setFetchedData(data.dates || {});
    } catch (e) {
      console.error('Failed to fetch calendar data', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(y, m);
  }, [y, m, fetchData]);

  const data = datesData || fetchedData;

  function goToMonth(dir) {
    const d = new Date(y, m - 1 + dir, 1);
    const yStr = d.getFullYear();
    const mStr = String(d.getMonth() + 1).padStart(2, '0');
    setViewDate(`${yStr}-${mStr}-01`);
    onMonthChange?.(yStr, d.getMonth() + 1);
  }

  function isToday(day) {
    const date = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return date === todayStr;
  }

  function isPastDate(day) {
    const date = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return date < todayStr;
  }

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="w-full bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-4 transition-colors duration-200">
      {/* Header */}
      {!hideHeader && (
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => goToMonth(-1)}
            className="p-1.5 rounded-lg text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors active:scale-90"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2.5">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 tracking-tight">{monthNames[m - 1]} {y}</h3>
            <button
              onClick={() => setViewDate(todayStr)}
              className="px-2 py-0.5 text-[11px] font-medium text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300 transition-colors active:scale-95"
            >
              Today
            </button>
          </div>
          <button
            onClick={() => goToMonth(1)}
            className="p-1.5 rounded-lg text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors active:scale-90"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {loading && (
        <div className="flex justify-center mb-2">
          <div className="w-4 h-4 border-2 border-gray-200 dark:border-gray-600 border-t-gray-500 dark:border-t-gray-300 rounded-full animate-spin" />
        </div>
      )}

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-2">
        {dayNames.map(d => (
          <div key={d} className="text-center text-[11px] font-medium text-gray-400 dark:text-gray-500 py-0.5 tracking-wide">{d}</div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7">
        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isSelected = selectedDate === dateStr;
          const dateInfo = data?.[dateStr];
          const isBlocked = dateInfo?.isBlocked;
          const hasBookings = (dateInfo?.count || 0) > 0;
          const allAvailable = !isBlocked && !hasBookings && !isPastDate(day);
          const past = isPastDate(day) && !hasBookings && !isBlocked && !isToday(day);

          let dotColor = null;
          if (isBlocked) dotColor = 'bg-red-400';
          else if (hasBookings) dotColor = 'bg-blue-500';
          else if (allAvailable) dotColor = 'bg-green-400';

          return (
            <button
              key={day}
              onClick={() => onDateSelect?.(dateStr)}
              className={`relative h-10 flex flex-col items-center justify-center text-sm transition-all duration-150 active:scale-90 rounded-lg mx-0.5 ${
                isSelected
                  ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-medium'
                  : isToday(day)
                  ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-medium'
                  : isBlocked
                  ? 'text-red-300 dark:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'
                  : past
                  ? 'text-gray-300 dark:text-gray-600'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              {isBlocked ? (
                <span className="text-xs leading-none">✕</span>
              ) : (
                <span className="leading-none">{day}</span>
              )}
              {/* Status indicator dot */}
              {dotColor && (
                <span className={`absolute top-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${dotColor} ${
                  isSelected || isToday(day) ? 'opacity-60' : ''
                }`} />
              )}
              {/* Booked count badge */}
              {hasBookings && !isSelected && !isToday(day) && !isBlocked && (
                <span className="text-[9px] font-medium text-blue-400 dark:text-blue-300 leading-none mt-0.5">
                  {dateInfo.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 text-[10px] text-gray-400 dark:text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400" /> Open
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Booked
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-red-400" /> Closed
        </span>
      </div>
    </div>
  );
}
