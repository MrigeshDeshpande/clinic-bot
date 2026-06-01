'use client';

import { useState, useEffect } from 'react';
import { TrendingUp, DollarSign, Calendar, Activity, Stethoscope, Pill } from 'lucide-react';

export default function StatsPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard/stats')
      .then(r => r.json())
      .then(d => setStats(d))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  function formatCurrency(amount) {
    return `₹${Number(amount || 0).toLocaleString('en-IN')}`;
  }

  const treatments = stats?.treatmentBreakdown || [];
  const maxTreatmentCount = Math.max(...treatments.map(t => t.count), 1);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100/50 dark:from-gray-950 dark:to-gray-900 p-4 md:p-6 lg:p-8">
        <div className="max-w-6xl mx-auto space-y-6 animate-pulse">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-40" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => <div key={i} className="h-32 bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800" />)}
          </div>
          <div className="h-64 bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100/50 dark:from-gray-950 dark:to-gray-900">
      <div className="max-w-6xl mx-auto p-4 md:p-6 lg:p-8 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-200 dark:shadow-emerald-900/50">
            <TrendingUp className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">Statistics</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Practice overview and treatment insights</p>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-6 shadow-sm hover:shadow-md dark:hover:shadow-gray-900/50 transition-shadow duration-200">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/30">
                <Calendar className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full">
                {stats?.totalAppointments || 0} total
              </span>
            </div>
            <div className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-1">{stats?.todayAppointments || 0}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Appointments Today</div>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-6 shadow-sm hover:shadow-md dark:hover:shadow-gray-900/50 transition-shadow duration-200">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/30 dark:to-emerald-800/30">
                <DollarSign className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
            <div className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-1">{formatCurrency(stats?.todayRevenue || 0)}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Today&apos;s Revenue</div>
            {stats?.totalRevenue > 0 && (
              <div className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                Total: {formatCurrency(stats.totalRevenue)}
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-6 shadow-sm hover:shadow-md dark:hover:shadow-gray-900/50 transition-shadow duration-200">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-violet-50 to-violet-100 dark:from-violet-900/30 dark:to-violet-800/30">
                <Activity className="w-5 h-5 text-violet-600 dark:text-violet-400" />
              </div>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/30 px-2 py-0.5 rounded-full">
                {stats?.totalPatients || 0} total
              </span>
            </div>
            <div className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-1">{stats?.newPatientsThisMonth || 0}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">New Patients This Month</div>
          </div>
        </div>

        {/* Treatment Breakdown */}
        <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-6 md:p-8 shadow-sm">
          <div className="flex items-center gap-2.5 mb-6">
            <Stethoscope className="w-5 h-5 text-blue-500 dark:text-blue-400" />
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Treatment Breakdown</h2>
          </div>

          {treatments.length === 0 ? (
            <div className="text-center py-12">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-gray-50 dark:bg-gray-800 mb-4">
                <Pill className="w-7 h-7 text-gray-300 dark:text-gray-600" />
              </div>
              <p className="text-gray-500 dark:text-gray-400 text-sm">No treatments recorded yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {treatments.map((t, i) => {
                const percentage = (t.count / maxTreatmentCount) * 100;
                const gradients = [
                  'from-blue-500 to-blue-600',
                  'from-emerald-500 to-teal-500',
                  'from-violet-500 to-purple-600',
                  'from-rose-500 to-pink-600',
                  'from-amber-500 to-orange-500',
                  'from-cyan-500 to-sky-500',
                  'from-indigo-500 to-indigo-600',
                ];
                return (
                  <div key={t.treatment || i} className="group">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100 transition-colors">
                        {t.treatment}
                      </span>
                      <span className="text-sm font-semibold text-gray-500 dark:text-gray-400">{t.count} visit{t.count !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r ${gradients[i % gradients.length]} transition-all duration-700 ease-out`}
                        style={{ width: `${Math.max(percentage, 4)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
