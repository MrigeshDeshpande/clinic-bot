'use client';

import { useState, useEffect, useCallback } from 'react';

export default function PatientsPage() {
  const [query, setQuery] = useState('');
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const fetchPatients = useCallback(async (q) => {
    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch(`/api/dashboard/patients?q=${encodeURIComponent(q)}&limit=30`);
      const data = await res.json();
      setPatients(data.patients || []);
    } catch {
      setPatients([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (query.length >= 2) {
      const timer = setTimeout(() => fetchPatients(query), 300);
      return () => clearTimeout(timer);
    } else if (query.length === 0) {
      fetchPatients('');
    }
  }, [query, fetchPatients]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Patients</h1>
        <p className="text-gray-500 mt-1">Search and manage patient records</p>
      </div>

      <div className="mb-6">
        <div className="relative max-w-md">
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by name or phone..."
            className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none text-sm"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full" />
        </div>
      ) : patients.length === 0 && searched ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
          <p className="text-gray-400 text-lg mb-1">No patients found</p>
          <p className="text-gray-300 text-sm">Try a different search term</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Phone</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Age/Sex</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Visits</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Last Visit</th>
              </tr>
            </thead>
            <tbody>
              {patients.map(p => (
                <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition">
                  <td className="px-5 py-4 text-sm font-medium text-gray-900">{p.name || '—'}</td>
                  <td className="px-5 py-4 text-sm text-gray-600">{p.phone || '—'}</td>
                  <td className="px-5 py-4 text-sm text-gray-500">
                    {p.age ? `${p.age}${p.sex ? '/' + p.sex : ''}` : '—'}
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-700">{p.visit_count || 0}</td>
                  <td className="px-5 py-4 text-sm text-gray-500">
                    {p.last_visit ? new Date(p.last_visit).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
