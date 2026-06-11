import React, { useState, useEffect, useCallback } from 'react';
import { X, Search } from 'lucide-react';

const LOCATIONS = ['Hudco', 'Bhilai', 'Durg', 'Nehru Nagar', 'Borsi'];

export default function WalkInDrawer({ onComplete, onClose }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [age, setAge] = useState('');
  const [sex, setSex] = useState('');
  const [location, setLocation] = useState('');
  const [showCustomLocation, setShowCustomLocation] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Patient search with debounce
  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/dashboard/patients/search?q=${encodeURIComponent(searchQuery)}`);
        const data = await res.json();
        setSearchResults(data.patients || []);
      } catch {} finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const selectExisting = useCallback(async (p) => {
    onComplete({
      id: p.id,
      name: p.name,
      phone: p.phone || '',
      age: p.age || '',
      sex: p.sex || '',
      location: p.location || '',
    });
  }, [onComplete]);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      // Try to find existing patient
      if (phone) {
        const res = await fetch(`/api/dashboard/patients/search?q=${encodeURIComponent(phone.replace(/\D/g, ''))}`);
        const data = await res.json();
        const match = (data.patients || []).find(p =>
          p.phone?.replace(/\D/g, '') === phone.replace(/\D/g, '')
        );
        if (match) {
          onComplete({
            id: match.id,
            name: name.trim(),
            phone: match.phone || '',
            age: match.age || '',
            sex: match.sex || '',
            location: match.location || '',
          });
          setSubmitting(false);
          return;
        }
      }

      // Create new patient
      onComplete({
        name: name.trim(),
        phone: phone || '',
        age: age || '',
        sex: sex || '',
        location: location || '',
      });
    } catch {} finally {
      setSubmitting(false);
    }
  }, [name, phone, age, sex, location, onComplete]);

  const isExistingPatient = searchQuery.trim().length >= 2 && searchResults.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white dark:bg-gray-900 shadow-2xl h-full overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">New Walk-in</h2>
          <button type="button" onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Search existing */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search existing patient..."
              className="w-full pl-8 pr-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 transition-all" />
            {searching && (
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                <div className="w-3.5 h-3.5 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
              </div>
            )}
          </div>

          {isExistingPatient && (
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-100 dark:divide-gray-800 max-h-[200px] overflow-y-auto">
              {searchResults.slice(0, 5).map(p => (
                <button key={p.id} type="button" onClick={() => selectExisting(p)}
                  className="w-full text-left px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{p.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{p.phone} · {p.age || '?'} yrs · {p.sex || '—'}</p>
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <hr className="flex-1 border-gray-200 dark:border-gray-700" />
            <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">OR register new</span>
            <hr className="flex-1 border-gray-200 dark:border-gray-700" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Name *</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} autoFocus
                className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 transition-all"
                placeholder="Patient name" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Phone</label>
              <div className="flex gap-1">
                <span className="px-2 py-2 text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">+91</span>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  className="flex-1 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 transition-all"
                  placeholder="Phone number" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Age</label>
                <input type="number" value={age} onChange={e => setAge(e.target.value)}
                  min={0} max={150}
                  className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 transition-all"
                  placeholder="Years" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Sex</label>
                <select value={sex} onChange={e => setSex(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 transition-all">
                  <option value="">Select</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Location</label>
              <div className="flex gap-2">
                <select value={showCustomLocation ? 'Other' : location} onChange={e => {
                  if (e.target.value === 'Other') { setShowCustomLocation(true); setLocation(''); }
                  else { setShowCustomLocation(false); setLocation(e.target.value); }
                }}
                  className="flex-1 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 transition-all">
                  <option value="">Select</option>
                  {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
                  <option value="Other">Other</option>
                </select>
              </div>
              {showCustomLocation && (
                <input type="text" value={location} onChange={e => setLocation(e.target.value)}
                  placeholder="Enter location"
                  className="mt-1 w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 transition-all" />
              )}
            </div>

            <button type="submit" disabled={submitting || !name.trim()}
              className="w-full py-2.5 text-sm font-semibold rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white hover:from-emerald-600 hover:to-emerald-700 shadow-lg shadow-emerald-200 dark:shadow-emerald-900/50 transition-all active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed">
              {submitting ? 'Creating...' : 'Start Consultation'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
