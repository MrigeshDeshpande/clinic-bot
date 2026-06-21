'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronDown, ChevronRight, CalendarClock, Activity, DollarSign, CheckCircle2, User, Check, RotateCcw, MessageCircle, ExternalLink } from 'lucide-react';

const TABS = [
  { key: 'overdue_followups', label: 'Overdue', icon: CalendarClock },
  { key: 'incomplete_treatments', label: 'Treatments', icon: Activity },
  { key: 'pending_payments', label: 'Payments', icon: DollarSign },
];

function formatDays(days) {
  if (days == null) return '';
  if (days === 0) return 'Today';
  if (days === 1) return '1 day';
  return `${days} days`;
}

export default function AttentionPanel({ data }) {
  const [collapsed, setCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState('overdue_followups');
  const [treatmentItems, setTreatmentItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(new Set());
  const [actionLoading, setActionLoading] = useState(new Set());

  useEffect(() => {
    if (data?.incomplete_treatments) {
      setTreatmentItems(data.incomplete_treatments);
    }
  }, [data?.incomplete_treatments]);

  if (!data) return null;

  const { overdue_followups = [], pending_payments = [] } = data;
  const total = overdue_followups.length + treatmentItems.length + pending_payments.length;

  if (total === 0) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm p-4 mb-8">
        <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="w-4 h-4" />
          <span className="font-medium">All clear — no patients currently require attention</span>
        </div>
      </div>
    );
  }

  const newTreatmentItems = treatmentItems.filter(i => i.attention_status === 'new');
  const acknowledgedTreatmentItems = treatmentItems.filter(i => i.attention_status === 'acknowledged');

  const activeItems = ({
    overdue_followups,
    incomplete_treatments: treatmentItems,
    pending_payments,
  })[activeTab] || [];

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm mb-8 transition-colors duration-200">
      {/* Header */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors rounded-t-xl"
      >
        <div className="flex items-center gap-2">
          <div className="relative">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            {total > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-red-500 rounded-full text-[8px] font-bold text-white flex items-center justify-center shadow-sm">
                {total > 9 ? '9+' : total}
              </span>
            )}
          </div>
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Needs Attention</span>
          <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">({total})</span>
        </div>
        {collapsed ? <ChevronRight className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>

      {!collapsed && (
        <div className="px-4 pb-4">
          {/* Tab Bar */}
          <div className="flex gap-1 mb-3 border-b border-gray-100 dark:border-gray-800">
            {TABS.map(({ key, label, icon: Icon }) => {
              const count = key === 'incomplete_treatments' ? treatmentItems.length
                : ({ overdue_followups, pending_payments })[key].length;
              return (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors cursor-pointer border-b-2 -mb-px ${
                    activeTab === key
                      ? 'text-amber-600 dark:text-amber-400 border-amber-500'
                      : 'text-gray-500 dark:text-gray-400 border-transparent hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                  {count > 0 && (
                    <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                      activeTab === key
                        ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                    }`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Items — Overdue Followups */}
          {activeTab === 'overdue_followups' && (
            <TabItems items={overdue_followups} tab="overdue_followups" onWhatsApp={handleWhatsApp} actionLoading={actionLoading} />
          )}

          {/* Items — Incomplete Treatments */}
          {activeTab === 'incomplete_treatments' && (
            <div className="space-y-3">
              {newTreatmentItems.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-1.5 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    New ({newTreatmentItems.length})
                  </p>
                  <div className="space-y-1">
                    {newTreatmentItems.map((item, i) => (
                      <TreatmentItemRow
                        key={item.plan_id || i}
                        item={item}
                        loading={loadingItems.has(item.plan_id)}
                        onAcknowledge={(planId) => handleStatusChange(planId, 'acknowledged')}
                        onResolve={(planId) => handleStatusChange(planId, 'resolved')}
                        onWhatsApp={handleWhatsApp}
                        actionLoading={actionLoading}
                      />
                    ))}
                  </div>
                </div>
              )}
              {acknowledgedTreatmentItems.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1.5 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                    Acknowledged ({acknowledgedTreatmentItems.length})
                  </p>
                  <div className="space-y-1">
                    {acknowledgedTreatmentItems.map((item, i) => (
                      <TreatmentItemRow
                        key={item.plan_id || i}
                        item={item}
                        acknowledged
                        loading={loadingItems.has(item.plan_id)}
                        onAcknowledge={(planId) => handleStatusChange(planId, 'acknowledged')}
                        onUnacknowledge={(planId) => handleStatusChange(planId, 'new')}
                        onResolve={(planId) => handleStatusChange(planId, 'resolved')}
                        onWhatsApp={handleWhatsApp}
                        actionLoading={actionLoading}
                      />
                    ))}
                  </div>
                </div>
              )}
              {treatmentItems.length === 0 && (
                <div className="flex items-center gap-2 py-6 text-sm text-emerald-600 dark:text-emerald-400 justify-center">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>All clear — no incomplete treatments</span>
                </div>
              )}
            </div>
          )}

          {/* Items — Pending Payments */}
          {activeTab === 'pending_payments' && (
            <TabItems items={pending_payments} tab="pending_payments" onWhatsApp={handleWhatsApp} onCollect={handleCollect} actionLoading={actionLoading} />
          )}
        </div>
      )}
    </div>
  );

  async function handleWhatsApp(item, tab) {
    const key = `wa-${item.patient_id}`;
    setActionLoading(prev => new Set(prev).add(key));
    try {
      const messages = {
        overdue_followups: `Hi ${item.patient_name}, this is a friendly reminder about your follow-up appointment at Shri Balaji Dental Clinic. Please call us to reschedule.`,
        incomplete_treatments: `Hi ${item.patient_name}, this is a reminder to continue your dental treatment at Shri Balaji Dental Clinic. Please schedule your next appointment.`,
        pending_payments: `Hi ${item.patient_name}, this is a gentle reminder about your outstanding balance of ₹${Number(item.outstanding).toLocaleString('en-IN')} at Shri Balaji Dental Clinic. Please clear it at your earliest convenience.`,
      };
      await fetch('/api/dashboard/send-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: item.patient_phone, message: messages[tab] || messages.pending_payments }),
      });
    } catch {}
    setActionLoading(prev => { const n = new Set(prev); n.delete(key); return n; });
  }

  async function handleCollect(item) {
    const key = `collect-${item.appointment_id}`;
    setActionLoading(prev => new Set(prev).add(key));
    try {
      await fetch(`/api/dashboard/appointments/${item.appointment_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paid_amount: item.outstanding, payment_status: 'paid' }),
      });
    } catch {}
    setActionLoading(prev => { const n = new Set(prev); n.delete(key); return n; });
  }

  async function handleStatusChange(planId, status) {
    setLoadingItems(prev => new Set(prev).add(planId));
    const prevItems = treatmentItems;
    setTreatmentItems(prev =>
      prev.map(item =>
        item.plan_id === planId ? { ...item, attention_status: status } : item
      )
    );
    try {
      const res = await fetch(`/api/dashboard/attention/${planId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        setTreatmentItems(prevItems);
      }
    } catch {
      setTreatmentItems(prevItems);
    } finally {
      setLoadingItems(prev => { const next = new Set(prev); next.delete(planId); return next; });
    }
  }
}

function TabItems({ items, tab, onWhatsApp, onCollect, actionLoading = new Set() }) {
  if (items.length === 0) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-emerald-600 dark:text-emerald-400 justify-center">
        <CheckCircle2 className="w-4 h-4" />
        <span>All clear in this category</span>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      {items.map((item, i) => (
        <div
          key={item.appointment_id || item.patient_id || i}
          className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-900/40 dark:to-amber-800/40 flex items-center justify-center shrink-0">
              <User className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate leading-tight">
                {item.patient_id ? (
                  <Link href={`/dashboard/patients/${item.patient_id}`} className="hover:text-amber-600 dark:hover:text-amber-400 hover:underline">
                    {item.patient_name || 'Patient'}
                  </Link>
                ) : (
                  item.patient_name || 'Patient'
                )}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate leading-tight mt-0.5">
                {renderItemDetail(item, tab)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {renderDaysBadge(item, tab)}
            {item.patient_phone && onWhatsApp && (
              <button
                onClick={() => onWhatsApp(item, tab)}
                disabled={actionLoading.has(`wa-${item.patient_id}`)}
                className={`p-1 rounded-md transition-colors ${
                  actionLoading.has(`wa-${item.patient_id}`)
                    ? 'opacity-50 cursor-not-allowed'
                    : 'hover:bg-teal-50 dark:hover:bg-teal-900/20 text-teal-600 dark:text-teal-400'
                }`}
                title="Send WhatsApp message"
              >
                {actionLoading.has(`wa-${item.patient_id}`) ? (
                  <div className="w-3.5 h-3.5 border-2 border-teal-300 border-t-teal-600 rounded-full animate-spin" />
                ) : (
                  <MessageCircle className="w-3.5 h-3.5" />
                )}
              </button>
            )}
            {onCollect && tab === 'pending_payments' && (
              <button
                onClick={() => onCollect(item)}
                disabled={actionLoading.has(`collect-${item.appointment_id}`)}
                className={`p-1 rounded-md transition-colors ${
                  actionLoading.has(`collect-${item.appointment_id}`)
                    ? 'opacity-50 cursor-not-allowed'
                    : 'hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400'
                }`}
                title="Collect payment"
              >
                {actionLoading.has(`collect-${item.appointment_id}`) ? (
                  <div className="w-3.5 h-3.5 border-2 border-emerald-300 border-t-emerald-600 rounded-full animate-spin" />
                ) : (
                  <DollarSign className="w-3.5 h-3.5" />
                )}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function TreatmentItemRow({ item, acknowledged, loading, onAcknowledge, onUnacknowledge, onResolve, onWhatsApp, actionLoading }) {
  const days = item.days_since_activity;
  const sevClass = !acknowledged && days >= 30
    ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800'
    : !acknowledged && days >= 7
      ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800'
      : 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800';

  const rowCls = acknowledged
    ? 'flex items-center justify-between gap-3 py-2 px-3 rounded-lg opacity-60 hover:opacity-100 transition-opacity hover:bg-gray-50 dark:hover:bg-gray-800/50'
    : 'flex items-center justify-between gap-3 py-2 px-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors';

  return (
    <div className={rowCls}>
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
          acknowledged
            ? 'bg-gray-100 dark:bg-gray-800'
            : 'bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-900/40 dark:to-amber-800/40'
        }`}>
          <User className={`w-3.5 h-3.5 ${acknowledged ? 'text-gray-400' : 'text-amber-600 dark:text-amber-400'}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-medium truncate leading-tight ${
            acknowledged ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-gray-100'
          }`}>
            {item.patient_id ? (
              <Link href={`/dashboard/patients/${item.patient_id}`} className="hover:underline">
                {item.patient_name || 'Patient'}
              </Link>
            ) : (
              item.patient_name || 'Patient'
            )}
          </p>
          <p className={`text-xs truncate leading-tight mt-0.5 ${
            acknowledged ? 'text-gray-400 dark:text-gray-500' : 'text-gray-500 dark:text-gray-400'
          }`}>
            {item.tooth_number ? `Tooth ${item.tooth_number} · ` : ''}
            {item.procedure_name || 'Treatment'}
            {item.next_step ? ` → ${item.next_step}` : ''}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {!acknowledged && days != null && (
          <span className={`px-2 py-0.5 text-[11px] font-semibold rounded-full border whitespace-nowrap ${sevClass}`}>
            {formatDays(days)}
          </span>
        )}
        {acknowledged && (
          <span className="px-2 py-0.5 text-[11px] font-semibold rounded-full border whitespace-nowrap bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-500 border-gray-200 dark:border-gray-700">
            Acknowledged
          </span>
        )}
        <div className="flex gap-1">
          {item.patient_phone && onWhatsApp && (
            <button
              onClick={() => onWhatsApp(item, 'incomplete_treatments')}
              disabled={actionLoading?.has(`wa-${item.patient_id}`)}
              className={`p-1 rounded-md transition-colors ${
                actionLoading?.has(`wa-${item.patient_id}`)
                  ? 'opacity-50 cursor-not-allowed'
                  : 'hover:bg-teal-50 dark:hover:bg-teal-900/20 text-teal-600 dark:text-teal-400'
              }`}
              title="Send WhatsApp message"
            >
              {actionLoading?.has(`wa-${item.patient_id}`) ? (
                <div className="w-3.5 h-3.5 border-2 border-teal-300 border-t-teal-600 rounded-full animate-spin" />
              ) : (
                <MessageCircle className="w-3.5 h-3.5" />
              )}
            </button>
          )}
          {!acknowledged ? (
            <button
              onClick={() => onAcknowledge?.(item.plan_id)}
              disabled={loading}
              className={`p-1 rounded-md transition-colors cursor-pointer ${
                loading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-amber-50 dark:hover:bg-amber-900/20 text-amber-600 dark:text-amber-400'
              }`}
              title="Acknowledge"
            >
              {loading ? (
                <div className="w-3.5 h-3.5 border-2 border-amber-300 border-t-amber-600 rounded-full animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
            </button>
          ) : (
            <>
              <button
                onClick={() => onResolve?.(item.plan_id)}
                disabled={loading}
                className={`p-1 rounded-md transition-colors cursor-pointer ${
                  loading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400'
                }`}
                title="Mark resolved"
              >
                {loading ? (
                  <div className="w-3.5 h-3.5 border-2 border-emerald-300 border-t-emerald-600 rounded-full animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
              </button>
              {onUnacknowledge && (
                <button
                  onClick={() => onUnacknowledge(item.plan_id)}
                  disabled={loading}
                  className={`p-1 rounded-md transition-colors cursor-pointer ${
                    loading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 dark:text-gray-500'
                  }`}
                  title="Mark as new"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function renderItemDetail(item, tab) {
  switch (tab) {
    case 'overdue_followups':
      return (
        <>
          Follow-up overdue{item.followup_date ? ` (${item.followup_date})` : ''}
          {item.treatment_label ? ` — ${item.treatment_label}` : ''}
        </>
      );
    case 'pending_payments':
      return (
        <>
          {item.treatment_label || 'Visit'}
          {item.outstanding != null ? ` — ₹${Number(item.outstanding).toLocaleString('en-IN')}` : ''}
        </>
      );
    default:
      return '';
  }
}

function renderDaysBadge(item, tab) {
  let days = null;
  let label = '';

  switch (tab) {
    case 'overdue_followups':
      if (item.followup_date) {
        const diff = Math.ceil((Date.now() - new Date(item.followup_date).getTime()) / (1000 * 60 * 60 * 24));
        days = diff;
        label = formatDays(diff);
      }
      break;
    case 'pending_payments':
      if (item.visit_date) {
        const diff = Math.ceil((Date.now() - new Date(item.visit_date).getTime()) / (1000 * 60 * 60 * 24));
        days = diff;
        label = formatDays(diff);
      }
      break;
  }

  if (!days || !label) return null;

  const sevClass = days >= 30
    ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800'
    : days >= 7
      ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800'
      : 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800';

  return (
    <span className={`px-2 py-0.5 text-[11px] font-semibold rounded-full border whitespace-nowrap ${sevClass}`}>
      {label}
    </span>
  );
}
