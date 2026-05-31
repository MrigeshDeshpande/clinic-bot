'use client';

import { useState, useEffect } from 'react';
import { TrendingUp, DollarSign, Calendar, Activity, Stethoscope, Pill, ArrowUp, ArrowDown } from 'lucide-react';

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
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100/50 p-4 md:p-6 lg:p-8">
        <div className="max-w-6xl mx-auto space-y-6 animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-40" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => <div key={i} className="h-32 bg-white rounded-3xl border border-gray-100" />)}
          </div>
          <div className="h-64 bg-white rounded-3xl border border-gray-100" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100/50">
      <div className="max-w-6xl mx-auto p-4 md:p-6 lg:p-8 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-200">
            <TrendingUp className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">Statistics</h1>
            <p className="text-sm text-gray-500 mt-0.5">Practice overview and treatment insights</p>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm hover:shadow-md transition-shadow duration-200">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100">
                <Calendar className="w-5 h-5 text-blue-600" />
              </div>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                <ArrowUp className="w-3 h-3" />
                {stats?.totalAppointments || 0} total
              </span>
            </div>
            <div className="text-3xl font-bold text-gray-900 mb-1">{stats?.todayAppointments || 0}</div>
            <div className="text-sm text-gray-500">Appointments Today</div>
          </div>

          <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm hover:shadow-md transition-shadow duration-200">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100">
                <DollarSign className="w-5 h-5 text-emerald-600" />
              </div>
            </div>
            <div className="text-3xl font-bold text-gray-900 mb-1">{formatCurrency(stats?.todayRevenue || 0)}</div>
            <div className="text-sm text-gray-500">Today's Revenue</div>
            {stats?.totalRevenue > 0 && (
              <div className="mt-2 text-xs text-gray-400">
                Total: {formatCurrency(stats.totalRevenue)}
              </div>
            )}
          </div>

          <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm hover:shadow-md transition-shadow duration-200">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-violet-50 to-violet-100">
                <Activity className="w-5 h-5 text-violet-600" />
              </div>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full">
                {stats?.totalPatients || 0} total
              </span>
            </div>
            <div className="text-3xl font-bold text-gray-900 mb-1">{stats?.newPatientsThisMonth || 0}</div>
            <div className="text-sm text-gray-500">New Patients This Month</div>
          </div>
        </div>

        {/* Treatment Breakdown */}
        <div className="bg-white rounded-3xl border border-gray-100 p-6 md:p-8 shadow-sm">
          <div className="flex items-center gap-2.5 mb-6">
            <Stethoscope className="w-5 h-5 text-blue-500" />
            <h2 className="text-lg font-bold text-gray-900">Treatment Breakdown</h2>
          </div>

          {treatments.length === 0 ? (
            <div className="text-center py-12">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-gray-50 mb-4">
                <Pill className="w-7 h-7 text-gray-300" />
              </div>
              <p className="text-gray-500 text-sm">No treatments recorded yet</p>
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
                      <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900 transition-colors">
                        {t.treatment}
                      </span>
                      <span className="text-sm font-semibold text-gray-500">{t.count} visit{t.count !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
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
