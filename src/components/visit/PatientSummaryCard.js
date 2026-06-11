import React from 'react';
import { Download } from 'lucide-react';
import MediaViewer from '@/components/MediaViewer';

export default function PatientSummaryCard({ patientSummaryProps }) {
  const {
    appointmentId,
    appointmentMeta,
    patientProfile,
    patientVisits,
    getSignedUrl,
    showToast
  } = patientSummaryProps;

  if (!(appointmentId && (appointmentMeta || patientProfile)) && !patientProfile) {
    return null;
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 bg-gradient-to-r from-emerald-50/80 to-blue-50/80 dark:from-emerald-900/20 dark:to-blue-900/20 border-b border-gray-100 dark:border-gray-800">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-sm font-bold shadow-sm shrink-0">
          {((patientProfile?.name || appointmentMeta?.patient_name || 'P'))[0].toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100 text-lg truncate">{patientProfile?.name || appointmentMeta?.patient_name || 'Patient'}</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {appointmentMeta?.date?.slice(0, 10)}{appointmentMeta?.time ? ` at ${appointmentMeta.time?.slice(0, 5)}` : ''}
            {appointmentMeta?.location ? ` · ${appointmentMeta.location}` : ''}
            {!appointmentId && patientProfile ? `${patientProfile.visit_count ? `${patientProfile.visit_count} visit${patientProfile.visit_count > 1 ? 's' : ''}${patientVisits[0]?.date ? ` · Last: ${patientVisits[0].date.slice(0, 10)}` : ''}` : 'New patient'}` : ''}
          </p>
        </div>
        {appointmentMeta ? (
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
          appointmentMeta?.status === 'completed' ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800' :
          appointmentMeta?.status === 'no_show' ? 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800' :
          appointmentMeta?.arrival_status === 'called' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800' :
          appointmentMeta?.arrival_status === 'arrived' ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800' :
          'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700'
        }`}>
          {appointmentMeta?.status === 'completed' ? 'Completed' :
           appointmentMeta?.status === 'no_show' ? 'No Show' :
           appointmentMeta?.arrival_status === 'called' ? 'In Session' :
           appointmentMeta?.arrival_status === 'arrived' ? 'Waiting' : 'Scheduled'}
        </span>
        ) : null}
      </div>
      <div className="px-6 py-4 grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Phone</span>
          <p className="text-sm text-gray-700 dark:text-gray-300 mt-0.5">{appointmentMeta?.patient_phone || patientProfile?.phone || '—'}</p>
        </div>
        <div>
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Age</span>
          <p className="text-sm text-gray-700 dark:text-gray-300 mt-0.5">{patientProfile?.age ? `${patientProfile.age} yrs` : '—'}</p>
        </div>
        <div>
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Sex</span>
          <p className="text-sm text-gray-700 dark:text-gray-300 mt-0.5">{patientProfile?.sex ? (patientProfile.sex.charAt(0).toUpperCase() + patientProfile.sex.slice(1)) : '—'}</p>
        </div>
        <div>
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Location</span>
          <p className="text-sm text-gray-700 dark:text-gray-300 mt-0.5">{appointmentMeta?.location || patientProfile?.location || '—'}</p>
        </div>
        {patientProfile?.visit_count !== undefined && (
          <div>
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total Visits</span>
            <p className="text-sm text-gray-700 dark:text-gray-300 mt-0.5">{patientProfile.visit_count}</p>
          </div>
        )}
        {patientProfile?.total_spent !== undefined && (
          <div>
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total Spent</span>
            <p className="text-sm text-gray-700 dark:text-gray-300 mt-0.5">₹{Number(patientProfile.total_spent).toLocaleString('en-IN')}</p>
          </div>
        )}
        {appointmentMeta?.chit_media?.length > 0 ? (
          <div className="col-span-full">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 block">Media Shared ({appointmentMeta.chit_media.length})</span>
            <MediaViewer mediaKeys={appointmentMeta.chit_media} getSignedUrl={getSignedUrl} />
          </div>
        ) : !appointmentMeta && (() => {
          const latestWithMedia = patientVisits.find(v => Array.isArray(v.chit_media) && v.chit_media.length > 0);
          if (!latestWithMedia) return null;
          return (
            <div className="col-span-full">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 block">Media from Previous Visits ({latestWithMedia.chit_media.length})</span>
              <MediaViewer mediaKeys={latestWithMedia.chit_media} getSignedUrl={getSignedUrl} />
            </div>
          );
        })()}
        {appointmentMeta?.status === 'completed' && (
          <div>
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Prescription</span>
            <button onClick={async (e) => {
                e.preventDefault();
                try {
                  const res = await fetch(`/api/dashboard/visits/${appointmentMeta.id}/prescription`, { method: 'POST' });
                  const data = await res.json();
                  if (res.ok && data.url) {
                    showToast('PDF generated successfully', 'success');
                    window.open(data.url, '_blank');
                  } else {
                    showToast(data.error || 'Failed to generate prescription', 'error');
                  }
                } catch {
                  showToast('Network error', 'error');
                }
              }}
                className="inline-flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 mt-0.5 hover:text-blue-700 dark:hover:text-blue-300 transition-colors">
                <Download className="w-3.5 h-3.5" />
                Generate
              </button>
          </div>
        )}
      </div>
    </div>
  );
}
