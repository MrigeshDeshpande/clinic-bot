'use client';

import { useState, useEffect, useContext, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DollarSign, CalendarDays, Clock, XCircle, Plus, Users, LayoutGrid, Columns3, ChevronUp, ChevronDown, Search, CheckCircle2, X } from 'lucide-react';
import Calendar from '@/components/Calendar';
import WeekView from '@/components/WeekView';
import DayTimeline from '@/components/DayTimeline';
import AppointmentDetailsModal from '@/components/AppointmentDetailsModal';
import QuickCheckoutModal from '@/components/QuickCheckoutModal';
import RapidWalkInModal from '@/components/RapidWalkInModal';
import { DateContext, ToastContext } from './layout';
import { TREATMENT_NAMES } from '@/lib/treatments';
import { parseDateOnly, formatDateLong, formatDateShort } from '@/lib/date';
import { fetchCached, invalidateFetchCache } from '@/lib/clientFetchCache';

function StatusBadge({ status, arrivalStatus }) {
  if (status === 'completed') return <span className="px-3 py-1 rounded-full text-sm font-medium bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800">Completed</span>;
  if (status === 'no_show') return <span className="px-3 py-1 rounded-full text-sm font-medium bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800">No Show</span>;
  if (arrivalStatus === 'called') return <span className="px-3 py-1 rounded-full text-sm font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800">In Session</span>;
  if (arrivalStatus === 'arrived') return <span className="px-3 py-1 rounded-full text-sm font-medium bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">Waiting</span>;
  return <span className="px-3 py-1 rounded-full text-sm font-medium bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700">Scheduled</span>;
}

const FINANCIAL_CARDS = ['revenue', 'outstanding'];

const COLOR_MAP = {
  total: { text: 'text-gray-900 dark:text-gray-100', icon: 'text-gray-400 dark:text-gray-500', bg: 'bg-gray-50 dark:bg-gray-800', ring: 'ring-gray-100 dark:ring-gray-700' },
  waiting: { text: 'text-amber-600 dark:text-amber-400', icon: 'text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30', ring: 'ring-amber-100 dark:ring-amber-800' },
  in_session: { text: 'text-blue-600 dark:text-blue-400', icon: 'text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30', ring: 'ring-blue-100 dark:ring-blue-800' },
  completed: { text: 'text-green-600 dark:text-green-400', icon: 'text-green-400', bg: 'bg-green-50 dark:bg-green-900/30', ring: 'ring-green-100 dark:ring-green-800' },
  revenue: { text: 'text-emerald-700 dark:text-emerald-400', icon: 'text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30', ring: 'ring-emerald-100 dark:ring-emerald-800' },
};

const CARD_STYLE_MAP = {
  total: {
    hoverBg: 'hover:bg-gray-500/[0.02] dark:hover:bg-gray-400/[0.01]',
    hoverBorder: 'hover:border-gray-300 dark:hover:border-gray-700',
    hoverGlow: 'hover:shadow-lg hover:shadow-gray-200/20 dark:hover:shadow-gray-950/20',
    accentBar: 'bg-gray-400 dark:bg-gray-600',
    accentText: 'text-gray-500 dark:text-gray-400',
    iconColor: 'text-gray-400 dark:text-gray-500'
  },
  waiting: {
    hoverBg: 'hover:bg-amber-500/[0.03] dark:hover:bg-amber-400/[0.015]',
    hoverBorder: 'hover:border-amber-300 dark:hover:border-amber-800/60',
    hoverGlow: 'hover:shadow-lg hover:shadow-amber-200/10 dark:hover:shadow-amber-950/10',
    accentBar: 'bg-amber-500 dark:bg-amber-400',
    accentText: 'text-amber-600 dark:text-amber-400',
    iconColor: 'text-amber-500 dark:text-amber-400'
  },
  in_session: {
    hoverBg: 'hover:bg-blue-500/[0.03] dark:hover:bg-blue-400/[0.015]',
    hoverBorder: 'hover:border-blue-300 dark:hover:border-blue-800/60',
    hoverGlow: 'hover:shadow-lg hover:shadow-blue-200/10 dark:hover:shadow-blue-950/10',
    accentBar: 'bg-blue-500 dark:bg-blue-400',
    accentText: 'text-blue-600 dark:text-blue-400',
    iconColor: 'text-blue-500 dark:text-blue-400'
  },
  completed: {
    hoverBg: 'hover:bg-green-500/[0.03] dark:hover:bg-green-400/[0.015]',
    hoverBorder: 'hover:border-green-300 dark:hover:border-green-800/60',
    hoverGlow: 'hover:shadow-lg hover:shadow-green-200/10 dark:hover:shadow-green-950/10',
    accentBar: 'bg-green-500 dark:bg-green-400',
    accentText: 'text-green-600 dark:text-green-400',
    iconColor: 'text-green-500 dark:text-green-400'
  },
  revenue: {
    hoverBg: 'hover:bg-emerald-500/[0.03] dark:hover:bg-emerald-400/[0.015]',
    hoverBorder: 'hover:border-emerald-300 dark:hover:border-emerald-800/60',
    hoverGlow: 'hover:shadow-lg hover:shadow-emerald-200/10 dark:hover:shadow-emerald-950/10',
    accentBar: 'bg-emerald-500 dark:bg-emerald-400',
    accentText: 'text-emerald-700 dark:text-emerald-400',
    iconColor: 'text-emerald-500 dark:text-emerald-400'
  }
};

// Default slot definitions (fallback if API doesn't return them)
const DEFAULT_SLOTS = {
  weekday: ['10:00','10:30','11:00','11:30','12:00','12:30',
            '14:00','14:30','15:00','15:30','16:00','16:30','17:00','17:30',
            '18:00','18:30','19:00','19:30'],
  sunday:  ['10:00','10:30','11:00','11:30','12:00','12:30','13:00','13:30'],
};

const PHONE_PREFIX = '+91';
function stripPhonePrefix(v) { return v?.replace(/^(\+91|91)/, '') || v || ''; }
function withPhonePrefix(v) { const s = stripPhonePrefix(v); return s ? `${PHONE_PREFIX}${s}` : ''; }

function QuickBookForm({ date, time, onClose, onBooked }) {
  const [patientName, setPatientName] = useState('');
  const [patientPhone, setPatientPhone] = useState('');
  const [patientAge, setPatientAge] = useState('');
  const [patientSex, setPatientSex] = useState('');
  const [selectedTime, setSelectedTime] = useState(time || '');
  const [treatment, setTreatment] = useState('');
  const [location, setLocation] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchState, setSearchState] = useState('idle');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [selectedPatient, setSelectedPatient] = useState(null);
  const nameInputRef = useRef(null);
  const submitRef = useRef(null);
  const queryRef = useRef('');
  const shouldFocusSubmit = useRef(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [bookedAppointment, setBookedAppointment] = useState(null);

  useEffect(() => {
    setTimeout(() => nameInputRef.current?.focus(), 100);
  }, []);

  useEffect(() => {
    const abort = new AbortController();
    queryRef.current = patientName;
    if (patientName.length < 2 || selectedPatient) {
      setSearchResults([]);
      setSearchState('idle');
      return;
    }
    setSearchResults([]);
    setSearchState('searching');
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/dashboard/patients/search?q=${encodeURIComponent(patientName)}`, { signal: abort.signal });
        const d = await res.json();
        const results = d.patients || [];
        if (queryRef.current !== patientName) return; // stale
        setSearchResults(results);
        if (results.length > 0) {
          setSearchState('success');
        } else {
          setSearchState('empty');
          setTimeout(() => {
            if (queryRef.current === patientName) {
              setSearchResults([]);
              setSearchState('idle');
            }
          }, 2000);
        }
      } catch (e) {
        if (e.name !== 'AbortError') { console.error('Quick book search error:', e); setSearchState('idle'); }
      }
    }, 250);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [patientName, selectedPatient]);

  // Auto-highlight first result
  useEffect(() => {
    setHighlightedIndex(searchState === 'success' && searchResults.length > 0 ? 0 : -1);
  }, [searchResults, searchState]);

  // Focus submit after patient selection
  useEffect(() => {
    if (shouldFocusSubmit.current) {
      submitRef.current?.focus();
      shouldFocusSubmit.current = false;
    }
  }, [selectedPatient]);

  // Global Escape handler
  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') {
        if (searchState === 'success' || searchResults.length > 0) {
          setSearchResults([]);
          setSearchState('idle');
        } else if (!bookedAppointment) {
          onClose?.();
        }
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [searchState, searchResults, bookedAppointment, onClose]);

  function selectPatient(p) {
    setSelectedPatient(p);
    setPatientName(p.name);
    setPatientPhone((p.phone || '').replace(/\D/g, ''));
    setPatientAge(p.age ? String(p.age) : '');
    setPatientSex(p.sex || '');
    setSearchResults([]);
    setSearchState('idle');
    shouldFocusSubmit.current = true;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!patientName.trim()) { setError('Patient name is required'); return; }
    if (!time && !selectedTime) { setError('Please select a time slot'); return; }
    setSaving(true);
    setError('');

    try {
      const res = await fetch('/api/dashboard/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: selectedPatient?.id || null,
          patientName: patientName.trim(),
          patientPhone: patientPhone ? `+91${patientPhone}` : null,
          patientAge: patientAge.trim() || null,
          patientSex: patientSex || null,
          date,
          time: time || selectedTime || null,
          treatment: treatment || null,
          location: location.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to book');
        return;
      }
      setBookedAppointment(data.appointment);
      onBooked?.(data.appointment);
    } catch (err) {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }

  if (bookedAppointment) {
    return (
      <div className="p-6 space-y-5 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-900/30 mx-auto">
          <CheckCircle2 className="w-8 h-8 text-emerald-500" />
        </div>
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-lg">Appointment Booked</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {bookedAppointment.patient_name}{bookedAppointment.time ? ` — ${bookedAppointment.time?.slice(0, 5)}` : ' — Walk-in'}
        </p>
        <div className="flex gap-3 pt-2">
          <button
            onClick={() => {
              const close = onClose;
              close?.();
              window.location.href = `/dashboard/visit?appointmentId=${bookedAppointment.id}&name=${encodeURIComponent(bookedAppointment.patient_name)}&mode=completeAppointment`;
            }}
            className="flex-1 px-4 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-medium rounded-xl hover:bg-gray-800 dark:hover:bg-gray-100 transition-all"
          >
            Open Visit
          </button>
          <button
            onClick={() => {
              setBookedAppointment(null);
              setPatientName('');
              setPatientPhone('');
              setPatientAge('');
              setPatientSex('');
              setSelectedTime(time || '');
              setTreatment('');
              setLocation('');
              setSelectedPatient(null);
              setSearchResults([]);
              setSearchState('idle');
              setError('');
              setHighlightedIndex(-1);
              setTimeout(() => nameInputRef.current?.focus(), 50);
            }}
            className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 text-sm font-medium rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-all"
          >
            Book Another
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-5">
      {/* Patient Name with Search */}
      <div className="relative">
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Patient Name *</label>
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={nameInputRef}
            type="text"
            value={patientName}
            onChange={e => { setPatientName(e.target.value); setSelectedPatient(null); }}
            onKeyDown={e => {
              if (searchState === 'success' && searchResults.length > 0) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setHighlightedIndex(prev => (prev + 1) % searchResults.length);
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setHighlightedIndex(prev => (prev - 1 + searchResults.length) % searchResults.length);
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  if (highlightedIndex >= 0 && highlightedIndex < searchResults.length) {
                    selectPatient(searchResults[highlightedIndex]);
                  }
                }
              }
            }}
            placeholder="Type patient name..."
            className="w-full pl-9 pr-3 py-2.5 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 dark:focus:ring-gray-600 focus:border-gray-300 dark:focus:border-gray-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 transition-colors"
          />
          {searchState === 'searching' && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="w-3.5 h-3.5 border-2 border-gray-200 dark:border-gray-600 border-t-gray-600 dark:border-t-gray-300 rounded-full animate-spin" />
            </div>
          )}
        </div>
        {searchState === 'success' && !selectedPatient && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg dark:shadow-gray-900/50 z-10 overflow-hidden">
            {searchResults.map((p, i) => (
              <button
                key={p.id}
                type="button"
                onClick={() => selectPatient(p)}
                onMouseEnter={() => setHighlightedIndex(i)}
                ref={el => { if (highlightedIndex === i && el) el.scrollIntoView({ block: 'nearest' }); }}
                className={`w-full text-left px-4 py-3 transition-colors flex items-center gap-3 border-b border-gray-50 dark:border-gray-700 last:border-0 ${
                  highlightedIndex === i
                    ? 'bg-gray-100 dark:bg-gray-700'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                }`}
              >
                <span className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-xs font-semibold text-gray-600 dark:text-gray-300 shrink-0">
                  {(p.name || '?')[0].toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{p.name}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">{p.phone || 'No phone'} · {p.age ? `${p.age} yrs` : '—'}</p>
                </div>
              </button>
            ))}
          </div>
        )}
        {searchState === 'empty' && !selectedPatient && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm z-10 p-5 text-center">
            <Search className="w-6 h-6 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No patients found</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">A new patient record will be created when you book.</p>
          </div>
        )}
      </div>

      {/* Phone */}
      <div>
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Phone Number</label>
        <div className="flex">
          <span className="inline-flex items-center px-3 py-2.5 bg-gray-100 dark:bg-gray-700 border border-r-0 border-gray-200 dark:border-gray-600 rounded-l-xl text-sm font-medium text-gray-600 dark:text-gray-300 shrink-0">{PHONE_PREFIX}</span>
          <input
            type="tel"
            value={patientPhone}
            onChange={e => setPatientPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
            placeholder="9876543210"
            className="flex-1 px-3 py-2.5 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 rounded-r-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 dark:focus:ring-gray-600 focus:border-gray-300 dark:focus:border-gray-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 transition-colors"
          />
        </div>
      </div>

      {/* Age & Sex — side by side */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Age</label>
          <input
            type="number"
            value={patientAge}
            onChange={e => setPatientAge(e.target.value)}
            placeholder="e.g. 35"
            min="0"
            max="150"
            className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 dark:focus:ring-gray-600 focus:border-gray-300 dark:focus:border-gray-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 transition-colors"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Sex</label>
          <select
            value={patientSex}
            onChange={e => setPatientSex(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 dark:focus:ring-gray-600 focus:border-gray-300 dark:focus:border-gray-500 text-gray-900 dark:text-gray-100 appearance-none cursor-pointer transition-colors"
          >
            <option value="">Select...</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Other">Other</option>
          </select>
        </div>
      </div>

      {/* Location */}
      <div>
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Location</label>
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <input
            type="text"
            value={location}
            onChange={e => setLocation(e.target.value)}
            placeholder="Room, floor, or area"
            className="w-full pl-9 pr-3 py-2.5 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 dark:focus:ring-gray-600 focus:border-gray-300 dark:focus:border-gray-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 transition-colors"
          />
        </div>
      </div>

      {/* Time selector — only when opened without a pre-selected slot */}
      {!time && (
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Time *</label>
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <select
              value={selectedTime}
              onChange={e => setSelectedTime(e.target.value)}
              className="w-full pl-9 pr-8 py-2.5 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 dark:focus:ring-gray-600 focus:border-gray-300 dark:focus:border-gray-500 text-gray-900 dark:text-gray-100 appearance-none cursor-pointer transition-colors"
            >
              <option value="">Select time...</option>
              {(new Date(date + 'T12:00:00').getDay() === 0 ? DEFAULT_SLOTS.sunday : DEFAULT_SLOTS.weekday).map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-gray-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 5-7-5" />
            </svg>
          </div>
        </div>
      )}

      {/* Treatment Dropdown */}
      <div>
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Treatment</label>
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 5-7-5m0 0l7 5 7-5" />
          </svg>
          <select
            value={treatment}
            onChange={e => setTreatment(e.target.value)}
            className="w-full pl-9 pr-8 py-2.5 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 dark:focus:ring-gray-600 focus:border-gray-300 dark:focus:border-gray-500 text-gray-900 dark:text-gray-100 appearance-none cursor-pointer transition-colors"
          >
            <option value="">Select treatment...</option>
            {TREATMENT_NAMES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-gray-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 5-7-5" />
          </svg>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 rounded-lg px-3 py-2 border border-red-100 dark:border-red-800">
          <XCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex gap-3 pt-1">
        <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 text-sm font-medium rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-all">Cancel</button>
        <button
          ref={submitRef}
          type="submit"
          disabled={saving || !patientName.trim()}
          className="flex-1 px-4 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-medium rounded-xl hover:bg-gray-800 dark:hover:bg-gray-100 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving ? (
            <><div className="w-4 h-4 border-2 border-white/30 dark:border-gray-900/30 border-t-white dark:border-t-gray-900 rounded-full animate-spin" /> Booking...</>
          ) : (
            <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> Book Appointment</>
          )}
        </button>
      </div>
    </form>
  );
}

function SlotGrid({ selectedDate, appointments, datesData, slotDefinitions, onBookSlotRef }) {
  const router = useRouter();
  const [afternoonCollapsed, setAfternoonCollapsed] = useState(false);
  const dateInfo = datesData?.[selectedDate];
  const bookedAppointments = appointments.filter(a => a.status === 'confirmed' || a.status === 'completed');

  const d = parseDateOnly(selectedDate) || new Date();
  const isSunday = d.getDay() === 0;
  const slots = slotDefinitions?.[isSunday ? 'sunday' : 'weekday'] ||
                DEFAULT_SLOTS[isSunday ? 'sunday' : 'weekday'];

  // Build booked times lookup
  const bookedByTime = {};
  for (const a of bookedAppointments) {
    const t = a.time?.slice(0, 5);
    if (t) bookedByTime[t] = a;
  }

  // Time-aware helpers for today's schedule
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const currentHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  function addMins(t, m) { const [h, min] = t.split(':').map(Number); const total = h * 60 + min + m; return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`; }
  const nextFreeSlot = isToday ? slots.find(s => s > currentHHMM && !bookedByTime[s]) : null;

  if (dateInfo?.isBlocked) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-xl p-6 text-center">
        <div className="flex flex-col items-center gap-2">
          <XCircle className="w-7 h-7 text-red-400" />
          <p className="text-sm font-semibold text-red-700 dark:text-red-400">Clinic Closed</p>
          {dateInfo.blockedReason && (
            <p className="text-xs text-red-500 dark:text-red-400">{dateInfo.blockedReason}</p>
          )}
          <Link href="/dashboard/schedule" className="text-xs text-red-600 dark:text-red-400 underline hover:text-red-700 mt-1">
            Manage schedule →
          </Link>
        </div>
      </div>
    );
  }

  if (!dateInfo) {
    if (d < new Date(new Date().toDateString())) {
      return (
        <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 rounded-xl p-6 text-center">
          <p className="text-sm text-gray-400 dark:text-gray-500">Past date — no slot data.</p>
        </div>
      );
    }
  }

  const morningSlots = slots.filter(t => t < '13:00');
  const afternoonSlots = slots.filter(t => t >= '13:00');

  const totalBooked = Object.keys(bookedByTime).length;
  const available = slots.length - totalBooked;
  return (
    <div className="h-full bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm p-4 transition-colors duration-200 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-gray-400 dark:text-gray-500" />
          <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300">
            {d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
          </h3>
        </div>
      </div>

      <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mb-3">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> {totalBooked} booked</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400" /> {available} open</span>
        <span className="ml-auto text-gray-400 dark:text-gray-500">{Math.round((totalBooked / slots.length) * 100)}% full</span>
      </div>

      {morningSlots.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">Morning</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-1.5">
            {morningSlots.map(slotTime => {
              const isBooked = !!bookedByTime[slotTime];
              const bookedAppt = bookedByTime[slotTime];
              const isPast = isToday && addMins(slotTime, 30) <= currentHHMM;
              const isCurrent = isToday && slotTime <= currentHHMM && addMins(slotTime, 30) > currentHHMM;
              const isNextFree = slotTime === nextFreeSlot;
              const showBook = !isBooked && !isPast;
              return (
                <button
                  key={slotTime}
                  type="button"
                  disabled={isPast && !isBooked}
                  className={`relative rounded-lg border text-center transition-all duration-150 ${
                    isPast && !isBooked
                      ? 'bg-gray-50 dark:bg-gray-800/40 border-gray-200 dark:border-gray-700 cursor-not-allowed opacity-60'
                      : isBooked
                        ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/40 hover:border-blue-300 dark:hover:border-blue-700 active:scale-95'
                        : isNextFree
                          ? 'bg-green-50 dark:bg-green-900/20 border-emerald-400 dark:border-emerald-500 hover:bg-green-100 dark:hover:bg-green-900/30 active:scale-95 ring-2 ring-emerald-300/50 dark:ring-emerald-600/50 animate-pulse'
                          : 'bg-green-50/60 dark:bg-green-900/20 border-green-200 dark:border-green-800 hover:border-green-400 dark:hover:border-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 hover:shadow-sm active:scale-95'
                  }`}
                  onClick={() => {
                    if (isBooked && bookedAppt?.patient_id) {
                      router.push(`/dashboard/patients/${bookedAppt.patient_id}`);
                    } else if (showBook) {
                      onBookSlotRef?.current?.(slotTime);
                    }
                  }}
                >
                  <div className="px-3 py-3">
                    <div className="flex items-center justify-center gap-1">
                      {isCurrent ? (
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-ping shrink-0" />
                      ) : (
                        <Clock className={`w-3 h-3 ${isBooked ? 'text-blue-400' : 'text-green-400'}`} />
                      )}
                      <span className={`text-sm font-semibold leading-tight ${
                        isPast && !isBooked ? 'text-gray-400 dark:text-gray-500'
                        : isBooked ? 'text-blue-700 dark:text-blue-300'
                        : 'text-green-700 dark:text-green-300'
                      }`}>{slotTime}{isCurrent && <span className="ml-1 text-xs font-bold text-red-500 uppercase">Now</span>}</span>
                    </div>
                    {isBooked ? (
                      <div className="flex items-center justify-center gap-1 mt-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                        <p className={`text-xs font-medium truncate leading-tight ${isPast ? 'text-gray-400 dark:text-gray-500' : 'text-blue-600 dark:text-blue-400'}`}>{bookedAppt.patient_name || 'Booked'}</p>
                      </div>
                    ) : showBook ? (
                      <div className="flex items-center justify-center gap-1 mt-1">
                        <Plus className={`w-2.5 h-2.5 ${isNextFree ? 'text-emerald-500' : 'text-green-500 dark:text-green-400'}`} />
                        <p className={`text-xs font-medium leading-tight ${isNextFree ? 'text-emerald-600 dark:text-emerald-400' : 'text-green-600 dark:text-green-400'}`}>Book</p>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-1 mt-1">
                        <p className="text-xs text-gray-400 dark:text-gray-500 font-medium leading-tight">Passed</p>
                      </div>
                    )}
                  </div>
                  {isBooked && bookedAppt.arrival_status === 'arrived' && !isPast && (
                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-amber-400 rounded-full border-2 border-white dark:border-gray-900" title="Arrived" />
                  )}
                  {isBooked && bookedAppt.arrival_status === 'called' && !isPast && (
                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full border-2 border-white dark:border-gray-900" title="In Session" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {afternoonSlots.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setAfternoonCollapsed(!afternoonCollapsed)}
            className="flex items-center gap-1.5 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2 hover:text-gray-600 dark:hover:text-gray-300 transition-colors w-full text-left cursor-pointer"
          >
            <span>Afternoon</span>
            {afternoonCollapsed ? (
              <ChevronDown className="w-3.5 h-3.5 text-gray-400 dark:text-gray-550" />
            ) : (
              <ChevronUp className="w-3.5 h-3.5 text-gray-400 dark:text-gray-550" />
            )}
          </button>
          {!afternoonCollapsed && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-1.5">
              {afternoonSlots.map(slotTime => {
                const isBooked = !!bookedByTime[slotTime];
                const bookedAppt = bookedByTime[slotTime];
                const isPast = isToday && addMins(slotTime, 30) <= currentHHMM;
                const isCurrent = isToday && slotTime <= currentHHMM && addMins(slotTime, 30) > currentHHMM;
                const isNextFree = slotTime === nextFreeSlot;
                const showBook = !isBooked && !isPast;
                return (
                  <button
                    key={slotTime}
                    type="button"
                    disabled={isPast && !isBooked}
                    className={`relative rounded-lg border text-center transition-all duration-150 ${
                      isPast && !isBooked
                        ? 'bg-gray-50 dark:bg-gray-800/40 border-gray-200 dark:border-gray-700 cursor-not-allowed opacity-60'
                        : isBooked
                          ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/40 hover:border-blue-300 dark:hover:border-blue-700 active:scale-95'
                          : isNextFree
                            ? 'bg-green-50 dark:bg-green-900/20 border-emerald-400 dark:border-emerald-500 hover:bg-green-100 dark:hover:bg-green-900/30 active:scale-95 ring-2 ring-emerald-300/50 dark:ring-emerald-600/50 animate-pulse'
                            : 'bg-green-50/60 dark:bg-green-900/20 border-green-200 dark:border-green-800 hover:border-green-400 dark:hover:border-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 hover:shadow-sm active:scale-95'
                    }`}
                    onClick={() => {
                      if (isBooked && bookedAppt?.patient_id) {
                        router.push(`/dashboard/patients/${bookedAppt.patient_id}`);
                      } else if (showBook) {
                        onBookSlotRef?.current?.(slotTime);
                      }
                    }}
                  >
                    <div className="px-3 py-3">
                      <div className="flex items-center justify-center gap-1">
                        {isCurrent ? (
                          <span className="w-2 h-2 rounded-full bg-red-500 animate-ping shrink-0" />
                        ) : (
                          <Clock className={`w-3 h-3 ${isBooked ? 'text-blue-400' : isPast ? 'text-gray-300 dark:text-gray-600' : 'text-green-400'}`} />
                        )}
                        <span className={`text-sm font-semibold leading-tight ${
                          isPast && !isBooked ? 'text-gray-400 dark:text-gray-500'
                          : isBooked ? 'text-blue-700 dark:text-blue-300'
                          : 'text-green-700 dark:text-green-300'
                        }`}>{slotTime}{isCurrent && <span className="ml-1 text-xs font-bold text-red-500 uppercase">Now</span>}</span>
                      </div>
                      {isBooked ? (
                        <div className="flex items-center justify-center gap-1 mt-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                          <p className={`text-xs font-medium truncate leading-tight ${isPast ? 'text-gray-400 dark:text-gray-500' : 'text-blue-600 dark:text-blue-400'}`}>{bookedAppt.patient_name || 'Booked'}</p>
                        </div>
                      ) : showBook ? (
                        <div className="flex items-center justify-center gap-1 mt-1">
                          <Plus className={`w-2.5 h-2.5 ${isNextFree ? 'text-emerald-500' : 'text-green-500 dark:text-green-400'}`} />
                          <p className={`text-xs font-medium leading-tight ${isNextFree ? 'text-emerald-600 dark:text-emerald-400' : 'text-green-600 dark:text-green-400'}`}>Book</p>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-1 mt-1">
                          <p className="text-xs text-gray-400 dark:text-gray-500 font-medium leading-tight">Passed</p>
                        </div>
                      )}
                    </div>
                    {isBooked && bookedAppt.arrival_status === 'arrived' && !isPast && (
                      <span className="absolute -top-1 -right-1 w-3 h-3 bg-amber-400 rounded-full border-2 border-white dark:border-gray-900" title="Arrived" />
                    )}
                    {isBooked && bookedAppt.arrival_status === 'called' && !isPast && (
                      <span className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full border-2 border-white dark:border-gray-900" title="In Session" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { selectedDate, setSelectedDate } = useContext(DateContext);
  const { showToast } = useContext(ToastContext);
  const [data, setData] = useState(null);
  const [datesData, setDatesData] = useState(null);
  const [slotDefinitions, setSlotDefinitions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [overviewError, setOverviewError] = useState(null);
  const [viewMode, setViewMode] = useState('month');
  const [bookingModal, setBookingModal] = useState({ open: false, time: null });
  const [refreshKey, setRefreshKey] = useState(0);
  const [recentBookings, setRecentBookings] = useState([]);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [showQuickCheckout, setShowQuickCheckout] = useState(null);
  const [showWalkIn, setShowWalkIn] = useState(null);
  const [fabOpen, setFabOpen] = useState(false);
  const bookSlotRef = useRef(null);

  // Handle ?book=time query param to pop open QuickBook (from WeekView/DayTimeline slot clicks)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const bookTime = params.get('book');
    if (bookTime) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBookingModal({ open: true, time: bookTime });
      // Clean the URL without full page reload
      const url = new URL(window.location);
      url.searchParams.delete('book');
      window.history.replaceState({}, '', url);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
  const d = parseDateOnly(selectedDate) || new Date();
    const year = d.getFullYear();
    const month = d.getMonth() + 1;

    Promise.all([
      fetchCached(`/api/dashboard/appointments?date=${selectedDate}`),
      fetchCached(`/api/dashboard/calendar?year=${year}&month=${month}`),
    ])
      .then(([apptData, calData]) => {
        if (cancelled) return;
        setData(apptData);
        setDatesData(calData.dates || {});
        if (calData.slotDefinitions) setSlotDefinitions(calData.slotDefinitions);
        setLoading(false);
      })
      .catch(e => {
        console.error('Dashboard fetch error:', e);
        if (!cancelled) { setLoading(false); setOverviewError('Failed to load dashboard data. Please try again.'); }
      });

    return () => { cancelled = true; };
  }, [selectedDate, refreshKey]);

  // Keep ref updated to avoid React Compiler stale closures in child components
  useEffect(() => {
    bookSlotRef.current = (time) => setBookingModal({ open: true, time });
  });

  function handleBookingComplete(appointment) {
    if (appointment) {
      setRecentBookings(prev => [appointment, ...prev].slice(0, 20));
      setData(prev => {
        if (!prev) return prev;
        const exists = (prev.appointments || []).find(a => a.id === appointment.id);
        if (exists) return prev;
        return {
          ...prev,
          appointments: [...(prev.appointments || []), appointment].sort((a, b) => (a.time || '').localeCompare(b.time || '')),
          totals: {
            ...prev.totals,
            confirmed: (prev.totals?.confirmed || 0) + 1,
          },
        };
      });
      // Refresh calendar data to show the blue dot on the booked date
      const d = parseDateOnly(selectedDate) || new Date();
      fetch(`/api/dashboard/calendar?year=${d.getFullYear()}&month=${d.getMonth() + 1}`)
        .then(r => r.json())
        .then(calData => {
          setDatesData(calData.dates || {});
          if (calData.slotDefinitions) setSlotDefinitions(calData.slotDefinitions);
        })
        .catch(() => {});
    }
    showToast('Appointment booked successfully', 'success');
  }

  function handleAppointmentSelect(appt) {
    setSelectedAppointment(appt);
  }

  function handleQuickCheckoutSuccess() {
    setShowQuickCheckout(null);
    setSelectedAppointment(null);
    showToast('Visit completed', 'success');
    setRefreshKey(k => k + 1);
  }

  function handleWalkInSuccess() {
    setShowWalkIn(null);
    showToast('Walk-in completed', 'success');
    setRefreshKey(k => k + 1);
  }

  const totals = data?.totals || {};
  const appointments = data?.appointments || [];
  const confirmed = appointments.filter(a => a.status === 'confirmed');
  const completed = appointments.filter(a => a.status === 'completed');
  const todayRevenue = completed.reduce((sum, a) => sum + Number(a.consultation_fee || 0) + Number(a.treatment_charges || 0) + Number(a.medicine_charges || 0), 0);
  const todayCollected = completed.reduce((sum, a) => sum + Number(a.paid_amount || 0), 0);
  const todayPending = completed.reduce((sum, a) => sum + (Number(a.consultation_fee || 0) + Number(a.treatment_charges || 0) + Number(a.medicine_charges || 0) - Number(a.paid_amount || 0)), 0);
  const paymentMethods = completed.filter(a => a.payment_status === 'paid' || a.payment_status === 'partial').reduce((acc, a) => { const m = a.payment_method || 'cash'; acc[m] = (acc[m] || 0) + 1; return acc; }, {});

  function formatCurrency(amount) {
    return `₹${Number(amount || 0).toLocaleString('en-IN')}`;
  }

  if (overviewError) {
    return (
      <div className="animate-fade-in">
        {/* Header always rendered for LCP */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Dashboard</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">{formatDateLong(selectedDate)}</p>
          </div>
        </div>
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6 text-center max-w-lg mx-auto mt-12">
          <XCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-red-700 dark:text-red-400 mb-1">Something went wrong</h3>
          <p className="text-sm text-red-600 dark:text-red-400 mb-4">{overviewError}</p>
          <button
            onClick={() => { setOverviewError(null); setRefreshKey(k => k + 1); }}
            className="px-5 py-2.5 bg-red-600 text-white text-sm font-medium rounded-xl hover:bg-red-700 transition-all"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="py-3 mb-6 border-b border-gray-100 dark:border-gray-800 transition-all">
        {/* Row 1: Title + Actions */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 tracking-tight leading-none">Dashboard</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 leading-tight">{formatDateLong(selectedDate)}</p>
          </div>
          <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2.5 w-full md:w-auto">
            <button
              onClick={() => setBookingModal({ open: true, time: null })}
              className="flex items-center justify-center gap-1.5 px-4 py-2 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white text-xs font-semibold rounded-xl transition-all shadow-md shadow-teal-600/15 dark:shadow-none active:scale-[0.98] cursor-pointer border border-teal-500/10 w-full md:w-auto"
            >
              <Plus className="w-3.5 h-3.5 text-teal-100" />
              New Appointment
            </button>
            <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-xl p-0.5 w-full md:w-auto justify-between">
              {[['month', 'Month', CalendarDays], ['week', 'Week', Columns3], ['day', 'Day', LayoutGrid]].map(([mode, label, Icon]) => (
                <button
                  key={mode}
                  data-view={mode}
                  onClick={() => setViewMode(mode)}
                  className={`flex-1 md:flex-none z-10 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer ${
                    viewMode === mode
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Row 2: KPI Strip */}
        {!loading && (
          <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100/60 dark:bg-gray-800/40 rounded-full border border-gray-200/40 dark:border-gray-700/30 justify-center sm:justify-start">
              <div className="w-1.5 h-1.5 rounded-full bg-gray-400" />
              <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Total</span>
              <span className="text-xs font-bold text-gray-900 dark:text-gray-100">{appointments.length}</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50/60 dark:bg-amber-950/20 rounded-full border border-amber-200/40 dark:border-amber-800/20 justify-center sm:justify-start">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">Waiting</span>
              <span className="text-xs font-bold text-amber-700 dark:text-amber-300">{totals.waiting || 0}</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50/60 dark:bg-blue-950/20 rounded-full border border-blue-200/40 dark:border-blue-800/20 justify-center sm:justify-start">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400">In Session</span>
              <span className="text-xs font-bold text-blue-700 dark:text-blue-300">{totals.in_session || 0}</span>
            </div>
            <div className="col-span-2 sm:col-span-1 flex items-center gap-1.5 px-3 py-1.5 bg-slate-100/60 dark:bg-slate-800/40 rounded-full border border-slate-200/40 dark:border-slate-700/30 justify-center sm:justify-start">
              <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />
              <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Completed</span>
              <span className="text-xs font-bold text-gray-900 dark:text-gray-100">{totals.completed || 0}</span>
            </div>
            <div className="col-span-1 flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50/60 dark:bg-emerald-950/20 rounded-full border border-emerald-200/40 dark:border-emerald-800/20 justify-center sm:justify-start">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">Revenue</span>
              <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">{formatCurrency(todayRevenue)}</span>
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="space-y-6 animate-pulse">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded" />
                <div className="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded" />
              </div>
              <div className="grid grid-cols-7 gap-1 mb-2">
                {Array.from({length: 7}).map((_, i) => (
                  <div key={`sh-${i}`} className="h-3 w-full bg-gray-200 dark:bg-gray-700 rounded" />
                ))}
              </div>
              {Array.from({length: 5}).map((_, w) => (
                <div key={`sw-${w}`} className="grid grid-cols-7 gap-1 mb-1">
                  {Array.from({length: 7}).map((_, d) => (
                    <div key={`sd-${d}`} className="h-8 w-full bg-gray-100 dark:bg-gray-800 rounded" />
                  ))}
                </div>
              ))}
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm p-4">
              <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded mb-4" />
              {Array.from({length: 8}).map((_, i) => (
                <div key={`ss-${i}`} className="flex items-center gap-3 mb-3">
                  <div className="h-3 w-12 bg-gray-200 dark:bg-gray-700 rounded shrink-0" />
                  <div className="h-6 flex-1 bg-gray-100 dark:bg-gray-800 rounded" />
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : viewMode === 'month' ? (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Calendar */}
        <Calendar
          selectedDate={selectedDate}
          onDateSelect={setSelectedDate}
          datesData={datesData}
          onMonthChange={(y, m) => {
            fetch(`/api/dashboard/calendar?year=${y}&month=${m}`)
              .then(r => r.json())
              .then(json => {
                setDatesData(json.dates || {});
                if (json.slotDefinitions) setSlotDefinitions(json.slotDefinitions);
              })
              .catch(e => console.error('Calendar month change error:', e));
          }}
        />

        {/* Slot detail for selected day */}
        <SlotGrid
          selectedDate={selectedDate}
          appointments={appointments}
          datesData={datesData}
          slotDefinitions={slotDefinitions}
          onBookSlotRef={bookSlotRef}
        />
      </div>
      ) : viewMode === 'week' ? (
        <div className="mb-8">
          <WeekView
            selectedDate={selectedDate}
            onDateSelect={setSelectedDate}
            onRefresh={() => setRefreshKey(k => k + 1)}
            onAppointmentSelect={handleAppointmentSelect}
            onBookSlot={(date, time) => setBookingModal({ open: true, time })}
            onWalkInSlot={(date, time) => setShowWalkIn({ date, time })}
          />
        </div>
      ) : (
        <div className="mb-8">
          <DayTimeline
            selectedDate={selectedDate}
            onDateSelect={setSelectedDate}
            onRefresh={() => setRefreshKey(k => k + 1)}
            onAppointmentSelect={handleAppointmentSelect}
            onBookSlot={(date, time) => setBookingModal({ open: true, time })}
            onWalkInSlot={(date, time) => setShowWalkIn({ date, time })}
          />
        </div>
      )
      }

      {/* FAB — quick actions */}
      <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2">
          {fabOpen && (
            <div className="animate-scale-in origin-bottom-right space-y-1.5 mb-1">
              <button
                onClick={() => { setShowWalkIn({ date: null, time: null }); setFabOpen(false); }}
                className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-xl shadow-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-all w-full active:scale-[0.97]"
              >
                <span className="text-lg">⚡</span>
                Quick Walk-In
              </button>
              <button
                onClick={() => { setBookingModal({ open: true, time: null }); setFabOpen(false); }}
                className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-xl shadow-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-all w-full active:scale-[0.97]"
              >
                <Plus className="w-4 h-4" />
                New Appointment
              </button>
            </div>
          )}
          <button
            onClick={() => setFabOpen(o => !o)}
            className="w-12 h-12 bg-gray-900 dark:bg-white hover:bg-gray-800 dark:hover:bg-gray-100 text-white dark:text-gray-900 rounded-full shadow-xl shadow-gray-900/20 dark:shadow-white/10 flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95"
          >
            {fabOpen ? <ChevronUp className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
          </button>
        </div>

      {/* Financial Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        {[
          { key: 'revenue', label: "Today's Revenue", value: formatCurrency(todayRevenue), link: '/dashboard/stats' },
          { key: 'outstanding', label: 'Outstanding Amount', value: formatCurrency(todayPending), link: '/dashboard/appointments?status=completed' },
        ].map(card => {
          const style = CARD_STYLE_MAP[card.key === 'outstanding' ? (todayPending > 0 ? 'waiting' : 'completed') : 'revenue'];
          return (
            <button
              key={card.key}
              onClick={() => router.push(card.link)}
              className={`relative overflow-hidden w-full text-left bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-5 hover:-translate-y-0.5 transition-all duration-300 group cursor-pointer active:scale-[0.98] ${style.hoverBg} ${style.hoverBorder} ${style.hoverGlow}`}
            >
              <div className={`absolute -right-3 -bottom-3 w-20 h-20 pointer-events-none transition-all duration-500 ease-out group-hover:scale-125 group-hover:rotate-12 ${style.iconColor}`}>
                <div className="w-full h-full opacity-[0.12] dark:opacity-[0.06] flex items-center justify-center">
                  <DollarSign className="w-14 h-14" />
                </div>
              </div>
              <div className="relative z-10 flex flex-col h-full justify-between">
                <div>
                  <span className={`text-xs font-bold tracking-wider uppercase ${style.accentText}`}>
                    {card.label}
                  </span>
                  <p className="text-3xl font-extrabold tracking-tight mt-2 text-gray-900 dark:text-gray-100">
                    {card.value}
                  </p>
                </div>
              </div>
              <div className={`absolute bottom-0 left-0 right-0 h-1 ${style.accentBar} transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left`} />
            </button>
          );
        })}
      </div>

      {/* Today's Collection Breakdown */}
      {completed.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm p-4 mb-8">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/30">
              <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
            </div>
              <span className="text-base font-semibold text-gray-700 dark:text-gray-300">Today&apos;s Collection</span>
            <span className="text-xs text-gray-400 dark:text-gray-500">{completed.length} completed visits</span>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:flex sm:flex-wrap sm:items-center sm:gap-x-6 sm:gap-y-2">
            <div>
              <span className="text-xs text-gray-500 dark:text-gray-400 uppercase">Collected</span>
              <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(todayCollected)}</p>
            </div>
            <div className="hidden sm:block w-px h-8 bg-gray-200 dark:bg-gray-700" />
            <div>
              <span className="text-xs text-gray-500 dark:text-gray-400 uppercase">Pending</span>
              <p className="text-lg font-bold text-amber-500 dark:text-amber-400">{formatCurrency(todayPending)}</p>
            </div>
            <div className="hidden sm:block w-px h-8 bg-gray-200 dark:bg-gray-700" />
            <div className="col-span-2 sm:col-span-1 flex gap-4">
              {Object.entries(paymentMethods).map(([method, count]) => (
                <div key={method} className="text-left sm:text-center">
                  <span className="text-xs text-gray-400 dark:text-gray-500 uppercase block">{method}</span>
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{count}</span>
                </div>
              ))}
            </div>
            {todayPending > 0 && (
              <div className="col-span-2 sm:col-span-1 sm:ml-auto">
                <button onClick={() => router.push('/dashboard/appointments?status=completed')}
                  className="w-full sm:w-auto px-3.5 py-2 text-xs font-semibold bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-xl border border-amber-200 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-all active:scale-[0.98] cursor-pointer">
                  Collect Pending
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Upcoming & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm p-6 transition-colors duration-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500 animate-dot-pulse" />
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Upcoming</h2>
            </div>
            <Link href="/dashboard/appointments" className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium transition-colors">
              View all →
            </Link>
          </div>
          {confirmed.length === 0 ? (
            <p className="text-gray-400 dark:text-gray-500 text-sm py-8 text-center">No appointments for this date.</p>
          ) : (
            <div className="space-y-1">
              {confirmed.slice(0, 5).map((a, i) => (
                <div key={a.id} className={`flex items-start justify-between gap-2 py-3 px-3 -mx-3 rounded-lg transition-colors ${recentBookings.some(b => b.id === a.id) ? 'bg-blue-50/80 dark:bg-blue-900/20 ring-1 ring-blue-200 dark:ring-blue-800' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}>
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ${recentBookings.some(b => b.id === a.id) ? 'bg-blue-500 text-white shadow-sm' : 'bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/50 dark:to-blue-800/50 text-blue-700 dark:text-blue-300'}`}>
                      {(a.patient_name || 'P')[0].toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-medium text-gray-900 dark:text-gray-100 truncate">
                        {a.is_priority ? '⭐ ' : ''}
                        {a.patient_id ? (
                          <Link href={`/dashboard/patients/${a.patient_id}`} className="hover:text-blue-600 dark:hover:text-blue-400 hover:underline">
                            {a.patient_name || 'Patient'}
                          </Link>
                        ) : (
                          a.patient_name || 'Patient'
                        )}
                        {recentBookings.some(b => b.id === a.id) && (
                          <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 dark:bg-blue-800/50 text-blue-700 dark:text-blue-300 animate-scale-in">New</span>
                        )}
                      </p>
                      <p className="text-sm text-gray-400 dark:text-gray-500 truncate">{a.time?.slice(0, 5)} — {Array.isArray(a?.treatments) && a.treatments.length > 0 ? a.treatments.join(' + ') : a.treatment || 'Visit'}</p>
                    </div>
                  </div>
                  <StatusBadge status={a.status} arrivalStatus={a.arrival_status} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm p-6 transition-colors duration-200">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-dot-pulse" />
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Recent Activity</h2>
          </div>
          {completed.length === 0 ? (
            <p className="text-gray-400 dark:text-gray-500 text-sm py-8 text-center">No completed visits for this date.</p>
          ) : (
            <div className="space-y-1">
              {completed.slice(0, 5).reverse().map(a => (
                <div key={a.id} className="flex items-center justify-between py-3 px-3 -mx-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/50 dark:to-green-800/50 flex items-center justify-center text-xs font-semibold text-green-700 dark:text-green-300">
                      {(a.patient_name || 'P')[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-base font-medium text-gray-900 dark:text-gray-100 truncate">
                        {a.patient_id ? (
                          <Link href={`/dashboard/patients/${a.patient_id}`} className="hover:text-blue-600 dark:hover:text-blue-400 hover:underline">
                            {a.patient_name || 'Patient'}
                          </Link>
                        ) : (
                          a.patient_name || 'Patient'
                        )}
                      </p>
                      <p className="text-sm text-gray-400 dark:text-gray-500 truncate">{Array.isArray(a?.treatments) && a.treatments.length > 0 ? a.treatments.join(' + ') : a.treatment || 'Visit'} — ₹{(a.consultation_fee || 0) + (a.treatment_charges || 0) + (a.medicine_charges || 0)}</p>
                    </div>
                  </div>
                  <StatusBadge status={a.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>



      {/* Quick Booking Modal — Enhanced */}
      {bookingModal.open && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center animate-backdrop-in">
          <div className="absolute inset-0 bg-black/30 dark:bg-black/60 backdrop-blur-sm cursor-pointer" onClick={() => setBookingModal({ open: false, time: null })} />
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl dark:shadow-gray-900/80 border border-gray-200 dark:border-gray-700 w-full max-w-md mx-4 max-h-[90vh] flex flex-col overflow-hidden animate-scale-in" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-md">
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">Quick Booking</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {formatDateShort(selectedDate)}
                    {bookingModal.time ? ` at ${bookingModal.time}` : ''}
                  </p>
                </div>
              </div>
              <button onClick={() => setBookingModal({ open: false, time: null })} className="p-1 -mr-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 dark:text-gray-500 transition-colors cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 no-scrollbar">
              <QuickBookForm
                date={selectedDate}
                time={bookingModal.time}
                onClose={() => setBookingModal({ open: false, time: null })}
                onBooked={(appt) => { handleBookingComplete(appt); setBookingModal({ open: false, time: null }); }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Appointment Details Modal */}
      {selectedAppointment && !showQuickCheckout && (
        <AppointmentDetailsModal
          appointment={selectedAppointment}
          onClose={() => setSelectedAppointment(null)}
          onQuickCheckout={(appt) => { setShowQuickCheckout(appt); }}
          showToast={showToast}
        />
      )}

      {/* Quick Checkout Modal */}
      {showQuickCheckout && (
        <QuickCheckoutModal
          appointment={showQuickCheckout}
          onClose={() => { setShowQuickCheckout(null); setSelectedAppointment(null); }}
          onSuccess={handleQuickCheckoutSuccess}
          showToast={showToast}
        />
      )}

      {/* Rapid Walk-In Modal */}
      {showWalkIn && (
        <RapidWalkInModal
          date={showWalkIn.date}
          time={showWalkIn.time}
          onClose={() => setShowWalkIn(null)}
          onSuccess={handleWalkInSuccess}
          showToast={showToast}
        />
      )}
    </div>
  );
}
