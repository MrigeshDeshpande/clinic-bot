import React, { useState } from 'react';
import { X } from 'lucide-react';
import { apiFetch } from '@/lib/clientApi';

const LOCATIONS = ['Hudco', 'Bhilai', 'Durg', 'Nehru Nagar', 'Borsi'];

export default function EditPatientDrawer({ patientProfile, onClose, onSaved, showToast }) {
  const [name, setName] = useState(patientProfile?.name || '');
  const [phone, setPhone] = useState((patientProfile?.phone || '').replace(/\D/g, ''));
  const [age, setAge] = useState(patientProfile?.age?.toString() || '');
  const [sex, setSex] = useState(patientProfile?.sex || '');
  const [location, setLocation] = useState(patientProfile?.location || '');
  const [showCustomLocation, setShowCustomLocation] = useState(!LOCATIONS.includes(patientProfile?.location || ''));
  const [occupation, setOccupation] = useState(patientProfile?.occupation || '');
  const [address, setAddress] = useState(patientProfile?.address || '');
  const [saving, setSaving] = useState(false);

  async function handleSave(e) {
    e.preventDefault();
    const payload = {
      name: name.trim(),
      phone: phone || '',
      age: age ? parseInt(age, 10) : undefined,
      sex: sex || '',
      location: location || '',
      occupation: occupation.trim() || '',
      address: address.trim() || '',
    };

    if (!patientProfile?.id) {
      setSaving(true);
      try {
        const apiPayload = { ...payload, phone: phone ? `+91${phone}` : undefined };
        const res = await apiFetch('/api/dashboard/patients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(apiPayload),
        });
        if (res.ok) {
          const created = await res.json();
          showToast?.('Patient created & details saved', 'success');
          onSaved?.(created);
          onClose();
        } else {
          const data = await res.json();
          showToast?.(data.error || 'Failed to create patient', 'error');
        }
      } catch {
        showToast?.('Network error', 'error');
      } finally {
        setSaving(false);
      }
      return;
    }

    setSaving(true);
    try {
      const apiPayload = { ...payload, phone: phone ? `+91${phone}` : undefined };
      const res = await apiFetch(`/api/dashboard/patients/${patientProfile.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiPayload),
      });
      if (res.ok) {
        const updated = await res.json();
        showToast?.('Patient details updated', 'success');
        onSaved?.(updated);
        onClose();
      } else {
        const data = await res.json();
        showToast?.(data.error || 'Failed to update', 'error');
      }
    } catch (err) {
      showToast?.('Network error', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm cursor-pointer" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white dark:bg-gray-900 shadow-2xl h-full overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Edit Patient</h2>
          <button type="button" onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-5 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 transition-all" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Phone</label>
            <div className="flex gap-1">
              <span className="px-2 py-2 text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">+91</span>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                className="flex-1 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 transition-all" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Age</label>
              <input type="number" value={age} onChange={e => setAge(e.target.value)} min={0} max={150}
                className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 transition-all" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Sex</label>
              <select value={sex} onChange={e => setSex(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 transition-all">
                <option value="">Select</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Location</label>
            <select value={showCustomLocation ? 'Other' : location} onChange={e => {
              if (e.target.value === 'Other') { setShowCustomLocation(true); setLocation(''); }
              else { setShowCustomLocation(false); setLocation(e.target.value); }
            }}
              className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 transition-all">
              <option value="">Select</option>
              {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
              <option value="Other">Other</option>
            </select>
            {showCustomLocation && (
              <input type="text" value={location} onChange={e => setLocation(e.target.value)}
                placeholder="Enter location"
                className="mt-1 w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 transition-all" />
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Occupation</label>
            <input type="text" value={occupation} onChange={e => setOccupation(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 transition-all"
              placeholder="e.g. Engineer, Business, Student" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Address</label>
            <input type="text" value={address} onChange={e => setAddress(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 transition-all"
              placeholder="e.g. 123 Main St, City" />
          </div>

          <div className="pt-2">
            <button type="submit" disabled={saving}
              className="w-full py-2.5 text-sm font-semibold rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white hover:from-emerald-600 hover:to-emerald-700 shadow-lg transition-all active:scale-[0.99] disabled:opacity-60">
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
