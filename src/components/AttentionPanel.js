'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronDown, ChevronRight, CalendarClock, Activity, DollarSign, CheckCircle2, User } from 'lucide-react';

const TABS = [
  { key: 'overdue_followups', label: 'Overdue', icon: CalendarClock },
  { key: 'incomplete_treatments', label: 'Treatments', icon: Activity },
  { key: 'pending_payments', label: 'Payments', icon: DollarSign },
];

function AttentionIcon({ type }) {
  const cls = 'w-3.5 h-3.5 shrink-0';
  switch (type) {
    case 'overdue':
      return <CalendarClock className={`${cls} text-amber-500`} />;
    case 'treatment':
      return <Activity className={`${cls} text-blue-500`} />;
    case 'payment':
      return <DollarSign className={`${cls} text-emerald-500`} />;
    default:
      return <AlertTriangle className={`${cls} text-gray-400`} />;
  }
}

function formatDays(days) {
  if (days == null) return '';
  if (days === 0) return 'Today';
  if (days === 1) return '1 day';
  return `${days} days`;
}

function getSeverityBadge(days) {
  if (days == null) return null;
  if (days >= 30) return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-700';
  if (days >= 7) return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-700';
  return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700';
}

export default function AttentionPanel({ data }) {
  const [collapsed, setCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState('overdue_followups');

  if (!data) return null;

  const { overdue_followups = [], incomplete_treatments = [], pending_payments = [] } = data;
  const total = overdue_followups.length + incomplete_treatments.length + pending_payments.length;

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

  const activeItems = ({
    overdue_followups,
    incomplete_treatments,
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
              const count = ({ overdue_followups, incomplete_treatments, pending_payments })[key].length;
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

          {/* Items */}
          {activeItems.length === 0 ? (
            <div className="flex items-center gap-2 py-6 text-sm text-emerald-600 dark:text-emerald-400 justify-center">
              <CheckCircle2 className="w-4 h-4" />
              <span>All clear in this category</span>
            </div>
          ) : (
            <div className="space-y-1">
              {activeItems.map((item, i) => (
                <div
                  key={item.patient_id || item.appointment_id || i}
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
                        {renderItemDetail(item, activeTab)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {renderDaysBadge(item, activeTab)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
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
    case 'incomplete_treatments':
      return (
        <>
          {item.tooth_number ? `Tooth ${item.tooth_number} · ` : ''}
          {item.procedure_name || 'Treatment'}
          {item.next_step ? ` → ${item.next_step}` : ''}
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
    case 'incomplete_treatments':
      if (item.days_since_activity != null) {
        days = item.days_since_activity;
        label = formatDays(item.days_since_activity);
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
