'use client';

import { useState, useMemo } from 'react';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export default function Calendar({ selectedDate, onDateSelect, dotDates = [] }) {
  const today = new Date().toISOString().slice(0, 10);
  const [viewDate, setViewDate] = useState(() => selectedDate || today);
  const dotSet = useMemo(() => new Set(dotDates), [dotDates]);

  const year = new Date(viewDate).getFullYear();
  const month = new Date(viewDate).getMonth();

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();

  function prev() { setViewDate(new Date(year, month - 1, 1).toISOString().slice(0, 7) + '-01'); }
  function next() { setViewDate(new Date(year, month + 1, 1).toISOString().slice(0, 7) + '-01'); }

  const cells = [];
  for (let i = firstDay - 1; i >= 0; i--) cells.push({ day: daysInPrev - i, other: true });
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ day: d, date: dateStr });
  }
  const remaining = 7 - (cells.length % 7 || 7);
  for (let d = 1; d <= remaining; d++) cells.push({ day: d, other: true });

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 select-none">
      <div className="flex items-center justify-between mb-3">
        <button onClick={prev} className="p-1 hover:bg-gray-100 rounded-lg transition text-gray-500">&larr;</button>
        <span className="text-sm font-semibold text-gray-800">{MONTHS[month]} {year}</span>
        <button onClick={next} className="p-1 hover:bg-gray-100 rounded-lg transition text-gray-500">&rarr;</button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-xs font-medium text-gray-400 mb-1">
        {WEEKDAYS.map(d => <div key={d} className="py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((cell, i) => {
          if (cell.other) return <div key={i} className="py-1.5 text-xs text-gray-200" />;
          const isSelected = cell.date === selectedDate;
          const isToday = cell.date === today;
          const hasDot = dotSet.has(cell.date);
          return (
            <button
              key={cell.date}
              onClick={() => onDateSelect(cell.date)}
              className={`relative py-1.5 text-xs rounded-lg transition ${isSelected ? 'bg-blue-600 text-white font-semibold' : isToday ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-700 hover:bg-gray-100'}`}
            >
              {cell.day}
              {hasDot && !isSelected && <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-blue-500 rounded-full" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
