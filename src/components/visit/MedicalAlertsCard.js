import React from 'react';
import { TrendingUp, Clock, CheckCircle2, AlertTriangle, Heart, MessageSquare, Users, Pill } from 'lucide-react';

export default function MedicalAlertsCard({ medicalAlertsProps }) {
  const {
    patientProfile,
    patientVisits,
    medicalHistory,
    loadingExtra,
    patientMessages,
    patientFamily,
    router
  } = medicalAlertsProps;

  return (
    <>
      {/* ── Quick Stats Row ── */}
      {patientProfile && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total Visits</span>
            </div>
            <p className="text-2xl font-bold leading-tight text-gray-900 dark:text-gray-100">{patientProfile.visit_count || 0}</p>                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {patientVisits.length > 0 ? `Last: ${patientVisits[0]?.date?.slice(0, 10) || 'N/A'}` : 'First visit'}
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-blue-500" />
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total Spent</span>
            </div>
            <p className="text-2xl font-bold leading-tight text-gray-900 dark:text-gray-100">₹{Number(patientProfile.total_spent || 0).toLocaleString('en-IN')}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              {patientProfile.visit_count > 0 ? `Avg: ₹${Math.round(Number(patientProfile.total_spent || 0) / (patientProfile.visit_count || 1)).toLocaleString('en-IN')}` : '—'}
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Patient Since</span>
            </div>
            <p className="text-xl font-bold text-gray-900 dark:text-gray-100 text-sm leading-tight">{patientProfile.created_at?.slice(0, 10) || '—'}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              {patientProfile.created_at ? `${Math.floor((Date.now() - new Date(patientProfile.created_at).getTime()) / (1000 * 60 * 60 * 24 * 30))} months ago` : ''}
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-violet-500" />
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Follow-up</span>
            </div>
            {(() => {
              const lastVisit = patientVisits.find(v => v.follow_up_date);
              const fupDate = lastVisit?.follow_up_date;
              const isOverdue = fupDate && new Date(fupDate) < new Date();
              const hasReturned = fupDate && patientVisits.some(v => v.date === fupDate || (v.date > fupDate && v.date < new Date(Date.now() + 86400000).toISOString().slice(0, 10)));
              if (!fupDate) return <><p className="text-xl font-bold text-gray-400 dark:text-gray-500">—</p><p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">No follow-up set</p></>;
              if (hasReturned) return <><p className="text-xl font-bold text-emerald-500">✓</p><p className="text-xs text-emerald-500 mt-0.5">Completed</p></>;
              if (isOverdue) return <><p className="text-xl font-bold text-red-500">{Math.floor((Date.now() - new Date(fupDate).getTime()) / (1000 * 60 * 60 * 24))}d</p><p className="text-xs text-red-500 mt-0.5">Overdue since {fupDate}</p></>;
              return <><p className="text-xl font-bold text-amber-500">⏳</p><p className="text-xs text-amber-500 mt-0.5">Due {fupDate}</p></>;
            })()}
          </div>
        </div>
      )}

      {/* ── Habits & Risk Factors (Compact) ── */}
      {patientProfile && (() => {
        const h = medicalHistory.habits || {};
        const hasHabits = Object.keys(h).length > 0 && Object.values(h).some(v => v);
        if (!hasHabits) return null;
        const habitLabels = {
          smoking: { never: ['Smoking', 'Never', 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-100 dark:border-green-800'], former: ['Smoking', 'Former', 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-100 dark:border-amber-800'], current: ['Smoking', 'Current', 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-100 dark:border-red-800'] },
          tobaccoChewing: { never: ['Tobacco', 'Never', 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-100 dark:border-green-800'], former: ['Tobacco', 'Former', 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-100 dark:border-amber-800'], current: ['Tobacco', 'Current', 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-100 dark:border-red-800'] },
          panMasala: { never: ['Pan Masala', 'Never', 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-100 dark:border-green-800'], former: ['Pan Masala', 'Former', 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-100 dark:border-amber-800'], current: ['Pan Masala', 'Current', 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-100 dark:border-red-800'] },
          alcohol: { never: ['Alcohol', 'Never', 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-100 dark:border-green-800'], occasional: ['Alcohol', 'Occasional', 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-100 dark:border-amber-800'], regular: ['Alcohol', 'Regular', 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-100 dark:border-red-800'] },
          brushingFrequency: { once: ['Brushing', 'Once/day', 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-100 dark:border-amber-800'], twice: ['Brushing', 'Twice/day', 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-100 dark:border-green-800'], irregular: ['Brushing', 'Irregular', 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-100 dark:border-red-800'] },
          sugaryDiet: { low: ['Sugary Diet', 'Low', 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-100 dark:border-green-800'], moderate: ['Sugary Diet', 'Moderate', 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-100 dark:border-amber-800'], high: ['Sugary Diet', 'High', 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-100 dark:border-red-800'] },
        };
        return (
          <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/30"><AlertTriangle className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" /></div>
              <h2 className="font-bold text-gray-900 dark:text-gray-100 text-lg">Habits &amp; Risk Factors</h2>
              <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">Editable below</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(habitLabels).map(([key, levels]) => {
                const val = h[key];
                if (!val || !levels[val]) return null;
                const [label, statusLabel, cls] = levels[val];
                const icon = statusLabel === 'Current' || statusLabel === 'Regular' || statusLabel === 'Irregular' || statusLabel === 'High'
                  ? 'M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
                  : 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z';
                return (
                  <span key={key} className={'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ' + cls}>
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} /></svg>
                    {label}: {statusLabel}
                  </span>
                );
              })}
              {h.other && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs font-medium border border-gray-200 dark:border-gray-700">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  Other: {h.other}
                </span>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Medical & Dental History (Compact) ── */}
      {patientProfile && (() => {
        const hasEntries = medicalHistory.allergies || medicalHistory.chronicConditions || medicalHistory.bloodGroup || medicalHistory.bp || medicalHistory.weight || medicalHistory.medications;
        if (!hasEntries) return null;
        return (
          <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 rounded-lg bg-red-50 dark:bg-red-900/30"><Heart className="w-3.5 h-3.5 text-red-500 dark:text-red-400" /></div>
              <h2 className="font-bold text-gray-900 dark:text-gray-100 text-lg">Medical & Dental History</h2>
              <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">Reference — editable below</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {medicalHistory.allergies && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-xs font-medium border border-red-100 dark:border-red-800">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  Allergies: {medicalHistory.allergies}
                </span>
              )}
              {medicalHistory.chronicConditions && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 text-xs font-medium border border-orange-100 dark:border-orange-800">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  Chronic: {medicalHistory.chronicConditions}
                </span>
              )}
              {medicalHistory.bloodGroup && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium border border-blue-100 dark:border-blue-800">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                  Blood: {medicalHistory.bloodGroup}
                </span>
              )}
              {(medicalHistory.bp || medicalHistory.weight) && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 text-xs font-medium border border-teal-100 dark:border-teal-800">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  {[medicalHistory.bp, medicalHistory.weight].filter(Boolean).join(' / ')}
                </span>
              )}
              {medicalHistory.medications && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 text-xs font-medium border border-violet-100 dark:border-violet-800">
                  <Pill className="w-3 h-3" />
                  Meds: {medicalHistory.medications}
                </span>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── WhatsApp Conversation ── */}
      {patientProfile && (
        <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-gray-100 dark:border-gray-800">
            <div className="p-1.5 rounded-lg bg-green-50 dark:bg-green-900/30"><MessageSquare className="w-3.5 h-3.5 text-green-500 dark:text-green-400" /></div>
            <h2 className="font-bold text-gray-900 dark:text-gray-100 text-lg">WhatsApp Conversation</h2>
            <span className="text-xs text-gray-500 dark:text-gray-400 font-normal">Recent messages</span>
          </div>
          <div className="px-5 py-3 max-h-[300px] overflow-y-auto">
            {loadingExtra ? (
              <div className="flex items-center justify-center py-6">
                <div className="w-4 h-4 border-2 border-gray-200 dark:border-gray-700 border-t-emerald-500 rounded-full animate-spin" />
              </div>
            ) : patientMessages.length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-6">No WhatsApp messages found</p>
            ) : (
              <div className="space-y-2">
                {patientMessages.filter(m => m.role === 'user' || m.intent).slice(-6).reverse().map((m, i) => (
                  <div key={m.id || i} className={`flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                    <div className={`max-w-[85%] px-3 py-2 rounded-xl text-xs ${
                      m.role === 'user'
                        ? 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-bl-sm'
                        : 'bg-emerald-50 dark:bg-emerald-900/30 text-gray-700 dark:text-gray-300 rounded-br-sm'
                    }`}>
                      <p className="leading-relaxed">{m.content || '(no content)'}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                        {m.role === 'user' ? 'Patient' : 'Clinic'} · {m.created_at ? new Date(m.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                        {m.intent && <span className="ml-1 px-1 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-[8px]">{m.intent}</span>}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Family Members ── */}
      {patientProfile && (
        <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="p-1.5 rounded-lg bg-teal-50 dark:bg-teal-900/30"><Users className="w-3.5 h-3.5 text-teal-500 dark:text-teal-400" /></div>
            <h2 className="font-bold text-gray-900 dark:text-gray-100 text-lg">Family Members</h2>
            <span className="text-xs text-gray-500 dark:text-gray-400 font-normal">{patientFamily.length > 0 ? `${patientFamily.length} linked` : ''}</span>
          </div>
          {loadingExtra ? (
            <div className="flex items-center justify-center py-6">
              <div className="w-4 h-4 border-2 border-gray-200 dark:border-gray-700 border-t-emerald-500 rounded-full animate-spin" />
            </div>
          ) : patientFamily.length === 0 ? (
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-6">No family members linked</p>
          ) : (
            <div className="space-y-2">
              {patientFamily.map(f => (
                <div key={f.relationship_id || f.id} className="flex items-center gap-3 px-3 py-2 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-700">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-100 to-teal-50 dark:from-teal-900/30 dark:to-teal-800/30 flex items-center justify-center text-xs font-semibold text-teal-700 dark:text-teal-300 shrink-0">
                    {(f.name || '?')[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">{f.name}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {f.relationship_type ? f.relationship_type.charAt(0).toUpperCase() + f.relationship_type.slice(1) : 'Family'}
                      {f.age ? ` · ${f.age} yrs` : ''}{f.sex ? ` · ${f.sex.charAt(0).toUpperCase() + f.sex.slice(1)}` : ''}
                    </p>
                  </div>
                  {f.id && (
                    <button type="button" onClick={() => router.push(`/dashboard/patients/${f.id}`)}
                      className="px-2.5 py-1 text-xs font-medium rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-teal-300 dark:hover:border-teal-600 transition-all shrink-0">
                      View
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
