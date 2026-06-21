'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect, useContext } from 'react';
import { fetchCached, invalidateFetchCache } from '@/lib/clientFetchCache';
import { ToastContext } from '../../layout';
import {
  ArrowLeft, CheckCircle, XCircle, AlertCircle, Clock, User, Phone, Calendar,
  Cpu, FileText, Eye, EyeOff, ChevronDown, ChevronRight, FileSearch, Stethoscope,
  Pill, IndianRupee, MessageSquareText, ClipboardList, Syringe
} from 'lucide-react';

function StatusBadge({ status }) {
  const styles = {
    extraction_completed: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    review_pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    approved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  };
  const labels = {
    extraction_completed: 'Extraction Done',
    review_pending: 'Needs Review',
    approved: 'Approved',
    rejected: 'Rejected',
  };

  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
      {status === 'review_pending' && <AlertCircle className="w-3 h-3" />}
      {status === 'approved' && <CheckCircle className="w-3 h-3" />}
      {status === 'rejected' && <XCircle className="w-3 h-3" />}
      {(status === 'extraction_completed' || !status) && <Cpu className="w-3 h-3" />}
      {labels[status] || status}
    </span>
  );
}

function SectionCard({ title, icon: Icon, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <span className="flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4 text-gray-400" />}
          {title}
        </span>
        {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}

function JsonValue({ value }) {
  if (value === null || value === undefined) return <span className="text-gray-400 italic">—</span>;
  if (typeof value === 'string') return <span className="text-gray-900 dark:text-gray-100">{value}</span>;
  if (typeof value === 'number') return <span className="text-gray-900 dark:text-gray-100 font-medium">{value}</span>;
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-gray-400 italic">None</span>;
    return (
      <div className="space-y-1.5">
        {value.map((item, i) => (
          <div key={i} className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2.5 text-sm border border-gray-100 dark:border-gray-700/50">
            {typeof item === 'object' ? (
              <div className="space-y-1">
                {Object.entries(item).filter(([, v]) => v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0)).map(([k, v]) => (
                  <div key={k} className="flex gap-2">
                    <span className="text-gray-500 dark:text-gray-400 capitalize min-w-[90px] text-xs">{k.replace(/_/g, ' ')}:</span>
                    <div className="flex-1">
                      {Array.isArray(v) ? (
                        <span className="text-gray-900 dark:text-gray-100">{v.join(', ') || '—'}</span>
                      ) : (
                        <JsonValue value={v} />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <JsonValue value={item} />
            )}
          </div>
        ))}
      </div>
    );
  }
  return <span className="text-gray-900 dark:text-gray-100">{JSON.stringify(value)}</span>;
}

function StructuredViewer({ data }) {
  if (!data) {
    return (
      <div className="text-center py-8 text-gray-400">
        <FileSearch className="w-8 h-8 mx-auto mb-2" />
        <p className="text-sm">No structured data available</p>
      </div>
    );
  }

  const sections = [
    { key: 'patient', title: 'Patient', icon: User, render: () => data.patient && (
      <div className="grid grid-cols-2 gap-2 text-sm">
        {data.patient.name && <div><span className="text-gray-500 text-xs">Name</span><p className="text-gray-900 dark:text-gray-100">{data.patient.name}</p></div>}
        {data.patient.age && <div><span className="text-gray-500 text-xs">Age</span><p className="text-gray-900 dark:text-gray-100">{data.patient.age}</p></div>}
        {data.patient.sex && <div><span className="text-gray-500 text-xs">Sex</span><p className="text-gray-900 dark:text-gray-100">{data.patient.sex}</p></div>}
        {data.patient.phone && <div><span className="text-gray-500 text-xs">Phone</span><p className="text-gray-900 dark:text-gray-100">{data.patient.phone}</p></div>}
        {data.patient.date && <div><span className="text-gray-500 text-xs">Date</span><p className="text-gray-900 dark:text-gray-100">{data.patient.date}</p></div>}
      </div>
    ) },
    { key: 'observations', title: 'Observations', icon: Stethoscope, count: data.observations?.length },
    { key: 'diagnoses', title: 'Diagnoses', icon: ClipboardList, count: data.diagnoses?.length },
    { key: 'treatment_recommendations', title: 'Treatment Recommendations', icon: Syringe, count: data.treatment_recommendations?.length },
    { key: 'completed_treatments', title: 'Completed Treatments', icon: CheckCircle, count: data.completed_treatments?.length },
    { key: 'medications', title: 'Medications', icon: Pill, count: data.medications?.length },
    { key: 'financial_estimates', title: 'Financial Estimates', icon: IndianRupee, count: data.financial_estimates?.length },
    { key: 'followups', title: 'Follow-ups', icon: Calendar, count: data.followups?.length },
    { key: 'unclassified_notes', title: 'Unclassified Notes', icon: MessageSquareText, count: data.unclassified_notes?.length },
  ];

  return (
    <div className="space-y-2">
      {sections.map(s => (
        <SectionCard key={s.key} title={`${s.title}${s.count !== undefined ? ` (${s.count})` : ''}`} icon={s.icon} defaultOpen={s.key === 'patient' || (s.count || 0) > 0}>
          {s.render ? s.render() : <JsonValue value={data[s.key]} />}
        </SectionCard>
      ))}
    </div>
  );
}

export default function ExtractionDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { showToast } = useContext(ToastContext);
  const [extraction, setExtraction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [action, setAction] = useState(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showRawText, setShowRawText] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchCached(`/api/dashboard/extractions/${id}`);
        if (cancelled) return;
        if (!data.extraction) {
          setError('Extraction not found');
          return;
        }
        setExtraction(data.extraction);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [id]);

  async function handleAction(act) {
    if (act === 'reject' && !reason.trim()) {
      showToast('Please provide a reason for rejection', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/dashboard/extractions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: act, reason: act === 'reject' ? reason.trim() : undefined }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update');
      }
      invalidateFetchCache(`/api/dashboard/extractions/${id}`);
      invalidateFetchCache('/api/dashboard/extractions');
      showToast(act === 'approve' ? 'Extraction approved' : 'Extraction rejected', 'success');
      setTimeout(() => router.push('/dashboard/extractions'), 800);
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  if (loading) {
    return (
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-32" />
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-64" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="h-96 bg-gray-100 dark:bg-gray-800 rounded-2xl" />
            <div className="h-96 bg-gray-100 dark:bg-gray-800 rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !extraction) {
    return (
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <Link href="/dashboard/extractions" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 mb-4 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Extractions
        </Link>
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-6 text-center">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-red-600 dark:text-red-400 font-medium">{error || 'Extraction not found'}</p>
        </div>
      </div>
    );
  }

  const isTerminal = extraction.extraction_status === 'approved' || extraction.extraction_status === 'rejected';

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <Link href="/dashboard/extractions" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 mb-4 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Extractions
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Extraction Review</h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" />{extraction.patient_name || 'Unknown'}</span>
            {extraction.patient_phone && <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{extraction.patient_phone}</span>}
            {extraction.appointment_date && <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{formatDate(extraction.appointment_date)}</span>}
            {extraction.extraction_completed_at && <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{formatDate(extraction.extraction_completed_at)}</span>}
            {extraction.extraction_model && <span className="flex items-center gap-1"><Cpu className="w-3.5 h-3.5" />{extraction.extraction_model}</span>}
          </div>
        </div>
        <StatusBadge status={extraction.extraction_status} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <FileText className="w-4 h-4 text-gray-400" />
              Raw OCR Text
            </h2>
            <button
              onClick={() => setShowRawText(!showRawText)}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
            >
              {showRawText ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              {showRawText ? 'Hide' : 'Show'}
            </button>
          </div>
          <div className="flex-1 overflow-auto max-h-[600px]">
            {showRawText && extraction.raw_text ? (
              <pre className="p-4 text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">
                {extraction.raw_text}
              </pre>
            ) : (
              <div className="flex items-center justify-center h-32 text-gray-400">
                <Eye className="w-5 h-5 mr-2" />
                <span className="text-sm">Click "Show" to view raw OCR text</span>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <FileSearch className="w-4 h-4 text-gray-400" />
              Extracted Data
            </h2>
          </div>
          <div className="flex-1 overflow-auto max-h-[600px] p-3">
            <StructuredViewer data={extraction.structured_json} />
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">Review Decision</h2>
        {isTerminal ? (
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            {extraction.extraction_status === 'approved' ? (
              <><CheckCircle className="w-4 h-4 text-green-500" /> Approved</>
            ) : (
              <><XCircle className="w-4 h-4 text-red-500" /> Rejected{extraction.error_message ? `: ${extraction.error_message}` : ''}</>
            )}
          </div>
        ) : (
          <>
            <div className="mb-4">
              <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1.5">
                Rejection reason <span className="text-gray-400">(required if rejecting)</span>
              </label>
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Describe what needs to be corrected..."
                rows={3}
                className="w-full px-3.5 py-2.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
                disabled={submitting}
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => handleAction('approve')}
                disabled={submitting}
                className="flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-xl text-sm font-medium transition-colors"
              >
                <CheckCircle className="w-4 h-4" />
                {submitting ? 'Submitting...' : 'Approve'}
              </button>
              <button
                onClick={() => handleAction('reject')}
                disabled={submitting}
                className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-xl text-sm font-medium transition-colors"
              >
                <XCircle className="w-4 h-4" />
                {submitting ? 'Submitting...' : 'Reject'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
