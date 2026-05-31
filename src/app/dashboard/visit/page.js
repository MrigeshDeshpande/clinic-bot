'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Stethoscope, FileText, Pill, Calendar, Plus, Trash2, ClipboardCheck, Activity, ArrowLeft } from 'lucide-react';

const TREATMENTS = [
  'General Checkup', 'Root Canal', 'Dental Filling', 'Teeth Cleaning',
  'Extraction', 'Braces Adjustment', 'Crown', 'Veneers', 'Whitening', 'Scaling', 'Other',
];

export default function VisitPage() {
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

  useEffect(() => {
    setForm(f => ({
      ...f,
      patientName: prefillName || f.patientName,
      treatment: prefillTreatment || f.treatment,
    }));
  }, [prefillName, prefillTreatment]);

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
            fees: (Number(form.consultationFee) || 0) + (Number(form.treatmentCharges) || 0) + (Number(form.medicineCharges) || 0),
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
  }

  if (result) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100/50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl border border-gray-100 p-8 md:p-12 max-w-md w-full text-center shadow-lg">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-emerald-50 to-emerald-100 mb-6">
            <ClipboardCheck className="w-10 h-10 text-emerald-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Visit Logged Successfully</h2>
          <div className="text-gray-500 text-sm mb-6 space-y-1">
            <p><span className="font-medium text-gray-700">{result.patient_name}</span> — {result.treatment}</p>
          </div>
          <div className="flex gap-3 justify-center">
            {appointmentId ? (
              <button onClick={() => router.push('/dashboard/appointments')} className="px-6 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-800 transition-all active:scale-95">
                Back to Appointments
              </button>
            ) : (
              <button onClick={resetForm} className="px-6 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-800 transition-all active:scale-95">
                Log Another Visit
              </button>
            )}
            <button onClick={() => window.print()} className="px-6 py-2.5 bg-white text-gray-700 text-sm font-medium rounded-xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all">
              Print
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100/50">
      <div className="max-w-2xl mx-auto p-4 md:p-6 lg:p-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          {appointmentId && (
            <button onClick={() => router.push('/dashboard/appointments')} className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition-colors">
              <ArrowLeft className="w-4 h-4 text-gray-500" />
            </button>
          )}
          <div className="p-3 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-200">
            <Stethoscope className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">Log Visit</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {appointmentId ? `Completing appointment for ${prefillName}` : 'Record a patient consultation'}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Patient Info — hidden when pre-filled from appointment */}
          {!appointmentId && (
            <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
              <div className="flex items-center gap-2.5 mb-5">
                <div className="p-1.5 rounded-lg bg-blue-50"><Activity className="w-4 h-4 text-blue-500" /></div>
                <h2 className="font-semibold text-gray-900">Patient Information</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Patient Name *</label>
                  <input type="text" value={form.patientName}
                    onChange={e => { setForm(f => ({ ...f, patientName: e.target.value })); setErrors(ev => { const n={...ev}; delete n.patientName; return n; }); }}
                    className={`w-full px-4 py-2.5 bg-white border rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 transition-all ${errors.patientName ? 'border-red-300 focus:ring-red-200' : 'border-gray-200 focus:ring-blue-200 focus:border-blue-400'}`}
                    placeholder="e.g. Rajesh Kumar" />
                  {errors.patientName && <p className="text-xs text-red-500 mt-1">{errors.patientName}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone (optional)</label>
                  <input type="tel" value={form.patientPhone} onChange={e => setForm(f => ({ ...f, patientPhone: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition-all"
                    placeholder="e.g. 9876543210" />
                </div>
              </div>
            </div>
          )}

          {/* Consultation Details */}
          <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
            <div className="flex items-center gap-2.5 mb-5">
              <div className="p-1.5 rounded-lg bg-emerald-50"><Stethoscope className="w-4 h-4 text-emerald-500" /></div>
              <h2 className="font-semibold text-gray-900">Consultation Details</h2>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Treatment *</label>
              <select value={form.treatment}
                onChange={e => { setForm(f => ({ ...f, treatment: e.target.value })); setErrors(ev => { const n={...ev}; delete n.treatment; return n; }); }}
                className={`w-full px-4 py-2.5 bg-white border rounded-xl text-sm focus:outline-none focus:ring-2 transition-all appearance-none ${errors.treatment ? 'border-red-300 focus:ring-red-200' : 'border-gray-200 focus:ring-blue-200 focus:border-blue-400'} ${!form.treatment ? 'text-gray-400' : 'text-gray-900'}`}>
                <option value="">Select treatment...</option>
                {TREATMENTS.map(t => <option key={t} value={t} className="text-gray-900">{t}</option>)}
              </select>
              {errors.treatment && <p className="text-xs text-red-500 mt-1">{errors.treatment}</p>}
            </div>

            {/* Fee breakdown */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                { key: 'consultationFee', label: 'Consultation' },
                { key: 'treatmentCharges', label: 'Treatment' },
                { key: 'medicineCharges', label: 'Medicines' },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{label} (₹)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
                    <input type="number" min="0" step="1" value={form[key]}
                      onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                      className="w-full pl-7 pr-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition-all"
                      placeholder="0" />
                  </div>
                </div>
              ))}
            </div>
            {(Number(form.consultationFee) + Number(form.treatmentCharges) + Number(form.medicineCharges)) > 0 && (
              <p className="text-sm text-gray-500 text-right">
                Total: <span className="font-semibold text-gray-900">₹{(Number(form.consultationFee) + Number(form.treatmentCharges) + Number(form.medicineCharges)).toLocaleString('en-IN')}</span>
              </p>
            )}

            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-gray-400" /> Diagnosis / Observations
              </label>
              <textarea value={form.diagnosis} onChange={e => setForm(f => ({ ...f, diagnosis: e.target.value }))}
                rows={3} className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition-all resize-none"
                placeholder="Describe the diagnosis, observations, and any clinical notes..." />
            </div>
          </div>

          {/* Medicines */}
          <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-violet-50"><Pill className="w-4 h-4 text-violet-500" /></div>
                <h2 className="font-semibold text-gray-900">Prescribed Medicines</h2>
              </div>
              <button type="button" onClick={addMedicine} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-violet-600 bg-violet-50 rounded-xl hover:bg-violet-100 transition-all active:scale-95">
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </div>
            {form.medicines.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No medicines added.</p>
            ) : (
              <div className="space-y-3">
                {form.medicines.map((med, idx) => (
                  <div key={idx} className="bg-gray-50 rounded-2xl p-4 border border-gray-100 relative group">
                    <button type="button" onClick={() => removeMedicine(idx)}
                      className="absolute -top-2 -right-2 w-6 h-6 bg-white rounded-full border border-gray-200 flex items-center justify-center text-gray-400 hover:text-red-500 hover:border-red-200 transition-all opacity-0 group-hover:opacity-100 shadow-sm">
                      <Trash2 className="w-3 h-3" />
                    </button>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[['name','Medicine','e.g. Amoxicillin'],['dosage','Dosage','e.g. 500mg'],['frequency','Frequency','e.g. Twice daily'],['duration','Duration','e.g. 5 days']].map(([f, lbl, ph]) => (
                        <div key={f}>
                          <label className="block text-xs font-medium text-gray-500 mb-1">{lbl}</label>
                          <input type="text" value={med[f]} onChange={e => updateMedicine(idx, f, e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 transition-all"
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
          <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
            <div className="flex items-center gap-2.5 mb-5">
              <div className="p-1.5 rounded-lg bg-amber-50"><Calendar className="w-4 h-4 text-amber-500" /></div>
              <h2 className="font-semibold text-gray-900">Follow-up</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Follow-up Date</label>
                <input type="date" value={form.followUpDate} onChange={e => setForm(f => ({ ...f, followUpDate: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition-all" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Instructions</label>
                <input type="text" value={form.followUpInstructions} onChange={e => setForm(f => ({ ...f, followUpInstructions: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition-all"
                  placeholder="e.g. Return in 2 weeks" />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
            <div className="flex items-center gap-2.5 mb-5">
              <div className="p-1.5 rounded-lg bg-gray-100"><FileText className="w-4 h-4 text-gray-500" /></div>
              <h2 className="font-semibold text-gray-900">Additional Notes</h2>
            </div>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={2} className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition-all resize-none"
              placeholder="Any additional notes or instructions..." />
          </div>

          <button type="submit" disabled={submitting}
            className="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white text-sm font-semibold rounded-xl hover:from-emerald-600 hover:to-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:opacity-60 disabled:cursor-not-allowed transition-all active:scale-[0.99] shadow-lg shadow-emerald-200">
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
