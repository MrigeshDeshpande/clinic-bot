import React from 'react';
import { Heart, AlertTriangle } from 'lucide-react';

export default function MedicalHistoryCard({ medicalHistoryProps }) {
  const {
    patientProfile,
    medicalHistory,
    setMedicalHistory,
    habits
  } = medicalHistoryProps;

  if (!patientProfile) return null;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="p-1.5 rounded-lg bg-red-50 dark:bg-red-900/30"><Heart className="w-3.5 h-3.5 text-red-500 dark:text-red-400" /></div>
        <h2 className="font-bold text-gray-900 dark:text-gray-100 text-lg">Medical & Dental History</h2>
        <span className="text-xs text-gray-500 dark:text-gray-400 font-normal">Update as needed</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Allergies</label>
          <input type="text" value={medicalHistory.allergies} onChange={e => setMedicalHistory(h => ({ ...h, allergies: e.target.value }))}
            className="w-full px-2.5 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-200 dark:focus:ring-red-800 focus:border-red-400 dark:focus:border-red-500 transition-all placeholder-gray-400"
            placeholder="e.g. Penicillin, Latex" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Chronic Conditions</label>
          <input type="text" value={medicalHistory.chronicConditions} onChange={e => setMedicalHistory(h => ({ ...h, chronicConditions: e.target.value }))}
            className="w-full px-2.5 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-200 dark:focus:ring-orange-800 focus:border-orange-400 dark:focus:border-orange-500 transition-all placeholder-gray-400"
            placeholder="e.g. Diabetes, Hypertension" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Blood Group</label>
          <input type="text" value={medicalHistory.bloodGroup} onChange={e => setMedicalHistory(h => ({ ...h, bloodGroup: e.target.value }))}
            className="w-full px-2.5 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 focus:border-blue-400 dark:focus:border-blue-500 transition-all placeholder-gray-400"
            placeholder="e.g. O+" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">BP</label>
          <input type="text" value={medicalHistory.bp} onChange={e => setMedicalHistory(h => ({ ...h, bp: e.target.value }))}
            className="w-full px-2.5 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 focus:border-blue-400 dark:focus:border-blue-500 transition-all placeholder-gray-400"
            placeholder="e.g. 120/80" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Weight</label>
          <input type="text" value={medicalHistory.weight} onChange={e => setMedicalHistory(h => ({ ...h, weight: e.target.value }))}
            className="w-full px-2.5 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 focus:border-blue-400 dark:focus:border-blue-500 transition-all placeholder-gray-400"
            placeholder="e.g. 70 kg" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Current Medications</label>
          <input type="text" value={medicalHistory.medications} onChange={e => setMedicalHistory(h => ({ ...h, medications: e.target.value }))}
            className="w-full px-2.5 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-200 dark:focus:ring-violet-800 focus:border-violet-400 dark:focus:border-violet-500 transition-all placeholder-gray-400"
            placeholder="e.g. Metformin 500mg, Amlodipine 5mg" />
        </div>
      </div>
      {/* ── Habits & Risk Factors (Editable) ── */}
      <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-2 mb-3">
          <div className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/30"><AlertTriangle className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" /></div>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">Habits &amp; Risk Factors</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Smoking</label>
            <select value={habits.smoking || ''} onChange={e => setMedicalHistory(h => ({ ...h, habits: { ...h.habits, smoking: e.target.value || undefined } }))}
              className="w-full px-2.5 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-200 dark:focus:ring-amber-800 focus:border-amber-400 dark:focus:border-amber-500 transition-all">
              <option value="">Select</option>
              <option value="never">Never</option>
              <option value="former">Former</option>
              <option value="current">Current</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Tobacco Chewing</label>
            <select value={habits.tobaccoChewing || ''} onChange={e => setMedicalHistory(h => ({ ...h, habits: { ...h.habits, tobaccoChewing: e.target.value || undefined } }))}
              className="w-full px-2.5 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-200 dark:focus:ring-amber-800 focus:border-amber-400 dark:focus:border-amber-500 transition-all">
              <option value="">Select</option>
              <option value="never">Never</option>
              <option value="former">Former</option>
              <option value="current">Current</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Pan Masala</label>
            <select value={habits.panMasala || ''} onChange={e => setMedicalHistory(h => ({ ...h, habits: { ...h.habits, panMasala: e.target.value || undefined } }))}
              className="w-full px-2.5 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-200 dark:focus:ring-amber-800 focus:border-amber-400 dark:focus:border-amber-500 transition-all">
              <option value="">Select</option>
              <option value="never">Never</option>
              <option value="former">Former</option>
              <option value="current">Current</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Alcohol</label>
            <select value={habits.alcohol || ''} onChange={e => setMedicalHistory(h => ({ ...h, habits: { ...h.habits, alcohol: e.target.value || undefined } }))}
              className="w-full px-2.5 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-200 dark:focus:ring-amber-800 focus:border-amber-400 dark:focus:border-amber-500 transition-all">
              <option value="">Select</option>
              <option value="never">Never</option>
              <option value="occasional">Occasional</option>
              <option value="regular">Regular</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Brushing Frequency</label>
            <select value={habits.brushingFrequency || ''} onChange={e => setMedicalHistory(h => ({ ...h, habits: { ...h.habits, brushingFrequency: e.target.value || undefined } }))}
              className="w-full px-2.5 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-200 dark:focus:ring-amber-800 focus:border-amber-400 dark:focus:border-amber-500 transition-all">
              <option value="">Select</option>
              <option value="twice">Twice a day</option>
              <option value="once">Once a day</option>
              <option value="irregular">Irregular</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Sugary Diet</label>
            <select value={habits.sugaryDiet || ''} onChange={e => setMedicalHistory(h => ({ ...h, habits: { ...h.habits, sugaryDiet: e.target.value || undefined } }))}
              className="w-full px-2.5 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-200 dark:focus:ring-amber-800 focus:border-amber-400 dark:focus:border-amber-500 transition-all">
              <option value="">Select</option>
              <option value="low">Low</option>
              <option value="moderate">Moderate</option>
              <option value="high">High</option>
            </select>
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Other Habits / Notes</label>
            <input type="text" value={habits.other || ''} onChange={e => setMedicalHistory(h => ({ ...h, habits: { ...h.habits, other: e.target.value || undefined } }))}
              className="w-full px-2.5 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-200 dark:focus:ring-amber-800 focus:border-amber-400 dark:focus:border-amber-500 transition-all placeholder-gray-400"
              placeholder="e.g. Betel nut, Areca nut, Mouthwash use" />
          </div>
        </div>
      </div>
    </div>
  );
}
