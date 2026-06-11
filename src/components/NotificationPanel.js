'use client';

import { useState, useEffect, useRef } from 'react';
import { Bell, X, Calendar, Users, Phone, Clock, AlertTriangle } from 'lucide-react';

export default function NotificationPanel({ compact }) {
  const [notifications, setNotifications] = useState(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [manualMessages, setManualMessages] = useState([]);
  const ref = useRef(null);
  const esRef = useRef(null);

  // Request browser notification permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Subscribe to SSE stream for manual chat notifications
  useEffect(() => {
    function connect() {
      const es = new EventSource('/api/dashboard/notifications/stream');
      esRef.current = es;

      es.onmessage = (event) => {
        if (event.data === 'connected' || event.data.startsWith(': keepalive')) return;
        try {
          const data = JSON.parse(event.data);
          setManualMessages(prev => {
            const next = [{ ...data, id: Date.now() }, ...prev].slice(0, 20);
            return next;
          });
          // Show browser notification
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(`New message from ${data.profileName || 'Patient'}`, {
              body: data.text?.slice(0, 100),
              icon: '/favicon.ico',
            });
          }
        } catch {}
      };

      es.onerror = () => {
        es.close();
        setTimeout(connect, 3000);
      };
    }

    connect();
    return () => esRef.current?.close();
  }, []);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function handleToggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      setManualMessages([]);
      setLoading(true);
      fetch('/api/dashboard/notifications')
        .then(r => r.json())
        .then(d => setNotifications(d))
        .catch(() => setNotifications(null))
        .finally(() => setLoading(false));
    }
  }

  const totalAlerts = (notifications
    ? (notifications.pendingCallbacks?.length || 0) + (notifications.recentCancellations?.length || 0)
    : 0) + manualMessages.length;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={handleToggle}
        className={`relative flex items-center gap-2 rounded-xl text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300 transition-all w-full ${
          compact ? 'justify-center p-2' : 'px-3.5 py-2.5'
        }`}
        title="Notifications"
      >
        <Bell className="w-4 h-4" />
        {!compact && <span className="hidden sm:inline text-xs">Notifications</span>}
        {totalAlerts > 0 && (
          <span className="absolute top-1.5 left-[22px] -translate-x-1/2 -translate-y-1/2 min-w-[16px] h-4 flex items-center justify-center px-1 rounded-full bg-red-500 text-white text-xs font-bold leading-none shadow-sm">
            {totalAlerts > 9 ? '9+' : totalAlerts}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 bg-black/20 dark:bg-black/50 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 bottom-full mb-2 z-50 w-80 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-2xl dark:shadow-gray-900/60 overflow-hidden animate-scale-in">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2.5">
                <Bell className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Notifications</h3>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-all"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="max-h-[420px] overflow-y-auto">
              {/* Incoming manual messages */}
              {manualMessages.length > 0 && (
                <div className="px-5 py-3 border-b border-gray-50 dark:border-gray-800">
                  <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Bell className="w-3 h-3 text-blue-500" /> Incoming Messages ({manualMessages.length})
                  </p>
                  <div className="space-y-1.5">
                    {manualMessages.map(msg => (
                      <div key={msg.id} className="flex items-start gap-2 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800">
                        <span className="text-xs font-medium text-blue-700 dark:text-blue-300 shrink-0 mt-0.5">{msg.profileName}:</span>
                        <span className="text-xs text-gray-600 dark:text-gray-400 truncate">{msg.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {loading ? (
                <div className="p-6 space-y-3 animate-pulse">
                  {[1,2,3].map(i => (
                    <div key={i} className="h-12 bg-gray-100 dark:bg-gray-800 rounded-xl" />
                  ))}
                </div>
              ) : !notifications ? (
                <div className="p-6 text-center text-sm text-gray-400 dark:text-gray-500">Could not load notifications.</div>
              ) : (
                <div className="divide-y divide-gray-50 dark:divide-gray-800">
                  {/* Today's summary */}
                  <div className="px-5 py-3.5 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                      <Calendar className="w-4 h-4 text-blue-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Today&apos;s Appointments</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{notifications.todayAppointments} today · {notifications.newPatients} new patients</p>
                    </div>
                  </div>

                  {/* Upcoming appointments */}
                  {notifications.upcomingAppointments?.length > 0 && (
                    <div className="px-5 py-3">
                      <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Clock className="w-3 h-3" /> Upcoming (next hour)
                      </p>
                      <div className="space-y-1.5">
                        {notifications.upcomingAppointments.map(a => (
                          <div key={a.id} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800">
                            <span className="text-xs font-bold text-amber-700 dark:text-amber-400 w-10 shrink-0">{a.time?.slice(0, 5)}</span>
                            <span className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{a.patient_name}</span>
                            {a.treatment && <span className="text-xs text-gray-400 dark:text-gray-500 truncate">{a.treatment}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Pending callbacks */}
                  {notifications.pendingCallbacks?.length > 0 && (
                    <div className="px-5 py-3">
                      <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Phone className="w-3 h-3 text-red-500" /> Pending Callbacks ({notifications.pendingCallbacks.length})
                      </p>
                      <div className="space-y-1.5">
                        {notifications.pendingCallbacks.map(cb => (
                          <div key={cb.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800">
                            <Users className="w-3 h-3 text-red-400 shrink-0" />
                            <span className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{cb.patient_name || 'Anonymous'}</span>
                            {cb.comment && <span className="text-xs text-gray-400 dark:text-gray-500 truncate">&quot;{cb.comment.slice(0, 30)}&quot;</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recent cancellations */}
                  {notifications.recentCancellations?.length > 0 && (
                    <div className="px-5 py-3">
                      <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <AlertTriangle className="w-3 h-3 text-red-500" /> Recent Cancellations
                      </p>
                      <div className="space-y-1.5">
                        {notifications.recentCancellations.map(c => (
                          <div key={c.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
                            <span className="text-xs font-medium text-gray-600 dark:text-gray-400 w-10 shrink-0">{c.time?.slice(0, 5)}</span>
                            <span className="text-xs text-gray-700 dark:text-gray-300 truncate">{c.patient_name || 'Patient'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Empty state */}
                  {notifications.todayAppointments === 0 &&
                   notifications.pendingCallbacks?.length === 0 &&
                   notifications.recentCancellations?.length === 0 &&
                   notifications.upcomingAppointments?.length === 0 && (
                    <div className="p-8 text-center text-sm text-gray-400 dark:text-gray-500">
                      <Bell className="w-8 h-8 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
                      No new notifications
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <style jsx>{`
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.95) translateY(4px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .animate-scale-in {
          animation: scaleIn 0.15s ease-out both;
        }
      `}</style>
    </div>
  );
}
