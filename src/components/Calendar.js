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
    <div className="w-full h-full bg-gradient-to-br from-white to-gray-50/80 dark:from-gray-900 dark:to-gray-950/80 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-md transition-shadow duration-300 p-5 flex flex-col">
      {/* Header */}
      {!hideHeader && (
        <div className="flex items-center justify-between mb-5">
          <button
            onClick={() => goToMonth(-1)}
            className="p-2 rounded-xl text-gray-300 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all active:scale-90"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-3">
            <h3 className="text-base font-bold text-gray-800 dark:text-gray-200 tracking-tight">
              {monthNames[m - 1]} <span className="font-normal text-gray-400 dark:text-gray-500">{y}</span>
            </h3>
            <button
              onClick={() => setViewDate(todayStr)}
              className="px-2.5 py-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 hover:text-blue-700 dark:hover:text-blue-300 transition-all active:scale-95 ring-1 ring-blue-200/50 dark:ring-blue-800/50"
            >
              Today
            </button>
          </div>
          <button
            onClick={() => goToMonth(1)}
            className="p-2 rounded-xl text-gray-300 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all active:scale-90"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Loading shimmer */}
      {loading && (
        <div className="flex justify-center mb-3">
          <div className="flex items-center gap-2 text-[11px] text-gray-400 dark:text-gray-500">
            <div className="w-3 h-3 border-2 border-gray-200 dark:border-gray-600 border-t-blue-500 dark:border-t-blue-400 rounded-full animate-spin" />
            Loading...
          </div>
        </div>
      )}

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-2.5 gap-0.5">
        {dayNames.map((d, i) => (
          <div
            key={d}
            className={`text-center text-[11px] font-semibold py-1 tracking-wider uppercase ${
              i === 0 || i === 6
                ? 'text-red-400 dark:text-red-500/70'
                : 'text-gray-400 dark:text-gray-500'
            }`}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 gap-0.5">
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
          else if (allAvailable) dotColor = 'bg-emerald-400';

          return (
            <button
              key={day}
              onClick={() => onDateSelect?.(dateStr)}
              className={`relative h-12 flex flex-col items-center justify-center text-sm transition-all duration-150 rounded-xl mx-0.5 select-none ${
                isSelected
                  ? 'bg-gradient-to-br from-gray-900 to-gray-800 dark:from-white dark:to-gray-100 text-white dark:text-gray-900 font-semibold shadow-md dark:shadow-white/10'
                  : isToday(day)
                  ? 'bg-gradient-to-br from-blue-50 to-indigo-50/80 dark:from-blue-900/30 dark:to-indigo-900/20 text-gray-900 dark:text-gray-100 font-semibold ring-2 ring-blue-200 dark:ring-blue-700/60'
                  : isBlocked
                  ? 'text-red-300 dark:text-red-600/70 hover:bg-red-50 dark:hover:bg-red-900/15 cursor-pointer'
                  : past
                  ? 'text-gray-300 dark:text-gray-600 cursor-default'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/60 hover:text-gray-900 dark:hover:text-gray-200 hover:shadow-sm cursor-pointer'
              }`}
            >
              {/* Day number */}
              {isBlocked ? (
                <span className="text-xs leading-none opacity-70">✕</span>
              ) : (
                <span className="leading-none">{day}</span>
              )}

              {/* Status indicators row */}
              <div className="flex items-center gap-1 mt-1.5">
                {/* Color dot */}
                {dotColor && (
                  <span className={`w-1.5 h-1.5 rounded-full ${dotColor} ${
                    isSelected || isToday(day) ? 'opacity-80' : ''
                  } ${isToday(day) && hasBookings ? 'animate-pulse' : ''}`} />
                )}
                {/* Booking count */}
                {hasBookings && !isBlocked && (
                  <span className={`text-[9px] font-bold leading-none ${
                    isSelected
                      ? 'text-white/80'
                      : isToday(day)
                      ? 'text-blue-600 dark:text-blue-300'
                      : 'text-blue-500 dark:text-blue-400'
                  }`}>
                    {dateInfo.count}
                  </span>
                )}
                {/* Available indicator */}
                {allAvailable && !dotColor && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-300/50" />
                )}
              </div>

              {/* Today subtle ring */}
              {isToday(day) && !isSelected && (
                <span className="absolute inset-0 rounded-xl ring-2 ring-blue-200 dark:ring-blue-700/50 animate-dot-pulse" />
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-5 mt-auto pt-4 border-t border-gray-100 dark:border-gray-800/80">
        <span className="flex items-center gap-2 text-[11px] font-medium text-gray-400 dark:text-gray-500">
          <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.4)]" />
          Open
        </span>
        <span className="flex items-center gap-2 text-[11px] font-medium text-gray-400 dark:text-gray-500">
          <span className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_4px_rgba(59,130,246,0.4)]" />
          Booked
        </span>
        <span className="flex items-center gap-2 text-[11px] font-medium text-gray-400 dark:text-gray-500">
          <span className="w-2 h-2 rounded-full bg-red-400 shadow-[0_0_4px_rgba(248,113,113,0.4)]" />
          Closed
        </span>
      </div>
    </div>
  );
}
