'use client';

import { useState, useEffect, Suspense, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Stethoscope, FileText, Pill, Calendar, Plus, Trash2, ClipboardCheck, Activity, ArrowLeft, Upload, Search, X } from 'lucide-react';

const TREATMENTS = [
  'General Checkup', 'Root Canal', 'Dental Filling', 'Teeth Cleaning',
  'Extraction', 'Braces Adjustment', 'Crown', 'Veneers', 'Whitening', 'Scaling', 'Other',
];

export default function VisitPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100/50 dark:from-gray-950 dark:to-gray-900 flex items-center justify-center p-4">
        <div className="animate-pulse text-gray-400 dark:text-gray-500 text-sm">Loading...</div>
      </div>
    }>
      <VisitPageInner />
    </Suspense>
  );
}

function VisitPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const appointmentId = searchParams.get('appointmentId');
  const prefillName = searchParams.get('name') || '';
  const prefillTreatment = searchParams.get('treatment') || '';

  const [form, setForm] = useState({
    patientName: prefillName,
    patientPhone: '',
    treatment: prefillTreatment,
    consultationFee: '',
    treatmentCharges: '',
    medicineCharges: '',
    diagnosis: '',
    medicines: [],
    followUpDate: '',
    followUpInstructions: '',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [errors, setErrors] = useState({});
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [mediaFiles, setMediaFiles] = useState([]);
  const searchRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    setForm(f => ({
      ...f,
      patientName: prefillName || f.patientName,
      treatment: prefillTreatment || f.treatment,
    }));
  }, [prefillName, prefillTreatment]);

  // Patient search for walk-in
  useEffect(() => {
    if (appointmentId || form.patientName.trim().length < 2) {
      setSearchResults([]);
      setShowSearch(false);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/dashboard/patients/search?q=${encodeURIComponent(form.patientName.trim())}`);
        const data = await res.json();
        setSearchResults(data.patients || []);
        setShowSearch(data.patients?.length > 0);
      } catch {}
      setSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [form.patientName, appointmentId]);

  function selectPatient(p) {
    setForm(f => ({
      ...f,
      patientName: p.name,
      patientPhone: p.phone || f.patientPhone,
    }));
    setShowSearch(false);
    setSearchResults([]);
  }

  async function handleMediaUpload(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploadingMedia(true);
    try {
      setMediaFiles(prev => [...prev, ...files]);
    } catch (err) {
      alert('Failed to add media');
    } finally {
      setUploadingMedia(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function removeMediaFile(idx) {
    setMediaFiles(prev => prev.filter((_, i) => i !== idx));
  }

  function addMedicine() {
    setForm(f => ({ ...f, medicines: [...f.medicines, { name: '', dosage: '', frequency: '', duration: '' }] }));
  }
  function updateMedicine(idx, field, value) {
    setForm(f => { const meds = [...f.medicines]; meds[idx] = { ...meds[idx], [field]: value }; return { ...f, medicines: meds }; });
  }
  function removeMedicine(idx) {
    setForm(f => ({ ...f, medicines: f.medicines.filter((_, i) => i !== idx) }));
  }

  function validate() {
    const e = {};
    if (!form.patientName.trim()) e.patientName = 'Patient name is required';
    if (!form.treatment) e.treatment = 'Please select a treatment';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      const payload = appointmentId
        ? {
            appointmentId,
            treatment: form.treatment,
            diagnosis: form.diagnosis.trim() || undefined,
            medicines: form.medicines.filter(m => m.name.trim()),
            consultationFee: Number(form.consultationFee) || 0,
            treatmentCharges: Number(form.treatmentCharges) || 0,
            medicineCharges: Number(form.medicineCharges) || 0,
            notes: form.notes.trim() || undefined,
            followUpDate: form.followUpDate || undefined,
            followUpInstructions: form.followUpInstructions.trim() || undefined,
            status: 'completed',
          }
        : {
            patient_name: form.patientName.trim(),
            patient_phone: form.patientPhone.trim() || undefined,
            treatment: form.treatment,
            consultationFee: Number(form.consultationFee) || 0,
            treatmentCharges: Number(form.treatmentCharges) || 0,
            medicineCharges: Number(form.medicineCharges) || 0,
            diagnosis: form.diagnosis.trim() || undefined,
            medicines: form.medicines.filter(m => m.name.trim()),
            followUpDate: form.followUpDate || undefined,
            followUpInstructions: form.followUpInstructions.trim() || undefined,
            notes: form.notes.trim() || undefined,
          };

      const res = await fetch('/api/dashboard/visit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        const appointmentIdForMedia = data.appointment?.id || appointmentId;
        if (appointmentIdForMedia && mediaFiles.length > 0) {
          for (const file of mediaFiles) {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('appointmentId', appointmentIdForMedia);
            await fetch('/api/dashboard/media', {
              method: 'POST',
              body: formData,
            });
          }
        }
        setResult({ patient_name: form.patientName, treatment: form.treatment });
      } else {
        alert(data.error || 'Failed to log visit');
      }
    } catch {
      alert('Network error');
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setForm({ patientName: '', patientPhone: '', treatment: '', consultationFee: '', treatmentCharges: '', medicineCharges: '', diagnosis: '', medicines: [], followUpDate: '', followUpInstructions: '', notes: '' });
    setResult(null);
    setErrors({});
    setMediaFiles([]);
  }

  function getFilePreview(file) {
    if (file.type?.startsWith('image/')) {
      return URL.createObjectURL(file);
    }
    return null;
  }

  function getFileIcon(file) {
    if (file.type?.startsWith('image/')) return '🖼️';
    if (file.type?.startsWith('audio/')) return '🎵';
    if (file.type?.startsWith('video/')) return '🎬';
    return '📎';
  }

  if (result) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100/50 dark:from-gray-950 dark:to-gray-900 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-8 md:p-12 max-w-md w-full text-center shadow-lg transition-colors duration-200">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/30 dark:to-emerald-800/30 mb-6">
            <ClipboardCheck className="w-10 h-10 text-emerald-500 dark:text-emerald-400" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Visit Logged Successfully</h2>
          <div className="text-gray-500 dark:text-gray-400 text-sm mb-6 space-y-1">
            <p><span className="font-medium text-gray-700 dark:text-gray-300">{result.patient_name}</span> — {result.treatment}</p>
          </div>
          <div className="flex gap-3 justify-center">
            {appointmentId ? (
              <button onClick={() => router.push('/dashboard/appointments')} className="px-6 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-medium rounded-xl hover:bg-gray-800 dark:hover:bg-gray-100 transition-all active:scale-95">
                Back to Appointments
              </button>
            ) : (
              <button onClick={resetForm} className="px-6 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-medium rounded-xl hover:bg-gray-800 dark:hover:bg-gray-100 transition-all active:scale-95">
                Log Another Visit
              </button>
            )}
            <button onClick={() => window.print()} className="px-6 py-2.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all">
              Print
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100/50 dark:from-gray-950 dark:to-gray-900">
      <div className="max-w-2xl mx-auto p-4 md:p-6 lg:p-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          {appointmentId && (
            <button onClick={() => router.push('/dashboard/appointments')} className="p-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <ArrowLeft className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            </button>
          )}
          <div className="p-3 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-200 dark:shadow-emerald-900/50">
            <Stethoscope className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">Log Visit</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {appointmentId ? `Completing appointment for ${prefillName}` : 'Record a patient consultation'}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Patient Info — hidden when pre-filled from appointment */}
          {!appointmentId && (
            <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-6 shadow-sm relative">
              <div className="flex items-center gap-2.5 mb-5">
                <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/30"><Search className="w-4 h-4 text-blue-500 dark:text-blue-400" /></div>
                <h2 className="font-semibold text-gray-900 dark:text-gray-100">Patient Information</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Patient Name *</label>
                  <input type="text" value={form.patientName}
                    onChange={e => { setForm(f => ({ ...f, patientName: e.target.value })); setErrors(ev => { const n={...ev}; delete n.patientName; return n; }); }}
                    className={`w-full px-4 py-2.5 bg-white dark:bg-gray-800 border rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 transition-all ${errors.patientName ? 'border-red-300 dark:border-red-700 focus:ring-red-200 dark:focus:ring-red-800' : 'border-gray-200 dark:border-gray-700 focus:ring-blue-200 dark:focus:ring-blue-800 focus:border-blue-400 dark:focus:border-blue-500'}`}
                    placeholder="e.g. Rajesh Kumar" />
                  {errors.patientName && <p className="text-xs text-red-500 dark:text-red-400 mt-1">{errors.patientName}</p>}
                  {/* Search suggestions */}
                  {showSearch && searchResults.length > 0 && (
                    <div ref={searchRef} className="absolute z-20 mt-1 w-full bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg overflow-hidden">
                      {searchResults.map(p => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => selectPatient(p)}
                          className="w-full text-left px-4 py-3 hover:bg-blue-50 dark:hover:bg-blue-900/20 border-b border-gray-50 dark:border-gray-700 last:border-0 transition-colors flex items-center gap-3"
                        >
                          <span className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/30 flex items-center justify-center text-xs font-semibold text-blue-700 dark:text-blue-300 flex-shrink-0">
                            {(p.name || '?')[0].toUpperCase()}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{p.name}</p>
                            {p.phone && <p className="text-xs text-gray-400 dark:text-gray-500">{p.phone}</p>}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Phone (optional)</label>
                  <input type="tel" value={form.patientPhone} onChange={e => setForm(f => ({ ...f, patientPhone: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 focus:border-blue-400 dark:focus:border-blue-500 transition-all"
                    placeholder="e.g. 9876543210" />
                </div>
              </div>
            </div>
          )}

          {/* Media Upload Section */}
          <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-6 shadow-sm">
              <div className="flex items-center gap-2.5 mb-5">
                <div className="p-1.5 rounded-lg bg-purple-50 dark:bg-purple-900/30"><Upload className="w-4 h-4 text-purple-500 dark:text-purple-400" /></div>
                <h2 className="font-semibold text-gray-900 dark:text-gray-100">Attachments</h2>
                <span className="text-xs text-gray-400 dark:text-gray-500 font-normal">(optional)</span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,audio/*,video/*,.pdf,.doc,.docx"
                onChange={handleMediaUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingMedia}
                className="w-full py-8 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl hover:border-purple-300 dark:hover:border-purple-600 hover:bg-purple-50/30 dark:hover:bg-purple-900/10 transition-all flex flex-col items-center gap-2 text-gray-400 dark:text-gray-500 hover:text-purple-500 dark:hover:text-purple-400"
              >
                <Upload className="w-6 h-6" />
                <span className="text-sm font-medium">
                  {uploadingMedia ? 'Uploading...' : 'Click to upload photos or files'}
                </span>
                <span className="text-xs">Photos, documents, audio recordings</span>
              </button>
              {mediaFiles.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {mediaFiles.map((file, idx) => (
                    <div key={idx} className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 text-sm">
                      {getFilePreview(file) ? (
                        <img src={getFilePreview(file)} alt="" className="w-8 h-8 rounded-lg object-cover" />
                      ) : (
                        <span className="text-base">{getFileIcon(file)}</span>
                      )}
                      <span className="flex-1 truncate text-gray-700 dark:text-gray-300">{file.name}</span>
                      <span className="text-xs text-gray-400 dark:text-gray-500">{(file.size / 1024).toFixed(0)} KB</span>
                      <button type="button" onClick={() => removeMediaFile(idx)}
                        className="p-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

          {/* Consultation Details */}
          <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-6 shadow-sm">
            <div className="flex items-center gap-2.5 mb-5">
              <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/30"><Stethoscope className="w-4 h-4 text-emerald-500 dark:text-emerald-400" /></div>
              <h2 className="font-semibold text-gray-900 dark:text-gray-100">Consultation Details</h2>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Treatment *</label>
              <select value={form.treatment}
                onChange={e => { setForm(f => ({ ...f, treatment: e.target.value })); setErrors(ev => { const n={...ev}; delete n.treatment; return n; }); }}
                className={`w-full px-4 py-2.5 bg-white dark:bg-gray-800 border rounded-xl text-sm focus:outline-none focus:ring-2 transition-all appearance-none ${errors.treatment ? 'border-red-300 dark:border-red-700 focus:ring-red-200 dark:focus:ring-red-800' : 'border-gray-200 dark:border-gray-700 focus:ring-blue-200 dark:focus:ring-blue-800 focus:border-blue-400 dark:focus:border-blue-500'} ${!form.treatment ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-gray-100'}`}>
                <option value="">Select treatment...</option>
                {TREATMENTS.map(t => <option key={t} value={t} className="text-gray-900 dark:text-gray-100">{t}</option>)}
              </select>
              {errors.treatment && <p className="text-xs text-red-500 dark:text-red-400 mt-1">{errors.treatment}</p>}
            </div>

            {/* Fee breakdown */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                { key: 'consultationFee', label: 'Consultation' },
                { key: 'treatmentCharges', label: 'Treatment' },
                { key: 'medicineCharges', label: 'Medicines' },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{label} (₹)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 text-sm">₹</span>
                    <input type="number" min="0" step="1" value={form[key]}
                      onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                      className="w-full pl-7 pr-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 focus:border-blue-400 dark:focus:border-blue-500 transition-all"
                      placeholder="0" />
                  </div>
                </div>
              ))}
            </div>
            {(Number(form.consultationFee) + Number(form.treatmentCharges) + Number(form.medicineCharges)) > 0 && (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-right">
                Total: <span className="font-semibold text-gray-900 dark:text-gray-100">₹{(Number(form.consultationFee) + Number(form.treatmentCharges) + Number(form.medicineCharges)).toLocaleString('en-IN')}</span>
              </p>
            )}

            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" /> Diagnosis / Observations
              </label>
              <textarea value={form.diagnosis} onChange={e => setForm(f => ({ ...f, diagnosis: e.target.value }))}
                rows={3} className="w-full px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 focus:border-blue-400 dark:focus:border-blue-500 transition-all resize-none"
                placeholder="Describe the diagnosis, observations, and any clinical notes..." />
            </div>
          </div>

          {/* Medicines */}
          <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-violet-50 dark:bg-violet-900/30"><Pill className="w-4 h-4 text-violet-500 dark:text-violet-400" /></div>
                <h2 className="font-semibold text-gray-900 dark:text-gray-100">Prescribed Medicines</h2>
              </div>
              <button type="button" onClick={addMedicine} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/30 rounded-xl hover:bg-violet-100 dark:hover:bg-violet-900/50 transition-all active:scale-95">
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </div>
            {form.medicines.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">No medicines added.</p>
            ) : (
              <div className="space-y-3">
                {form.medicines.map((med, idx) => (
                  <div key={idx} className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-4 border border-gray-100 dark:border-gray-700 relative group">
                    <button type="button" onClick={() => removeMedicine(idx)}
                      className="absolute -top-2 -right-2 w-6 h-6 bg-white dark:bg-gray-800 rounded-full border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-700 transition-all opacity-0 group-hover:opacity-100 shadow-sm">
                      <Trash2 className="w-3 h-3" />
                    </button>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[['name','Medicine','e.g. Amoxicillin'],['dosage','Dosage','e.g. 500mg'],['frequency','Frequency','e.g. Twice daily'],['duration','Duration','e.g. 5 days']].map(([f, lbl, ph]) => (
                        <div key={f}>
                          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{lbl}</label>
                          <input type="text" value={med[f]} onChange={e => updateMedicine(idx, f, e.target.value)}
                            className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 transition-all"
                            placeholder={ph} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Follow-up */}
          <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-6 shadow-sm">
            <div className="flex items-center gap-2.5 mb-5">
              <div className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/30"><Calendar className="w-4 h-4 text-amber-500 dark:text-amber-400" /></div>
              <h2 className="font-semibold text-gray-900 dark:text-gray-100">Follow-up</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Follow-up Date</label>
                <input type="date" value={form.followUpDate} onChange={e => setForm(f => ({ ...f, followUpDate: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 focus:border-blue-400 dark:focus:border-blue-500 transition-all" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Instructions</label>
                <input type="text" value={form.followUpInstructions} onChange={e => setForm(f => ({ ...f, followUpInstructions: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 focus:border-blue-400 dark:focus:border-blue-500 transition-all"
                  placeholder="e.g. Return in 2 weeks" />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-6 shadow-sm">
            <div className="flex items-center gap-2.5 mb-5">
              <div className="p-1.5 rounded-lg bg-gray-100 dark:bg-gray-800"><FileText className="w-4 h-4 text-gray-500 dark:text-gray-400" /></div>
              <h2 className="font-semibold text-gray-900 dark:text-gray-100">Additional Notes</h2>
            </div>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={2} className="w-full px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 focus:border-blue-400 dark:focus:border-blue-500 transition-all resize-none"
              placeholder="Any additional notes or instructions..." />
          </div>

          <button type="submit" disabled={submitting}
            className="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white text-sm font-semibold rounded-xl hover:from-emerald-600 hover:to-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:opacity-60 disabled:cursor-not-allowed transition-all active:scale-[0.99] shadow-lg shadow-emerald-200 dark:shadow-emerald-900/50">
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                Saving...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <ClipboardCheck className="w-4 h-4" />
                {appointmentId ? 'Complete & Save Visit' : 'Log Visit'}
              </span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
