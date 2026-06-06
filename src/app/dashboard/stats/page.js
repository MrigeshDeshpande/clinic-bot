'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { fetchCached } from '@/lib/clientFetchCache';
import {
  TrendingUp, DollarSign, Calendar, Activity, Stethoscope,
  Pill, Clock, Users, XCircle, Download, ArrowUp, ArrowDown, Mars, Venus,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';

const PERIODS = [
  { value: 'week', label: '7 Days' },
  { value: 'month', label: '30 Days' },
  { value: 'quarter', label: '90 Days' },
];

export default function StatsPage() {
  const router = useRouter();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('week');

  const fetchStats = useCallback(async (p) => {
    setLoading(true);
    try {
      const d = await fetchCached(`/api/dashboard/stats?period=${p}`, null, 300000);
      setStats(d);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(period); }, [period, fetchStats]);

  function formatCurrency(amount) {
    return `₹${Number(amount || 0).toLocaleString('en-IN')}`;
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  function getCSV() {
    if (!stats) return;
    const rows = [['Date', 'Completed', 'Total', 'Revenue']];
    for (const day of (stats.daily || [])) {
      rows.push([day.date, day.completed, day.total, day.revenue]);
    }
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clinic-stats-${period}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const treatments = stats?.treatmentBreakdown || [];
  const peakHours = stats?.peakHours || [];
  const dayOfWeek = stats?.dayOfWeek || [];
  const daily = stats?.daily || [];
  const bySex = stats?.demographics?.bySex || [];
  const byAgeGroup = stats?.demographics?.byAgeGroup || [];
  const totalDemographic = bySex.reduce((s, d) => s + d.count, 0);

  const periodLabel = PERIODS.find(p => p.value === period)?.label || '';

  if (loading && !stats) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100/50 dark:from-gray-950 dark:to-gray-900 p-4 md:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto space-y-6 animate-pulse">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-40" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-32 bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800" />)}
          </div>
          <div className="h-72 bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="h-64 bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800" />
            <div className="h-64 bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100/50 dark:from-gray-950 dark:to-gray-900">
      <div className="max-w-7xl mx-auto p-4 md:p-6 lg:p-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-200 dark:shadow-emerald-900/50">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">Analytics</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Practice overview and performance insights</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={getCSV}
              className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
            <div className="flex bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-1">
              {PERIODS.map(p => (
                <button
                  key={p.value}
                  onClick={() => setPeriod(p.value)}
                  className={`px-3 py-2.5 text-sm font-medium rounded-lg transition-all ${
                    period === p.value
                      ? 'bg-emerald-500 text-white shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* KPI Cards Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Appointments Today */}
          <KpiCard
            icon={<Calendar className="w-5 h-5" />}
            iconBg="from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/30"
            iconColor="text-blue-600 dark:text-blue-400"
            value={stats?.todayAppointments || 0}
            label="Appointments Today"
            badge={`${stats?.totalAppointments || 0} in ${periodLabel}`}
            badgeColor="text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30"
            trend={stats?.visitsChange}
            onClick={() => router.push('/dashboard/appointments')}
          />

          {/* Revenue */}
          <KpiCard
            icon={<DollarSign className="w-5 h-5" />}
            iconBg="from-emerald-50 to-emerald-100 dark:from-emerald-900/30 dark:to-emerald-800/30"
            iconColor="text-emerald-600 dark:text-emerald-400"
            value={formatCurrency(stats?.totalRevenue || 0)}
            label={`Revenue (${periodLabel})`}
            sub={`Avg ₹${stats?.avgRevenuePerVisit || 0}/visit`}
            trend={stats?.revenueChange}
            trendLabel="vs prev period"
            onClick={() => router.push('/dashboard/appointments')}
          />

          {/* No-Show Rate */}
          <KpiCard
            icon={<XCircle className="w-5 h-5" />}
            iconBg="from-rose-50 to-rose-100 dark:from-rose-900/30 dark:to-rose-800/30"
            iconColor="text-rose-600 dark:text-rose-400"
            value={`${stats?.noShowPct || 0}%`}
            label="No-Show Rate"
            sub={`${stats?.totalNoShows || 0} no-shows`}
            onClick={() => router.push('/dashboard/appointments?status=no_show')}
          />

          {/* Retention Rate */}
          <KpiCard
            icon={<Users className="w-5 h-5" />}
            iconBg="from-violet-50 to-violet-100 dark:from-violet-900/30 dark:to-violet-800/30"
            iconColor="text-violet-600 dark:text-violet-400"
            value={`${stats?.retentionRate || 0}%`}
            label="Returning Patients"
            sub={`${stats?.returningPatients || 0} of ${stats?.totalPatients || 0}`}
            onClick={() => router.push('/dashboard/patients')}
          />
        </div>

        {/* Revenue Breakdown */}
        {stats?.feeBreakdown && (stats.feeBreakdown.consultation > 0 || stats.feeBreakdown.treatment > 0 || stats.feeBreakdown.medicine > 0) && (
          <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-6 md:p-8 shadow-sm">
            <div className="flex items-center gap-2.5 mb-6">
              <DollarSign className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Revenue Breakdown</h2>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-4">
                {[
                  { label: 'Consultation Fees', value: stats.feeBreakdown.consultation, color: 'bg-blue-500', pct: stats.totalRevenue > 0 ? (stats.feeBreakdown.consultation / stats.totalRevenue) * 100 : 0 },
                  { label: 'Treatment Charges', value: stats.feeBreakdown.treatment, color: 'bg-emerald-500', pct: stats.totalRevenue > 0 ? (stats.feeBreakdown.treatment / stats.totalRevenue) * 100 : 0 },
                  { label: 'Medicine Charges', value: stats.feeBreakdown.medicine, color: 'bg-violet-500', pct: stats.totalRevenue > 0 ? (stats.feeBreakdown.medicine / stats.totalRevenue) * 100 : 0 },
                ].map(item => (
                  <div key={item.label}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{item.label}</span>
                      <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(item.value)}</span>
                    </div>
                    <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${item.color} transition-all duration-700`} style={{ width: `${Math.max(item.pct, 2)}%` }} />
                    </div>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500">{item.pct.toFixed(0)}% of total</span>
                  </div>
                ))}
              </div>
              {stats.totalRevenue > 0 && (
                <div className="flex items-center justify-center">
                  <div className="relative w-48 h-48">
                    <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                      {[
                        { pct: (stats.feeBreakdown.consultation / stats.totalRevenue) * 100, color: '#3b82f6', offset: 0 },
                        { pct: (stats.feeBreakdown.treatment / stats.totalRevenue) * 100, color: '#10b981', offset: (stats.feeBreakdown.consultation / stats.totalRevenue) * 100 },
                        { pct: (stats.feeBreakdown.medicine / stats.totalRevenue) * 100, color: '#8b5cf6', offset: ((stats.feeBreakdown.consultation + stats.feeBreakdown.treatment) / stats.totalRevenue) * 100 },
                      ].filter(s => s.pct > 0).map((seg, i) => (
                        <circle key={i} cx="50" cy="50" r="40" fill="none"
                          stroke={seg.color} strokeWidth="12"
                          strokeDasharray={`${seg.pct * 2.513} ${(100 - seg.pct) * 2.513}`}
                          strokeDashoffset={-seg.offset * 2.513}
                          className="transition-all duration-700" />
                      ))}
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center flex-col">
                      <span className="text-xl font-bold text-gray-900 dark:text-gray-100">{formatCurrency(stats.totalRevenue)}</span>
                      <span className="text-[10px] text-gray-500 dark:text-gray-400">Total</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Top Patients by Revenue */}
        {stats?.topPatients?.length > 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-6 md:p-8 shadow-sm">
            <div className="flex items-center gap-2.5 mb-6">
              <Users className="w-5 h-5 text-amber-500 dark:text-amber-400" />
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Top Patients by Revenue</h2>
              <span className="text-xs text-gray-500 dark:text-gray-400 font-normal">({periodLabel})</span>
            </div>
            <div className="space-y-3">
              {stats.topPatients.map((p, i) => {
                const maxRev = stats.topPatients[0]?.totalRevenue || 1;
                const pct = (p.totalRevenue / maxRev) * 100;
                return (
                  <div key={p.patientId || i} className="flex items-center gap-4 group">
                    <span className="w-6 text-center text-sm font-bold text-gray-400 dark:text-gray-500">#{i + 1}</span>
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-100 to-amber-50 dark:from-amber-900/30 dark:to-amber-800/30 flex items-center justify-center text-sm font-semibold text-amber-700 dark:text-amber-300 shrink-0">
                      {(p.patientName || '?')[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <button onClick={() => router.push(`/dashboard/patients/${p.patientId}`)}
                          className="text-sm font-medium text-gray-900 dark:text-gray-100 hover:text-amber-600 dark:hover:text-amber-400 transition-colors truncate">
                          {p.patientName}
                        </button>
                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 shrink-0 ml-2">{formatCurrency(p.totalRevenue)}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-500 transition-all duration-700" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0">{p.visitCount} visit{p.visitCount !== 1 ? 's' : ''}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Daily Trend Chart */}
        <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-6 md:p-8 shadow-sm">
          <div className="flex items-center gap-2.5 mb-6">
            <TrendingUp className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Daily Trend</h2>
          </div>
          {daily.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400 text-sm">No data for this period</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={daily}>
                <defs>
                  <linearGradient id="completedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 12 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
                <Tooltip
                  labelFormatter={formatDate}
                  contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb' }}
                />
                <Legend />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="completed"
                  stroke="#10b981"
                  fill="url(#completedGrad)"
                  name="Completed"
                  strokeWidth={2}
                />
                <Area
                  yAxisId="right"
                  type="monotone"
                  dataKey="revenue"
                  stroke="#6366f1"
                  fill="url(#revenueGrad)"
                  name="Revenue"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Peak Hours */}
          <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-6 md:p-8 shadow-sm">
            <div className="flex items-center gap-2.5 mb-6">
              <Clock className="w-5 h-5 text-amber-500 dark:text-amber-400" />
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Peak Hours</h2>
            </div>
            {peakHours.length === 0 ? (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400 text-sm">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={peakHours}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb' }} />
                  <Bar dataKey="count" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Appointments" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Day of Week */}
          <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-6 md:p-8 shadow-sm">
            <div className="flex items-center gap-2.5 mb-6">
              <Calendar className="w-5 h-5 text-blue-500 dark:text-blue-400" />
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">By Day of Week</h2>
            </div>
            {dayOfWeek.length === 0 ? (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400 text-sm">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={dayOfWeek}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb' }} />
                  <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Appointments" />
                </BarChart>
              </ResponsiveContainer>
            )}
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
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-3">
                {treatments.map((t, i) => {
                  const maxCount = Math.max(...treatments.map(x => x.count), 1);
                  const pct = (t.count / maxCount) * 100;
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
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t.treatment}</span>
                        <span className="text-sm font-semibold text-gray-500 dark:text-gray-400">{t.count} visit{t.count !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full bg-gradient-to-r ${gradients[i % gradients.length]} transition-all duration-700 ease-out`}
                          style={{ width: `${Math.max(pct, 4)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={treatments} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis type="number" tick={{ fontSize: 12 }} />
                    <YAxis dataKey="treatment" type="category" tick={{ fontSize: 11 }} width={100} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb' }} />
                    <Bar dataKey="count" fill="#10b981" radius={[0, 4, 4, 0]} name="Visits" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>

        {/* New Patients */}
        <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-6 md:p-8 shadow-sm">
          <div className="flex items-center gap-2.5 mb-6">
            <Users className="w-5 h-5 text-violet-500 dark:text-violet-400" />
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Patient Growth</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div>
              <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">{stats?.newPatientsThisMonth || 0}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">New Patients This Month</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">{stats?.totalPatients || 0}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">Total Patients</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">{stats?.returningPatients || 0}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">Returning Patients ({periodLabel})</div>
            </div>
          </div>
        </div>

        {/* Demographics */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Sex Distribution */}
          <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-6 md:p-8 shadow-sm">
            <div className="flex items-center gap-2.5 mb-6">
              <Users className="w-5 h-5 text-rose-500 dark:text-rose-400" />
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Patients by Sex</h2>
            </div>
            {bySex.length === 0 ? (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400 text-sm">No data</div>
            ) : (
              <div className="space-y-4">
                {bySex.map(d => {
                  const pct = totalDemographic > 0 ? Math.round((d.count / totalDemographic) * 100) : 0;
                  const isMale = d.sex?.toLowerCase() === 'm' || d.sex?.toLowerCase() === 'male';
                  return (
                    <div key={d.sex} className="flex items-center gap-4">
                      <div className={`p-2.5 rounded-xl ${isMale ? 'bg-blue-50 dark:bg-blue-900/30' : 'bg-rose-50 dark:bg-rose-900/30'}`}>
                        {isMale
                          ? <Mars className={`w-5 h-5 ${isMale ? 'text-blue-500' : 'text-rose-500'}`} />
                          : <Venus className={`w-5 h-5 ${isMale ? 'text-blue-500' : 'text-rose-500'}`} />
                        }
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 capitalize">{d.sex}</span>
                          <span className="text-sm font-semibold text-gray-500 dark:text-gray-400">{d.count} ({pct}%)</span>
                        </div>
                        <div className="h-2.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${isMale ? 'bg-blue-500' : 'bg-rose-500'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Age Group Distribution */}
          <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-6 md:p-8 shadow-sm">
            <div className="flex items-center gap-2.5 mb-6">
              <Activity className="w-5 h-5 text-amber-500 dark:text-amber-400" />
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Patients by Age Group</h2>
            </div>
            {byAgeGroup.length === 0 ? (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400 text-sm">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={byAgeGroup}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="ageGroup" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb' }} />
                  <Bar dataKey="count" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Patients" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ icon, iconBg, iconColor, value, label, badge, badgeColor, sub, trend, trendLabel, onClick }) {
  return (
    <div onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined} onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(e); } : undefined}
      className={`bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-6 shadow-sm hover:shadow-md dark:hover:shadow-gray-900/50 transition-shadow duration-200 ${onClick ? 'cursor-pointer text-left w-full active:scale-[0.98]' : ''}`}>
      <div className="flex items-center justify-between mb-4">
        <div className={`p-2.5 rounded-xl bg-gradient-to-br ${iconBg}`}>
          <span className={iconColor}>{icon}</span>
        </div>
        {badge && (
          <span className={`inline-flex items-center gap-1 text-xs font-medium ${badgeColor} px-2 py-0.5 rounded-full`}>
            {badge}
          </span>
        )}
      </div>
      <div className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-1">{value}</div>
      <div className="text-sm text-gray-500 dark:text-gray-400">{label}</div>
      {sub && <div className="mt-1 text-xs text-gray-400 dark:text-gray-500">{sub}</div>}
      {trend !== undefined && (
        <div className={`mt-2 flex items-center gap-1 text-xs font-medium ${
          trend > 0 ? 'text-emerald-600 dark:text-emerald-400' : trend < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-gray-400'
        }`}>
          {trend > 0 ? <ArrowUp className="w-3 h-3" /> : trend < 0 ? <ArrowDown className="w-3 h-3" /> : null}
          {trend > 0 ? '+' : ''}{trend}%
          {trendLabel && <span className="text-gray-400 dark:text-gray-500 font-normal ml-1">{trendLabel}</span>}
        </div>
      )}
    </div>
  );
}
