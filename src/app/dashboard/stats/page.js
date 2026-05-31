'use client';

import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';

export default function StatsPage() {
  const [period, setPeriod] = useState('week');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/dashboard/stats?period=${period}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [period]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full" />
      </div>
    );
  }

  const summary = data?.summary || {};
  const daily = (data?.daily || []).map(d => ({
    ...d,
    date: new Date(d.date + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' }),
  }));
  const treatments = data?.treatments || [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Statistics</h1>
          <p className="text-gray-500 mt-1">Weekly and monthly performance trends</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setPeriod('week')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${period === 'week' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
          >
            Week
          </button>
          <button
            onClick={() => setPeriod('month')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${period === 'month' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
          >
            Month
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <p className="text-sm text-gray-500 mb-1">Total Visits</p>
          <p className="text-3xl font-bold text-gray-900">{summary.total_visits || 0}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <p className="text-sm text-gray-500 mb-1">Revenue</p>
          <p className="text-3xl font-bold text-green-600">₹{summary.total_revenue || 0}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <p className="text-sm text-gray-500 mb-1">No Shows</p>
          <p className="text-3xl font-bold text-red-600">{summary.total_no_shows || 0}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <p className="text-sm text-gray-500 mb-1">Cancelled</p>
          <p className="text-3xl font-bold text-gray-600">{summary.total_cancelled || 0}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Daily Appointments</h2>
          {daily.length === 0 ? (
            <p className="text-gray-400 text-sm py-8 text-center">No data for this period.</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={daily}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                  labelStyle={{ fontWeight: 600, color: '#111827' }}
                />
                <Legend iconType="circle" />
                <Bar dataKey="completed" name="Completed" fill="#16a34a" radius={[4, 4, 0, 0]} />
                <Bar dataKey="total" name="Total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Popular Treatments</h2>
          {treatments.length === 0 ? (
            <p className="text-gray-400 text-sm py-8 text-center">No treatment data for this period.</p>
          ) : (
            <div className="space-y-3">
              {treatments.map((t, i) => {
                const maxCount = treatments[0]?.count || 1;
                const pct = (t.count / maxCount) * 100;
                return (
                  <div key={t.treatment || i}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-700">{t.treatment || 'Unknown'}</span>
                      <span className="text-gray-500 font-medium">{t.count}</span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
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
