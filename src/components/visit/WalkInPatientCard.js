import React from 'react';
import { Search } from 'lucide-react';

export default function WalkInPatientCard({ walkInProps }) {
  const {
    appointmentId,
    patientProfile,
    form,
    setForm,
    errors,
    setErrors,
    searchState,
    searchResults,
    highlightedIndex,
    setHighlightedIndex,
    selectPatient,
    searchRef,
    showCustomLocation,
    setShowCustomLocation,
    PHONE_PREFIX,
    LOCATIONS
  } = walkInProps;

  if (appointmentId || patientProfile) {
    return null;
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-6 shadow-sm relative">
      <div className="flex items-center gap-2.5 mb-5">
        <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/30"><Search className="w-4 h-4 text-blue-500 dark:text-blue-400" /></div>
        <h2 className="font-bold text-gray-900 dark:text-gray-100 text-lg">Patient Information</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="relative">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Patient Name *</label>
          <div className="relative">
            <input type="text" value={form.patientName}
              onChange={e => { setForm(f => ({ ...f, patientName: e.target.value })); setErrors(ev => { const n={...ev}; delete n.patientName; return n; }); }}
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
              className={`w-full px-4 py-2.5 bg-white dark:bg-gray-800 border rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 transition-all ${errors.patientName ? 'border-red-300 dark:border-red-700 focus:ring-red-200 dark:focus:ring-red-800' : 'border-gray-200 dark:border-gray-700 focus:ring-blue-200 dark:focus:ring-blue-800 focus:border-blue-400 dark:focus:border-blue-500'}`}
              placeholder="e.g. Rajesh Kumar" />
            {searchState === 'searching' && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="w-3.5 h-3.5 border-2 border-gray-200 dark:border-gray-600 border-t-gray-600 dark:border-t-gray-300 rounded-full animate-spin" />
              </div>
            )}
          </div>
          {errors.patientName && <p className="text-xs text-red-500 dark:text-red-400 mt-1">{errors.patientName}</p>}
          {searchState === 'success' && (
            <div ref={searchRef} className="absolute z-20 mt-1 w-full bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg overflow-hidden">
              {searchResults.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => selectPatient(p)}
                  onMouseEnter={() => setHighlightedIndex(i)}
                  ref={el => { if (highlightedIndex === i && el) el.scrollIntoView({ block: 'nearest' }); }}
                  className={`w-full text-left px-4 py-3 transition-colors flex items-center gap-3 border-b border-gray-50 dark:border-gray-700 last:border-0 ${
                    highlightedIndex === i
                      ? 'bg-blue-100 dark:bg-blue-900/40'
                      : 'hover:bg-blue-50 dark:hover:bg-blue-900/20'
                  }`}
                >
                  <span className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/30 flex items-center justify-center text-xs font-semibold text-blue-700 dark:text-blue-300 flex-shrink-0">
                    {(p.name || '?')[0].toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{p.name}</p>
                    {p.phone && <p className="text-xs text-gray-400 dark:text-gray-500">{p.phone}</p>}
                  </div>
                </button>
              ))}
            </div>
          )}
          {searchState === 'empty' && (
            <div ref={searchRef} className="absolute z-20 mt-1 w-full bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden p-5 text-center">
              <Search className="w-6 h-6 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No patients found</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">A new patient record will be created when you book.</p>
            </div>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Phone</label>
          <div className="flex">
            <span className="inline-flex items-center px-3 py-2.5 bg-gray-100 dark:bg-gray-700 border border-r-0 border-gray-200 dark:border-gray-600 rounded-l-xl text-sm font-medium text-gray-600 dark:text-gray-300 shrink-0">{PHONE_PREFIX}</span>
            <input type="tel" value={form.patientPhone} onChange={e => setForm(f => ({ ...f, patientPhone: e.target.value.replace(/\D/g, '') }))}
              className="flex-1 px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-r-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 focus:border-blue-400 dark:focus:border-blue-500 transition-all"
              placeholder="9876543210" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Age</label>
          <input type="number" min="0" max="150" value={form.patientAge || ''}
            onChange={e => setForm(f => ({ ...f, patientAge: e.target.value }))}
            className="w-full px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 focus:border-blue-400 dark:focus:border-blue-500 transition-all"
            placeholder="e.g. 35" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Sex</label>
            <select value={form.patientSex || ''} onChange={e => setForm(f => ({ ...f, patientSex: e.target.value }))}
            className={`w-full px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 focus:border-blue-400 dark:focus:border-blue-500 transition-all appearance-none ${!form.patientSex ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-gray-100'}`}>
            <option value="">Select...</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div className={showCustomLocation ? 'md:col-span-2' : ''}>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Location</label>
          <div className={showCustomLocation ? 'flex flex-col sm:flex-row gap-2' : ''}>
            <select value={showCustomLocation ? 'Other' : (LOCATIONS.includes(form.patientLocation) ? form.patientLocation : '')} onChange={e => {
              if (e.target.value === 'Other') { setShowCustomLocation(true); setForm(f => ({ ...f, patientLocation: '' })); }
              else { setShowCustomLocation(false); setForm(f => ({ ...f, patientLocation: e.target.value })); }
            }}
              className={`${showCustomLocation ? 'sm:w-1/2' : 'w-full'} px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 focus:border-blue-400 dark:focus:border-blue-500 transition-all appearance-none ${!showCustomLocation && form.patientLocation ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'}`}>
              <option value="">Select...</option>
              <option value="Hudco">Hudco</option>
              <option value="Bhilai">Bhilai</option>
              <option value="Durg">Durg</option>
              <option value="Nehru Nagar">Nehru Nagar</option>
              <option value="Borsi">Borsi</option>
              <option value="Other">Other (type)</option>
            </select>
            {showCustomLocation && (
              <input type="text" value={form.patientLocation} onChange={e => setForm(f => ({ ...f, patientLocation: e.target.value }))} autoFocus
                className="sm:w-1/2 px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 focus:border-blue-400 dark:focus:border-blue-500 transition-all"
                placeholder="Type location..." />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
