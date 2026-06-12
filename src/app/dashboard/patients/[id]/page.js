'use client';

import { useState, useEffect, useRef, useContext, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Calendar, Phone,
  Pill, Printer, Download,
  Users, AlertCircle, Star,
  ClipboardList, Edit3, Save, X, MessageSquare
} from 'lucide-react';
import { formatDate as fmtDate } from '@/lib/date';
import { fetchCached, invalidateFetchCache } from '@/lib/clientFetchCache';
import { getTreatmentName } from '@/lib/treatments';
import { ToastContext } from '../../layout';

const PHONE_PREFIX = '+91';
function stripPhonePrefix(v) { return v?.replace(/^(\+91|91)/, '') || v || ''; }
function withPhonePrefix(v) { const s = stripPhonePrefix(v); return s ? `${PHONE_PREFIX}${s}` : ''; }

function formatDate(d) {
  if (!d) return 'N/A';
  const dateStr = typeof d === 'string' ? d.slice(0, 10) : String(d).slice(0, 10);
  return fmtDate(dateStr, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function formatCurrency(amount) {
  return `₹${Number(amount || 0).toLocaleString('en-IN')}`;
}

function getInitials(name) {
  if (!name || name === '?') return '?';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function getSignedUrl(key) {
  return `/api/dashboard/media/signed?key=${encodeURIComponent(key)}`;
}

function ratingEmoji(rating) {
  if (rating === 'great') return { emoji: '😊', label: 'Great', color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30' };
  if (rating === 'okay') return { emoji: '🙂', label: 'Okay', color: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30' };
  if (rating === 'poor') return { emoji: '😞', label: 'Poor', color: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30' };
  return { emoji: '—', label: rating, color: 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800' };
}

function ratingIcon(rating) {
  switch (rating) {
    case 'great': return '😊';
    case 'okay': return '🙂';
    case 'poor': return '😞';
    default: return '—';
  }
}

function ratingBadge(rating) {
  switch (rating) {
    case 'great': return 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800';
    case 'okay': return 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800';
    case 'poor': return 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800';
    default: return 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700';
  }
}

const avatarColors = [
  'from-blue-500 to-blue-600',
  'from-emerald-500 to-teal-600',
  'from-violet-500 to-purple-600',
  'from-rose-500 to-pink-600',
  'from-amber-500 to-orange-600',
];

function getAvatarColor(name) {
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return avatarColors[Math.abs(hash) % avatarColors.length];
}

export default function PatientDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { showToast } = useContext(ToastContext);
  const [patient, setPatient] = useState(null);
  const [visits, setVisits] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', age: '', sex: '', phone: '', location: '' });
  const [saving, setSaving] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showMessages, setShowMessages] = useState(false);
  const [showMedical, setShowMedical] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [manualModeStartedAt, setManualModeStartedAt] = useState(null);
  const [endingChat, setEndingChat] = useState(false);
  const [family, setFamily] = useState([]);
  const [showLinkFamily, setShowLinkFamily] = useState(false);
  const [linkSearch, setLinkSearch] = useState('');
  const [linkSearchResults, setLinkSearchResults] = useState([]);
  const [linkSearching, setLinkSearching] = useState(false);
  const [linkType, setLinkType] = useState('other');
  const [linking, setLinking] = useState(false);
  const [unlinking, setUnlinking] = useState(null);
  const [patientRatings, setPatientRatings] = useState({});
  const [savingRatings, setSavingRatings] = useState(false);
  const [googleMapsUrl, setGoogleMapsUrl] = useState('');
  const [sendingReviewLink, setSendingReviewLink] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const moreRef = useRef(null);
  const visitsRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
      if (showMessages && messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, showMessages]);

  useEffect(() => {
    async function load() {
      try {
        const data = await fetchCached(`/api/dashboard/patients/${id}`, {}, 60_000);
        if (!data.patient) {
          setPatient(null);
          setLoading(false);
          return;
        }
        setPatient(data.patient);
        setPatientRatings(data.patient?.patient_ratings || {});
        setVisits(data.visits || []);
        setEditForm({
          name: data.patient?.name || '',
          age: data.patient?.age?.toString() || '',
          sex: data.patient?.sex || '',
          phone: stripPhonePrefix(data.patient?.phone) || '',
          location: data.patient?.location || '',
        });
        setLoading(false);

        // Fetch secondary data in background after showing content
        const secondaryPromises = [];
        if (data.patient?.wa_id) {
          secondaryPromises.push(
            fetchCached(`/api/dashboard/feedback?limit=20&waId=${encodeURIComponent(data.patient.wa_id)}`, {}, 60_000)
              .then(fbData => setFeedback(fbData?.entries || []))
              .catch(() => {})
          );
        }
        secondaryPromises.push(
          fetchCached(`/api/dashboard/patients/${id}/chat-mode`, {}, 30_000)
            .then(cmData => {
              setManualMode(cmData.manualMode);
              setManualModeStartedAt(cmData.manualModeStartedAt);
            })
            .catch(() => {})
        );
        secondaryPromises.push(
          fetchCached(`/api/dashboard/patients/${id}/family`, {}, 30_000)
            .then(famData => setFamily(famData.family || []))
            .catch(() => {})
        );
        secondaryPromises.push(
          fetch('/api/dashboard/settings')
            .then(r => r.json())
            .then(data => {
              if (data.settings?.google_maps?.review_url) setGoogleMapsUrl(data.settings.google_maps.review_url);
            })
            .catch(() => {})
        );
        secondaryPromises.push(
          fetchCached(`/api/dashboard/patients/${id}/messages`, {}, 30_000)
            .then(msgData => setMessages(msgData.messages || []))
            .catch(() => {})
        );

        Promise.all(secondaryPromises).catch(() => {});
      } catch (e) {
        console.error('Failed to load patient', e);
        setLoading(false);
      }
    }
    load();
  }, [id]);

  async function loadMessages(force = false) {
    setMessagesLoading(true);
    try {
      if (force) invalidateFetchCache(`/api/dashboard/patients/${id}/messages`);
      const data = await fetchCached(`/api/dashboard/patients/${id}/messages`, {}, 30_000);
      setMessages(data.messages || []);
    } catch (e) {
      console.error('Failed to load messages', e);
    } finally {
      setMessagesLoading(false);
    }
  }

  useEffect(() => {
    if (showMessages && messages.length === 0 && !messagesLoading) {
      loadMessages();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMessages]);

  // SSE: listen for new message events while messages section is shown
  useEffect(() => {
    if (!showMessages) return;
    const eventSource = new EventSource(`/api/dashboard/patients/${id}/messages/stream`);
    eventSource.onmessage = (event) => {
      if (event.data === 'new_message' && document.visibilityState === 'visible') {
        loadMessages(true);
      }
    };
    eventSource.onerror = () => eventSource.close();
    return () => eventSource.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMessages, id]);

  // Search patients for linking
  useEffect(() => {
    if (linkSearch.length < 2 || !showLinkFamily) {
      setLinkSearchResults([]);
      return;
    }
    setLinkSearching(true);
    const timer = setTimeout(() => {
      fetchCached(`/api/dashboard/patients/search?q=${encodeURIComponent(linkSearch)}`, {}, 30_000)
        .then(d => {
          const filtered = (d.patients || []).filter(p => p.id !== id && !family.some(f => f.id === p.id));
          setLinkSearchResults(filtered);
        })
        .catch(() => setLinkSearchResults([]))
        .finally(() => setLinkSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [linkSearch, showLinkFamily, id, family]);

  async function handleLinkPatient(relatedPatientId) {
    setLinking(true);
    try {
      const res = await fetch(`/api/dashboard/patients/${id}/family`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ relatedPatientId, relationshipType: linkType }),
      });
      const data = await res.json();
      if (res.ok) {
        const created = data.family;
        setFamily(prev => created ? [...prev, created] : prev);
        invalidateFetchCache(`/api/dashboard/patients/${id}/family`);
        setShowLinkFamily(false);
        setLinkSearch('');
        setLinkSearchResults([]);
        setLinkType('other');
        showToast('Family member linked', 'success');
      } else {
        showToast(data.error || 'Failed to link', 'error');
      }
    } catch {
      showToast('Network error', 'error');
    } finally {
      setLinking(false);
    }
  }

  async function handleUnlinkPatient(relationshipId, memberName) {
    if (!window.confirm(`Unlink ${memberName} from this patient?`)) return;
    setUnlinking(relationshipId);
    try {
      const res = await fetch(`/api/dashboard/patients/${id}/family?relationshipId=${relationshipId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setFamily(prev => prev.filter(f => f.relationship_id !== relationshipId));
        showToast('Family member unlinked', 'success');
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to unlink', 'error');
      }
    } catch {
      showToast('Network error', 'error');
    } finally {
      setUnlinking(null);
    }
  }

  async function endChat() {
    if (!window.confirm('Are you sure you want to end the chat? The patient will return to the main chatbot flow.')) return;
    setEndingChat(true);
    try {
      const res = await fetch(`/api/dashboard/patients/${id}/chat-mode`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manualMode: false }),
      });
      if (res.ok) {
        setManualMode(false);
        setManualModeStartedAt(null);
      }
    } catch (err) {
      console.error('Failed to end chat', err);
    } finally {
      setEndingChat(false);
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/dashboard/patients/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editForm.name.trim(),
          age: editForm.age ? parseInt(editForm.age, 10) : null,
          sex: editForm.sex || null,
          phone: withPhonePrefix(editForm.phone.trim()),
          location: editForm.location.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setPatient(prev => ({ ...prev, ...data.patient }));
        setEditing(false);
      } else {
        showToast(data.error || 'Failed to save', 'error');
      }
    } catch (err) {
      showToast('Network error', 'error');
    } finally {
      setSaving(false);
    }
  }

  // Close More dropdown on outside click
  useEffect(() => {
    if (!showMore) return;
    function handle(e) {
      if (moreRef.current && !moreRef.current.contains(e.target)) setShowMore(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [showMore]);

  // Close More dropdown on Escape
  useEffect(() => {
    if (!showMore) return;
    function handle(e) {
      if (e.key === 'Escape') setShowMore(false);
    }
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [showMore]);

  const RATING_CATEGORIES = [
    { key: 'payment_time', label: 'Payment on Time' },
    { key: 'timely_appointment', label: 'Timely Appointment' },
    { key: 'behaviour', label: 'Behaviour' },
    { key: 'cooperative_treatment', label: 'Cooperative to Treatment' },
  ];

  async function saveRatings() {
    setSavingRatings(true);
    try {
      const res = await fetch(`/api/dashboard/patients/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patient_ratings: patientRatings }),
      });
      if (res.ok) {
        showToast('Ratings saved', 'success');
        invalidateFetchCache(`/api/dashboard/patients/${id}`);
      } else {
        showToast('Failed to save ratings', 'error');
      }
    } catch {
      showToast('Network error', 'error');
    }
    setSavingRatings(false);
  }

  async function sendGoogleReview() {
    if (!googleMapsUrl) { showToast('Set Google Maps review URL in settings first', 'error'); return; }
    setSendingReviewLink(true);
    try {
      const phone = patient?.phone;
      if (!phone) { showToast('No phone number on file', 'error'); setSendingReviewLink(false); return; }
      const waId = phone.startsWith('+') ? phone.slice(1) : phone;
      const message = `Dear ${patient.name},\n\nThank you for visiting Shri Balaji Dental Clinic! 🙏\n\nWe would love to hear about your experience. Please take a moment to leave us a Google review:\n\n${googleMapsUrl}\n\nYour feedback helps us serve you better!`;
      const res = await fetch('/api/dashboard/send-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: waId, message }),
      });
      if (res.ok) {
        showToast('Google review link sent on WhatsApp', 'success');
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to send', 'error');
      }
    } catch {
      showToast('Network error', 'error');
    }
    setSendingReviewLink(false);
  }

  const completedVisits = useMemo(() => visits.filter(v => v.status === 'completed'), [visits]);
  const totalRevenue = useMemo(() => completedVisits.reduce((sum, v) => sum + Number(v.consultation_fee || 0) + Number(v.treatment_charges || 0) + Number(v.medicine_charges || 0), 0), [completedVisits]);
  const totalCollected = useMemo(() => completedVisits.reduce((sum, v) => sum + Number(v.paid_amount || 0), 0), [completedVisits]);

  // All images across all visits, grouped by visit date
  const allVisitMedia = useMemo(() => {
    return visits
      .filter(v => Array.isArray(v.chit_media) && v.chit_media.some(k => k.includes('_photo.')))
      .map(v => ({
        visitId: v.id,
        date: v.date,
        treatment: v.treatment || 'Visit',
        images: v.chit_media.filter(k => k.includes('_photo.')),
      }));
  }, [visits]);
  const totalImages = useMemo(() => allVisitMedia.reduce((sum, g) => sum + g.images.length, 0), [allVisitMedia]);
  const [expandedImage, setExpandedImage] = useState(null);
  const [expandedTooth, setExpandedTooth] = useState(null);
  const totalDue = useMemo(() => totalRevenue - totalCollected, [totalRevenue, totalCollected]);
  const upcomingFollowUp = useMemo(() => completedVisits.find(v => v.follow_up_date && v.follow_up_date >= new Date().toISOString().slice(0, 10)), [completedVisits]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100/50 dark:from-gray-950 dark:to-gray-900 p-4 md:p-6 lg:p-8">
        <div className="max-w-4xl mx-auto space-y-6 animate-pulse">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-24" />
          <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 border border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 rounded-2xl bg-gray-200 dark:bg-gray-700" />
              <div className="space-y-2">
                <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-40" />
                <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-24" />
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-gray-100 dark:bg-gray-800 rounded-2xl" />)}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100/50 dark:from-gray-950 dark:to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-red-50 dark:bg-red-900/20 mb-4">
            <AlertCircle className="w-10 h-10 text-red-400" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Patient not found</h2>
          <button onClick={() => router.push('/dashboard/patients')} className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-sm">
            Back to patients
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100/50 dark:from-gray-950 dark:to-gray-900">
      <div className="max-w-6xl mx-auto p-4 md:p-6 lg:p-8 space-y-6">
        {/* Back */}
        <button
          onClick={() => router.push('/dashboard/patients')}
          className="inline-flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Patients
        </button>

        {/* Patient Header Card */}
        <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-4 md:p-8 shadow-sm transition-colors duration-200">
          <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-5">
            <div className={`w-12 h-12 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br ${getAvatarColor(patient.name)} flex items-center justify-center text-white font-bold text-lg sm:text-xl shadow-lg shrink-0`}>
              {getInitials(patient.name)}
            </div>
            <div className="flex-1 min-w-0 w-full sm:w-auto">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4">
                <div className="min-w-0">
                  {editing ? (
                    <input
                      type="text"
                      value={editForm.name}
                      onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                      className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 tracking-tight bg-transparent border-b-2 border-gray-300 dark:border-gray-600 focus:border-gray-900 dark:focus:border-gray-100 outline-none pb-0.5 w-full"
                    />
                  ) : (
                    <h1 className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 tracking-tight truncate">
                      {patient.name === '?' ? 'Unknown Patient' : patient.name}
                    </h1>
                  )}
                  <div className="flex flex-wrap items-center gap-2 sm:gap-4 mt-2 text-sm sm:text-base text-gray-500 dark:text-gray-400">
                    <span className="flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      {editing ? (
                        <div className="flex items-center">
                          <span className="inline-flex items-center px-2 py-0.5 bg-gray-100 dark:bg-gray-700 border border-r-0 border-gray-300 dark:border-gray-600 rounded-l text-xs font-medium text-gray-600 dark:text-gray-300">{PHONE_PREFIX}</span>
                          <input
                            type="text"
                            value={stripPhonePrefix(editForm.phone)}
                            onChange={e => setEditForm(f => ({ ...f, phone: stripPhonePrefix(e.target.value) }))}
                            className="bg-transparent border-b border-t border-r border-gray-300 dark:border-gray-600 focus:border-gray-900 dark:focus:border-gray-100 outline-none w-28 sm:w-32 text-gray-900 dark:text-gray-100 text-sm px-1"
                          />
                        </div>
                      ) : (
                        patient.phone || 'N/A'
                      )}
                    </span>
                    {!editing && (
                      <>
                        <span className="flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                          {completedVisits.length} visit{completedVisits.length !== 1 ? 's' : ''}
                        </span>
                        {patient.age && (
                          <span>{patient.age} yrs{patient.sex ? `, ${patient.sex}` : ''}</span>
                        )}
                        {patient.location && (
                          <span className="text-gray-400 dark:text-gray-500">{patient.location}</span>
                        )}
                        <span className="flex items-center gap-1.5">
                          Family <button onClick={() => setShowLinkFamily(true)} className="text-blue-500 hover:text-blue-600">+ Link Member</button>
                        </span>
                      </>
                    )}
                  </div>
                  {upcomingFollowUp && (
                    <div className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">
                      Next Follow-up · {formatDate(upcomingFollowUp.follow_up_date)}
                    </div>
                  )}
                  {editing && (
                    <div className="flex flex-wrap items-center gap-3 sm:gap-4 mt-3">
                      <label className="text-xs text-gray-500 dark:text-gray-400">
                        Age
                        <input
                          type="number"
                          value={editForm.age}
                          onChange={e => setEditForm(f => ({ ...f, age: e.target.value }))}
                          className="ml-2 w-16 bg-transparent border-b border-gray-300 dark:border-gray-600 focus:border-gray-900 dark:focus:border-gray-100 outline-none text-sm text-gray-900 dark:text-gray-100"
                        />
                      </label>
                      <label className="text-xs text-gray-500 dark:text-gray-400">
                        Sex
                        <select
                          value={editForm.sex}
                          onChange={e => setEditForm(f => ({ ...f, sex: e.target.value }))}
                          className="ml-2 bg-transparent border-b border-gray-300 dark:border-gray-600 focus:border-gray-900 dark:focus:border-gray-100 outline-none text-sm text-gray-900 dark:text-gray-100"
                        >
                          <option value="">—</option>
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                          <option value="Other">Other</option>
                        </select>
                      </label>
                      <label className="text-xs text-gray-500 dark:text-gray-400">
                        Location
                        <input
                          type="text"
                          value={editForm.location}
                          onChange={e => setEditForm(f => ({ ...f, location: e.target.value }))}
                          placeholder="e.g. Bhilai, Durg"
                          className="ml-2 w-28 bg-transparent border-b border-gray-300 dark:border-gray-600 focus:border-gray-900 dark:focus:border-gray-100 outline-none text-sm text-gray-900 dark:text-gray-100"
                        />
                      </label>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {editing ? (
                    <>
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700 transition-all disabled:opacity-50 active:scale-95 shadow-md"
                      >
                        <Save className="w-4 h-4" />
                        {saving ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={() => { setEditing(false); setEditForm({ name: patient.name, age: patient.age?.toString() || '', sex: patient.sex || '', phone: stripPhonePrefix(patient.phone) || '', location: patient.location || '' }); }}
                        className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-sm font-medium rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-all"
                      >
                        <X className="w-4 h-4" />
                        Cancel
                      </button>
                    </>
                  ) : (
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => setEditing(true)} className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-sm font-medium rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-all active:scale-95">
                        <Edit3 className="w-4 h-4" />
                        Edit
                      </button>
                      <div className="relative" ref={moreRef}>
                        <button onClick={() => setShowMore(v => !v)} className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-sm font-medium rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-all active:scale-95">
                          More <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                        </button>
                        {showMore && (
                          <div className="absolute right-0 top-full mt-1 z-50 min-w-[180px] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl py-1.5">
                            <button onClick={() => { setShowMore(false); setShowMessageModal(true); }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all">
                              <MessageSquare className="w-4 h-4 text-blue-500" /> Message
                            </button>
                            <button onClick={async () => { setShowMore(false); const latest = completedVisits[0]; if (!latest) { showToast('No completed visits', 'error'); return; } try { const res = await fetch(`/api/dashboard/visits/${latest.id}/prescription`, { method: 'POST' }); const data = await res.json(); if (res.ok && data.url) window.open(data.url, '_blank'); else showToast(data.error || 'Failed', 'error'); } catch { showToast('Network error', 'error'); } }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all">
                              <Printer className="w-4 h-4 text-gray-500" /> Print
                            </button>
                            <button onClick={async () => { setShowMore(false); const latest = completedVisits[0]; if (!latest) { showToast('No completed visits', 'error'); return; } try { const res = await fetch(`/api/dashboard/visits/${latest.id}/chart`, { method: 'POST' }); const data = await res.json(); if (res.ok && data.url) window.open(data.url, '_blank'); else showToast(data.error || 'Failed', 'error'); } catch { showToast('Network error', 'error'); } }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all">
                              <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg> Chart
                            </button>
                            <div className="border-t border-gray-100 dark:border-gray-700 my-1" />
                            <button onClick={async () => { setShowMore(false); await sendGoogleReview(); }} disabled={sendingReviewLink} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all disabled:opacity-50">
                              <svg className="w-4 h-4 text-orange-500" viewBox="0 0 24 24" fill="currentColor"><path d="M21.35 11.1H12v3h5.46c-.69 2.01-2.43 3.46-4.96 3.46-3.04 0-5.5-2.46-5.5-5.5s2.46-5.5 5.5-5.5c1.46 0 2.68.53 3.67 1.42l2.52-2.52C16.87 3.96 14.57 3 12 3 7.03 3 3 7.03 3 12s4.03 9 9 9c4.54 0 8.29-3.22 8.99-7.5l.36-2.4z" /></svg> Google Review
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>



          {/* Metrics Strip */}
          {completedVisits.length > 0 && (
            <>
              <button onClick={() => visitsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="w-full mt-4 sm:mt-6 flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-all text-left">
                👤 {completedVisits.length} Visit{completedVisits.length !== 1 ? 's' : ''} <span className="text-gray-300 dark:text-gray-600">·</span> {formatCurrency(totalRevenue)} Revenue <span className="text-gray-300 dark:text-gray-600">·</span> Last Visit {completedVisits[0] ? formatDate(completedVisits[0].date) : 'N/A'}
              </button>
            </>
          )}
        </div>

        {/* Visit History — hero section */}
        <div ref={visitsRef}>
          {visits.length > 0 ? (
            <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-4 md:p-8 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <ClipboardList className="w-5 h-5 text-blue-500" />
                <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Visit History</h2>
                <span className="text-xs text-gray-400 dark:text-gray-500">({visits.length})</span>
              </div>
              <div className="relative">
                <div className="absolute left-[18px] md:left-[23px] top-0 bottom-0 w-px bg-gray-200 dark:bg-gray-700 opacity-50" />
                <div className="space-y-4 md:space-y-6">
                  {visits.map((visit, idx) => (
                    <div key={visit.id || idx} className="relative pl-10 md:pl-14 animate-in" style={{ animationDelay: `${idx * 80}ms` }}>
                        <div className={`absolute left-[9px] md:left-[14px] top-1 w-3 h-3 md:w-3.5 md:h-3.5 rounded-full border-2 border-white dark:border-gray-900 shadow-sm ${
                          visit.status === 'completed' ? 'bg-emerald-500/80'
                          : visit.status === 'cancelled' ? 'bg-red-400/80'
                          : 'bg-amber-400/80'
                        }`} />
                      <div onClick={() => { if (visit.status === 'completed') router.push(`/dashboard/visit?appointmentId=${visit.id}&name=${encodeURIComponent(patient?.name || '')}&treatment=${encodeURIComponent(visit.treatment || '')}&patientId=${id}`); }}
                        className="bg-gradient-to-br from-gray-50 to-white dark:from-gray-800 dark:to-gray-900 rounded-2xl border border-gray-200/80 dark:border-gray-700 p-4 md:p-5 hover:shadow-md dark:hover:shadow-gray-900/50 hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-200 cursor-pointer active:scale-[0.98]">
                        <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 truncate">{visit.treatment || 'Visit'}</h3>
                        <div className="flex items-center gap-1 mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                          {formatDate(visit.date)}
                          {visit.time && <><span className="text-gray-300 dark:text-gray-600">·</span><span>{visit.time}</span></>}
                          {(Number(visit.consultation_fee || 0) + Number(visit.treatment_charges || 0) + Number(visit.medicine_charges || 0)) > 0 && (
                            <><span className="text-gray-300 dark:text-gray-600">·</span>
                            <span className="font-medium text-gray-900 dark:text-gray-100">{formatCurrency(Number(visit.consultation_fee || 0) + Number(visit.treatment_charges || 0) + Number(visit.medicine_charges || 0))}</span>
                            {visit.payment_status === 'paid' && <span className="text-emerald-600">· Paid</span>}
                            {visit.payment_status === 'partial' && <span className="text-amber-500">· Part Paid</span>}
                            {visit.payment_status === 'pending' && <span className="text-red-500">· Unpaid</span>}
                            </>
                          )}
                          {visit.status !== 'completed' && (
                            <span className={`ml-1 px-1.5 py-0.5 rounded text-xs font-medium ${
                              visit.status === 'cancelled' ? 'text-red-500 bg-red-50 dark:bg-red-900/30' :
                              'text-amber-500 bg-amber-50 dark:bg-amber-900/30'
                            }`}>
                              {visit.status === 'no_show' ? 'No Show' : visit.status.charAt(0).toUpperCase() + visit.status.slice(1)}
                            </span>
                          )}
                        </div>

                        {visit.diagnosis && (
                          <p className="mt-3 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{visit.diagnosis}</p>
                        )}

                        {Array.isArray(visit.tooth_diagnoses) && visit.tooth_diagnoses.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {visit.tooth_diagnoses.map((td, ti) => (
                              <span key={ti} className="inline-flex items-center gap-1 px-2 py-1 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-700 dark:text-gray-300">
                                #{td.tooth}
                                {td.surface && <span className="opacity-50">{td.surface}</span>}
                                <span className="text-gray-300 dark:text-gray-600">—</span>
                                {td.diagnoses.join(', ')}
                                {td.treatment && <><span className="text-gray-300 dark:text-gray-600">|</span><span className="text-emerald-600 dark:text-emerald-400">{getTreatmentName(td.treatment)}</span></>}
                                {td.severity && (
                                  <span className={`text-xs px-1 py-0.5 rounded ${
                                    td.severity === 'severe' ? 'text-red-600 bg-red-50 dark:bg-red-900/30' :
                                    td.severity === 'moderate' ? 'text-orange-600 bg-orange-50 dark:bg-orange-900/30' :
                                    'text-amber-600 bg-amber-50 dark:bg-amber-900/30'
                                  }`}>{td.severity}</span>
                                )}
                                {td.status === 'treated' && <span className="text-xs text-emerald-500 bg-emerald-50 dark:bg-emerald-900/30 px-1 py-0.5 rounded">✓ Treated</span>}
                                {td.status === 'wip' && <span className="text-xs text-blue-500 bg-blue-50 dark:bg-blue-900/30 px-1 py-0.5 rounded">In Progress</span>}
                              </span>
                            ))}
                          </div>
                        )}

                        {Array.isArray(visit.medicines) && visit.medicines.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {visit.medicines.map((med, mi) => (
                              <span key={mi} className="inline-flex items-center gap-1 px-2.5 py-1 bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-900/30 dark:to-purple-900/30 text-purple-700 dark:text-purple-400 text-xs font-medium rounded-lg border border-purple-200 dark:border-purple-800">
                                {med.name}
                                {med.dosage && <><span className="text-purple-400">|</span><span>{med.dosage}</span></>}
                                {med.frequency && <><span className="text-purple-400">•</span><span>{med.frequency}</span></>}
                                {med.duration && <><span className="text-purple-400">•</span><span>{med.duration}</span></>}
                              </span>
                            ))}
                          </div>
                        )}

                        {visit.notes && (
                          <p className="mt-2 text-xs text-gray-400 dark:text-gray-500 italic leading-relaxed">{visit.notes}</p>
                        )}

                        {visit.chit_media && visit.chit_media.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {visit.chit_media.filter(k => k.includes('_photo.')).map(key => (
                              <img key={key} src={getSignedUrl(key)} alt=""
                                className="w-12 h-12 rounded-lg object-cover border border-gray-200 dark:border-gray-700"
                                loading="lazy" />
                            ))}
                            {visit.chit_media.filter(k => !k.includes('_photo.')).length > 0 && (
                              <span className="inline-flex items-center px-1.5 py-0.5 text-xs text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700">
                                +{visit.chit_media.filter(k => !k.includes('_photo.')).length} files
                              </span>
                            )}
                          </div>
                        )}

                        {visit.status === 'completed' && (
                          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 flex flex-wrap gap-2">
                            <button onClick={async (e) => {
                              e.stopPropagation();
                              try {
                                const res = await fetch(`/api/dashboard/visits/${visit.id}/prescription`, { method: 'POST' });
                                const data = await res.json();
                                if (res.ok && data.url) window.open(data.url, '_blank');
                                else showToast(data.error || 'Failed to generate prescription', 'error');
                              } catch { showToast('Network error', 'error'); }
                            }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-all active:scale-95 cursor-pointer">
                              <Printer className="w-3 h-3" /> Rx
                            </button>
                            <button onClick={async (e) => {
                              e.stopPropagation();
                              try {
                                const res = await fetch(`/api/dashboard/visits/${visit.id}/chart`, { method: 'POST' });
                                const data = await res.json();
                                if (res.ok && data.url) window.open(data.url, '_blank');
                                else showToast(data.error || 'Failed to generate chart', 'error');
                              } catch { showToast('Network error', 'error'); }
                            }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-all active:scale-95 cursor-pointer">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg> Chart
                            </button>
                            <button onClick={async (e) => {
                              e.stopPropagation();
                              setSendingMessage(true);
                              try {
                                showToast('⏳ Compiling & sending...', 'info', { duration: 6000 });
                                const res = await fetch(`/api/dashboard/visits/${visit.id}/compile/send`, { method: 'POST' });
                                const data = await res.json();
                                if (res.ok && data.success) {
                                  showToast('✅ Compiled & sent to patient on WhatsApp', 'success');
                                } else if (data.url) {
                                  window.open(data.url, '_blank');
                                  showToast('⚠️ Compiled but WhatsApp send failed. PDF opened in new tab.', 'info');
                                } else {
                                  showToast(data.error || 'Failed to compile', 'error');
                                }
                              } catch { showToast('Network error', 'error'); }
                              setSendingMessage(false);
                            }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-all active:scale-95 cursor-pointer">
                              <Download className="w-3 h-3" /> Compile
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/visit?appointmentId=${visit.id}&name=${encodeURIComponent(patient?.name || '')}&treatment=${encodeURIComponent(visit.treatment || '')}&edit=true&patientId=${id}`); }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-all active:scale-95 cursor-pointer">
                              <Edit3 className="w-3 h-3" /> Edit
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-12 text-center shadow-sm">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-50 dark:bg-gray-800 mb-4">
                <ClipboardList className="w-8 h-8 text-gray-300 dark:text-gray-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">No visits recorded</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Visit history will appear here once appointments are completed</p>
            </div>
          )}
        </div>

        {/* Medical History & Habits */}
        {(patient.allergies || patient.chronic_conditions || patient.blood_group || patient.bp || patient.weight || patient.medications || patient.habits || patient.address || patient.occupation || patient.dental_history || patient.family_history) && (
          <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
            <button onClick={() => setShowMedical(v => !v)} className="w-full flex items-center gap-2.5 px-4 md:px-6 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left">
              <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${showMedical ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Medical History &amp; Habits</span>
            </button>
            {showMedical && (
            <div className="px-4 md:px-6 pb-4 md:pb-6">
            <div className="flex flex-wrap gap-2">
              {patient.allergies && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-xs font-medium border border-red-100 dark:border-red-800">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  Allergies: {patient.allergies}
                </span>
              )}
              {patient.chronic_conditions && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 text-xs font-medium border border-orange-100 dark:border-orange-800">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  Chronic: {patient.chronic_conditions}
                </span>
              )}
              {patient.blood_group && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium border border-blue-100 dark:border-blue-800">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                  Blood: {patient.blood_group}
                </span>
              )}
              {(patient.bp || patient.weight) && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 text-xs font-medium border border-teal-100 dark:border-teal-800">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  {[patient.bp, patient.weight].filter(Boolean).join(' / ')}
                </span>
              )}
              {patient.medications && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 text-xs font-medium border border-violet-100 dark:border-violet-800">
                  <Pill className="w-3 h-3" />
                  Meds: {patient.medications}
                </span>
              )}
              {patient.habits && typeof patient.habits === 'object' && Object.keys(patient.habits).length > 0 && (() => {
                const h = patient.habits;
                const habitLabel = (key, val) => {
                  const labels = {
                    smoking: { never: 'Never', former: 'Former', current: 'Current' },
                    tobaccoChewing: { never: 'Never', former: 'Former', current: 'Current' },
                    panMasala: { never: 'Never', former: 'Former', current: 'Current' },
                    alcohol: { never: 'Never', occasional: 'Occasional', regular: 'Regular' },
                    brushingFrequency: { once: 'Once/day', twice: 'Twice/day', irregular: 'Irregular' },
                    sugaryDiet: { low: 'Low', moderate: 'Moderate', high: 'High' },
                  };
                  const displayNames = {
                    smoking: 'Smoking', tobaccoChewing: 'Tobacco', panMasala: 'Pan Masala',
                    alcohol: 'Alcohol', brushingFrequency: 'Brushing', sugaryDiet: 'Sugary Diet',
                  };
                  const label = labels[key]?.[val];
                  return label ? `${displayNames[key] || key}: ${label}` : null;
                };
                const items = Object.entries(h)
                  .filter(([k, v]) => v && k !== 'other')
                  .map(([k, v]) => habitLabel(k, v))
                  .filter(Boolean);
                if (items.length === 0 && h.other) items.push(`Other: ${h.other}`);
                if (items.length === 0) return null;
                return items.map((item, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-xs font-medium border border-amber-100 dark:border-amber-800">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    {item}
                  </span>
                ));
              })()}
              {patient.address && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium border border-blue-100 dark:border-blue-800">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  Address: {patient.address}
                </span>
              )}
              {patient.occupation && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium border border-blue-100 dark:border-blue-800">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                  Occupation: {patient.occupation}
                </span>
              )}
              {patient.dental_history && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 text-xs font-medium border border-orange-100 dark:border-orange-800">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                  PDH: {patient.dental_history}
                </span>
              )}
              {patient.family_history && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 text-xs font-medium border border-teal-100 dark:border-teal-800">
                  <Users className="w-3 h-3" />
                  FH: {patient.family_history}
                </span>
              )}
            </div>
          </div>
        )}
          </div>
        )}

        {/* All Media Gallery */}
        {totalImages > 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-4 md:p-6 shadow-sm">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                  <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <span className="text-sm sm:text-base font-semibold text-gray-900 dark:text-gray-100">All Images ({totalImages})</span>
              </div>
              <span className="text-xs text-gray-400 dark:text-gray-500">{allVisitMedia.length} visit{allVisitMedia.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="space-y-3">
              {allVisitMedia.map(group => (
                <div key={group.visitId}>
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar className="w-3 h-3 text-gray-400" />
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{formatDate(group.date)} — {group.treatment}</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">({group.images.length})</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {group.images.map(key => (
                      <button
                        key={key}
                        onClick={() => setExpandedImage(key)}
                        className="group relative overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 hover:border-violet-300 dark:hover:border-violet-600 hover:shadow-md transition-all duration-200 shrink-0 focus:outline-none focus:ring-2 focus:ring-violet-400"
                      >
                        <img
                          src={getSignedUrl(key)}
                          alt=""
                          className="w-20 h-20 sm:w-24 sm:h-24 object-cover transition-transform duration-300 group-hover:scale-110"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-200" />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}



            {/* Per-Tooth chip grid + right drawer */}
            {completedVisits.some(v => v.tooth_diagnoses?.length > 0) && (() => {
              const toothTimeline = {};
              for (const v of completedVisits) {
                if (!v.tooth_diagnoses?.length) continue;
                for (const td of v.tooth_diagnoses) {
                  if (!toothTimeline[td.tooth]) toothTimeline[td.tooth] = [];
                  toothTimeline[td.tooth].push({
                    date: v.date,
                    visitId: v.id,
                    surface: td.surface,
                    diagnoses: td.diagnoses,
                    treatment: td.treatment,
                    severity: td.severity,
                    status: td.status,
                    outcome: td.outcome,
                    notes: td.notes,
                  });
                }
              }
              const toothKeys = Object.keys(toothTimeline).sort((a, b) => Number(a) - Number(b));
              if (toothKeys.length === 0) return null;

              function outcomeColor(outcome) {
                if (outcome === 'successful') return 'bg-emerald-400';
                if (outcome === 'complication' || outcome === 'failed') return 'bg-red-400';
                if (outcome === 'ongoing') return 'bg-blue-400';
                return 'bg-gray-300 dark:bg-gray-600';
              }

              function outcomeIcon(outcome) {
                if (outcome === 'successful') return '✓';
                if (outcome === 'complication') return '⚠';
                if (outcome === 'failed') return '✕';
                if (outcome === 'ongoing') return '⟳';
                return '';
              }

              const selectedEntries = expandedTooth ? toothTimeline[expandedTooth] : null;

              return (
                <>
                  <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-3 md:p-5 shadow-sm mt-4">
                    <div className="flex items-center gap-2 mb-3">
                      <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                      <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Per-Tooth History</h3>
                      <span className="text-xs text-gray-400 dark:text-gray-500">· {toothKeys.length} teeth</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {toothKeys.map(tooth => {
                        const entries = toothTimeline[tooth];
                        const latest = entries[entries.length - 1];
                        return (
                          <button
                            key={tooth}
                            onClick={() => setExpandedTooth(expandedTooth === tooth ? null : tooth)}
                            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium transition-all active:scale-95 ${
                              expandedTooth === tooth
                                ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-gray-900 dark:border-white shadow-md'
                                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500 hover:shadow-sm'
                            }`}
                          >
                            <span className={`w-2 h-2 rounded-full ${latest.outcome ? outcomeColor(latest.outcome) : 'bg-gray-300'}`} />
                            #{tooth}
                            {latest.outcome && <span className="text-xs opacity-60">{outcomeIcon(latest.outcome)}</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Right drawer */}
                  {expandedTooth && selectedEntries && (
                    <>
                      <div className="fixed inset-0 bg-black/30 z-40 backdrop-blur-sm cursor-pointer" onClick={() => setExpandedTooth(null)} />
                      <div className="fixed top-0 right-0 h-full w-full max-w-md bg-white dark:bg-gray-900 shadow-2xl z-50 overflow-y-auto">
                        <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 px-5 py-4 flex items-center justify-between z-10">
                          <div className="flex items-center gap-2.5">
                            <span className={`w-3 h-3 rounded-full ${outcomeColor(selectedEntries[selectedEntries.length - 1].outcome)}`} />
                            <h3 className="font-bold text-gray-900 dark:text-gray-100">#{expandedTooth} History</h3>
                            <span className="text-xs text-gray-400">({selectedEntries.length} visit{selectedEntries.length > 1 ? 's' : ''})</span>
                          </div>
                          <button onClick={() => setExpandedTooth(null)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                            <X className="w-4 h-4 text-gray-400" />
                          </button>
                        </div>
                        <div className="p-5 space-y-3">
                          {selectedEntries.map((e, idx) => (
                            <div key={idx} className="flex gap-3 text-sm bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
                              <div className="flex flex-col items-center gap-1 shrink-0">
                                <span className={`w-3 h-3 rounded-full ring-2 ring-white dark:ring-gray-900 ${outcomeColor(e.outcome)}`} />
                                {idx < selectedEntries.length - 1 && <div className="w-0.5 flex-1 bg-gray-200 dark:bg-gray-700" />}
                              </div>
                              <div className="flex-1 min-w-0 space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-gray-900 dark:text-gray-100">{formatDate(e.date).slice(0, 6)}</span>
                                  {e.surface && <span className="text-gray-400">({e.surface})</span>}
                                  {e.severity && (
                                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                                      e.severity === 'severe' ? 'text-red-600 bg-red-50 dark:bg-red-900/30' :
                                      e.severity === 'moderate' ? 'text-orange-600 bg-orange-50 dark:bg-orange-900/30' :
                                      'text-amber-600 bg-amber-50 dark:bg-amber-900/30'
                                    }`}>{e.severity}</span>
                                  )}
                                </div>
                                <p className="text-gray-700 dark:text-gray-300 font-medium">{e.diagnoses.join(', ')}</p>
                                {e.treatment && <p className="text-emerald-600 dark:text-emerald-400">Plan: {getTreatmentName(e.treatment)}</p>}
                                {e.outcome && <p className="font-medium" style={{ color: e.outcome === 'successful' ? '#059669' : e.outcome === 'complication' || e.outcome === 'failed' ? '#dc2626' : '#2563eb' }}>{outcomeIcon(e.outcome)} {e.outcome}</p>}
                                {e.notes && <p className="text-gray-400 dark:text-gray-500 italic text-xs">{e.notes}</p>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </>
              );
            })()}

        {/* Feedback */}
        {feedback.length > 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
            <button onClick={() => setShowFeedback(v => !v)} className="w-full flex items-center gap-2.5 px-4 md:px-6 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left">
              <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${showFeedback ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              <Star className="w-4 h-4 text-amber-500" />
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Feedback</span>
              <span className="ml-auto inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-xs font-medium">{feedback.length}</span>
            </button>
            {showFeedback && (
              <div className="px-4 md:px-6 pb-4 md:pb-6 space-y-4">
                {/* Doctor's Patient Ratings */}
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                    <Star className="w-4 h-4 text-blue-500" />
                    Doctor's Patient Rating
                  </h3>
                  <div className="space-y-2">
                    {RATING_CATEGORIES.map(cat => (
                      <div key={cat.key} className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-gray-600 dark:text-gray-400 min-w-[100px]">{cat.label}</span>
                        <div className="flex items-center gap-0.5">
                          {[1, 2, 3, 4, 5].map(star => (
                            <button
                              key={star}
                              type="button"
                              onClick={() => setPatientRatings(prev => ({ ...prev, [cat.key]: (prev[cat.key] || 0) === star ? 0 : star }))}
                              className={`w-5 h-5 flex items-center justify-center rounded transition-all hover:scale-110 active:scale-90 ${
                                (patientRatings[cat.key] || 0) >= star
                                  ? 'text-amber-400'
                                  : 'text-gray-300 dark:text-gray-600'
                              }`}
                            >
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                              </svg>
                            </button>
                          ))}
                          <span className="ml-1.5 text-xs font-medium text-gray-400 dark:text-gray-500 min-w-[20px]">
                            {patientRatings[cat.key] || 0}/5
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
                    <p className="text-xs text-gray-400 dark:text-gray-500">Rate the patient across categories</p>
                    <button
                      onClick={saveRatings}
                      disabled={savingRatings}
                      className="px-3 py-1.5 text-xs font-medium bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white rounded-lg transition-all active:scale-95"
                    >
                      {savingRatings ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>

                {/* Patient's Feedback (from WhatsApp) */}
                <div>
                  {feedback.filter(f => f.rating).length > 0 ? (
                    <>
                      <div className="grid grid-cols-3 gap-2 mb-4">
                        {['great', 'okay', 'poor'].map(rating => {
                          const entries = feedback.filter(f => f.rating === rating);
                          if (entries.length === 0) return null;
                          const r = ratingEmoji(rating);
                          return (
                            <div key={rating} className={`rounded-xl p-2.5 text-center ${r.color} border border-current/20`}>
                              <div className="text-lg mb-0.5">{r.emoji}</div>
                              <div className="text-sm font-bold">{entries.length}</div>
                              <div className="text-xs font-medium opacity-70">{r.label}</div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="space-y-2">
                        {feedback.map((f, i) => (
                          <div key={f.id || i} className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3 border border-gray-100 dark:border-gray-700">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${ratingBadge(f.rating)}`}>
                                {ratingIcon(f.rating)}
                                {f.rating}
                              </span>
                              <span className="text-xs text-gray-400 dark:text-gray-500">
                                {new Date(f.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </span>
                            </div>
                            {f.comment && <p className="text-sm text-gray-700 dark:text-gray-300">{f.comment}</p>}
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-8">
                      <Star className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                      <p className="text-xs text-gray-400 dark:text-gray-500">No feedback yet from this patient.</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Messages */}
        {messages.length > 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
            <button onClick={() => setShowMessages(v => !v)} className="w-full flex items-center gap-2.5 px-4 md:px-6 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left">
              <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${showMessages ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              <MessageSquare className="w-4 h-4 text-blue-500" />
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Messages</span>
              <span className="ml-auto inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs font-medium">{messages.length}</span>
            </button>
            {showMessages && (
              <div className="px-4 md:px-6 pb-4 md:pb-6">
                {manualMode && (
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl text-xs flex-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse shrink-0" />
                      <span className="text-blue-700 dark:text-blue-300 font-medium">Doctor Chat Active</span>
                    </div>
                    <button
                      onClick={endChat}
                      disabled={endingChat}
                      className="px-3 py-1.5 text-xs font-medium border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-all active:scale-95 disabled:opacity-50"
                    >
                      {endingChat ? 'Ending...' : 'End Chat'}
                    </button>
                  </div>
                )}
                {messagesLoading ? (
                  <div className="space-y-2 animate-pulse">
                    {[1,2,3].map(i => (
                      <div key={i} className="flex gap-2">
                        <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700 shrink-0" />
                        <div className="flex-1 space-y-1.5">
                          <div className="h-2.5 bg-gray-200 dark:bg-gray-700 rounded w-20" />
                          <div className="h-10 bg-gray-100 dark:bg-gray-800 rounded-xl w-2/3" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[500px] overflow-y-auto">
                    {messages.map((msg, i) => (
                      <div key={msg.id || i} className={`flex gap-2 ${msg.role === 'bot' ? 'justify-start' : 'justify-end'}`}>
                        {msg.role === 'bot' && (
                          <div className="w-6 h-6 rounded-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">B</div>
                        )}
                        <div className={`max-w-[80%]`}>
                          <div className={`rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                            msg.role === 'bot'
                              ? 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-tl-md'
                              : 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-tr-md'
                          }`}>
                            <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                          </div>
                          <div className={`flex items-center gap-1.5 mt-0.5 text-xs text-gray-400 dark:text-gray-500 ${msg.role === 'user' ? 'text-right' : ''}`}>
                            <span>{new Date(msg.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                            {msg.intent && <span className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">{msg.intent}</span>}
                          </div>
                        </div>
                        {msg.role === 'user' && (
                          <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">P</div>
                        )}
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

        {/* Link Family Member Modal */}
        {showLinkFamily && (
          <>
            <div className="fixed inset-0 bg-black/40 dark:bg-black/60 z-50 backdrop-blur-sm cursor-pointer" onClick={() => { setShowLinkFamily(false); setLinkSearch(''); setLinkSearchResults([]); }} />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-2xl w-full max-w-md overflow-hidden animate-scale-in">
                <div className="flex items-center justify-between px-4 sm:px-5 pt-4 pb-3 border-b border-gray-100 dark:border-gray-800">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-lg">Link Family Member</h3>
                  <button
                    onClick={() => { setShowLinkFamily(false); setLinkSearch(''); setLinkSearchResults([]); }}
                    className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-all"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="p-4 sm:p-5 space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Search Patient</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={linkSearch}
                        onChange={e => setLinkSearch(e.target.value)}
                        placeholder="Type patient name..."
                        className="w-full pl-3 pr-8 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400 text-gray-900 dark:text-gray-100 placeholder-gray-400"
                        autoFocus
                      />
                      {linkSearching && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <div className="w-3.5 h-3.5 border-2 border-gray-200 border-t-violet-500 rounded-full animate-spin" />
                        </div>
                      )}
                    </div>
                    {linkSearchResults.length > 0 && (
                      <div className="mt-2 max-h-48 overflow-y-auto space-y-1">
                        {linkSearchResults.map(p => (
                          <button
                            key={p.id}
                            onClick={() => handleLinkPatient(p.id)}
                            disabled={linking}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-violet-50 dark:hover:bg-violet-900/20 border border-transparent hover:border-violet-200 dark:hover:border-violet-800 transition-all text-left"
                          >
                            <span className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-xs font-semibold text-gray-600 dark:text-gray-300 shrink-0">
                              {(p.name || '?')[0].toUpperCase()}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{p.name}</p>
                              <p className="text-xs text-gray-400 dark:text-gray-500">{p.phone || 'No phone'} {p.age ? `· ${p.age}yrs` : ''}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    {linkSearch.length >= 2 && !linkSearching && linkSearchResults.length === 0 && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 text-center">No matching patients found.</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Relationship</label>
                    <select
                      value={linkType}
                      onChange={e => setLinkType(e.target.value)}
                      className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400 text-gray-900 dark:text-gray-100"
                    >
                      <option value="spouse">Spouse</option>
                      <option value="child">Child</option>
                      <option value="parent">Parent</option>
                      <option value="sibling">Sibling</option>
                      <option value="guardian">Guardian</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => { setShowLinkFamily(false); setLinkSearch(''); setLinkSearchResults([]); }}
                      className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-all"
                    >
                      Cancel
                    </button>
                    <p className="text-xs text-gray-400 dark:text-gray-500 text-center flex-1">Select a patient and relationship above</p>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Send Message Modal */}
        {showMessageModal && (
          <>
            <div className="fixed inset-0 bg-black/40 dark:bg-black/60 z-50 backdrop-blur-sm cursor-pointer" onClick={() => setShowMessageModal(false)} />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
              <div className="bg-white dark:bg-gray-900 rounded-2xl sm:rounded-3xl border border-gray-100 dark:border-gray-800 shadow-2xl w-full max-w-lg overflow-hidden animate-scale-in mx-auto">
                <div className="flex items-center justify-between px-4 sm:px-6 pt-4 sm:pt-6 pb-4 border-b border-gray-100 dark:border-gray-800">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br ${getAvatarColor(patient.name)} flex items-center justify-center text-white font-bold text-sm shadow-md shrink-0`}>
                      {getInitials(patient.name)}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-lg truncate">Send Message to {patient.name === '?' ? 'Patient' : patient.name}</h3>
                      <p className="text-xs text-gray-400 dark:text-gray-500">Via WhatsApp</p>
                    </div>
                  </div>
                  <button
                    onClick={() => { setShowMessageModal(false); setMessageText(''); }}
                    className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-all shrink-0"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!messageText.trim() || sendingMessage) return;
                    setSendingMessage(true);
                    try {
                      const res = await fetch(`/api/dashboard/patients/${id}/send-message`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ message: messageText.trim() }),
                      });
                      const data = await res.json();
                      if (res.ok) {
                        setMessageText('');
                        setShowMessageModal(false);
                        setManualMode(true);
                        setManualModeStartedAt(new Date().toISOString());
                        // Refresh messages section
                        if (showMessages) {
                          loadMessages();
                        }
                      } else {
                        showToast(data.error || 'Failed to send message', 'error');
                      }
                    } catch (err) {
                      showToast('Network error — could not send message', 'error');
                    } finally {
                      setSendingMessage(false);
                    }
                  }}
                  className="p-4 sm:p-6"
                >
                  <div className="relative">
                    <textarea
                      value={messageText}
                      onChange={e => setMessageText(e.target.value)}
                      placeholder="Type your message here…"
                      rows={4}
                      autoFocus
                      className="w-full resize-none rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-3.5 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 dark:focus:border-blue-400 transition-all"
                      onKeyDown={e => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                          e.currentTarget.closest('form').requestSubmit();
                        }
                      }}
                    />
                    <p className="mt-2 text-xs text-gray-400 dark:text-gray-500 text-right">
                      {patient.phone ? `Via WhatsApp — ${patient.phone}` : 'No phone number on file'}
                    </p>
                  </div>
                  <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-3 mt-4">
                    <button
                      type="button"
                      onClick={() => { setShowMessageModal(false); setMessageText(''); }}
                      className="px-5 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!messageText.trim() || sendingMessage}
                      className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-all disabled:opacity-50 active:scale-95 shadow-md"
                    >
                      <MessageSquare className="w-4 h-4" />
                      {sendingMessage ? 'Sending…' : 'Send Message'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </>
        )}

        {/* Expanded Image Lightbox */}
        {expandedImage && (
          <>
            <div className="fixed inset-0 bg-black/70 dark:bg-black/80 z-50 backdrop-blur-md cursor-pointer" onClick={() => setExpandedImage(null)} />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
              <div className="relative max-w-3xl w-full max-h-[90vh] flex items-center justify-center animate-scale-in">
                <button
                  onClick={() => setExpandedImage(null)}
                  className="absolute -top-3 -right-3 z-10 w-8 h-8 rounded-full bg-white dark:bg-gray-800 shadow-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-all hover:scale-110"
                >
                  <X className="w-4 h-4" />
                </button>
                <img
                  src={getSignedUrl(expandedImage)}
                  alt=""
                  className="max-w-full max-h-[85vh] rounded-2xl shadow-2xl object-contain bg-white dark:bg-gray-900"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>
          </>
        )}

      <style jsx>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.95) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .animate-in {
          animation: fadeInUp 0.4s ease-out both;
        }
        .animate-scale-in {
          animation: scaleIn 0.2s ease-out both;
        }
        @media print {
          .animate-in {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
          }
        }
      `}</style>
    </div>
  );
}
