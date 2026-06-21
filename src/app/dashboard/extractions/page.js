'use client';

import Link from 'next/link';
import { useState, useEffect, useContext } from 'react';
import { fetchCached } from '@/lib/clientFetchCache';
import { ToastContext } from '../layout';
import { FileSearch, ArrowUpRight, Clock, CheckCircle, AlertCircle, Calendar, User, Phone, Cpu, FileText } from 'lucide-react';

function StatusBadge({ status }) {
  const styles = {
    extraction_completed: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800',
    review_pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800',
    approved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border border-green-200 dark:border-green-800',
    rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border border-red-200 dark:border-red-800',
  };
  const labels = {
    extraction_completed: 'Extraction Done',
    review_pending: 'Needs Review',
    approved: 'Approved',
    rejected: 'Rejected',
  };

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border border-gray-200 dark:border-gray-700'}`}>
      {status === 'extraction_completed' && <Cpu className="w-3 h-3" />}
      {status === 'review_pending' && <AlertCircle className="w-3 h-3" />}
      {status === 'approved' && <CheckCircle className="w-3 h-3" />}
      {status === 'rejected' && <AlertCircle className="w-3 h-3" />}
      {labels[status] || status}
    </span>
  );
}

function Skeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {[1, 2, 3].map(i => (
        <div key={i} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
          <div className="flex items-start justify-between">
            <div className="space-y-2 flex-1">
              <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-48" />
              <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-32" />
              <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-64" />
            </div>
            <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded-full w-28" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ExtractionsPage() {
  const { showToast } = useContext(ToastContext);
  const [extractions, setExtractions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchCached('/api/dashboard/extractions');
        if (cancelled) return;
        setExtractions(data.extractions || []);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  if (loading) {
    return (
      <div className="p-4 md:p-6 max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Extraction Review</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Review and approve prescription extractions</p>
        </div>
        <Skeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 md:p-6 max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Extraction Review</h1>
        </div>
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-6 text-center">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-red-600 dark:text-red-400 font-medium">Failed to load extractions</p>
          <p className="text-red-500 dark:text-red-500 text-sm mt-1">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-xl text-sm hover:bg-red-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const pendingCount = extractions.filter(e => e.extraction_status === 'review_pending').length;
  const newCount = extractions.filter(e => e.extraction_status === 'extraction_completed').length;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Extraction Review</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {extractions.length === 0
            ? 'No extractions pending review'
            : `${extractions.length} pending — ${pendingCount} flagged for review, ${newCount} awaiting review`
          }
        </p>
      </div>

      {extractions.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <FileSearch className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">No extractions to review</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">Prescriptions that have been OCR-processed and extracted will appear here for your review.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {extractions.map(ext => (
            <Link
              key={ext.id}
              href={'/dashboard/extractions/' + ext.id}
              className="block bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 hover:border-blue-200 dark:hover:border-blue-800 hover:shadow-sm transition-all duration-200 group"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1.5">
                    <User className="w-4 h-4 text-gray-400" />
                    <span className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                      {ext.patient_name || 'Unknown Patient'}
                    </span>
                    {ext.patient_phone && (
                      <span className="text-sm text-gray-400">· {ext.patient_phone}</span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
                    {ext.appointment_date && (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {formatDate(ext.appointment_date)}
                      </span>
                    )}
                    {ext.extraction_completed_at && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        Extracted {formatDate(ext.extraction_completed_at)}
                      </span>
                    )}
                    {ext.extraction_model && (
                      <span className="flex items-center gap-1">
                        <Cpu className="w-3.5 h-3.5" />
                        {ext.extraction_model}
                      </span>
                    )}
                  </div>
                  {ext.raw_text && (
                    <p className="mt-2 text-sm text-gray-400 dark:text-gray-500 line-clamp-2 italic">
                      <FileText className="w-3 h-3 inline mr-1" />
                      {ext.raw_text.slice(0, 200)}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <StatusBadge status={ext.extraction_status} />
                  <ArrowUpRight className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-blue-500 transition-colors" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
