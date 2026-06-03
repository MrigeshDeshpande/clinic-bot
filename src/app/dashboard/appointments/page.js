'use client';

import { useState, useEffect, useCallback, useRef, useContext, Suspense } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FileImage, Phone as PhoneIcon } from 'lucide-react';
import { parseDateOnly, formatDateLong, formatDateShort } from '@/lib/date';
import { TREATMENT_NAMES } from '@/lib/treatments';
import Calendar from '@/components/Calendar';
import { DateContext, ToastContext } from '../layout';

function StatusBadge({ status, arrivalStatus }) {
  if (status === 'completed') return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800">Completed</span>;
  if (status === 'no_show') return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800">No Show</span>;
  if (arrivalStatus === 'called') return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800">In Session</span>;
  if (arrivalStatus === 'arrived') return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">Waiting</span>;
  return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700">Scheduled</span>;
}

// Preset fee packages for one-tap filling
const PRESET_FEES = [
  { label: 'Scaling', fee: 500, icon: '🦷' },
  { label: 'Filling', fee: 800, icon: '🩹' },
  { label: 'RCT', fee: 3000, icon: '🔬' },
  { label: 'Extraction', fee: 600, icon: '🦷' },
  { label: 'Cleaning', fee: 400, icon: '✨' },
];

// Follow-up auto-suggest in days based on treatment type
const FOLLOW_UP_SUGGEST = {
  'Root Canal': 7,
  'Scaling': 180,
  'Teeth Cleaning': 180,
  'Dental Filling': 365,
  'Extraction': 7,
  'Crown': 14,
  'Implants': 90,
  'Braces Adjustment': 30,
  'General Checkup': 180,
  'Whitening': 365,
  'Veneers': 365,
  'Pediatric Dentistry': 180,
};

function computeFollowUpDate(treatmentName) {
  const days = FOLLOW_UP_SUGGEST[treatmentName];
  if (!days) return '';
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function VisitCompleteModal({ appointment, onClose, onComplete, showToast }) {
  const [treatment, setTreatment] = useState(appointment?.treatment || '');
  const [consultationFee, setConsultationFee] = useState(String(appointment?.consultation_fee || ''));
  const [treatmentCharges, setTreatmentCharges] = useState(String(appointment?.treatment_charges || ''));
  const [medicineCharges, setMedicineCharges] = useState(String(appointment?.medicine_charges || ''));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [diagnosis, setDiagnosis] = useState('');
  const [followUpDate, setFollowUpDate] = useState(
    appointment?.treatment ? computeFollowUpDate(appointment.treatment) : ''
  );
  const [followUpInstructions, setFollowUpInstructions] = useState('');

  function applyPreset(feeAmount) {
    setConsultationFee(String(feeAmount));
  }

  function handleTreatmentChange(name) {
    setTreatment(name);
    const suggested = computeFollowUpDate(name);
    if (suggested) setFollowUpDate(suggested);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!treatment) { setError('Please select a treatment'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/dashboard/visit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointmentId: appointment.id,
          treatment,
          diagnosis: diagnosis.trim() || undefined,
          consultationFee: Number(consultationFee) || 0,
          treatmentCharges: Number(treatmentCharges) || 0,
          medicineCharges: Number(medicineCharges) || 0,
          followUpDate: followUpDate || undefined,
          followUpInstructions: followUpInstructions.trim() || undefined,
          status: 'completed',
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Visit completed successfully', 'success');
        onComplete(appointment.id);
      } else {
        setError(data.error || 'Failed to complete visit');
      }
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }

  if (!appointment) return null;

  const total = Number(consultationFee) + Number(treatmentCharges) + Number(medicineCharges);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center animate-backdrop-in">
      <div className="absolute inset-0 bg-black/30 dark:bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl dark:shadow-gray-900/80 border border-gray-200 dark:border-gray-700 w-full max-w-sm mx-4 animate-scale-in max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 pt-5 pb-2 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-md shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Complete Visit</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {appointment.patient_name || 'Patient'}
                {appointment.time && <span> · {appointment.time?.slice(0, 5)}</span>}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 -mr-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 dark:text-gray-500 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 pb-5 pt-2">
          {/* Treatment */}
          <div className="mb-3.5">
            <select value={treatment} onChange={e => handleTreatmentChange(e.target.value)}
              className="w-full px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-200 dark:focus:ring-emerald-800 focus:border-emerald-400 dark:focus:border-emerald-500 appearance-none transition-all cursor-pointer">
              <option value="">Select treatment...</option>
              {TREATMENT_NAMES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* Preset fee packages — hero element */}
          <div className="mb-3.5">
            <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1.5">Fee</p>
            <div className="grid grid-cols-3 gap-1.5">
              {PRESET_FEES.map(p => (
                <button key={p.label} type="button" onClick={() => applyPreset(p.fee)}
                  className={`flex flex-col items-center gap-0.5 px-2 py-2.5 rounded-xl text-xs font-medium border transition-all active:scale-95 ${
                    consultationFee === String(p.fee)
                      ? 'bg-emerald-100 dark:bg-emerald-900/40 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 ring-1 ring-emerald-300 dark:ring-emerald-700'
                      : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-emerald-300 dark:hover:border-emerald-600 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10'
                  }`}>
                  <span className="text-base">{p.icon}</span>
                  <span className="font-semibold">₹{p.fee}</span>
                  <span className="text-[10px] opacity-70">{p.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Fee breakdown + Custom fee input */}
          <div className="mb-3.5">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <label className="text-[10px] font-medium text-gray-400 dark:text-gray-500">Consultation (₹)</label>
                <input type="number" min="0" value={consultationFee} onChange={e => setConsultationFee(e.target.value)}
                  className="w-full px-2.5 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-200 dark:focus:ring-emerald-800 focus:border-emerald-400 dark:focus:border-emerald-500 transition-all"
                  placeholder="0" />
              </div>
              <div className="flex-1">
                <label className="text-[10px] font-medium text-gray-400 dark:text-gray-500">Treatment (₹)</label>
                <input type="number" min="0" value={treatmentCharges} onChange={e => setTreatmentCharges(e.target.value)}
                  className="w-full px-2.5 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-200 dark:focus:ring-emerald-800 focus:border-emerald-400 dark:focus:border-emerald-500 transition-all"
                  placeholder="0" />
              </div>
              <div className="flex-1">
                <label className="text-[10px] font-medium text-gray-400 dark:text-gray-500">Medicines (₹)</label>
                <input type="number" min="0" value={medicineCharges} onChange={e => setMedicineCharges(e.target.value)}
                  className="w-full px-2.5 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-200 dark:focus:ring-emerald-800 focus:border-emerald-400 dark:focus:border-emerald-500 transition-all"
                  placeholder="0" />
              </div>
            </div>
            {total > 0 && (
              <p className="text-xs text-gray-500 dark:text-gray-400 text-right mt-1">
                Total: <span className="font-semibold text-gray-900 dark:text-gray-100">₹{total.toLocaleString('en-IN')}</span>
              </p>
            )}
          </div>

          {/* Expandable details: Diagnosis + Follow-up */}
          {!showDetails && (
            <button type="button" onClick={() => setShowDetails(true)}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-all mb-2">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Add diagnosis & follow-up
            </button>
          )}

          {showDetails && (
            <div className="space-y-3 mb-3.5 animate-slide-down">
              <div className="border-t border-gray-100 dark:border-gray-800 pt-3" />
              {/* Diagnosis */}
              <div>
                <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">Diagnosis / Observations</label>
                <textarea value={diagnosis} onChange={e => setDiagnosis(e.target.value)}
                  rows={2} className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-200 dark:focus:ring-emerald-800 focus:border-emerald-400 dark:focus:border-emerald-500 transition-all resize-none"
                  placeholder="Brief diagnosis or observations..." />
              </div>
              {/* Follow-up */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">Follow-up Date</label>
                  <input type="date" value={followUpDate} onChange={e => setFollowUpDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-200 dark:focus:ring-emerald-800 focus:border-emerald-400 dark:focus:border-emerald-500 transition-all" />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">Instructions</label>
                  <input type="text" value={followUpInstructions} onChange={e => setFollowUpInstructions(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-200 dark:focus:ring-emerald-800 focus:border-emerald-400 dark:focus:border-emerald-500 transition-all"
                    placeholder="e.g. Return in 2 weeks" />
                </div>
              </div>
              {treatment && FOLLOW_UP_SUGGEST[treatment] && (
                <p className="text-[10px] text-gray-400 dark:text-gray-500">
                  💡 Suggested in {FOLLOW_UP_SUGGEST[treatment]} day{FOLLOW_UP_SUGGEST[treatment] > 1 ? 's' : ''} for {treatment}
                </p>
              )}
              <button type="button" onClick={() => setShowDetails(false)}
                className="text-[11px] text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                Hide details ↑
              </button>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 rounded-lg px-3 py-2 border border-red-100 dark:border-red-800 mb-3">
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              {error}
            </div>
          )}

          <div className="flex gap-2.5">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 text-sm font-medium rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-all">Cancel</button>
            <button type="submit" disabled={saving || !treatment}
              className="flex-1 px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white text-sm font-semibold rounded-xl hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] shadow-lg shadow-emerald-200 dark:shadow-emerald-900/50 flex items-center justify-center gap-2">
              {saving ? (
                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving...</>
              ) : (
                <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> Complete</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const TOTALS_CONFIG = [
  { key: 'confirmed', label: 'Confirmed', color: 'text-gray-900 dark:text-gray-100', bg: 'bg-gray-50 dark:bg-gray-800', ring: 'ring-gray-100 dark:ring-gray-700', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4" /> },
  { key: 'waiting', label: 'Waiting', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30', ring: 'ring-amber-100 dark:ring-amber-800', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /> },
  { key: 'in_session', label: 'In Session', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30', ring: 'ring-blue-100 dark:ring-blue-800', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /> },
  { key: 'completed', label: 'Completed', color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/30', ring: 'ring-green-100 dark:ring-green-800', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /> },
  { key: 'no_show', label: 'No Show', color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/30', ring: 'ring-red-100 dark:ring-red-800', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /> },
];

function AppointmentsContent() {
  const { selectedDate, setSelectedDate } = useContext(DateContext);
  const { showToast } = useContext(ToastContext);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(null);
  const [error, setError] = useState('');
  const [arrivalUpdating, setArrivalUpdating] = useState(null);
  const [dotDates, setDotDates] = useState([]);
  const [showCalendar, setShowCalendar] = useState(false);
  const calRef = useRef();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeStatus = searchParams.get('status');
  const activeArrival = searchParams.get('arrival');

  const filteredAppointments = (data?.appointments || []).filter(a => {
    if (activeStatus) return a.status === activeStatus;
    if (activeArrival === 'arrived') return a.arrival_status === 'arrived';
    if (activeArrival === 'called') return a.arrival_status === 'called';
    return true;
  });

  const noFilter = !activeStatus && !activeArrival;

  const fetchCalendarDots = useCallback(async (date) => {
    const d = parseDateOnly(date) || new Date();
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    try { const res = await fetch(`/api/dashboard/calendar?year=${year}&month=${month}`); const json = await res.json(); setDotDates(Object.keys(json.dates || {})); } catch {}
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;
    fetch(`/api/dashboard/appointments?date=${selectedDate}`, { signal })
      .then(async r => { if (signal.aborted) return null; const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Failed to fetch appointments'); return d; })
      .then(d => { if (!signal.aborted && d) { setData(d); setLoading(false); } })
      .catch(e => { if (!signal.aborted) { setError(e.message); setLoading(false); } });
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchCalendarDots(selectedDate);
    return () => controller.abort();
  }, [selectedDate, fetchCalendarDots]);

  useEffect(() => {
    function handleClick(e) { if (calRef.current && !calRef.current.contains(e.target)) setShowCalendar(false); }
    if (showCalendar) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showCalendar]);

  function handleDateSelect(date) { setSelectedDate(date); setShowCalendar(false); }

  async function handleStatusChange(appointmentId, newStatus) {
    setUpdating(appointmentId);
    try {
      const res = await fetch('/api/dashboard/visit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId, status: newStatus }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(newStatus === 'completed' ? 'Marked as completed' : 'Marked as no show', 'success');
      } else {
        showToast(data.error || 'Failed to update status', 'error');
      }
    } catch {
      showToast('Network error', 'error');
    }
    setUpdating(null);
    fetch(`/api/dashboard/appointments?date=${selectedDate}`)
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Failed to reload'); return d; })
      .then(d => { if (d && !d.error) setData(d); })
      .catch(e => setError(e.message));
  }

  async function handleArrivalChange(appointmentId, arrivalStatus) {
    setArrivalUpdating(appointmentId);
    try {
      const res = await fetch('/api/dashboard/arrival', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId, arrivalStatus }),
      });
      const data = await res.json();
      if (res.ok) {
        const label = arrivalStatus === 'arrived' ? 'Marked as arrived' : 'Marked as in session';
        showToast(label, 'success');
      } else {
        showToast(data.error || 'Failed to update arrival', 'error');
      }
    } catch {
      showToast('Network error', 'error');
    }
    setArrivalUpdating(null);
    fetch(`/api/dashboard/appointments?date=${selectedDate}`)
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Failed to reload'); return d; })
      .then(d => { if (d && !d.error) setData(d); })
      .catch(e => setError(e.message));
  }

  const [completeModal, setCompleteModal] = useState(null);
  const [editing, setEditing] = useState(null);
  const [editValue, setEditValue] = useState('');
  const editRef = useRef(null);

  function getMediaCount(a) {
    return a.chit_media?.length || 0;
  }

  async function handleInlineSave(appointmentId, field, value) {
    setEditing(null);
    const res = await fetch(`/api/dashboard/appointments/${appointmentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    });
    if (res.ok) {
      const json = await res.json();
      setData(prev => ({
        ...prev,
        appointments: (prev?.appointments || []).map(a =>
          a.id === appointmentId ? { ...a, ...json.appointment } : a
        ),
      }));
    }
  }

  function startEdit(id, field, currentValue) {
    setEditing(`${id}::${field}`);
    setEditValue(String(currentValue ?? ''));
    setTimeout(() => editRef.current?.select(), 0);
  }

  function InlineEdit({ appointmentId, field, value, display, className }) {
    const key = `${appointmentId}::${field}`;
    if (editing === key) {
      return (
        <input
          ref={editRef}
          type="text"
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={() => handleInlineSave(appointmentId, field, editValue)}
          onKeyDown={e => {
            if (e.key === 'Enter') handleInlineSave(appointmentId, field, editValue);
            if (e.key === 'Escape') setEditing(null);
          }}
          className="w-full px-1 py-0.5 text-sm border border-blue-400 rounded bg-blue-50 dark:bg-blue-900/30 dark:border-blue-600 outline-none"
          autoFocus
        />
      );
    }
    return (
      <span onClick={() => startEdit(appointmentId, field, value)}
        className={`cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 px-1 -mx-1 rounded transition-colors ${className || ''}`}>
        {display ?? value ?? '—'}
      </span>
    );
  }

  return (
    <>
      <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Appointments</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            {formatDateLong(selectedDate)}
          </p>
        </div>
        <div className="relative" ref={calRef}>
          <button
            onClick={() => setShowCalendar(!showCalendar)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 hover:border-blue-200 dark:hover:border-blue-600 hover:shadow-sm transition-all text-sm text-gray-700 dark:text-gray-300"
          >
            <svg className="w-4 h-4 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {formatDateShort(selectedDate)}
          </button>
          {showCalendar && (
            <>
              <div className="fixed inset-0 bg-black/20 dark:bg-black/50 z-40" onClick={() => setShowCalendar(false)} />
              <div className="fixed md:absolute left-1/2 md:left-auto -translate-x-1/2 md:translate-x-0 md:right-0 top-1/4 md:top-full mt-2 z-50 w-72 animate-slide-down shadow-xl">
                <Calendar selectedDate={selectedDate} onDateSelect={handleDateSelect} dotDates={dotDates} onMonthChange={(y, m) => fetchCalendarDots(`${y}-${String(m).padStart(2,'0')}-01`)} />
              </div>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="shimmer h-12 w-full rounded-xl" />
          <div className="shimmer h-64 w-full rounded-xl" />
        </div>
      ) : error ? (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 text-red-700 dark:text-red-400 text-sm">{error}</div>
      ) : (
        <div className="space-y-6">
          {/* Summary Cards */}
            {data?.totals && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {TOTALS_CONFIG.map(cfg => {
                const isActive = cfg.key === 'confirmed' ? noFilter
                  : cfg.key === 'waiting' ? activeArrival === 'arrived'
                  : cfg.key === 'in_session' ? activeArrival === 'called'
                  : cfg.key === 'completed' ? activeStatus === 'completed'
                  : cfg.key === 'no_show' ? activeStatus === 'no_show'
                  : false;
                const links = {
                  confirmed: '/dashboard/appointments',
                  waiting: '/dashboard/appointments?arrival=arrived',
                  in_session: '/dashboard/appointments?arrival=called',
                  completed: '/dashboard/appointments?status=completed',
                  no_show: '/dashboard/appointments?status=no_show',
                };
                return (
                <button key={cfg.key} onClick={() => router.push(isActive ? '/dashboard/appointments' : links[cfg.key])}
                  className={`w-full text-left bg-white dark:bg-gray-900 rounded-xl border shadow-sm p-4 transition-all duration-200 group cursor-pointer active:scale-[0.98] ${isActive ? 'border-blue-500 dark:border-blue-400 ring-1 ring-blue-500/20 dark:ring-blue-400/20 -translate-y-0.5 shadow-md' : 'border-gray-100 dark:border-gray-800 hover:shadow-md dark:hover:shadow-gray-900/50 hover:-translate-y-0.5'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <p className={`text-xs font-medium ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'}`}>{cfg.label}</p>
                    <div className={`w-7 h-7 rounded-lg ${cfg.bg} flex items-center justify-center ring-1 ${cfg.ring} group-hover:scale-110 transition-transform`}>
                      <svg className={`w-4 h-4 ${cfg.color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">{cfg.icon}</svg>
                    </div>
                  </div>
                  <p className={`text-2xl font-bold ${cfg.color}`}>{Number(data.totals[cfg.key] || 0)}</p>
                </button>
                );
              })}
            </div>
          )}

          {/* Bulk Actions */}
          {data?.totals?.confirmed > 1 && (
              <div className="flex items-center gap-2 px-1">
              <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Bulk:</span>
              <button
                onClick={async () => {
                  if (!confirm(`Mark all ${data.totals.confirmed} confirmed appointments as completed?`)) return;
                  const res = await fetch(`/api/dashboard/appointments/bulk?date=${selectedDate}&action=complete_all`, { method: 'POST' });
                  const json = await res.json();
                  if (json.success) {
                    const r = await fetch(`/api/dashboard/appointments?date=${selectedDate}`);
                    const d = await r.json();
                    setData(d);
                  }
                }}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/50 border border-green-200 dark:border-green-800 transition-all hover:shadow-sm"
              >
                ✓ Complete All
              </button>
              <button
                onClick={async () => {
                  if (!confirm(`Cancel all ${data.totals.confirmed} confirmed appointments?`)) return;
                  const res = await fetch(`/api/dashboard/appointments/bulk?date=${selectedDate}&action=cancel_all`, { method: 'POST' });
                  const json = await res.json();
                  if (json.success) {
                    const r = await fetch(`/api/dashboard/appointments?date=${selectedDate}`);
                    const d = await r.json();
                    setData(d);
                  }
                }}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 border border-red-200 dark:border-red-800 transition-all hover:shadow-sm"
              >
                ✕ Cancel All
              </button>
            </div>
          )}

          {/* Appointments Table */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-800/80">
                    <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Time</th>
                    <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Patient</th>
                    <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Phone</th>
                    <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Location</th>
                    <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Treatment</th>
                    <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                    <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Amount</th>
                    <th className="text-right px-5 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.appointments || []).length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-5 py-16 text-center">
                        <div className="flex flex-col items-center gap-2">
                          <svg className="w-12 h-12 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <p className="text-gray-400 dark:text-gray-500 text-sm">No appointments for this date.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    (data?.appointments || []).map((a) => (
                      <tr key={a.id} className={`border-b border-gray-50 dark:border-gray-800 hover:bg-blue-50/30 dark:hover:bg-blue-900/10 transition-colors ${updating === a.id ? 'opacity-50 pointer-events-none' : ''}`}>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <span className={`w-1.5 h-1.5 rounded-full ${a.status === 'completed' ? 'bg-green-400' : a.status === 'no_show' ? 'bg-red-400' : 'bg-blue-400'}`} />
                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{a.time?.slice(0, 5)}</span>
                            {a.is_priority && <span className="text-xs">⭐</span>}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <span className="w-7 h-7 rounded-full bg-gradient-to-br from-gray-100 to-gray-50 dark:from-gray-700 dark:to-gray-600 flex items-center justify-center text-xs font-semibold text-gray-600 dark:text-gray-300 flex-shrink-0">
                              {(a.patient_name || 'P')[0].toUpperCase()}
                            </span>
                            {a.patient_id ? (
                              <Link href={`/dashboard/patients/${a.patient_id}`} className="text-sm text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 hover:underline truncate max-w-[160px]">
                                {a.patient_name || '—'}
                              </Link>
                            ) : (
                              <span className="text-sm text-gray-700 dark:text-gray-300 truncate max-w-[160px]">{a.patient_name || '—'}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-sm text-gray-500 dark:text-gray-400">
                          <InlineEdit
                            appointmentId={a.id}
                            field="patient_phone"
                            value={a.patient_phone || ''}
                            display={a.patient_phone ? (
                              <span className="flex items-center gap-1">
                                <PhoneIcon className="w-3 h-3 text-gray-400 dark:text-gray-500" />
                                {a.patient_phone}
                              </span>
                            ) : '—'}
                          />
                        </td>
                        <td className="px-5 py-4 text-sm text-gray-500 dark:text-gray-400">
                          <InlineEdit
                            appointmentId={a.id}
                            field="location"
                            value={a.location || ''}
                            display={a.location || '—'}
                          />
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm text-gray-500 dark:text-gray-400">{a.treatment || '—'}</span>
                            {getMediaCount(a) > 0 && (
                              <Link
                                href={a.patient_id ? `/dashboard/patients/${a.patient_id}` : '#'}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs font-medium hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                                title={`${getMediaCount(a)} media file(s)`}
                              >
                                <FileImage className="w-3 h-3" />
                                {getMediaCount(a)}
                              </Link>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-4"><StatusBadge status={a.status} arrivalStatus={a.arrival_status} /></td>
                        <td className="px-5 py-4 text-sm font-medium text-gray-700 dark:text-gray-300">
                          {editing === `${a.id}::fees` ? (
                            <div className="flex gap-1 items-center min-w-[200px]">
                              <input type="number" value={editValue.split(',')[0] || ''} onChange={e => setEditValue(`${e.target.value},${editValue.split(',')[1] || ''},${editValue.split(',')[2] || ''}`)}
                                className="w-14 px-1 py-0.5 text-xs border border-blue-400 rounded bg-blue-50 dark:bg-blue-900/30 dark:border-blue-600 outline-none text-center" placeholder="C"
                                onKeyDown={e => { if (e.key === 'Enter') handleInlineSave(a.id, 'consultation_fee', editValue.split(',')[0]) }} />
                              <input type="number" value={editValue.split(',')[1] || ''} onChange={e => setEditValue(`${editValue.split(',')[0] || ''},${e.target.value},${editValue.split(',')[2] || ''}`)}
                                className="w-14 px-1 py-0.5 text-xs border border-blue-400 rounded bg-blue-50 dark:bg-blue-900/30 dark:border-blue-600 outline-none text-center" placeholder="T"
                                onKeyDown={e => { if (e.key === 'Enter') handleInlineSave(a.id, 'treatment_charges', editValue.split(',')[1]) }} />
                              <input type="number" value={editValue.split(',')[2] || ''} onChange={e => setEditValue(`${editValue.split(',')[0] || ''},${editValue.split(',')[1] || ''},${e.target.value}`)}
                                className="w-14 px-1 py-0.5 text-xs border border-blue-400 rounded bg-blue-50 dark:bg-blue-900/30 dark:border-blue-600 outline-none text-center" placeholder="M"
                                onKeyDown={e => { if (e.key === 'Enter') handleInlineSave(a.id, 'medicine_charges', editValue.split(',')[2]) }}
                                onBlur={async () => {
                                  await handleInlineSave(a.id, 'consultation_fee', editValue.split(',')[0]);
                                  await handleInlineSave(a.id, 'treatment_charges', editValue.split(',')[1]);
                                  await handleInlineSave(a.id, 'medicine_charges', editValue.split(',')[2]);
                                }} />
                            </div>
                          ) : (
                            <span onClick={() => startEdit(a.id, 'fees', `${a.consultation_fee || 0},${a.treatment_charges || 0},${a.medicine_charges || 0}`)}
                              className="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 px-1 -mx-1 rounded transition-colors">
                              ₹{(a.consultation_fee || 0) + (a.treatment_charges || 0) + (a.medicine_charges || 0)}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex gap-1 justify-end">
                            {a.status === 'confirmed' && a.arrival_status === 'scheduled' && (
                              <button onClick={() => handleArrivalChange(a.id, 'arrived')} disabled={!!arrivalUpdating}
                                className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/50 border border-amber-200 dark:border-amber-800 transition-all disabled:opacity-50">
                                📍 Arrived
                              </button>
                            )}
                            {a.status === 'confirmed' && a.arrival_status === 'arrived' && (
                              <button onClick={() => handleArrivalChange(a.id, 'called')} disabled={!!arrivalUpdating}
                                className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-800 transition-all disabled:opacity-50">
                                📞 Call
                              </button>
                            )}
                            {a.status === 'confirmed' && (
                              <button onClick={() => setCompleteModal(a)}
                                className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/50 border border-green-200 dark:border-green-800 transition-all">
                                ✓ {a.arrival_status === 'called' ? 'Complete' : 'Done'}
                              </button>
                            )}
                            {a.status === 'confirmed' && (
                              <button onClick={() => handleStatusChange(a.id, 'no_show')} disabled={!!updating}
                                className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 border border-red-200 dark:border-red-800 transition-all disabled:opacity-50">
                                ✕ No Show
                              </button>
                            )}
                            {a.status === 'completed' && (
                              <span className="text-xs text-green-600 dark:text-green-400 font-medium">✓ Completed</span>
                            )}
                            {a.status === 'no_show' && (
                              <span className="text-xs text-red-600 dark:text-red-400 font-medium">✕ No Show</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

    </div>

      {/* One-click Visit Complete Modal — outside animate-fade-in to avoid transform breaking fixed positioning */}
      {typeof window !== 'undefined' && completeModal && createPortal(
        <VisitCompleteModal
          appointment={completeModal}
          onClose={() => setCompleteModal(null)}
          onComplete={(appointmentId) => {
            setCompleteModal(null);
            setData(prev => ({
              ...prev,
              appointments: (prev?.appointments || []).map(a =>
                a.id === appointmentId ? { ...a, status: 'completed' } : a
              ),
            }));
            fetch(`/api/dashboard/appointments?date=${selectedDate}`)
              .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Failed to reload'); return d; })
              .then(d => { if (d && !d.error) setData(d); })
              .catch(e => setError(e.message));
          }}
          showToast={showToast}
        />,
        document.body
      )}
    </>
  );
}

export default AppointmentsContent;
