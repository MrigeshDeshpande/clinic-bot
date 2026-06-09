'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Clock, XCircle, Loader2, MapPin, Phone, Plus, IndianRupee } from 'lucide-react';
import { parseDateOnly, formatDateShort } from '@/lib/date';
import { fetchCached, invalidateFetchCache } from '@/lib/clientFetchCache';

const SLOT_HEIGHT = 56;
const HOURS = Array.from({ length: 12 }, (_, i) => i + 8);

const TREATMENT_COLORS = {
  'General Dentistry': { bg: 'bg-sky-100 dark:bg-sky-900/30', text: 'text-sky-700 dark:text-sky-300', dot: 'bg-sky-500' },
  'Teeth Cleaning': { bg: 'bg-teal-100 dark:bg-teal-900/30', text: 'text-teal-700 dark:text-teal-300', dot: 'bg-teal-500' },
  'Root Canal': { bg: 'bg-rose-100 dark:bg-rose-900/30', text: 'text-rose-700 dark:text-rose-300', dot: 'bg-rose-500' },
  'Whitening': { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300', dot: 'bg-amber-500' },
  'Implants': { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300', dot: 'bg-purple-500' },
  'Braces': { bg: 'bg-indigo-100 dark:bg-indigo-900/30', text: 'text-indigo-700 dark:text-indigo-300', dot: 'bg-indigo-500' },
  'Crowns': { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-300', dot: 'bg-orange-500' },
  'Pediatric Dentistry': { bg: 'bg-pink-100 dark:bg-pink-900/30', text: 'text-pink-700 dark:text-pink-300', dot: 'bg-pink-500' },
};

function getTreatmentStyle(t) {
  if (!t) return { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', dot: 'bg-blue-500' };
  return TREATMENT_COLORS[t] || { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-600 dark:text-gray-400', dot: 'bg-gray-500' };
}

function getEndTime(time) {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  const end = h * 60 + m + 45;
  return `${String(Math.floor(end / 60) % 24).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
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

function formatCurrency(amount) {
  return `₹${Number(amount || 0).toLocaleString('en-IN')}`;
}

function StatusBadge({ status, arrivalStatus }) {
  if (status === 'completed') return <span className="px-1.5 py-[1px] rounded-full text-[9px] font-medium bg-slate-100 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300">Done</span>;
  if (status === 'no_show') return <span className="px-1.5 py-[1px] rounded-full text-[9px] font-medium bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300">No Show</span>;
  if (arrivalStatus === 'called') return <span className="px-1.5 py-[1px] rounded-full text-[9px] font-medium bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block mr-1 animate-pulse" />In Session</span>;
  if (arrivalStatus === 'arrived') return <span className="px-1.5 py-[1px] rounded-full text-[9px] font-medium bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block mr-1" />Waiting</span>;
  return <span className="px-1.5 py-[1px] rounded-full text-[9px] font-medium bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">Scheduled</span>;
}

function LoadingSkeleton() {
  return (
    <div className="p-6 space-y-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <div className="w-16 h-4 bg-gray-100 dark:bg-gray-800 rounded animate-pulse shrink-0" />
          <div className="flex-1 h-14 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
        </div>
      ))}
    </div>
  );
}

export default function DayTimeline({ selectedDate, onDateSelect, onRefresh, onAppointmentSelect }) {
  const router = useRouter();
  const [viewDate, setViewDate] = useState(() => parseDateOnly(selectedDate) || new Date());
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const [dropTime, setDropTime] = useState(null);
  const containerRef = useRef(null);
  const [dragHint, setDragHint] = useState(false);
  const hintTimer = useRef(null);
  const [hintTarget, setHintTarget] = useState(null);

  function handleAppointmentHover(appt, e) {
    if (appt.status !== 'confirmed') return;
    if (typeof window !== 'undefined' && !localStorage.getItem('dtDragHintShown')) {
      localStorage.setItem('dtDragHintShown', '1');
      const rect = e.currentTarget.getBoundingClientRect();
      setHintTarget({ top: rect.top - 32, left: rect.left + rect.width / 2 });
      setDragHint(true);
      if (hintTimer.current) clearTimeout(hintTimer.current);
      hintTimer.current = setTimeout(() => { setDragHint(false); setHintTarget(null); }, 3000);
    }
  }

  const dateStr = formatISO(viewDate);
  const today = new Date();
  const todayStr = formatISO(today);
  const isToday = isSameDay(viewDate, today);

  // Scroll to current time on mount (today)
  useEffect(() => {
    if (!containerRef.current || !isToday) return;
    const nowMin = today.getHours() * 60 + today.getMinutes();
    const startMin = 8 * 60;
    const scrollTo = ((nowMin - startMin) / 30) * SLOT_HEIGHT - 150;
    if (scrollTo > 0) {
      containerRef.current.scrollTop = Math.max(0, scrollTo);
    }
  }, [isToday]);

  useEffect(() => {
    setViewDate(parseDateOnly(selectedDate) || new Date());
  }, [selectedDate]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const fetchDay = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCached(`/api/dashboard/appointments?date=${dateStr}`);
      setAppointments(data?.appointments || []);
    } catch (e) {
      setError('Failed to load day data');
      console.error('DayTimeline fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [dateStr]);

  useEffect(() => {
    fetchDay();
  }, [fetchDay]);

  function goBack() {
    const prev = addDays(viewDate, -1);
    setViewDate(prev);
    onDateSelect?.(formatISO(prev));
  }

  function goForward() {
    const next = addDays(viewDate, 1);
    setViewDate(next);
    onDateSelect?.(formatISO(next));
  }

  function goToday() {
    setViewDate(new Date());
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
    setDropTime(null);
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const slotIndex = Math.round(y / SLOT_HEIGHT);
    const clampedIndex = Math.max(0, Math.min(slotIndex, ALL_SLOTS.length - 1));
    setDropTime(ALL_SLOTS[clampedIndex]);
  }

  function handleDragLeave() {
    setDropTime(null);
  }

  async function handleDrop(e) {
    e.preventDefault();
    setDraggingId(null);
    setDropTime(null);
    let data;
    try { data = JSON.parse(e.dataTransfer.getData('application/json')); } catch { return; }
    if (!data || !data.id) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const slotIndex = Math.round(y / SLOT_HEIGHT);
    const clampedIndex = Math.max(0, Math.min(slotIndex, ALL_SLOTS.length - 1));
    const time = ALL_SLOTS[clampedIndex];

    if (data.date === dateStr && data.time === time) return;

    try {
      const res = await fetch(`/api/dashboard/appointments/${data.id}/reschedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: dateStr, time, treatment: data.treatment }),
      });
      if (!res.ok) {
        const errData = await res.json();
        setToast(errData.error || 'Failed to reschedule');
        return;
      }
      invalidateFetchCache('/api/dashboard/appointments');
      setToast(`Moved to ${formatDateShort(dateStr)} at ${time}`);
      fetchDay();
      onRefresh?.();
    } catch { setToast('Network error'); }
  }

  function handleSlotClick(time) {
    onDateSelect?.(dateStr);
    router.push(`/dashboard?date=${dateStr}&book=${time}`);
  }

  function handleAppointmentClick(appt) {
    onAppointmentSelect?.(appt);
  }

  function isSlotPast(time) {
    if (!time || !isToday) return false;
    const [h, m] = time.split(':').map(Number);
    return (h * 60 + m + 30) <= (today.getHours() * 60 + today.getMinutes());
  }

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
          <button onClick={goToday} className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${isToday ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
            Today
          </button>
          <button onClick={goForward} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 ml-1">{formatDateShort(dateStr)}</span>
          {isToday && <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded-full">Today</span>}
        </div>
        <button onClick={fetchDay} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 dark:text-gray-500 transition-colors" title="Refresh">
          <Loader2 className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Timeline */}
      {loading ? (
        <LoadingSkeleton />
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-16 text-red-500 dark:text-red-400">
          <XCircle className="w-10 h-10 mb-3" />
          <p className="text-sm font-medium">{error}</p>
          <button onClick={fetchDay} className="mt-3 px-4 py-2 text-xs font-medium bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg border border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors">
            Retry
          </button>
        </div>
      ) : (
        <div ref={containerRef} className="overflow-y-auto max-h-[70vh] scroll-smooth">
          <div className="relative" style={{ minHeight: HOURS.length * SLOT_HEIGHT * 2 }}>
            {/* Time spine */}
            <div className="absolute left-16 top-0 bottom-0 z-10 pointer-events-none border-l border-gray-200 dark:border-gray-700" />

            {/* Hour rows + Bookable click zones */}
            {HOURS.map((h, hi) => {
              const hourLabel = h === 12 ? '12:00 PM' : h < 12 ? `${h}:00 AM` : `${h - 12}:00 PM`;
              const isPastHour = isToday && (h + 1) * 60 <= nowMin;
              return (
                <div key={h} style={{ height: SLOT_HEIGHT * 2 }} className={`relative border-b border-gray-100 dark:border-gray-800 transition-colors ${hi % 2 === 0 ? 'bg-white dark:bg-transparent' : 'bg-gray-50/30 dark:bg-gray-900/10'} ${isPastHour ? '' : 'hover:bg-blue-50/30 dark:hover:bg-blue-900/10'}`}>
                  <span className={`absolute -top-2.5 left-3 text-[11px] font-semibold bg-white dark:bg-gray-900 px-1 z-10 ${isPastHour ? 'text-gray-300 dark:text-gray-600' : 'text-gray-400 dark:text-gray-500'}`}>
                    {hourLabel}
                  </span>
                  {/* Quick-book buttons for each 30-min slot in this hour */}
                  {!isPastHour && (
                    <div className="absolute inset-0 flex">
                      <button onClick={() => handleSlotClick(`${String(h).padStart(2, '0')}:00`)} className="flex-1 opacity-0 hover:opacity-100 transition-opacity duration-150 flex items-center justify-center group cursor-pointer border-r border-dashed border-gray-200 dark:border-gray-700 last:border-r-0" style={{ height: '50%', alignSelf: 'flex-start' }}>
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-gray-400 dark:text-gray-500 group-hover:text-blue-600 dark:group-hover:text-blue-400 group-hover:bg-blue-50 dark:group-hover:bg-blue-900/30 transition-all">
                          <Plus className="w-2.5 h-2.5" /> Book
                        </span>
                      </button>
                      <button onClick={() => handleSlotClick(`${String(h).padStart(2, '0')}:30`)} className="flex-1 opacity-0 hover:opacity-100 transition-opacity duration-150 flex items-center justify-center group cursor-pointer">
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-gray-400 dark:text-gray-500 group-hover:text-blue-600 dark:group-hover:text-blue-400 group-hover:bg-blue-50 dark:group-hover:bg-blue-900/30 transition-all">
                          <Plus className="w-2.5 h-2.5" /> Book
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Current time indicator */}
            {isToday && nowOffset >= 0 && nowOffset < HOURS.length * SLOT_HEIGHT * 2 && (
              <div className="absolute left-0 right-0 z-30 pointer-events-none" style={{ top: nowOffset }}>
                <div className="flex items-center">
                  <span className="text-[10px] font-bold text-red-500 bg-white dark:bg-gray-900 px-1 rounded shadow-sm mr-1">
                    {String(today.getHours()).padStart(2, '0')}:{String(today.getMinutes()).padStart(2, '0')}
                  </span>
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-red-500/50 shadow-lg -ml-1" />
                  <div className="flex-1 h-0.5 bg-red-500 shadow-red-500/30 shadow-sm" />
                </div>
              </div>
            )}

            {/* Drop zone */}
            <div
              className="absolute inset-0"
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {/* Appointment blocks */}
              {(appointments || []).filter(a => a.time).map(appt => {
                const top = timeToOffset(appt.time?.slice(0, 5));
                const isDragging = draggingId === appt.id;
                const past = isSlotPast(appt.time?.slice(0, 5));
                const tStyle = getTreatmentStyle(appt.treatment);
                const isReserved = appt.status === 'completed' || appt.status === 'no_show';
                const paymentTotal = Number(appt.consultation_fee || 0) + Number(appt.treatment_charges || 0) + Number(appt.medicine_charges || 0);
                const paymentDue = paymentTotal - Number(appt.paid_amount || 0);

                return (
                  <div
                    key={appt.id}
                    draggable={appt.status === 'confirmed'}
                    onDragStart={(e) => handleDragStart(e, appt)}
                    onDragEnd={handleDragEnd}
                    onClick={(e) => { e.stopPropagation(); handleAppointmentClick(appt); }}
                    onMouseEnter={(e) => handleAppointmentHover(appt, e)}
                    className={`absolute left-16 right-4 rounded-xl border-2 transition-all duration-150 group overflow-hidden
                      ${isDragging ? 'opacity-40 scale-[0.97] z-40 ring-2 ring-blue-400 ring-offset-2' : 'z-20'}
                      ${appt.status === 'completed'
                        ? 'bg-slate-50 dark:bg-slate-800/30 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800/50'
                        : appt.arrival_status === 'called'
                          ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-900/40'
                          : appt.arrival_status === 'arrived'
                            ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/40'
                            : 'bg-white dark:bg-gray-800 border-blue-200 dark:border-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                      }
                      ${past && !isDragging ? 'opacity-50 grayscale-[20%]' : ''}
                      ${appt.status === 'confirmed' && !isDragging ? 'cursor-grab hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.98] active:cursor-grabbing' : 'cursor-pointer'}
                    `}
                    style={{ top, height: SLOT_HEIGHT }}
                  >
                    {/* Treatment color left accent bar */}
                    <div className={`absolute left-0 top-1 bottom-1 w-1 rounded-full shadow-sm ${tStyle.dot}`} />

                    <div className="flex items-start justify-between gap-2 px-3 py-1.5 pl-[7px]">
                      <div className="min-w-0 flex-1">
                        {/* Treatment name — primary */}
                        <div className="flex items-center gap-1.5">
                          <span className={`text-sm font-bold uppercase tracking-wider leading-tight ${isReserved || past ? 'text-gray-500 dark:text-gray-400' : 'text-gray-800 dark:text-gray-200'}`}>
                            {appt.treatment || 'Appointment'}
                          </span>
                          {appt.is_priority && <span className="text-xs">⭐</span>}
                        </div>
                        {/* Patient name */}
                        <span className={`text-xs font-semibold leading-tight ${isReserved || past ? 'text-gray-500 dark:text-gray-400' : 'text-gray-700 dark:text-gray-300'}`}>
                          {appt.patient_name || 'Patient'}
                        </span>
                        {/* Time + Payment meta row */}
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="flex items-center gap-1 text-[11px] text-gray-400 dark:text-gray-500 font-medium">
                            <Clock className="w-3 h-3" /> {appt.time?.slice(0, 5)} — {getEndTime(appt.time)}
                          </span>
                          {paymentTotal > 0 && appt.payment_status && (
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex items-center gap-0.5 ${
                              appt.payment_status === 'paid' ? 'bg-slate-100 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400' :
                              appt.payment_status === 'partial' ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' :
                              'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300'
                            }`}>
                              <IndianRupee className="w-2.5 h-2.5" />
                              {appt.payment_status === 'paid' ? formatCurrency(paymentTotal) : appt.payment_status === 'partial' ? `${formatCurrency(paymentDue)} due` : formatCurrency(paymentDue)}
                            </span>
                          )}
                        </div>
                        {(appt.location || appt.patient_phone) && (
                          <div className="flex items-center gap-3 mt-0.5">
                            {appt.location && (
                              <span className="flex items-center gap-1 text-[10px] text-gray-400 dark:text-gray-500">
                                <MapPin className="w-2.5 h-2.5" /> {appt.location}
                              </span>
                            )}
                            {appt.patient_phone && (
                              <span className="flex items-center gap-1 text-[10px] text-gray-400 dark:text-gray-500">
                                <Phone className="w-2.5 h-2.5" /> {appt.patient_phone}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <StatusBadge status={appt.status} arrivalStatus={appt.arrival_status} />
                    </div>
                  </div>
                );
              })}

              {/* Drop zone indicator */}
              {dropTime && draggingId && (
                <div
                  className="absolute left-16 right-4 z-30 border-2 border-dashed border-blue-400 dark:border-blue-500 rounded-xl bg-blue-50/70 dark:bg-blue-900/30 pointer-events-none flex items-center justify-center"
                  style={{ top: timeToOffset(dropTime), height: SLOT_HEIGHT }}
                >
                  <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">Drop here</span>
                </div>
              )}
            </div>

            {/* Empty state */}
            {appointments.filter(a => a.time).length === 0 && !loading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <Clock className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" />
                <p className="text-sm font-medium text-gray-400 dark:text-gray-500">No appointments</p>
                <p className="text-xs text-gray-300 dark:text-gray-600 mt-1">Click an empty slot to book</p>
              </div>
            )}
          </div>
        </div>
      )}

      {dragHint && hintTarget && (
        <div className="fixed z-[9999] animate-scale-in pointer-events-none" style={{ top: hintTarget.top, left: hintTarget.left, transform: 'translateX(-50%)' }}>
          <div className="bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-xs font-medium px-3 py-1.5 rounded-lg shadow-xl whitespace-nowrap">
            Drag to reschedule
            <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 dark:border-t-white" />
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[9999] animate-scale-in">
          <div className="flex items-center gap-2.5 px-4 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl shadow-2xl text-sm font-medium">
            {toast.startsWith('Moved') ? <Clock className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0 text-red-400" />}
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}
