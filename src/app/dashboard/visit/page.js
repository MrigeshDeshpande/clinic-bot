'use client';

import { useState, useEffect } from 'react';

export default function VisitPage() {
  const [appointments, setAppointments] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [treatment, setTreatment] = useState('');
  const [consultationFee, setConsultationFee] = useState('');
  const [treatmentCharges, setTreatmentCharges] = useState('');
  const [medicineCharges, setMedicineCharges] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    fetch(`/api/dashboard/appointments?date=${today}`)
      .then(r => r.json())
      .then(d => setAppointments(d.appointments?.filter(a => a.status === 'confirmed') || []))
      .catch(() => {});
  }, [today]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!selectedId) return;
    setSaving(true);
    setError('');

    try {
      const res = await fetch('/api/dashboard/visit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointmentId: selectedId,
          treatment,
          consultationFee: consultationFee || '0',
          treatmentCharges: treatmentCharges || '0',
          medicineCharges: medicineCharges || '0',
          notes,
          status: 'completed',
        }),
      });

      if (res.ok) {
        setDone(true);
      } else {
        const d = await res.json();
        setError(d.error || 'Failed to save');
      }
    } catch {
      setError('Network error');
    }
    setSaving(false);
  }

  function reset() {
    setSelectedId('');
    setTreatment('');
    setConsultationFee('');
    setTreatmentCharges('');
    setMedicineCharges('');
    setNotes('');
    setDone(false);
    setError('');
  }

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Visit Logged Successfully</h2>
        <p className="text-gray-500 mb-6">The appointment has been marked as completed.</p>
        <button onClick={reset} className="px-6 py-2.5 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition">
          Log Another Visit
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Quick Visit Logging</h1>
        <p className="text-gray-500 mt-1">Log a completed visit with details</p>
      </div>

      <div className="max-w-2xl">
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Appointment</label>
            <select
              value={selectedId}
              onChange={e => {
                const a = appointments.find(x => x.id === e.target.value);
                setSelectedId(e.target.value);
                if (a) setTreatment(a.treatment || '');
              }}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none text-sm"
              required
            >
              <option value="">Select a patient...</option>
              {appointments.map(a => (
                <option key={a.id} value={a.id}>
                  {a.time?.slice(0, 5)} — {a.patient_name || 'Patient'} {a.treatment ? `(${a.treatment})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Treatment</label>
            <input
              type="text"
              value={treatment}
              onChange={e => setTreatment(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none text-sm"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Consultation Fee</label>
              <input
                type="number"
                value={consultationFee}
                onChange={e => setConsultationFee(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none text-sm"
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Treatment Charges</label>
              <input
                type="number"
                value={treatmentCharges}
                onChange={e => setTreatmentCharges(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none text-sm"
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Medicine Charges</label>
              <input
                type="number"
                value={medicineCharges}
                onChange={e => setMedicineCharges(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none text-sm"
                placeholder="0"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none text-sm resize-none"
            />
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={saving || !selectedId}
            className="w-full py-3 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {saving ? 'Saving...' : 'Save Visit'}
          </button>
        </form>
      </div>
    </div>
  );
}
