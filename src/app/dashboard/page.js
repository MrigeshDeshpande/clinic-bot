'use client';

import { useState, useEffect, useContext, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DollarSign, CalendarDays, Clock, XCircle, Plus, Users } from 'lucide-react';
import Calendar from '@/components/Calendar';
import { DateContext } from './layout';
import { TREATMENT_NAMES } from '@/lib/treatments';
import { parseDateOnly, formatDateLong, formatDateShort } from '@/lib/date';

function StatusBadge({ status, arrivalStatus }) {
  if (status === 'completed') return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800">Completed</span>;
  if (status === 'no_show') return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800">No Show</span>;
  if (arrivalStatus === 'called') return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800">In Session</span>;
  if (arrivalStatus === 'arrived') return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">Waiting</span>;
  return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700">Scheduled</span>;
}

const STAT_CARDS = [
  { key: 'total', label: 'Total Appointments', color: 'gray', icon: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
  )},
  { key: 'waiting', label: 'Waiting', color: 'amber', icon: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  )},
  { key: 'in_session', label: 'In Session', color: 'blue', icon: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  )},
  { key: 'completed', label: 'Completed', color: 'green', icon: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  )},
];

const REVENUE_CARD = { key: 'revenue', label: "Today's Revenue", color: 'emerald', icon: <DollarSign className="w-5 h-5" /> };

const COLOR_MAP = {
  total: { text: 'text-gray-900 dark:text-gray-100', icon: 'text-gray-400 dark:text-gray-500', bg: 'bg-gray-50 dark:bg-gray-800', ring: 'ring-gray-100 dark:ring-gray-700' },
  waiting: { text: 'text-amber-600 dark:text-amber-400', icon: 'text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30', ring: 'ring-amber-100 dark:ring-amber-800' },
  in_session: { text: 'text-blue-600 dark:text-blue-400', icon: 'text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30', ring: 'ring-blue-100 dark:ring-blue-800' },
  completed: { text: 'text-green-600 dark:text-green-400', icon: 'text-green-400', bg: 'bg-green-50 dark:bg-green-900/30', ring: 'ring-green-100 dark:ring-green-800' },
  revenue: { text: 'text-emerald-700 dark:text-emerald-400', icon: 'text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30', ring: 'ring-emerald-100 dark:ring-emerald-800' },
};

// Default slot definitions (fallback if API doesn't return them)
const DEFAULT_SLOTS = {
  weekday: ['10:00','10:30','11:00','11:30','12:00','12:30',
            '14:00','14:30','15:00','15:30','16:00','16:30','17:00','17:30',
            '18:00','18:30','19:00','19:30'],
  sunday:  ['10:00','10:30','11:00','11:30','12:00','12:30','13:00','13:30'],
};

function QuickBookForm({ date, time, onClose, onBooked }) {
  const [patientName, setPatientName] = useState('');
  const [patientPhone, setPatientPhone] = useState('');
  const [patientAge, setPatientAge] = useState('');
  const [patientSex, setPatientSex] = useState('');
  const [treatment, setTreatment] = useState('');
  const [location, setLocation] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [familyMembers, setFamilyMembers] = useState([]);
  const [selectedFamilyMember, setSelectedFamilyMember] = useState(null);
  const nameInputRef = useRef(null);

  useEffect(() => {
    setTimeout(() => nameInputRef.current?.focus(), 100);
  }, []);

  useEffect(() => {
    if (patientName.length < 2 || selectedPatient) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      fetch(`/api/dashboard/patients/search?q=${encodeURIComponent(patientName)}`)
        .then(r => r.json())
        .then(d => setSearchResults(d.patients || []))
        .catch(e => console.error('Quick book search error:', e))
        .finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [patientName, selectedPatient]);

  function selectPatient(p) {
    setSelectedPatient(p);
    setPatientName(p.name);
    setPatientPhone(p.phone || '');
    setPatientAge(p.age ? String(p.age) : '');
    setPatientSex(p.sex || '');
    setSearchResults([]);
    setSelectedFamilyMember(null);
    fetch(`/api/dashboard/patients/${p.id}/family`)
      .then(r => r.json())
      .then(d => { setFamilyMembers(d.family || []); })
      .catch(() => setFamilyMembers([]));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!patientName.trim()) { setError('Patient name is required'); return; }
    setSaving(true);
    setError('');

    try {
      const res = await fetch('/api/dashboard/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientName: patientName.trim(),
          patientPhone: patientPhone.trim() || null,
          patientAge: patientAge.trim() || null,
          patientSex: patientSex || null,
          date,
          time,
          treatment: treatment || null,
          location: location.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to book');
        return;
      }
      onBooked?.(data.appointment);
    } catch (err) {
      setError('Network error');
    } finally {
      setSaving(false);
    }
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
            placeholder="Type patient name..."
            className="w-full pl-9 pr-3 py-2.5 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 dark:focus:ring-gray-600 focus:border-gray-300 dark:focus:border-gray-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 transition-colors"
          />
          {searching && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="w-3.5 h-3.5 border-2 border-gray-200 dark:border-gray-600 border-t-gray-600 dark:border-t-gray-300 rounded-full animate-spin" />
            </div>
          )}
        </div>
        {searchResults.length > 0 && !selectedPatient && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg dark:shadow-gray-900/50 z-10 overflow-hidden">
            {searchResults.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => selectPatient(p)}
                className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors flex items-center gap-3 border-b border-gray-50 dark:border-gray-700 last:border-0"
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
      </div>

      {/* Phone */}
      <div>
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Phone Number</label>
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
          <input
            type="tel"
            value={patientPhone}
            onChange={e => setPatientPhone(e.target.value)}
            placeholder="+91 98765 43210"
            className="w-full pl-9 pr-3 py-2.5 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 dark:focus:ring-gray-600 focus:border-gray-300 dark:focus:border-gray-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 transition-colors"
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

      {/* Family Member Selector */}
      {familyMembers.length > 0 && selectedPatient && (
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" /> Booking for
          </label>
          <div className="flex flex-wrap gap-1.5">
            <button type="button"
              onClick={() => { setSelectedFamilyMember(null); setPatientName(selectedPatient.name); setPatientPhone(selectedPatient.phone || ''); }}
              className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all ${!selectedFamilyMember ? 'bg-violet-100 dark:bg-violet-900/40 border-violet-300 dark:border-violet-700 text-violet-800 dark:text-violet-300' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
              {selectedPatient.name} (self)
            </button>
            {familyMembers.map(m => (
              <button key={m.id} type="button"
                onClick={() => { setSelectedFamilyMember(m); setPatientName(m.name); setPatientPhone(m.phone || ''); setPatientAge(m.age ? String(m.age) : ''); setPatientSex(m.sex || ''); }}
                className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all ${selectedFamilyMember?.id === m.id ? 'bg-violet-100 dark:bg-violet-900/40 border-violet-300 dark:border-violet-700 text-violet-800 dark:text-violet-300' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                {m.name} {m.age ? `(${m.age}y)` : ''}
              </button>
            ))}
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
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm p-4 transition-colors duration-200">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-gray-400 dark:text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            {d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
          </h3>
        </div>
      </div>

      <div className="flex items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400 mb-3">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> {totalBooked} booked</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400" /> {available} open</span>
        <span className="ml-auto text-gray-400 dark:text-gray-500">{Math.round((totalBooked / slots.length) * 100)}% full</span>
      </div>

      {morningSlots.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">Morning</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-1.5">
            {morningSlots.map(slotTime => {
              const isBooked = !!bookedByTime[slotTime];
              const bookedAppt = bookedByTime[slotTime];
              return (
                <button
                  key={slotTime}
                  type="button"
                  className={`relative rounded-lg border text-center transition-all duration-150 ${
                    isBooked
                      ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/40 hover:border-blue-300 dark:hover:border-blue-700 active:scale-95'
                      : 'bg-green-50/60 dark:bg-green-900/20 border-green-200 dark:border-green-800 hover:border-green-400 dark:hover:border-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 hover:shadow-sm active:scale-95'
                  }`}
                  onClick={() => {
                    if (isBooked && bookedAppt?.patient_id) {
                      router.push(`/dashboard/patients/${bookedAppt.patient_id}`);
                    } else if (!isBooked) {
                      onBookSlotRef?.current?.(slotTime);
                    }
                  }}
                >
                    <div className="px-2.5 py-2.5">
                    <div className="flex items-center justify-center gap-1">
                      <Clock className={`w-3 h-3 ${isBooked ? 'text-blue-400' : 'text-green-400'}`} />
                      <span className={`text-xs font-semibold ${isBooked ? 'text-blue-700 dark:text-blue-300' : 'text-green-700 dark:text-green-300'}`}>{slotTime}</span>
                    </div>
                    {isBooked ? (
                      <div className="flex items-center justify-center gap-1 mt-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                        <p className="text-[10px] text-blue-600 dark:text-blue-400 font-medium truncate leading-tight">{bookedAppt.patient_name || 'Booked'}</p>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-1 mt-1">
                        <Plus className="w-2.5 h-2.5 text-green-500 dark:text-green-400" />
                        <p className="text-[10px] text-green-600 dark:text-green-400 font-medium leading-tight">Book</p>
                      </div>
                    )}
                  </div>
                  {isBooked && bookedAppt.arrival_status === 'arrived' && (
                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-amber-400 rounded-full border-2 border-white dark:border-gray-900" title="Arrived" />
                  )}
                  {isBooked && bookedAppt.arrival_status === 'called' && (
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
          <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">Afternoon</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-1.5">
            {afternoonSlots.map(slotTime => {
              const isBooked = !!bookedByTime[slotTime];
              const bookedAppt = bookedByTime[slotTime];
              return (
                <button
                  key={slotTime}
                  type="button"
                  className={`relative rounded-lg border text-center transition-all duration-150 ${
                    isBooked
                      ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/40 hover:border-blue-300 dark:hover:border-blue-700 active:scale-95'
                      : 'bg-green-50/60 dark:bg-green-900/20 border-green-200 dark:border-green-800 hover:border-green-400 dark:hover:border-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 hover:shadow-sm active:scale-95'
                  }`}
                  onClick={() => {
                    if (isBooked && bookedAppt?.patient_id) {
                      router.push(`/dashboard/patients/${bookedAppt.patient_id}`);
                    } else if (!isBooked) {
                      onBookSlotRef?.current?.(slotTime);
                    }
                  }}
                >
                    <div className="px-2.5 py-2.5">
                    <div className="flex items-center justify-center gap-1">
                      <Clock className={`w-3 h-3 ${isBooked ? 'text-blue-400' : 'text-green-400'}`} />
                      <span className={`text-xs font-semibold ${isBooked ? 'text-blue-700 dark:text-blue-300' : 'text-green-700 dark:text-green-300'}`}>{slotTime}</span>
                    </div>
                    {isBooked ? (
                      <div className="flex items-center justify-center gap-1 mt-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                        <p className="text-[10px] text-blue-600 dark:text-blue-400 font-medium truncate leading-tight">{bookedAppt.patient_name || 'Booked'}</p>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-1 mt-1">
                        <Plus className="w-2.5 h-2.5 text-green-500 dark:text-green-400" />
                        <p className="text-[10px] text-green-600 dark:text-green-400 font-medium leading-tight">Book</p>
                      </div>
                    )}
                  </div>
                  {isBooked && bookedAppt.arrival_status === 'arrived' && (
                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-amber-400 rounded-full border-2 border-white dark:border-gray-900" title="Arrived" />
                  )}
                  {isBooked && bookedAppt.arrival_status === 'called' && (
                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full border-2 border-white dark:border-gray-900" title="In Session" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { selectedDate, setSelectedDate } = useContext(DateContext);
  const [data, setData] = useState(null);
  const [datesData, setDatesData] = useState(null);
  const [slotDefinitions, setSlotDefinitions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [overviewError, setOverviewError] = useState(null);
  const [bookingModal, setBookingModal] = useState({ open: false, time: null });
  const [refreshKey, setRefreshKey] = useState(0);
  const [toast, setToast] = useState(null);
  const [recentBookings, setRecentBookings] = useState([]);
  const bookSlotRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
  const d = parseDateOnly(selectedDate) || new Date();
    const year = d.getFullYear();
    const month = d.getMonth() + 1;

    Promise.all([
      fetch(`/api/dashboard/appointments?date=${selectedDate}`).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Failed to fetch appointments'); return d; }),
      fetch(`/api/dashboard/calendar?year=${year}&month=${month}`).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Failed to fetch calendar'); return d; }),
    ])
      .then(([apptData, calData]) => {
        if (cancelled) return;
        if (apptData.error) throw new Error(apptData.error);
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

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

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
    setToast('Appointment booked successfully');
  }

  if (overviewError) {
    return (
      <div className="animate-fade-in">
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

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="shimmer h-8 w-64 rounded-lg" />
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 shimmer h-80 rounded-xl" />
          <div className="shimmer h-80 rounded-xl" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="shimmer h-28 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="shimmer h-64 rounded-xl" />
          <div className="shimmer h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  const totals = data?.totals || {};
  const appointments = data?.appointments || [];
  const confirmed = appointments.filter(a => a.status === 'confirmed');
  const completed = appointments.filter(a => a.status === 'completed');
  const todayRevenue = completed.reduce((sum, a) => sum + Number(a.consultation_fee || 0) + Number(a.treatment_charges || 0) + Number(a.medicine_charges || 0), 0);
  const todayCollected = completed.filter(a => a.payment_status === 'paid').reduce((sum, a) => sum + Number(a.consultation_fee || 0) + Number(a.treatment_charges || 0) + Number(a.medicine_charges || 0), 0);
  const todayPending = completed.filter(a => a.payment_status !== 'paid').reduce((sum, a) => sum + Number(a.consultation_fee || 0) + Number(a.treatment_charges || 0) + Number(a.medicine_charges || 0), 0);
  const paymentMethods = completed.filter(a => a.payment_status === 'paid').reduce((acc, a) => { const m = a.payment_method || 'cash'; acc[m] = (acc[m] || 0) + 1; return acc; }, {});

  function formatCurrency(amount) {
    return `₹${Number(amount || 0).toLocaleString('en-IN')}`;
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Dashboard</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            {formatDateLong(selectedDate)}
          </p>
        </div>
      </div>

      {/* Calendar + Slot Detail — side by side on large screens */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-8">
        {/* Calendar */}
        <div className="xl:col-span-2">
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
        </div>

        {/* Slot detail for selected day */}
        <div>
          <SlotGrid
            selectedDate={selectedDate}
            appointments={appointments}
            datesData={datesData}
            slotDefinitions={slotDefinitions}
            onBookSlotRef={bookSlotRef}
          />
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        {[...STAT_CARDS, REVENUE_CARD].map(card => {
          const c = COLOR_MAP[card.key];
          let value;
          if (card.key === 'total') value = appointments.length;
          else if (card.key === 'revenue') value = formatCurrency(todayRevenue);
          else value = totals[card.key] || 0;
          return (
            <button key={card.key} onClick={() => {
              const links = {
                total: '/dashboard/appointments',
                waiting: '/dashboard/appointments?arrival=arrived',
                in_session: '/dashboard/appointments?arrival=called',
                completed: '/dashboard/appointments?status=completed',
                revenue: '/dashboard/stats',
              };
              router.push(links[card.key] || '/dashboard/appointments');
            }} className="w-full text-left bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm p-5 hover:shadow-md dark:hover:shadow-gray-900/50 hover:-translate-y-0.5 transition-all duration-200 group cursor-pointer active:scale-[0.98]">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">{card.label}</p>
                <div className={`w-9 h-9 rounded-lg ${c.bg} flex items-center justify-center ring-1 ${c.ring} group-hover:scale-110 transition-transform duration-200`}>
                  {card.key === 'revenue' ? (
                    <div className={`${c.icon}`}>{REVENUE_CARD.icon}</div>
                  ) : (
                    <svg className={`w-5 h-5 ${c.icon}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">{card.icon}</svg>
                  )}
                </div>
              </div>
              <p className={`text-3xl font-bold ${c.text}`}>{value}</p>
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
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Today's Collection</span>
            <span className="text-[10px] text-gray-400 dark:text-gray-500">{completed.length} completed visits</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div>
              <span className="text-[10px] text-gray-500 dark:text-gray-400 uppercase">Collected</span>
              <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(todayCollected)}</p>
            </div>
            <div className="w-px h-8 bg-gray-200 dark:bg-gray-700" />
            <div>
              <span className="text-[10px] text-gray-500 dark:text-gray-400 uppercase">Pending</span>
              <p className="text-lg font-bold text-amber-500 dark:text-amber-400">{formatCurrency(todayPending)}</p>
            </div>
            <div className="w-px h-8 bg-gray-200 dark:bg-gray-700" />
            <div className="flex gap-3">
              {Object.entries(paymentMethods).map(([method, count]) => (
                <div key={method} className="text-center">
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase block">{method}</span>
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{count}</span>
                </div>
              ))}
            </div>
            {todayPending > 0 && (
              <button onClick={() => router.push('/dashboard/appointments?status=completed')}
                className="ml-auto px-3 py-1.5 text-[11px] font-medium bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-lg border border-amber-200 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-all">
                Collect Pending
              </button>
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
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Upcoming</h2>
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
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {a.is_priority ? '⭐ ' : ''}
                        {a.patient_id ? (
                          <Link href={`/dashboard/patients/${a.patient_id}`} className="hover:text-blue-600 dark:hover:text-blue-400 hover:underline">
                            {a.patient_name || 'Patient'}
                          </Link>
                        ) : (
                          a.patient_name || 'Patient'
                        )}
                        {recentBookings.some(b => b.id === a.id) && (
                          <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 dark:bg-blue-800/50 text-blue-700 dark:text-blue-300 animate-scale-in">New</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{a.time?.slice(0, 5)} — {Array.isArray(a?.treatments) && a.treatments.length > 0 ? a.treatments.join(' + ') : a.treatment || 'Visit'}</p>
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
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Recent Activity</h2>
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
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {a.patient_id ? (
                          <Link href={`/dashboard/patients/${a.patient_id}`} className="hover:text-blue-600 dark:hover:text-blue-400 hover:underline">
                            {a.patient_name || 'Patient'}
                          </Link>
                        ) : (
                          a.patient_name || 'Patient'
                        )}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{Array.isArray(a?.treatments) && a.treatments.length > 0 ? a.treatments.join(' + ') : a.treatment || 'Visit'} — ₹{(a.consultation_fee || 0) + (a.treatment_charges || 0) + (a.medicine_charges || 0)}</p>
                    </div>
                  </div>
                  <StatusBadge status={a.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[9999] animate-scale-in">
          <div className="flex items-center gap-2.5 px-5 py-3 bg-emerald-600 text-white rounded-2xl shadow-2xl border border-emerald-500/50 text-sm font-medium">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            {toast}
          </div>
        </div>
      )}

      {/* Quick Booking Modal — Enhanced */}
      {bookingModal.open && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center animate-backdrop-in">
          {/* Subtle backdrop */}
          <div className="absolute inset-0 bg-black/30 dark:bg-black/60 backdrop-blur-sm" onClick={() => setBookingModal({ open: false, time: null })} />

          {/* Modal Card */}
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl dark:shadow-gray-900/80 border border-gray-200 dark:border-gray-700 w-full max-w-md mx-4 overflow-hidden animate-scale-in" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3">
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

            <QuickBookForm
              date={selectedDate}
              time={bookingModal.time}
              onClose={() => setBookingModal({ open: false, time: null })}
              onBooked={(appt) => { handleBookingComplete(appt); setBookingModal({ open: false, time: null }); }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
