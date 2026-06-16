'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Star, Search, Trash2, Edit3, X, MessageSquare, Phone, Calendar, ChevronRight, Loader2 } from 'lucide-react';
import { fetchCached, invalidateFetchCache } from '@/lib/clientFetchCache';
import { RATING_CATEGORIES, safeAvg } from '@/lib/constants';

function StarBar({ avg, size = 'sm' }) {
  const n = Math.round(Number(avg) || 0);
  const sizeClass = size === 'sm' ? 'w-3.5 h-3.5' : 'w-5 h-5';
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <svg key={i} className={`${sizeClass} ${i <= n ? 'text-amber-400' : 'text-gray-300 dark:text-gray-600'}`} fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

function StarRating({ value, onChange, size = 'sm' }) {
  const sizeClass = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';
  const containerClass = size === 'sm' ? 'w-5 h-5' : 'w-6 h-6';
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(star => (
        <button
          key={star}
          type="button"
          onClick={() => onChange?.(value === star ? 0 : star)}
          className={`${containerClass} flex items-center justify-center rounded-sm transition-all hover:scale-110 active:scale-90 ${
            value >= star ? 'text-amber-400' : 'text-gray-300 dark:text-gray-600'
          }`}
        >
          <svg className={sizeClass} fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        </button>
      ))}
    </div>
  );
}

function ReviewEditPanel({ review, onClose, onSaved, onDeleted }) {
  const [ratings, setRatings] = useState(review?.ratings || {});
  const [notes, setNotes] = useState(review?.notes || '');
  const [saving, setSaving] = useState(false);
  const [savingDelete, setSavingDelete] = useState(false);

  const handleSave = async () => {
    if (!review?.id) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/dashboard/patient-reviews/${review.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ratings, notes }),
      });
      if (res.ok) {
        onSaved?.();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!review?.id) return;
    setSavingDelete(true);
    try {
      const res = await fetch(`/api/dashboard/patient-reviews/${review.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        onDeleted?.(review.id);
      }
    } finally {
      setSavingDelete(false);
    }
  };
  const avgRating = safeAvg(ratings);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white dark:bg-gray-900 shadow-2xl border-l border-gray-200 dark:border-gray-800 overflow-y-auto animate-slide-in-right">
        <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Edit Review</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">{review?.patient_name}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
            <Calendar className="w-4 h-4" />
            <span>{review?.appointment_date ? new Date(review.appointment_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}</span>
            {review?.treatment && (
              <>
                <ChevronRight className="w-3 h-3" />
                <span className="text-gray-700 dark:text-gray-300 font-medium">{review.treatment}</span>
              </>
            )}
          </div>

          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 text-center">
            <div className="flex justify-center mb-1">
              <StarBar avg={avgRating} size="md" />
            </div>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{avgRating > 0 ? avgRating.toFixed(1) + ' / 5' : 'Not rated'}</p>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Ratings</p>
            {RATING_CATEGORIES.map(cat => (
              <div key={cat.key} className="flex items-center justify-between gap-3">
                <span className="text-xs text-gray-600 dark:text-gray-400 min-w-[140px]">{cat.label}</span>
                <StarRating value={ratings[cat.key] || 0} onChange={v => setRatings(prev => ({ ...prev, [cat.key]: v }))} />
                <span className="text-xs font-medium text-gray-400 dark:text-gray-500 min-w-[20px] text-right">{ratings[cat.key] || 0}/5</span>
              </div>
            ))}
          </div>

          <div>
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Notes</p>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Doctor's notes about this patient visit..."
              rows={4}
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
            />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 px-4 py-2.5 text-sm font-medium bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              onClick={handleDelete}
              disabled={savingDelete}
              className="px-4 py-2.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 disabled:opacity-50 rounded-xl transition-all active:scale-95 flex items-center gap-2"
            >
              {savingDelete ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PatientReviewsPage() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedReview, setSelectedReview] = useState(null);
  const debounceRef = useRef(null);
  const router = useRouter();

  const loadReviews = useCallback(async (q = '') => {
    invalidateFetchCache('patient-reviews');
    setLoading(true);
    try {
      const params = q ? `?q=${encodeURIComponent(q)}&limit=50` : '?limit=50';
      const data = await fetchCached(`/api/dashboard/patient-reviews${params}`, {}, 30_000);
      setReviews(data?.reviews || []);
    } catch {
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReviews();
  }, [loadReviews]);

  const handleSearch = value => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadReviews(value), 400);
  };

  const refreshList = () => {
    setSelectedReview(null);
    loadReviews(search);
  };

  const removeFromList = id => {
    setSelectedReview(null);
    setReviews(prev => prev.filter(r => r.id !== id));
  };

  const avgRatings = ratings => {
    const avg = safeAvg(ratings);
    return avg > 0 ? avg.toFixed(1) : '-';
  };

  return (
    <div className="animate-fade-in">
      <div className="flex items-center gap-4 mb-6">
        <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-200 dark:shadow-blue-900/50">
          <Star className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">Patient Reviews</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Doctor&apos;s ratings and notes for patient visits</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={e => handleSearch(e.target.value)}
          placeholder="Search by patient name or phone..."
          className="w-full pl-12 pr-4 py-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-shadow"
        />
      </div>

      {/* Summary Bar */}
      {!loading && reviews.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 px-5 py-3 mb-4 flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400 shadow-sm">
          <span className="font-medium text-gray-900 dark:text-gray-100">{reviews.length} review{reviews.length !== 1 ? 's' : ''}</span>
          <span className="w-px h-4 bg-gray-200 dark:bg-gray-700" />
          <span>{reviews.filter(r => r.notes).length} with notes</span>
        </div>
      )}

      {/* Reviews Table */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
        {loading ? (
          <div className="space-y-4 p-6 animate-pulse">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="flex items-center gap-4">
                <div className="shimmer h-5 w-32 rounded" />
                <div className="shimmer h-5 w-24 rounded" />
                <div className="shimmer h-5 w-20 rounded" />
                <div className="shimmer h-5 flex-1 rounded" />
                <div className="shimmer h-5 w-16 rounded" />
              </div>
            ))}
          </div>
        ) : reviews.length === 0 ? (
          <div className="p-12 text-center">
            <Star className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">No patient reviews yet</p>
            <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">Reviews appear here after you rate a patient during visit logging</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {reviews.map(review => {
              const avg = avgRatings(review.ratings);
              return (
                <div
                  key={review.id}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer group"
                  onClick={() => setSelectedReview(review)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{review.patient_name}</p>
                      <span className="text-xs text-gray-400">•</span>
                      <span className="text-xs text-gray-400">{review.patient_phone}</span>
                    </div>
                    {review.notes && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate max-w-md">{review.notes}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {avg !== '-' && (
                      <div className="flex items-center gap-1.5">
                        <StarBar avg={avg} size="sm" />
                        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{avg}</span>
                      </div>
                    )}
                    <span className="text-xs text-gray-400 dark:text-gray-500 min-w-[60px] text-right">
                      {review.appointment_date
                        ? new Date(review.appointment_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                        : '-'}
                    </span>
                    <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-gray-500 transition-colors" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit Panel */}
      {selectedReview && (
        <ReviewEditPanel
          review={selectedReview}
          onClose={() => setSelectedReview(null)}
          onSaved={refreshList}
          onDeleted={removeFromList}
        />
      )}
    </div>
  );
}
