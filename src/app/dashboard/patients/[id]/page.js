'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Activity, DollarSign, Calendar, Clock, Phone,
  Pill, Stethoscope, FileText, Printer, ClipboardList,
  ChevronRight, Users, AlertCircle
} from 'lucide-react';

export default function PatientDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [patient, setPatient] = useState(null);
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/dashboard/patients/${id}`);
        const data = await res.json();
        setPatient(data.patient);
        setVisits(data.visits || []);
      } catch (e) {
        console.error('Failed to load patient', e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  function formatDate(d) {
    if (!d) return 'N/A';
    return new Date(d + 'T12:00:00').toLocaleDateString('en-IN', {
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
  const totalRevenue = completedVisits.reduce((sum, v) => sum + Number(v.fees || 0), 0);
  const upcomingFollowUp = completedVisits.find(v => v.follow_up_date && v.follow_up_date >= new Date().toISOString().slice(0, 10));

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100/50 p-4 md:p-6 lg:p-8">
        <div className="max-w-4xl mx-auto space-y-6 animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-24" />
          <div className="bg-white rounded-3xl p-6 border border-gray-100">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 rounded-2xl bg-gray-200" />
              <div className="space-y-2">
                <div className="h-5 bg-gray-200 rounded w-40" />
                <div className="h-4 bg-gray-100 rounded w-24" />
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-gray-100 rounded-2xl" />)}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100/50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-red-50 mb-4">
            <AlertCircle className="w-10 h-10 text-red-400" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Patient not found</h2>
          <button onClick={() => router.push('/dashboard/patients')} className="text-blue-600 hover:text-blue-700 text-sm">
            Back to patients
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100/50">
      <div className="max-w-4xl mx-auto p-4 md:p-6 lg:p-8 space-y-6">
        {/* Back */}
        <button
          onClick={() => router.push('/dashboard/patients')}
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition-colors bg-white/80 backdrop-blur-sm px-4 py-2 rounded-xl border border-gray-200 hover:border-gray-300"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Patients
        </button>

        {/* Patient Header Card */}
        <div className="bg-white rounded-3xl border border-gray-100 p-6 md:p-8 shadow-sm">
          <div className="flex items-start gap-5">
            <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${getAvatarColor(patient.name)} flex items-center justify-center text-white font-bold text-xl shadow-lg shrink-0`}>
              {getInitials(patient.name)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">
                    {patient.name === '?' ? 'Unknown Patient' : patient.name}
                  </h1>
                  <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                    <span className="flex items-center gap-1.5">
                      <Phone className="w-4 h-4" />
                      {patient.phone || 'N/A'}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Users className="w-4 h-4" />
                      {completedVisits.length} visit{completedVisits.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => window.print()}
                  className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-800 transition-all active:scale-95 shadow-md"
                >
                  <Printer className="w-4 h-4" />
                  Print Records
                </button>
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          {completedVisits.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
              <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-2xl p-4 border border-blue-200/50">
                <div className="flex items-center gap-2 text-blue-600 text-xs font-semibold uppercase tracking-wider mb-2">
                  <Activity className="w-3.5 h-3.5" />
                  Visits
                </div>
                <div className="text-2xl font-bold text-gray-900">{completedVisits.length}</div>
              </div>
              <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 rounded-2xl p-4 border border-emerald-200/50">
                <div className="flex items-center gap-2 text-emerald-600 text-xs font-semibold uppercase tracking-wider mb-2">
                  <DollarSign className="w-3.5 h-3.5" />
                  Total Revenue
                </div>
                <div className="text-2xl font-bold text-gray-900">{formatCurrency(totalRevenue)}</div>
              </div>
              <div className="bg-gradient-to-br from-violet-50 to-violet-100/50 rounded-2xl p-4 border border-violet-200/50">
                <div className="flex items-center gap-2 text-violet-600 text-xs font-semibold uppercase tracking-wider mb-2">
                  <Calendar className="w-3.5 h-3.5" />
                  Last Visit
                </div>
                <div className="text-sm font-semibold text-gray-900 leading-tight">
                  {completedVisits[0] ? formatDate(completedVisits[0].date) : 'N/A'}
                </div>
              </div>
              <div className="bg-gradient-to-br from-amber-50 to-amber-100/50 rounded-2xl p-4 border border-amber-200/50">
                <div className="flex items-center gap-2 text-amber-600 text-xs font-semibold uppercase tracking-wider mb-2">
                  <Clock className="w-3.5 h-3.5" />
                  Follow-up
                </div>
                <div className="text-sm font-semibold text-gray-900 leading-tight">
                  {upcomingFollowUp ? formatDate(upcomingFollowUp.follow_up_date) : 'None'}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Visit Timeline */}
        {visits.length > 0 ? (
          <div className="bg-white rounded-3xl border border-gray-100 p-6 md:p-8 shadow-sm">
            <h2 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2.5">
              <ClipboardList className="w-5 h-5 text-blue-500" />
              Visit History
              <span className="text-sm font-normal text-gray-400">({visits.length} total)</span>
            </h2>

            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-[23px] top-0 bottom-0 w-0.5 bg-gradient-to-b from-blue-200 via-gray-200 to-gray-100" />

              <div className="space-y-6">
                {visits.map((visit, idx) => (
                  <div key={visit.id || idx} className="relative pl-14 animate-in" style={{ animationDelay: `${idx * 80}ms` }}>
                    {/* Timeline dot */}
                    <div className={`absolute left-[14px] top-1 w-5 h-5 rounded-full border-4 border-white shadow-md ${
                      visit.status === 'completed'
                        ? 'bg-emerald-500'
                        : visit.status === 'cancelled'
                        ? 'bg-red-400'
                        : 'bg-amber-400'
                    }`} />

                    {/* Visit Card */}
                    <div className="bg-gradient-to-br from-gray-50 to-white rounded-2xl border border-gray-200/80 p-5 hover:shadow-md hover:border-gray-300 transition-all duration-200">
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div className="flex items-center gap-3">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          <span className="font-semibold text-gray-900">{formatDate(visit.date)}</span>
                          {visit.time && (
                            <>
                              <span className="text-gray-300">•</span>
                              <Clock className="w-4 h-4 text-gray-400" />
                              <span className="text-gray-600">{visit.time}</span>
                            </>
                          )}
                        </div>
                        <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold ${
                          visit.status === 'completed'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : visit.status === 'cancelled'
                            ? 'bg-red-50 text-red-600 border border-red-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}>
                          {visit.status === 'no_show' ? 'No Show' : visit.status.charAt(0).toUpperCase() + visit.status.slice(1)}
                        </span>
                      </div>

                      {/* Treatment + Fees */}
                      {(visit.treatment || visit.fees) && (
                        <div className="flex flex-wrap items-center gap-3 mb-3">
                          {visit.treatment && (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-xl border border-gray-200 text-sm font-medium text-gray-700 shadow-sm">
                              <Stethoscope className="w-3.5 h-3.5 text-blue-500" />
                              {visit.treatment}
                            </span>
                          )}
                          {visit.fees > 0 && (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-xl border border-gray-200 text-sm font-medium text-gray-700 shadow-sm">
                              <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
                              {formatCurrency(visit.fees)}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Diagnosis */}
                      {visit.diagnosis && (
                        <div className="mb-3">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                            <FileText className="w-3 h-3" />
                            Diagnosis
                          </div>
                          <p className="text-sm text-gray-700 bg-white rounded-xl border border-gray-100 p-3 leading-relaxed">
                            {visit.diagnosis}
                          </p>
                        </div>
                      )}

                      {/* Medicines */}
                      {Array.isArray(visit.medicines) && visit.medicines.length > 0 && (
                        <div className="mb-3">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                            <Pill className="w-3 h-3" />
                            Prescribed Medicines ({visit.medicines.length})
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {visit.medicines.map((med, mi) => (
                              <span key={mi} className="inline-flex items-center gap-1 px-3 py-1.5 bg-gradient-to-r from-violet-50 to-purple-50 text-purple-700 text-xs font-medium rounded-xl border border-purple-200 shadow-sm">
                                {med.name}
                                {med.dosage && <span className="text-purple-400">|</span>}
                                {med.dosage && <span>{med.dosage}</span>}
                                {med.frequency && <span className="text-purple-400">•</span>}
                                {med.frequency && <span>{med.frequency}</span>}
                                {med.duration && <span className="text-purple-400">•</span>}
                                {med.duration && <span>{med.duration}</span>}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Follow-up */}
                      {visit.follow_up_date && (
                        <div className="flex items-center gap-3 text-sm bg-amber-50 rounded-xl px-3 py-2 border border-amber-200">
                          <Calendar className="w-4 h-4 text-amber-500 shrink-0" />
                          <span className="font-medium text-amber-800">
                            Follow-up: {formatDate(visit.follow_up_date)}
                          </span>
                          {visit.follow_up_instructions && (
                            <span className="text-amber-600">— {visit.follow_up_instructions}</span>
                          )}
                        </div>
                      )}

                      {/* Notes */}
                      {visit.notes && (
                        <div className="mt-3 pt-3 border-t border-gray-100">
                          <p className="text-sm text-gray-500 italic leading-relaxed">{visit.notes}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-3xl border border-gray-100 p-12 text-center shadow-sm">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-50 mb-4">
              <ClipboardList className="w-8 h-8 text-gray-300" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No visits recorded</h3>
            <p className="text-sm text-gray-500">Visit history will appear here once appointments are completed</p>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-in {
          animation: fadeInUp 0.4s ease-out both;
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
