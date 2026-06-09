'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, CalendarDays, Clock, XCircle, Plus, Loader2 } from 'lucide-react';
import { parseDateOnly, formatDateShort } from '@/lib/date';
import { fetchCached, invalidateFetchCache } from '@/lib/clientFetchCache';

const SLOT_HEIGHT = 56;
const HOURS = Array.from({ length: 12 }, (_, i) => i + 8);
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const TREATMENT_COLORS = {
  'General Dentistry': { bg: 'bg-sky-100 dark:bg-sky-900/40', text: 'text-sky-700 dark:text-sky-300', dot: 'bg-sky-500' },
  'Teeth Cleaning': { bg: 'bg-teal-100 dark:bg-teal-900/40', text: 'text-teal-700 dark:text-teal-300', dot: 'bg-teal-500' },
  'Root Canal': { bg: 'bg-rose-100 dark:bg-rose-900/40', text: 'text-rose-700 dark:text-rose-300', dot: 'bg-rose-500' },
  'Whitening': { bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-700 dark:text-amber-300', dot: 'bg-amber-500' },
  'Implants': { bg: 'bg-purple-100 dark:bg-purple-900/40', text: 'text-purple-700 dark:text-purple-300', dot: 'bg-purple-500' },
  'Braces': { bg: 'bg-indigo-100 dark:bg-indigo-900/40', text: 'text-indigo-700 dark:text-indigo-300', dot: 'bg-indigo-500' },
  'Crowns': { bg: 'bg-orange-100 dark:bg-orange-900/40', text: 'text-orange-700 dark:text-orange-300', dot: 'bg-orange-500' },
  'Pediatric Dentistry': { bg: 'bg-pink-100 dark:bg-pink-900/40', text: 'text-pink-700 dark:text-pink-300', dot: 'bg-pink-500' },
};

function getEndTime(time) {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  const end = h * 60 + m + 45;
  return `${String(Math.floor(end / 60) % 24).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
}

function getTreatmentStyle(t) {
  if (!t) return { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', dot: 'bg-blue-500' };
  return TREATMENT_COLORS[t] || { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-600 dark:text-gray-400', dot: 'bg-gray-500' };
}

function popoverDateFormat(dateStr) {
  const d = parseDateOnly(dateStr);
  return d?.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) || dateStr;
}

function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  date.setDate(date.getDate() - day + (day === 0 ? -6 : 1));
  return date;
}

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function formatISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function getSlotTimes() {
  const slots = [];
  for (const h of HOURS) {
    slots.push(`${String(h).padStart(2, '0')}:00`);
    slots.push(`${String(h).padStart(2, '0')}:30`);
  }
  return slots;
}

const ALL_SLOTS = getSlotTimes();

function timeToOffset(t) {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return 0;
  return ((h - 8) * 60 + m) / 30 * SLOT_HEIGHT;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-2 p-6">
      <div className="flex gap-4">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex-1 space-y-2">
            <div className="h-8 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
            <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
            <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
            <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-2/3 animate-pulse" />
            <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-1/2 animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function WeekView({ selectedDate, onDateSelect, onRefresh, onAppointmentSelect }) {
  const router = useRouter();
  const [weekStart, setWeekStart] = useState(() => getMonday(parseDateOnly(selectedDate) || new Date()));
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);
  const [dropTime, setDropTime] = useState(null);
  const containerRef = useRef(null);
  const dragOverDayRef = useRef(null);
  const dragOverTimeRef = useRef(null);
  const [dragHint, setDragHint] = useState(false);
  const hintTimer = useRef(null);
  const [hintTarget, setHintTarget] = useState(null);

  function handleAppointmentHover(appt, e) {
    if (appt.status !== 'confirmed') return;
    if (typeof window !== 'undefined' && !localStorage.getItem('wkDragHintShown')) {
      localStorage.setItem('wkDragHintShown', '1');
      const rect = e.currentTarget.getBoundingClientRect();
      setHintTarget({ top: rect.top - 32, left: rect.left + rect.width / 2 });
      setDragHint(true);
      if (hintTimer.current) clearTimeout(hintTimer.current);
      hintTimer.current = setTimeout(() => { setDragHint(false); setHintTarget(null); }, 3000);
    }
  }

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const fromStr = formatISO(days[0]);
  const toStr = formatISO(days[6]);
  const today = new Date();
  const todayStr = formatISO(today);
  const isThisWeek = days.some(d => isSameDay(d, today));

  // Scroll to current time on mount (today)
  useEffect(() => {
    if (!containerRef.current || !isSameDay(days.find(d => isSameDay(d, today)) || today, today)) return;
    const nowMin = today.getHours() * 60 + today.getMinutes();
    const startMin = 8 * 60;
    const scrollTo = ((nowMin - startMin) / 30) * SLOT_HEIGHT - 200;
    if (scrollTo > 0) {
      containerRef.current.scrollTop = Math.max(0, scrollTo);
    }
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const fetchWeek = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCached(`/api/dashboard/appointments?from=${fromStr}&to=${toStr}`);
      setAppointments(data?.appointments || []);
    } catch (e) {
      setError('Failed to load week data');
      console.error('WeekView fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [fromStr, toStr]);

  useEffect(() => {
    fetchWeek();
  }, [fetchWeek]);

  function goBack() {
    setWeekStart(prev => addDays(prev, -7));
  }

  function goForward() {
    setWeekStart(prev => addDays(prev, 7));
  }

  function goToday() {
    const monday = getMonday(new Date());
    setWeekStart(monday);
    onDateSelect?.(todayStr);
  }

  // ─── Drag & Drop ───
  function handleDragStart(e, appt) {
    setDraggingId(appt.id);
    e.dataTransfer.setData('application/json', JSON.stringify({
      id: appt.id, date: appt.date, time: appt.time, treatment: appt.treatment,
    }));
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragEnd() {
    setDraggingId(null);
    setDragOverCol(null);
    setDropTime(null);
    dragOverDayRef.current = null;
    dragOverTimeRef.current = null;
  }

  function handleDragOver(e, dayDateStr) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const slotIndex = Math.round(y / SLOT_HEIGHT);
    const clampedIndex = Math.max(0, Math.min(slotIndex, ALL_SLOTS.length - 1));
    const time = ALL_SLOTS[clampedIndex];
    setDragOverCol(dayDateStr);
    setDropTime(time);
    dragOverDayRef.current = dayDateStr;
    dragOverTimeRef.current = time;
  }

  function handleDragLeave() {
    setDropTime(null);
  }

  async function handleDrop(e, dayDateStr) {
    e.preventDefault();
    setDraggingId(null);
    setDragOverCol(null);
    setDropTime(null);
    let data;
    try {
      data = JSON.parse(e.dataTransfer.getData('application/json'));
    } catch { return; }
    if (!data || !data.id) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const slotIndex = Math.round(y / SLOT_HEIGHT);
    const clampedIndex = Math.max(0, Math.min(slotIndex, ALL_SLOTS.length - 1));
    const time = ALL_SLOTS[clampedIndex];

    if (data.date === dayDateStr && data.time === time) return;

    try {
      const res = await fetch(`/api/dashboard/appointments/${data.id}/reschedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: dayDateStr, time, treatment: data.treatment }),
      });
      if (!res.ok) {
        const errData = await res.json();
        setToast(errData.error || 'Failed to reschedule');
        return;
      }
      invalidateFetchCache('/api/dashboard/appointments');
      setToast(`Moved to ${popoverDateFormat(dayDateStr)} at ${time}`);
      fetchWeek();
      onRefresh?.();
    } catch { setToast('Network error'); }
  }

  function handleSlotClick(dayDateStr, time) {
    onDateSelect?.(dayDateStr);
    router.push(`/dashboard?date=${dayDateStr}&book=${time}`);
  }

  function handleAppointmentClick(appt) {
    onAppointmentSelect?.(appt);
  }

  const apptsByDay = {};
  for (const a of appointments) {
    const d = a.date?.slice(0, 10);
    if (!d || !a.time) continue;
    if (!apptsByDay[d]) apptsByDay[d] = [];
    apptsByDay[d].push(a);
  }

  function isSlotPast(dayDateStr, time) {
    if (!time) return false;
    const d = parseDateOnly(dayDateStr);
    if (!d) return false;
    if (!isSameDay(d, today)) return false;
    const [h, m] = time.split(':').map(Number);
    const slotEnd = h * 60 + m + 30;
    const now = today.getHours() * 60 + today.getMinutes();
    return slotEnd <= now;
  }

  function isSlotCurrent(dayDateStr, time) {
    if (!time) return false;
    const d = parseDateOnly(dayDateStr);
    if (!d) return false;
    if (!isSameDay(d, today)) return false;
    const [h, m] = time.split(':').map(Number);
    const slotStart = h * 60 + m;
    const slotEnd = slotStart + 30;
    const now = today.getHours() * 60 + today.getMinutes();
    return now >= slotStart && now < slotEnd;
  }

  function getStatusColor(status, arrivalStatus) {
    if (status === 'completed') return 'bg-slate-500';
    if (status === 'no_show') return 'bg-rose-400';
    if (arrivalStatus === 'called') return 'bg-emerald-500';
    if (arrivalStatus === 'arrived') return 'bg-amber-400';
    return 'bg-blue-400';
  }

  function getBlockColor(appt) {
    if (appt.status === 'completed') return 'bg-slate-50 dark:bg-slate-800/30 hover:bg-slate-100 dark:hover:bg-slate-800/50';
    if (appt.status === 'no_show') return 'bg-rose-50 dark:bg-rose-900/20 hover:bg-rose-100 dark:hover:bg-rose-900/40';
    if (appt.arrival_status === 'called') return 'bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/40';
    if (appt.arrival_status === 'arrived') return 'bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/40';
    return 'bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40';
  }

  const weekLabel = `${popoverDateFormat(formatISO(days[0]))} – ${popoverDateFormat(formatISO(days[6]))}`;

  // For now line
  const nowMin = today.getHours() * 60 + today.getMinutes();
  const startMin = 8 * 60;
  const nowOffset = ((nowMin - startMin) / 30) * SLOT_HEIGHT;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-1.5">
          <button onClick={goBack} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={goToday} className="px-2.5 py-1 text-xs font-medium rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
            Today
          </button>
          <button onClick={goForward} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 ml-1">{weekLabel}</span>
        </div>
        <button onClick={fetchWeek} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 dark:text-gray-500 transition-colors" title="Refresh">
          <Loader2 className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading ? (
        <LoadingSkeleton />
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-16 text-red-500 dark:text-red-400">
          <XCircle className="w-10 h-10 mb-3" />
          <p className="text-sm font-medium">{error}</p>
          <button onClick={fetchWeek} className="mt-3 px-4 py-2 text-xs font-medium bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg border border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors">
            Retry
          </button>
        </div>
      ) : (
        <div ref={containerRef} className="overflow-x-auto overflow-y-auto max-h-[75vh] scroll-smooth">
          <div className="flex min-w-[700px]">
            {/* Time labels column */}
            <div className="relative shrink-0 w-14 bg-white dark:bg-gray-900 border-r border-gray-100 dark:border-gray-800">
              <div className="h-10 border-b border-gray-100 dark:border-gray-800" />
              {HOURS.map(h => (
                  <div key={h} style={{ height: SLOT_HEIGHT * 2 }} className="relative border-b border-gray-100 dark:border-gray-800">
                  <span className="absolute top-0.5 right-2 text-[10px] font-semibold text-gray-400 dark:text-gray-500">
                    {h === 12 ? '12PM' : h < 12 ? `${h}AM` : `${h - 12}PM`}
                  </span>
                </div>
              ))}
              {/* Current time label in gutter */}
              {isThisWeek && nowOffset >= 0 && nowOffset < HOURS.length * SLOT_HEIGHT * 2 && (
                <div className="absolute right-0 z-20 pointer-events-none" style={{ top: nowOffset - 7 }}>
                  <span className="text-[9px] font-bold text-red-500 bg-white dark:bg-gray-900 px-0.5 whitespace-nowrap shadow-sm">
                    {String(today.getHours()).padStart(2, '0')}:{String(today.getMinutes()).padStart(2, '0')}
                  </span>
                </div>
              )}
            </div>

            {/* Day columns with spine */}
            <div className="flex-1 min-w-0 border-l border-gray-200 dark:border-gray-700">
              <div className="flex">
                {days.map((day, idx) => {
              const dayStr = formatISO(day);
              const dayAppts = apptsByDay[dayStr] || [];
              const dayOfWeek = day.getDay();
              const isToday = isSameDay(day, today);
              const isPastDay = day < new Date(new Date().toDateString());
              const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
              const isDragOver = dragOverCol === dayStr;

              return (
                <div key={dayStr} className={`flex-1 min-w-0 border-r border-gray-100 dark:border-gray-800 last:border-r-0 transition-colors duration-200 group/day ${isWeekend ? 'bg-gray-50/40 dark:bg-gray-800/20' : ''} ${isDragOver ? 'bg-blue-50/60 dark:bg-blue-900/20' : ''}`}>
                  {/* Day header */}
                  <div className={`h-10 flex flex-col items-center justify-center border-b border-gray-100 dark:border-gray-800 sticky top-0 z-10 transition-colors ${isToday ? 'bg-blue-50 dark:bg-blue-900/30' : isWeekend ? 'bg-gray-50/80 dark:bg-gray-800/40' : 'bg-white dark:bg-gray-900'}`}>
                    <span className={`text-[10px] font-bold uppercase leading-tight tracking-wider ${isToday ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`}>
                      {DAY_NAMES[dayOfWeek]}
                    </span>
                    <span className={`flex items-center gap-1 text-xs font-bold leading-tight -mt-0.5 ${isToday ? 'text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'}`}>
                      {day.getDate()}
                      {dayAppts.length > 0 && (
                        <span className={`text-[9px] font-semibold px-1 rounded-full ${isToday ? 'bg-blue-200 dark:bg-blue-800 text-blue-700 dark:text-blue-300' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
                          {dayAppts.length}
                        </span>
                      )}
                    </span>
                  </div>

                  {/* Time slots container */}
                  <div
                    className="relative"
                    style={{ height: HOURS.length * SLOT_HEIGHT * 2 }}
                    onDragOver={(e) => handleDragOver(e, dayStr)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, dayStr)}
                  >
                    {/* Alternating row backgrounds */}
                    {ALL_SLOTS.map((si) => (
                      <div
                        key={`row-${si}`}
                        className={`absolute left-0 right-0 pointer-events-none ${si % 2 === 0 ? 'bg-white dark:bg-transparent' : 'bg-gray-50/30 dark:bg-gray-900/10'}`}
                        style={{ top: si * SLOT_HEIGHT, height: SLOT_HEIGHT }}
                      />
                    ))}

                    {/* Current time indicator (today only) */}
              {isToday && nowOffset >= 0 && nowOffset < HOURS.length * SLOT_HEIGHT * 2 && (
                      <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: nowOffset }}>
                        <div className="flex items-center">
                          <span className="text-[9px] font-bold text-red-500 bg-white dark:bg-gray-900 px-0.5 rounded shadow-sm mr-1">
                            {String(today.getHours()).padStart(2, '0')}:{String(today.getMinutes()).padStart(2, '0')}
                          </span>
                          <div className="w-2 h-2 rounded-full bg-red-500 shadow-red-500/50 shadow-lg -ml-1" />
                          <div className="flex-1 h-0.5 bg-red-500 shadow-red-500/30 shadow-sm" />
                        </div>
                      </div>
                    )}

                    {/* Appointment blocks */}
                    {(dayAppts || []).filter(a => a.time).map(appt => {
                      const top = timeToOffset(appt.time?.slice(0, 5));
                      const isDragging = draggingId === appt.id;
                      const past = isPastDay || isSlotPast(dayStr, appt.time?.slice(0, 5));
                      const tStyle = getTreatmentStyle(appt.treatment);
                      const statusDot = getStatusColor(appt.status, appt.arrival_status);
                      return (
                        <div
                          key={appt.id}
                          draggable={appt.status === 'confirmed'}
                          onDragStart={(e) => handleDragStart(e, appt)}
                          onDragEnd={handleDragEnd}
                          onClick={(e) => { e.stopPropagation(); handleAppointmentClick(appt); }}
                          onMouseEnter={(e) => handleAppointmentHover(appt, e)}
                          className={`absolute left-0.5 right-0.5 rounded-md border border-gray-200 dark:border-gray-700 transition-all duration-150 overflow-hidden group
                            ${isDragging ? 'opacity-40 scale-95 z-30 ring-2 ring-blue-400 ring-offset-1' : 'z-10'}
                            ${getBlockColor(appt)}
                            ${past && !isDragging ? 'opacity-50 grayscale-[30%]' : ''}
                            ${appt.status === 'confirmed' && !isDragging ? 'cursor-grab hover:shadow-md hover:scale-[1.005] hover:z-20 active:scale-[0.97] active:cursor-grabbing' : 'cursor-pointer'}
                          `}
                          style={{ top, height: SLOT_HEIGHT }}
                        >
                          {/* Treatment color left accent bar */}
                          <div className={`absolute left-0 top-1 bottom-1 w-1 rounded-full shadow-sm ${tStyle.dot}`} />

                          <div className="flex flex-col justify-center h-full px-2 pl-[7px] pr-4">
                            {appt.treatment ? (
                              <span className="text-xs font-bold uppercase tracking-wide leading-tight text-gray-800 dark:text-gray-200 truncate">
                                {appt.treatment}
                              </span>
                            ) : (
                              <span className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 truncate">
                                No Treatment
                              </span>
                            )}
                            <span className="truncate">
                              <span className={`text-xs font-semibold leading-tight ${past ? 'text-gray-500 dark:text-gray-400' : 'text-gray-700 dark:text-gray-300'}`}>
                                {appt.patient_name || 'Patient'}
                              </span>
                              <span className="ml-1 text-[10px] text-gray-500 dark:text-gray-400 leading-tight">
                                · {appt.time?.slice(0, 5)}–{getEndTime(appt.time)}
                              </span>
                            </span>
                          </div>

                          <span className={`absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full ${statusDot}`} />
                        </div>
                      );
                    })}

                    {/* Drop zone indicator */}
                    {isDragOver && dropTime && (
                      <div
                        className="absolute left-1 right-1 z-20 border-2 border-dashed border-blue-400 dark:border-blue-500 rounded-md bg-blue-50/70 dark:bg-blue-900/30 pointer-events-none"
                        style={{ top: timeToOffset(dropTime), height: SLOT_HEIGHT }}
                      >
                        <span className="text-[9px] font-semibold text-blue-600 dark:text-blue-400 px-1">Drop here</span>
                      </div>
                    )}

                    {/* Empty slot click zones */}
                    {ALL_SLOTS.map((slotTime, si) => {
                      const booked = dayAppts.some(a => a.time?.slice(0, 5) === slotTime && a.status === 'confirmed');
                      if (booked) return null;
                      const past = isPastDay || isSlotPast(dayStr, slotTime);
                      if (past) return null;
                      return (
                        <button
                          key={`book-${si}`}
                          onClick={() => handleSlotClick(dayStr, slotTime)}
                          className="absolute left-0 right-0 z-5 cursor-pointer transition-colors duration-150 group-hover/day:bg-blue-50/20 dark:group-hover/day:bg-blue-900/10"
                          style={{ top: si * SLOT_HEIGHT, height: SLOT_HEIGHT }}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Toast */}
      {dragHint && hintTarget && (
        <div className="fixed z-[9999] animate-scale-in pointer-events-none" style={{ top: hintTarget.top, left: hintTarget.left, transform: 'translateX(-50%)' }}>
          <div className="bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-xs font-medium px-3 py-1.5 rounded-lg shadow-xl whitespace-nowrap">
            Drag to reschedule
            <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 dark:border-t-white" />
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-[9999] animate-scale-in">
          <div className="flex items-center gap-2.5 px-4 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl shadow-2xl text-sm font-medium">
            {toast.includes('Moved') ? <CalendarDays className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0 text-red-400" />}
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}
