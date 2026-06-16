'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Star, Phone, ThumbsUp, Meh, Frown, CheckCircle } from 'lucide-react';
import { fetchCached } from '@/lib/clientFetchCache';

export default function FeedbackPage() {
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetchCached('/api/dashboard/feedback?limit=50')
      .then(d => setFeedback(d))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  function ratingIcon(rating) {
    switch (rating) {
      case 'great': return <ThumbsUp className="w-4 h-4 text-emerald-500" />;
      case 'okay': return <Meh className="w-4 h-4 text-amber-500" />;
      case 'poor': return <Frown className="w-4 h-4 text-red-500" />;
      default: return null;
    }
  }

  function ratingBadge(rating) {
    switch (rating) {
      case 'great': return 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800';
      case 'okay': return 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800';
      case 'poor': return 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800';
      default: return 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700';
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="shimmer h-8 w-48 rounded-lg" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="shimmer h-28 rounded-xl" />)}
        </div>
        <div className="shimmer h-64 rounded-xl" />
      </div>
    );
  }

  const summary = feedback?.summary || { great: 0, okay: 0, poor: 0 };
  const total = Object.values(summary).reduce((a, b) => Number(a) + Number(b), 0);
  const satisfaction = total > 0 ? Math.round(((summary.great + summary.okay) / total) * 100) : 0;
  const entries = feedback?.entries || [];
  const callbacks = entries.filter(e => e.callback);
  const pendingCallbacks = callbacks.filter(e => !e.callback_contacted_at);
  const hasComment = entries.filter(e => e.comment);

  return (
    <div className="animate-fade-in">
      <div className="flex items-center gap-4 mb-6">
        <div className="p-3 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-amber-200 dark:shadow-amber-900/50">
          <Star className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">Feedback</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Patient satisfaction and reviews</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Satisfaction</p>
            <div className="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center">
              <ThumbsUp className="w-5 h-5 text-emerald-500" />
            </div>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{satisfaction}%</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{total} total responses</p>
        </div>

        <button onClick={() => document.getElementById('feedback-entries')?.scrollIntoView({ behavior: 'smooth' })}
          className="w-full text-left bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer active:scale-[0.98]">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Great</p>
            <div className="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center">
              <ThumbsUp className="w-5 h-5 text-emerald-500" />
            </div>
          </div>
          <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{summary.great}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{total > 0 ? Math.round((summary.great / total) * 100) : 0}% of responses</p>
        </button>

        <button onClick={() => document.getElementById('feedback-entries')?.scrollIntoView({ behavior: 'smooth' })}
          className="w-full text-left bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer active:scale-[0.98]">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Okay</p>
            <div className="w-9 h-9 rounded-lg bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center">
              <Meh className="w-5 h-5 text-amber-500" />
            </div>
          </div>
          <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">{summary.okay}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{total > 0 ? Math.round((summary.okay / total) * 100) : 0}% of responses</p>
        </button>

        <button onClick={() => document.getElementById('feedback-entries')?.scrollIntoView({ behavior: 'smooth' })}
          className="w-full text-left bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer active:scale-[0.98]">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Poor</p>
            <div className="w-9 h-9 rounded-lg bg-red-50 dark:bg-red-900/30 flex items-center justify-center">
              <Frown className="w-5 h-5 text-red-500" />
            </div>
          </div>
          <p className="text-3xl font-bold text-red-600 dark:text-red-400">{summary.poor}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{total > 0 ? Math.round((summary.poor / total) * 100) : 0}% of responses</p>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Feedback Entries */}
        <div id="feedback-entries" className="lg:col-span-2 bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">Recent Feedback</h2>
          </div>
          {entries.length === 0 ? (
            <div className="p-8 text-center text-gray-400 dark:text-gray-500 text-sm">No feedback yet.</div>
          ) : (
            <div className="divide-y divide-gray-50 dark:divide-gray-800">
              {entries.map((e, i) => (
                                  <div key={e.id || i} className="px-6 py-5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer" onClick={() => router.push(`/dashboard/patients?q=${encodeURIComponent(e.patient_name || '')}`)}>
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium border shrink-0 ${ratingBadge(e.rating)}`}>
                        {ratingIcon(e.rating)}
                        <span className="capitalize">{e.rating}</span>
                      </span>
                      <div className="min-w-0">
                        <p className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">{e.patient_name || 'Anonymous'}</p>
                        {e.comment && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-3">{e.comment}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-start">
                      {e.callback && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-xs font-semibold">
                          <Phone className="w-3 h-3" /> Callback
                        </span>
                      )}
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {new Date(e.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Callbacks & Comments Sidebar */}
        <div className="space-y-4">
          {/* Callback Requests */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-red-500" />
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Callback Requests</h3>
              </div>
              <span className="text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 px-2 py-0.5 rounded-full">{pendingCallbacks.length}</span>
            </div>
            {pendingCallbacks.length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-4">No pending callback requests</p>
            ) : (
              <div className="space-y-2">
                {pendingCallbacks.map((e, i) => (
                  <div key={e.id || i} className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 border border-red-100 dark:border-red-800">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{e.patient_name || 'Anonymous'}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{new Date(e.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                      <button
                        onClick={async () => {
                          const res = await fetch(`/api/dashboard/feedback/${e.id}/contact`, { method: 'PATCH' });
                          if (res.ok) {
                            setFeedback(prev => ({
                              ...prev,
                              entries: prev.entries.map(entry =>
                                entry.id === e.id ? { ...entry, callback_contacted_at: new Date().toISOString() } : entry
                              ),
                            }));
                          }
                        }}
                        className="shrink-0 text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 px-2.5 py-1.5 rounded-lg transition-colors font-medium flex items-center gap-1"
                      >
                        <CheckCircle className="w-3 h-3" /> Mark Contacted
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Rating Distribution Bar */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm p-4">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3">Distribution</h3>
            <div className="space-y-2">
              {[
                { label: 'Great', count: summary.great, color: 'bg-emerald-500' },
                { label: 'Okay', count: summary.okay, color: 'bg-amber-500' },
                { label: 'Poor', count: summary.poor, color: 'bg-red-500' },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 dark:text-gray-400 w-10">{item.label}</span>
                  <div className="flex-1 h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${item.color} transition-all duration-500`}
                      style={{ width: `${total > 0 ? (item.count / total) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300 w-6 text-right">{item.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
