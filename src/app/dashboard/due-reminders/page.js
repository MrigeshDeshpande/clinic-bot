'use client';

import { useState, useEffect, useContext } from 'react';
import { Bell, Clock, CheckCircle, XCircle, Loader2, RefreshCw, DollarSign, ChevronDown, ChevronUp } from 'lucide-react';
import { ToastContext } from '../layout';

function StatusIcon({ status }) {
  if (status === 'success') return <CheckCircle className="w-4 h-4 text-emerald-500" />;
  if (status === 'error') return <XCircle className="w-4 h-4 text-red-500" />;
  return <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />;
}

function formatTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatDuration(ms) {
  if (!ms) return '—';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

export default function DueRemindersPage() {
  const { showToast } = useContext(ToastContext);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [expandedLog, setExpandedLog] = useState(null);

  useEffect(() => {
    fetchLogs();
  }, []);

  async function fetchLogs() {
    setLoading(true);
    try {
      const res = await fetch('/api/dashboard/due-reminders');
      const data = await res.json();
      if (res.ok) {
        setLogs(data.logs || []);
      } else {
        showToast(data.error || 'Failed to load history', 'error');
      }
    } catch {
      showToast('Network error loading history', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleSendReminders() {
    setSending(true);
    setResult(null);
    try {
      const res = await fetch('/api/dashboard/due-reminders', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setResult({ type: 'success', data });
        showToast(`Sent ${data.sent} due reminder(s)`, 'success');
        fetchLogs();
      } else {
        setResult({ type: 'error', error: data.error || 'Failed to send' });
        showToast(data.error || 'Failed to send reminders', 'error');
      }
    } catch {
      setResult({ type: 'error', error: 'Network error' });
      showToast('Network error sending reminders', 'error');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="animate-fade-in max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Due Reminders</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Send payment reminders to patients with outstanding dues
          </p>
        </div>
        <button
          onClick={handleSendReminders}
          disabled={sending}
          className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-medium rounded-xl hover:bg-gray-800 dark:hover:bg-gray-100 transition-all disabled:opacity-50"
        >
          {sending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Bell className="w-4 h-4" />
          )}
          {sending ? 'Sending...' : 'Send Due Reminders'}
        </button>
      </div>

      {/* Result Banner */}
      {result && (
        <div className={`mb-6 p-4 rounded-xl border text-sm ${
          result.type === 'success'
            ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
            : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
        }`}>
          {result.type === 'success' ? (
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 shrink-0" />
              <div>
                <p className="font-semibold">Reminders sent successfully</p>
                <p className="text-xs mt-0.5 opacity-80">
                  {result.data.total} appointment(s) with pending dues — {result.data.sent} sent ({result.data.templateSent} via template)
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <XCircle className="w-5 h-5 shrink-0" />
              <span>{result.error}</span>
            </div>
          )}
        </div>
      )}

      {/* Quick Stats */}
      {logs.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Total Triggers', value: logs.length, color: 'gray' },
            { label: 'Manual Triggers', value: logs.filter(l => l.triggered_by === 'manual').length, color: 'blue' },
            { label: 'Total Reminders Sent', value: logs.reduce((s, l) => s + Number(l.sent_count), 0), color: 'emerald' },
          ].map(s => (
            <div key={s.label} className={`bg-${s.color}-50 dark:bg-${s.color}-900/20 border border-${s.color}-100 dark:border-${s.color}-800 rounded-xl p-4`}>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{s.label}</p>
              <p className={`text-2xl font-bold text-${s.color === 'gray' ? 'gray-900 dark:text-gray-100' : `${s.color}-700 dark:text-${s.color}-400`}`}>
                {s.value}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* History Table */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-400" />
            Trigger History
          </h2>
          <button
            onClick={fetchLogs}
            disabled={loading}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <Loader2 className="w-6 h-6 animate-spin text-gray-300 dark:text-gray-600 mx-auto mb-2" />
            <p className="text-sm text-gray-400 dark:text-gray-500">Loading history...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center">
            <DollarSign className="w-8 h-8 text-gray-200 dark:text-gray-700 mx-auto mb-2" />
            <p className="text-sm text-gray-400 dark:text-gray-500">No reminder history yet</p>
            <p className="text-xs text-gray-300 dark:text-gray-600 mt-1">
              Click "Send Due Reminders" to trigger the first batch
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {logs.map(log => (
              <div key={log.id}>
                <button
                  onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                  className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                      log.triggered_by === 'manual'
                        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800'
                        : 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700'
                    }`}>
                      {log.triggered_by}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {log.total_appointments} appt(s), {log.sent_count} sent
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        {formatTime(log.triggered_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {Number(log.template_sent_count) > 0 && (
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800 px-1.5 py-0.5 rounded">
                        {log.template_sent_count} template
                      </span>
                    )}
                    {expandedLog === log.id ? (
                      <ChevronUp className="w-4 h-4 text-gray-300 dark:text-gray-600" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-300 dark:text-gray-600" />
                    )}
                  </div>
                </button>

                {/* Expanded details */}
                {expandedLog === log.id && log.details?.appointments && (
                  <div className="px-5 pb-3 pl-14">
                    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 space-y-1.5">
                      <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">Appointments</p>
                      {log.details.appointments.map((a, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <span className="text-gray-700 dark:text-gray-300 truncate">{a.name || 'Unknown'}</span>
                          <span className="text-gray-500 dark:text-gray-400 font-medium shrink-0 ml-2">₹{a.due} due</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
