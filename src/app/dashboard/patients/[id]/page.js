'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Activity, DollarSign, Calendar, Clock, Phone,
  Pill, Stethoscope, FileText, Printer,
  ChevronRight, Users, AlertCircle, Star,
  ClipboardList, Edit3, Save, X, MessageSquare
} from 'lucide-react';
import MediaViewer from '@/components/MediaViewer';

export default function PatientDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [patient, setPatient] = useState(null);
  const [visits, setVisits] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', age: '', sex: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('visits');
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (activeTab === 'messages' && messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, activeTab]);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/dashboard/patients/${id}`);
        const data = await res.json();
        setPatient(data.patient);
        setVisits(data.visits || []);
        setEditForm({
          name: data.patient?.name || '',
          age: data.patient?.age?.toString() || '',
          sex: data.patient?.sex || '',
          phone: data.patient?.phone || '',
        });
        if (data.patient?.wa_id) {
          const fbRes = await fetch(`/api/dashboard/feedback?limit=20&waId=${encodeURIComponent(data.patient.wa_id)}`);
          const fbData = await fbRes.json();
          setFeedback(fbData?.entries || []);
        }
      } catch (e) {
        console.error('Failed to load patient', e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  async function loadMessages() {
    setMessagesLoading(true);
    try {
      const res = await fetch(`/api/dashboard/patients/${id}/messages`);
      const data = await res.json();
      setMessages(data.messages || []);
    } catch (e) {
      console.error('Failed to load messages', e);
    } finally {
      setMessagesLoading(false);
    }
  }

  useEffect(() => {
    if (activeTab === 'messages' && messages.length === 0 && !messagesLoading) {
      loadMessages();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

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
          phone: editForm.phone.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setPatient(prev => ({ ...prev, ...data.patient }));
        setEditing(false);
      } else {
        alert(data.error || 'Failed to save');
      }
    } catch (err) {
      alert('Network error');
    } finally {
      setSaving(false);
    }
  }

  const tabs = [
    { id: 'visits', label: 'Visit History', count: visits.length },
    { id: 'feedback', label: 'Feedback', count: feedback.filter(f => f.rating).length },
    { id: 'messages', label: 'Messages', count: null },
  ];

  function formatDate(d) {
    if (!d) return 'N/A';
    const dateStr = typeof d === 'string' ? d.slice(0, 10) : String(d).slice(0, 10);
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-IN', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
    });
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

  function getAvatarColor(name) {
    const colors = [
      'from-blue-500 to-blue-600',
      'from-emerald-500 to-teal-600',
      'from-violet-500 to-purple-600',
      'from-rose-500 to-pink-600',
      'from-amber-500 to-orange-600',
    ];
    let hash = 0;
    for (let i = 0; i < (name || '').length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  const completedVisits = visits.filter(v => v.status === 'completed');
  const totalRevenue = completedVisits.reduce((sum, v) => sum + Number(v.consultation_fee || 0) + Number(v.treatment_charges || 0) + Number(v.medicine_charges || 0), 0);
  const upcomingFollowUp = completedVisits.find(v => v.follow_up_date && v.follow_up_date >= new Date().toISOString().slice(0, 10));

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
      <div className="max-w-4xl mx-auto p-4 md:p-6 lg:p-8 space-y-6">
        {/* Back */}
        <button
          onClick={() => router.push('/dashboard/patients')}
          className="inline-flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Patients
        </button>

        {/* Patient Header Card */}
        <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-6 md:p-8 shadow-sm transition-colors duration-200">
          <div className="flex items-start gap-5">
            <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${getAvatarColor(patient.name)} flex items-center justify-center text-white font-bold text-xl shadow-lg shrink-0`}>
              {getInitials(patient.name)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-4">
                <div>
                  {editing ? (
                    <input
                      type="text"
                      value={editForm.name}
                      onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                      className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100 tracking-tight bg-transparent border-b-2 border-gray-300 dark:border-gray-600 focus:border-gray-900 dark:focus:border-gray-100 outline-none pb-0.5 w-full"
                    />
                  ) : (
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
                      {patient.name === '?' ? 'Unknown Patient' : patient.name}
                    </h1>
                  )}
                  <div className="flex items-center gap-4 mt-2 text-sm text-gray-500 dark:text-gray-400">
                    <span className="flex items-center gap-1.5">
                      <Phone className="w-4 h-4" />
                      {editing ? (
                        <input
                          type="text"
                          value={editForm.phone}
                          onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                          className="bg-transparent border-b border-gray-300 dark:border-gray-600 focus:border-gray-900 dark:focus:border-gray-100 outline-none w-32 text-gray-900 dark:text-gray-100"
                        />
                      ) : (
                        patient.phone || 'N/A'
                      )}
                    </span>
                    {!editing && (
                      <>
                        <span className="flex items-center gap-1.5">
                          <Users className="w-4 h-4" />
                          {completedVisits.length} visit{completedVisits.length !== 1 ? 's' : ''}
                        </span>
                        {patient.age && (
                          <span>{patient.age} yrs{patient.sex ? `, ${patient.sex}` : ''}</span>
                        )}
                      </>
                    )}
                  </div>
                  {editing && (
                    <div className="flex items-center gap-4 mt-3">
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
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
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
                        onClick={() => { setEditing(false); setEditForm({ name: patient.name, age: patient.age?.toString() || '', sex: patient.sex || '', phone: patient.phone || '' }); }}
                        className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-sm font-medium rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-all"
                      >
                        <X className="w-4 h-4" />
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => setEditing(true)}
                        className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-sm font-medium rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-all active:scale-95"
                      >
                        <Edit3 className="w-4 h-4" />
                        Edit
                      </button>
                      <button
                        onClick={() => setShowMessageModal(true)}
                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-all active:scale-95 shadow-md"
                      >
                        <MessageSquare className="w-4 h-4" />
                        Message
                      </button>
                      <button
                        onClick={() => window.print()}
                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-medium rounded-xl hover:bg-gray-800 dark:hover:bg-gray-100 transition-all active:scale-95 shadow-md"
                      >
                        <Printer className="w-4 h-4" />
                        Print
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          {completedVisits.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
              <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-900/20 dark:to-blue-800/20 rounded-2xl p-4 border border-blue-200/50 dark:border-blue-800">
                <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 text-xs font-semibold uppercase tracking-wider mb-2">
                  <Activity className="w-3.5 h-3.5" />
                  Visits
                </div>
                <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{completedVisits.length}</div>
              </div>
              <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-900/20 dark:to-emerald-800/20 rounded-2xl p-4 border border-emerald-200/50 dark:border-emerald-800">
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-2">
                  <DollarSign className="w-3.5 h-3.5" />
                  Total Revenue
                </div>
                <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{formatCurrency(totalRevenue)}</div>
              </div>
              <div className="bg-gradient-to-br from-violet-50 to-violet-100/50 dark:from-violet-900/20 dark:to-violet-800/20 rounded-2xl p-4 border border-violet-200/50 dark:border-violet-800">
                <div className="flex items-center gap-2 text-violet-600 dark:text-violet-400 text-xs font-semibold uppercase tracking-wider mb-2">
                  <Calendar className="w-3.5 h-3.5" />
                  Last Visit
                </div>
                <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-tight">
                  {completedVisits[0] ? formatDate(completedVisits[0].date) : 'N/A'}
                </div>
              </div>
              <div className="bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-900/20 dark:to-amber-800/20 rounded-2xl p-4 border border-amber-200/50 dark:border-amber-800">
                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-xs font-semibold uppercase tracking-wider mb-2">
                  <Clock className="w-3.5 h-3.5" />
                  Follow-up
                </div>
                <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-tight">
                  {upcomingFollowUp ? formatDate(upcomingFollowUp.follow_up_date) : 'None'}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-1 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-1 shadow-sm">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              {tab.id === 'visits' && <ClipboardList className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />}
              {tab.id === 'feedback' && <Star className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />}
              {tab.id === 'messages' && <MessageSquare className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />}
              {tab.label}
              {tab.count !== null && tab.count !== undefined && (
                <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                  activeTab === tab.id ? 'bg-white/20 dark:bg-gray-900/20 text-white dark:text-gray-900' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab Content: Visits */}
        {activeTab === 'visits' && (
          <>
            {visits.length > 0 ? (
              <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-6 md:p-8 shadow-sm">
                <div className="relative">
                  <div className="absolute left-[23px] top-0 bottom-0 w-0.5 bg-gradient-to-b from-blue-200 dark:from-blue-700 via-gray-200 dark:via-gray-700 to-gray-100 dark:to-gray-800" />
                  <div className="space-y-6">
                    {visits.map((visit, idx) => (
                      <div key={visit.id || idx} className="relative pl-14 animate-in" style={{ animationDelay: `${idx * 80}ms` }}>
                        <div className={`absolute left-[14px] top-1 w-5 h-5 rounded-full border-4 border-white dark:border-gray-900 shadow-md ${
                          visit.status === 'completed' ? 'bg-emerald-500'
                          : visit.status === 'cancelled' ? 'bg-red-400'
                          : 'bg-amber-400'
                        }`} />
                        <div className="bg-gradient-to-br from-gray-50 to-white dark:from-gray-800 dark:to-gray-900 rounded-2xl border border-gray-200/80 dark:border-gray-700 p-5 hover:shadow-md dark:hover:shadow-gray-900/50 hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-200">
                          <div className="flex items-start justify-between gap-4 mb-3">
                            <div className="flex items-center gap-3">
                              <Calendar className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                              <span className="font-semibold text-gray-900 dark:text-gray-100">{formatDate(visit.date)}</span>
                              {visit.time && (
                                <><span className="text-gray-300 dark:text-gray-600">•</span><Clock className="w-4 h-4 text-gray-400 dark:text-gray-500" /><span className="text-gray-600 dark:text-gray-400">{visit.time}</span></>
                              )}
                            </div>
                            <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold ${
                              visit.status === 'completed' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                              : visit.status === 'cancelled' ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800'
                              : 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
                            }`}>
                              {visit.status === 'no_show' ? 'No Show' : visit.status.charAt(0).toUpperCase() + visit.status.slice(1)}
                            </span>
                          </div>
                          {(visit.treatment || visit.consultation_fee || visit.treatment_charges || visit.medicine_charges) && (
                            <div className="flex flex-wrap items-center gap-3 mb-3">
                              {visit.treatment && (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 shadow-sm">
                                  <Stethoscope className="w-3.5 h-3.5 text-blue-500" />
                                  {visit.treatment}
                                </span>
                              )}
                              {(Number(visit.consultation_fee || 0) + Number(visit.treatment_charges || 0) + Number(visit.medicine_charges || 0)) > 0 && (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 shadow-sm">
                                  <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
                                  {formatCurrency(Number(visit.consultation_fee || 0) + Number(visit.treatment_charges || 0) + Number(visit.medicine_charges || 0))}
                                </span>
                              )}
                            </div>
                          )}
                          {visit.diagnosis && (
                            <div className="mb-3">
                              <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                                <FileText className="w-3 h-3" /> Diagnosis
                              </div>
                              <p className="text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-3 leading-relaxed">{visit.diagnosis}</p>
                            </div>
                          )}
                          {Array.isArray(visit.medicines) && visit.medicines.length > 0 && (
                            <div className="mb-3">
                              <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                                <Pill className="w-3 h-3" /> Prescribed Medicines ({visit.medicines.length})
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {visit.medicines.map((med, mi) => (
                                  <span key={mi} className="inline-flex items-center gap-1 px-3 py-1.5 bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-900/30 dark:to-purple-900/30 text-purple-700 dark:text-purple-400 text-xs font-medium rounded-xl border border-purple-200 dark:border-purple-800 shadow-sm">
                                    {med.name}
                                    {med.dosage && <><span className="text-purple-400">|</span><span>{med.dosage}</span></>}
                                    {med.frequency && <><span className="text-purple-400">•</span><span>{med.frequency}</span></>}
                                    {med.duration && <><span className="text-purple-400">•</span><span>{med.duration}</span></>}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          {visit.follow_up_date && (
                            <div className="flex items-center gap-3 text-sm bg-amber-50 dark:bg-amber-900/20 rounded-xl px-3 py-2 border border-amber-200 dark:border-amber-800">
                              <Calendar className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0" />
                              <span className="font-medium text-amber-800 dark:text-amber-300">Follow-up: {formatDate(visit.follow_up_date)}</span>
                              {visit.follow_up_instructions && <span className="text-amber-600 dark:text-amber-400">— {visit.follow_up_instructions}</span>}
                            </div>
                          )}
                          {visit.chit_media && visit.chit_media.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                              <MediaViewer mediaKeys={visit.chit_media} getSignedUrl={getSignedUrl} />
                            </div>
                          )}
                          {visit.notes && (
                            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                              <p className="text-sm text-gray-500 dark:text-gray-400 italic leading-relaxed">{visit.notes}</p>
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
          </>
        )}

        {/* Tab Content: Feedback */}
        {activeTab === 'feedback' && (
          <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-6 md:p-8 shadow-sm">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2.5">
              <Star className="w-5 h-5 text-amber-500" />
              Patient Feedback
            </h2>
            {feedback.filter(f => f.rating).length > 0 ? (
              <>
                <div className="grid grid-cols-3 gap-3 mb-6">
                  {['great', 'okay', 'poor'].map(rating => {
                    const entries = feedback.filter(f => f.rating === rating);
                    if (entries.length === 0) return null;
                    const r = ratingEmoji(rating);
                    return (
                      <div key={rating} className={`rounded-xl p-4 text-center ${r.color} border border-current/20`}>
                        <div className="text-2xl mb-1">{r.emoji}</div>
                        <div className="text-lg font-bold">{entries.length}</div>
                        <div className="text-xs font-medium opacity-70">{r.label}</div>
                      </div>
                    );
                  })}
                </div>
                <div className="space-y-3">
                  {feedback.map((f, i) => (
                    <div key={f.id || i} className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
                      <div className="flex items-center justify-between mb-2">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${ratingBadge(f.rating)}`}>
                          {ratingIcon(f.rating)}
                          {f.rating}
                        </span>
                        <span className="text-[10px] text-gray-400 dark:text-gray-500">
                          {new Date(f.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                      {f.comment && <p className="text-sm text-gray-700 dark:text-gray-300">{f.comment}</p>}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center py-12">
                <Star className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                <p className="text-sm text-gray-400 dark:text-gray-500">No feedback yet from this patient.</p>
              </div>
            )}
          </div>
        )}

        {/* Tab Content: Messages */}
        {activeTab === 'messages' && (
          <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-6 md:p-8 shadow-sm">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2.5">
              <MessageSquare className="w-5 h-5 text-blue-500 dark:text-blue-400" />
              Message History
            </h2>
            {messagesLoading ? (
              <div className="space-y-3 animate-pulse">
                {[1,2,3,4,5].map(i => (
                  <div key={i} className="flex gap-3">
                    <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-700 shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-24" />
                      <div className="h-12 bg-gray-100 dark:bg-gray-800 rounded-xl w-3/4" />
                    </div>
                  </div>
                ))}
              </div>
            ) : messages.length === 0 ? (
              <div className="text-center py-12">
                <MessageSquare className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                <p className="text-sm text-gray-400 dark:text-gray-500">No message history found.</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {messages.map((msg, i) => (
                  <div key={msg.id || i} className={`flex gap-3 ${msg.role === 'bot' ? 'justify-start' : 'justify-end'}`}>
                    {msg.role === 'bot' && (
                      <div className="w-7 h-7 rounded-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 flex items-center justify-center text-[10px] font-bold shrink-0 mt-1">
                        B
                      </div>
                    )}
                    <div className={`max-w-[80%] ${msg.role === 'bot' ? 'order-1' : 'order-1'}`}>
                      <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                        msg.role === 'bot'
                          ? 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-tl-md'
                          : 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-tr-md'
                      }`}>
                        <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                      </div>
                      <div className={`flex items-center gap-2 mt-1 text-[10px] text-gray-400 dark:text-gray-500 ${msg.role === 'user' ? 'text-right' : ''}`}>
                        <span>{new Date(msg.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                        {msg.intent && <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">{msg.intent}</span>}
                        {msg.state && <span className="text-gray-300 dark:text-gray-600">({msg.state})</span>}
                      </div>
                    </div>
                    {msg.role === 'user' && (
                      <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 flex items-center justify-center text-[10px] font-bold shrink-0 mt-1">
                        P
                      </div>
                    )}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        )}
      </div>

        {/* Send Message Modal */}
        {showMessageModal && (
          <>
            <div className="fixed inset-0 bg-black/40 dark:bg-black/60 z-50 backdrop-blur-sm" onClick={() => setShowMessageModal(false)} />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-2xl w-full max-w-lg overflow-hidden animate-scale-in">
                <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-800">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${getAvatarColor(patient.name)} flex items-center justify-center text-white font-bold text-sm shadow-md`}>
                      {getInitials(patient.name)}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">Send Message to {patient.name === '?' ? 'Patient' : patient.name}</h3>
                      <p className="text-xs text-gray-400 dark:text-gray-500">Message will be sent via WhatsApp</p>
                    </div>
                  </div>
                  <button
                    onClick={() => { setShowMessageModal(false); setMessageText(''); }}
                    className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-all"
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
                        // Refresh messages tab
                        if (activeTab === 'messages') {
                          loadMessages();
                        }
                      } else {
                        alert(data.error || 'Failed to send message');
                      }
                    } catch (err) {
                      alert('Network error — could not send message');
                    } finally {
                      setSendingMessage(false);
                    }
                  }}
                  className="p-6"
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
                    <p className="mt-2 text-[10px] text-gray-400 dark:text-gray-500 text-right">
                      {patient.phone ? `Via WhatsApp — ${patient.phone}` : 'No phone number on file'}
                    </p>
                  </div>
                  <div className="flex items-center justify-end gap-3 mt-4">
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
                      className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-all disabled:opacity-50 active:scale-95 shadow-md"
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
