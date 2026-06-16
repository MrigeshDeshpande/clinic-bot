'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, Users, ChevronRight, Phone, Calendar, Activity } from 'lucide-react';
import { formatDate } from '@/lib/date';
import { fetchCached } from '@/lib/clientFetchCache';

function PatientsPageFallback() {
  return <div className="p-8 text-center text-gray-400">Loading...</div>;
}

function PatientsPageInner() {
  const searchParams = useSearchParams();
  const [patients, setPatients] = useState([]);
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const searchRef = useRef(null);
  const router = useRouter();

  const fetchPatients = useCallback(async (q) => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams(q ? { q } : {});
      const data = await fetchCached(`/api/dashboard/patients?${params}`);
      const list = data?.patients ?? data;
      setPatients(Array.isArray(list) ? list : []);
    } catch (e) {
      console.error('Failed to fetch patients', e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPatients(search);
  }, [fetchPatients, search]);

  function getInitials(name) {
    if (!name || name === '?') return '?';
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  }

  function getAvatarColor(name) {
    const colors = [
      'from-blue-500 to-blue-600',
      'from-emerald-500 to-teal-600',
      'from-violet-500 to-purple-600',
      'from-rose-500 to-pink-600',
      'from-amber-500 to-orange-600',
      'from-cyan-500 to-sky-600',
    ];
    let hash = 0;
    for (let i = 0; i < (name || '').length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100/50 dark:from-gray-950 dark:to-gray-900">
      <div className="max-w-6xl mx-auto p-4 md:p-6 lg:p-8 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg shadow-blue-200 dark:shadow-blue-900/50">
            <Users className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">Patients</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Search and manage patient records</p>
          </div>
        </div>

        {/* Search */}
        <div className="relative group">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-emerald-500/10 dark:from-blue-500/5 dark:to-emerald-500/5 rounded-2xl blur-xl transition-opacity opacity-0 group-focus-within:opacity-100" />
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" />
            <input
              ref={searchRef}
              type="text"
              placeholder="Search by name or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-12 pr-4 py-3.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 dark:focus:border-blue-500 transition-all duration-200 shadow-sm text-base"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Patients List */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white dark:bg-gray-900 rounded-2xl p-5 border border-gray-100 dark:border-gray-800 animate-pulse">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gray-200 dark:bg-gray-700" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
                    <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-1/4" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-20">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-red-100 to-red-200 dark:from-red-900/30 dark:to-red-800/30 mb-6">
              <Activity className="w-10 h-10 text-red-400 dark:text-red-500" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Failed to load patients</h3>
            <p className="text-gray-500 dark:text-gray-400 text-sm max-w-sm mx-auto mb-4">{error}</p>
            <button
              onClick={() => fetchPatients(search)}
              className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              Retry
            </button>
          </div>
        ) : patients.length === 0 ? (
          <div className="text-center py-20">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 mb-6">
              <Users className="w-10 h-10 text-gray-400 dark:text-gray-500" />
            </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">No patients found</h3>
            <p className="text-gray-500 dark:text-gray-400 text-sm max-w-sm mx-auto">
              {search ? 'Try a different search term or clear the search filter' : 'Patients will appear here once they book appointments through WhatsApp'}
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {patients.map((patient, idx) => (
              <button
                key={`${patient.id}-${idx}`}
                type="button"
                onClick={() => router.push(`/dashboard/patients/${patient.id}`)}
                className="group relative w-full text-left bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4 md:p-5 hover:border-blue-200 dark:hover:border-blue-700 hover:shadow-lg hover:shadow-blue-100/50 dark:hover:shadow-blue-900/20 transition-all duration-200 animate-in cursor-pointer"
                style={{ animationDelay: `${idx * 50}ms` }}
              >
                {/* Mobile Layout (up to sm) */}
                <div className="flex sm:hidden flex-col gap-3">
                  {/* Top Row: Avatar + Name + Arrow */}
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${getAvatarColor(patient.name)} flex items-center justify-center text-white font-semibold text-xs shadow-md shrink-0`}>
                      {getInitials(patient.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {patient.name === '?' ? 'Unknown Patient' : patient.name}
                      </h3>
                    </div>
                    <div className="shrink-0 w-7 h-7 rounded-lg bg-gray-50 dark:bg-gray-800 group-hover:bg-blue-50 dark:group-hover:bg-blue-900/30 flex items-center justify-center transition-colors">
                      <ChevronRight className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors" />
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="border-t border-gray-100 dark:border-gray-800/80 my-0.5" />

                  {/* Bottom Row: Metadata info */}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex flex-wrap items-center gap-3 text-gray-500 dark:text-gray-400">
                      <span className="flex items-center gap-1.5 font-medium">
                        <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        {patient.phone || 'N/A'}
                      </span>
                      {patient.last_visit && (
                        <span className="flex items-center gap-1.5 font-medium">
                          <Calendar className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          Last: {formatDate(patient.last_visit)}
                          {!patient.last_visit_time && patient.visit_count > 0 && (
                            <span className="text-[9px] font-extrabold text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/30 px-1.5 py-0.5 rounded-full border border-violet-100/50 dark:border-violet-800/50 shrink-0">Walk-in</span>
                          )}
                        </span>
                      )}
                    </div>

                    {patient.visit_count > 0 && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-800 shrink-0">
                        <Activity className="w-3 h-3" />
                        {patient.visit_count} visit{patient.visit_count !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>

                {/* Desktop Layout (sm and up) */}
                <div className="hidden sm:flex items-center gap-4">
                  {/* Avatar with initials */}
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${getAvatarColor(patient.name)} flex items-center justify-center text-white font-semibold text-sm shadow-md shrink-0`}>
                    {getInitials(patient.name)}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {patient.name === '?' ? 'Unknown Patient' : patient.name}
                      </h3>
                      {patient.visit_count > 0 && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-800 shrink-0">
                          <Activity className="w-3 h-3" />
                          {patient.visit_count} visit{patient.visit_count !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-x-4 gap-y-1 text-base text-gray-500 dark:text-gray-400">
                      <span className="flex items-center gap-1.5 font-medium">
                        <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        {patient.phone || 'N/A'}
                      </span>
                      {patient.last_visit && (
                        <span className="flex items-center gap-1.5 font-medium">
                          <Calendar className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          Last: {formatDate(patient.last_visit)}
                          {!patient.last_visit_time && patient.visit_count > 0 && (
                            <span className="text-[10px] font-bold text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/30 px-1.5 py-0.5 rounded-full border border-violet-100 dark:border-violet-800 shrink-0">Walk-in</span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Arrow */}
                  <div className="shrink-0 w-8 h-8 rounded-xl bg-gray-50 dark:bg-gray-800 group-hover:bg-blue-50 dark:group-hover:bg-blue-900/30 flex items-center justify-center transition-colors">
                    <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500 group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors" />
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-in {
          animation: slideUp 0.3s ease-out both;
        }
      `}</style>
    </div>
  );
}

export default function PatientsPage() {
  return (
    <Suspense fallback={<PatientsPageFallback />}>
      <PatientsPageInner />
    </Suspense>
  );
}
