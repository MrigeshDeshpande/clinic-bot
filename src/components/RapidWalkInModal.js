'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Search } from 'lucide-react';

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash', icon: '\u{1F4B5}' },
  { value: 'upi', label: 'UPI', icon: '\u{1F4F1}' },
  { value: 'card', label: 'Card', icon: '\u{1F4B3}' },
  { value: 'other', label: 'Other', icon: '\u{1FA99}' },
];

const PHONE_PREFIX = '+91';
function stripPhonePrefix(v) { return v?.replace(/^(\+91|91)/, '') || v || ''; }
function withPhonePrefix(v) { const s = stripPhonePrefix(v); return s ? `${PHONE_PREFIX}${s}` : ''; }

export default function RapidWalkInModal({ onClose, onSuccess, showToast }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [treatmentFee, setTreatmentFee] = useState(500);
  const [medicineFee, setMedicineFee] = useState(0);
  const total = treatmentFee + medicineFee;
  const [paid, setPaid] = useState(500);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [searchResults, setSearchResults] = useState([]);
  const [searchState, setSearchState] = useState('idle');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [method, setMethod] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState('');
  const nameInputRef = useRef(null);
  const queryRef = useRef('');

  // Focus name input on mount
  useEffect(() => {
    setTimeout(() => nameInputRef.current?.focus(), 100);
  }, []);

  // Debounced patient search
  useEffect(() => {
    const abort = new AbortController();
    queryRef.current = name;
    if (name.length < 2 || selectedPatient) {
      setSearchResults([]);
      setSearchState('idle');
      return;
    }
    setSearchResults([]);
    setSearchState('searching');
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/dashboard/patients/search?q=${encodeURIComponent(name)}`, { signal: abort.signal });
        const d = await res.json();
        const results = d.patients || [];
        if (queryRef.current !== name) return; // stale
        setSearchResults(results);
        setSearchState(results.length > 0 ? 'success' : 'empty');
      } catch (e) {
        if (e.name !== 'AbortError') { console.error('Walk-in search error:', e); setSearchState('idle'); }
      }
    }, 250);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [name, selectedPatient]);

  // Auto-highlight first result
  useEffect(() => {
    setHighlightedIndex(searchState === 'success' && searchResults.length > 0 ? 0 : -1);
  }, [searchResults]);

  // Global Escape handler
  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') {
        if (searchState === 'success' || searchResults.length > 0) {
          setSearchResults([]);
          setSearchState('idle');
        } else {
          onClose?.();
        }
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [searchState, searchResults, onClose]);

  function selectPatient(p) {
    setSelectedPatient(p);
    setName(p.name);
    setPhone((p.phone || '').replace(/\D/g, '').slice(0, 10));
    setSearchResults([]);
    setSearchState('idle');
  }

  const outstanding = Math.max(0, total - paid);

  function getPaymentStatus() {
    if (paid >= total) return 'paid';
    if (paid > 0) return 'partial';
    return 'pending';
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) { setError('Patient name is required'); return; }
    if (paid > 0 && !method) { setError('Select a payment method'); return; }
    setSaving(true);
    setError('');
    try {
      const payload = {
        patient_name: name.trim(),
        patient_phone: phone ? `+91${phone}` : undefined,
        treatmentCharges: treatmentFee,
        medicineCharges: medicineFee,
        paidAmount: paid,
        paymentStatus: getPaymentStatus(),
        notes: notes.trim() || undefined,
      };
      if (paid > 0) {
        payload.paymentMethod = method;
      }
      const res = await fetch('/api/dashboard/visit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        showToast?.('Walk-in completed', 'success');
        onSuccess?.(data);
      } else {
        setError(data.error || 'Failed to save');
      }
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center animate-backdrop-in">
      <div className="absolute inset-0 bg-black/30 dark:bg-black/60 backdrop-blur-sm cursor-pointer" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl dark:shadow-gray-900/80 border border-gray-200 dark:border-gray-700 w-full max-w-sm mx-4 animate-scale-in overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-lg">Quick Walk-In</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Complete a visit in seconds</p>
          </div>
          <button onClick={onClose} className="p-1 -mr-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 dark:text-gray-500 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="relative">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Patient Name *</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500 pointer-events-none" />
              <input
                ref={nameInputRef}
                type="text"
                value={name}
                onChange={e => { setName(e.target.value); setSelectedPatient(null); }}
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
                className="w-full pl-9 pr-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-200 dark:focus:ring-gray-600 transition-colors placeholder-gray-400 dark:placeholder-gray-500"
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

          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Phone</label>
            <div className="flex">
              <span className="inline-flex items-center px-3 py-2.5 bg-gray-100 dark:bg-gray-700 border border-r-0 border-gray-200 dark:border-gray-600 rounded-l-xl text-sm font-medium text-gray-600 dark:text-gray-300 shrink-0">{PHONE_PREFIX}</span>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="9876543210"
                className="flex-1 px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-r-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-200 dark:focus:ring-gray-600 transition-colors placeholder-gray-400 dark:placeholder-gray-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Treat. Fee</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 dark:text-gray-500 font-medium">₹</span>
                <input
                  type="number"
                  min="0"
                  value={treatmentFee}
                  onChange={e => {
                    const diff = (Number(e.target.value) || 0) - treatmentFee;
                    setTreatmentFee(Math.max(0, Number(e.target.value) || 0));
                    setPaid(prev => Math.max(0, prev + diff));
                  }}
                  className="w-full pl-8 pr-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl text-sm font-medium text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-200 dark:focus:ring-gray-600 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Med. Fee</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 dark:text-gray-500 font-medium">₹</span>
                <input
                  type="number"
                  min="0"
                  value={medicineFee}
                  onChange={e => {
                    const diff = (Number(e.target.value) || 0) - medicineFee;
                    setMedicineFee(Math.max(0, Number(e.target.value) || 0));
                    setPaid(prev => Math.max(0, prev + diff));
                  }}
                  className="w-full pl-8 pr-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl text-sm font-medium text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-200 dark:focus:ring-gray-600 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
            </div>
            
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Amount Paid (Out of ₹{total.toLocaleString()})</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 dark:text-gray-500 font-medium">₹</span>
                <input
                  type="number"
                  min="0"
                  value={paid}
                  onChange={e => setPaid(Math.max(0, Number(e.target.value) || 0))}
                  className="w-full pl-8 pr-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl text-sm font-medium text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-200 dark:focus:ring-gray-600 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
            </div>
          </div>

          {outstanding > 0 && (
            <div className="flex items-center justify-between px-3 py-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
              <span className="text-xs font-medium text-amber-700 dark:text-amber-400">Outstanding</span>
              <span className="text-sm font-bold text-amber-800 dark:text-amber-300">₹{outstanding.toLocaleString('en-IN')}</span>
            </div>
          )}

          <div>
            <label className={`block text-xs font-medium mb-1.5 ${paid > 0 ? 'text-gray-500 dark:text-gray-400' : 'text-gray-400 dark:text-gray-500'}`}>Payment Mode</label>
            <div className="flex gap-2">
              {PAYMENT_METHODS.map(m => (
                <button
                  key={m.value}
                  type="button"
                  disabled={paid === 0}
                  onClick={() => setMethod(m.value)}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                    method === m.value
                      ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-gray-900 dark:border-white'
                      : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                  } ${paid === 0 ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <span className="text-base">{m.icon}</span>
                  {m.label}
                </button>
              ))}
            </div>
            {paid === 0 && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Set paid amount to select payment method</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Notes <span className="text-gray-400 dark:text-gray-500 font-normal">(optional)</span></label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Cash received by doctor..."
              className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-200 dark:focus:ring-gray-600 transition-colors placeholder-gray-400 dark:placeholder-gray-500"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 rounded-lg px-3 py-2 border border-red-100 dark:border-red-800">
              <X className="w-3 h-3 shrink-0" />
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 text-sm font-medium rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-all">Cancel</button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="flex-1 px-4 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold rounded-xl hover:bg-gray-800 dark:hover:bg-gray-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-[0.98]"
            >
              {saving ? (
                <><div className="w-4 h-4 border-2 border-white/30 dark:border-gray-900/30 border-t-white dark:border-t-gray-900 rounded-full animate-spin" /> Saving...</>
              ) : (
                <>{paid > 0 ? `Paid & Complete — ₹${paid.toLocaleString('en-IN')}` : 'Complete (No Payment)'}</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
