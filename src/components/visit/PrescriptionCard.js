import React from 'react';
import { Pill, X, Plus, Search, Trash2, Zap, Clock } from 'lucide-react';

const PRESET_COLORS = [
  { bg: 'bg-emerald-100 dark:bg-emerald-900/40 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-800', icon: '🟢' },
  { bg: 'bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800', icon: '🔵' },
  { bg: 'bg-violet-100 dark:bg-violet-900/40 border-violet-300 dark:border-violet-700 text-violet-800 dark:text-violet-300 hover:bg-violet-200 dark:hover:bg-violet-800', icon: '🟣' },
  { bg: 'bg-orange-100 dark:bg-orange-900/40 border-orange-300 dark:border-orange-700 text-orange-800 dark:text-orange-300 hover:bg-orange-200 dark:hover:bg-orange-800', icon: '🟠' },
  { bg: 'bg-rose-100 dark:bg-rose-900/40 border-rose-300 dark:border-rose-700 text-rose-800 dark:text-rose-300 hover:bg-rose-200 dark:hover:bg-rose-800', icon: '🔴' },
  { bg: 'bg-cyan-100 dark:bg-cyan-900/40 border-cyan-300 dark:border-cyan-700 text-cyan-800 dark:text-cyan-300 hover:bg-cyan-200 dark:hover:bg-cyan-800', icon: '🔷' },
];

const DEFAULT_TEMPLATES = [
  {
    id: 'default-extraction',
    name: 'Extraction',
    medicines: [
      { name: 'Amoxicillin 500mg', dosage: '500mg', frequency: 'Twice a day', duration: '5 days', timing: 'after' },
      { name: 'Dolo 650', dosage: '650mg', frequency: 'Twice a day', duration: '3 days', timing: 'after' },
    ],
  },
  {
    id: 'default-rct',
    name: 'RCT',
    medicines: [
      { name: 'Augmentin 625mg', dosage: '625mg', frequency: 'Twice a day', duration: '5 days', timing: 'after' },
      { name: 'Pantop 40mg', dosage: '40mg', frequency: 'Daily one time', duration: '5 days', timing: 'before' },
      { name: 'Dolo 650', dosage: '650mg', frequency: 'Twice a day', duration: '3 days', timing: 'after' },
    ],
  },
  {
    id: 'default-scaling',
    name: 'Scaling',
    medicines: [
      { name: 'Chlorhexidine Mouthwash 0.2%', dosage: '10ml', frequency: 'Twice a day', duration: '7 days', timing: 'after' },
    ],
  },
  {
    id: 'default-pain',
    name: 'Pain Relief',
    medicines: [
      { name: 'Dolo 650', dosage: '650mg', frequency: 'Twice a day', duration: '3 days', timing: 'after' },
    ],
  },
  {
    id: 'default-infection',
    name: 'Infection',
    medicines: [
      { name: 'Augmentin 625mg', dosage: '625mg', frequency: 'Twice a day', duration: '5 days', timing: 'after' },
      { name: 'Pantop 40mg', dosage: '40mg', frequency: 'Daily one time', duration: '5 days', timing: 'before' },
      { name: 'Metrogyl 400mg', dosage: '400mg', frequency: 'Twice a day', duration: '5 days', timing: 'after' },
    ],
  },
];

export default function PrescriptionCard({ prescriptionProps }) {
  const {
    rxTemplates,
    loadRxTemplate,
    deleteRxTemplate,
    showRxTemplateInput,
    setShowRxTemplateInput,
    form,
    setForm,
    rxTemplateName,
    setRxTemplateName,
    saveRxTemplate,
    saltSearch,
    setSaltSearch,
    filteredSalts,
    toggleSalt,
    addMedicine,
    removeMedicine,
    updateMedicine,
    FREQUENCY_OPTIONS,
    DURATION_OPTIONS,
    TIMING_OPTIONS,
    medicineUsage,
    medicineTemplates,
    loadMedicineTemplate,
    showMedicineTemplateInput,
    setShowMedicineTemplateInput,
    medicineTemplateName,
    setMedicineTemplateName,
    saveMedicineTemplate,
    savingMedicineTemplate,
  } = prescriptionProps;

  const freqShort = { 'Daily one time': 'Once', 'Twice a day': 'BD', 'Thrice a day': 'TDS' };

  const hasSearch = saltSearch.trim().length > 0;

  const templates = medicineTemplates?.length > 0 ? medicineTemplates : DEFAULT_TEMPLATES;

  function normalizeUsage(val) {
    if (typeof val === 'number') return { count: val, last_used_at: null };
    if (val && typeof val === 'object' && typeof val.count === 'number') return val;
    return { count: 0, last_used_at: null };
  }

  const hasUsageData = medicineUsage && Object.keys(medicineUsage).length > 0;

  const mostUsed = !hasSearch && medicineUsage ? Object.entries(medicineUsage)
    .map(([name, val]) => [name, normalizeUsage(val)])
    .sort(([, a], [, b]) => b.count - a.count || ((b.last_used_at || '') < (a.last_used_at || '') ? -1 : 1))
    .slice(0, 12)
    .filter(([name]) => !form.medicines.some(m => m.name === name))
  : [];

  const allSelected = form.medicines.map(m => m.name);

  function chipClass(salt, isSelected) {
    return `px-3 py-1.5 rounded-lg text-sm font-semibold leading-6 border transition-all active:scale-95 cursor-pointer ${
      isSelected
        ? 'bg-violet-100 dark:bg-violet-900/40 border-violet-300 dark:border-violet-600 text-violet-800 dark:text-violet-200'
        : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-violet-200 dark:hover:border-violet-600'
    }`;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Pill className="w-5 h-5 text-violet-500 dark:text-violet-400" />
        <h2 className="text-xl font-bold leading-7 text-gray-900 dark:text-gray-100">Prescription</h2>
      </div>

      {/* Presets (saved templates) */}
      <div className="flex flex-wrap gap-1.5">
        {rxTemplates.map((tpl, i) => {
          const c = PRESET_COLORS[i % PRESET_COLORS.length];
          return (
            <div key={tpl.id} className="relative group">
              <button type="button" onClick={() => loadRxTemplate(tpl)}
                className={`px-3 py-1.5 text-sm font-semibold leading-6 rounded-lg border transition-all active:scale-95 ${c.bg}`}>
                <span className="mr-1">{c.icon}</span>
                {tpl.name}
              </button>
              <button type="button" onClick={() => deleteRxTemplate(tpl.id)}
                className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-white dark:bg-gray-800 rounded-full border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-400 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100">
                <X className="w-2 h-2" />
              </button>
            </div>
          );
        })}
        {!showRxTemplateInput ? (
          <button type="button" onClick={() => setShowRxTemplateInput(true)} disabled={form.medicines.length === 0 && form.adviceSelected.length === 0}
            className="px-3 py-1.5 text-sm font-semibold leading-6 text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20 border border-dashed border-violet-300 dark:border-violet-700 rounded-lg hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
            <Plus className="w-3 h-3 inline mr-0.5" /> Save Template
          </button>
        ) : (
          <div className="flex items-center gap-1.5">
            <input type="text" value={rxTemplateName} onChange={e => setRxTemplateName(e.target.value)}
              placeholder="Template name..." autoFocus
              className="w-40 px-2.5 py-1.5 text-base leading-6 bg-white dark:bg-gray-800 border border-violet-300 dark:border-violet-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-200 dark:focus:ring-violet-800" />
            <button type="button" onClick={saveRxTemplate}
              className="px-3 py-1.5 text-sm font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-lg transition-colors">Save</button>
            <button type="button" onClick={() => setShowRxTemplateInput(false)}
              className="p-1 text-gray-500 hover:text-gray-700 transition-all">
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-300 dark:text-gray-600" />
        <input type="text" value={saltSearch} onChange={e => setSaltSearch(e.target.value)}
          placeholder="Search medicines..."
          className="w-full pl-7 pr-3 py-2 bg-gray-50/50 dark:bg-gray-800/30 border border-gray-100 dark:border-gray-700/50 rounded-lg text-base leading-6 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-violet-200 dark:focus:ring-violet-800 focus:border-violet-300 dark:focus:border-violet-700 transition-all placeholder-gray-400 dark:placeholder-gray-500" />
        {saltSearch && (
          <button type="button" onClick={() => setSaltSearch('')}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-gray-300 dark:text-gray-600 hover:text-gray-500 transition-colors">
            <X className="w-2.5 h-2.5" />
          </button>
        )}
      </div>

      {/* Most Used */}
      {!hasSearch && (mostUsed.length > 0 || !hasUsageData) && (
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Zap className="w-3 h-3 text-amber-500" />
            <span className="text-sm font-bold leading-6 text-gray-600 dark:text-gray-300 uppercase tracking-wide">Most Used</span>
          </div>
          {mostUsed.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {mostUsed.map(([salt, data]) => {
                const isSelected = allSelected.includes(salt);
                return (
                  <button key={salt} type="button" onClick={() => toggleSalt(salt)}
                    className={`${chipClass(salt, isSelected)} flex items-center gap-1`}>
                    {salt}
                    <span className="text-xs text-gray-400 font-normal">{data.count}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-base leading-7 text-gray-400 dark:text-gray-500 italic py-1">
              Start prescribing medicines and your most-used list will appear here automatically.
            </p>
          )}
          <div className="border-t border-gray-100 dark:border-gray-800/50 my-2" />
        </div>
      )}

      {/* Quick Templates */}
      {!hasSearch && (
        <div>
          <div className="flex items-center justify-between gap-3 mb-1.5">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3 h-3 text-violet-500" />
              <span className="text-sm font-bold leading-6 text-gray-600 dark:text-gray-300 uppercase tracking-wide">Quick Templates</span>
            </div>
            {!showMedicineTemplateInput && (
              <button type="button" onClick={() => setShowMedicineTemplateInput(true)} disabled={form.medicines.length === 0}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-sm font-semibold leading-5 rounded-lg border border-dashed border-violet-300 dark:border-violet-700 text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                <Plus className="w-3 h-3" />
                Save Medicines
              </button>
            )}
          </div>
          {showMedicineTemplateInput && (
            <div className="flex items-center gap-2 mb-2">
              <input type="text" value={medicineTemplateName} onChange={e => setMedicineTemplateName(e.target.value)}
                placeholder="Medicine template name..." autoFocus
                className="flex-1 min-w-0 px-3 py-1.5 text-base leading-6 bg-white dark:bg-gray-800 border border-violet-300 dark:border-violet-700 rounded-lg text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-200 dark:focus:ring-violet-800 placeholder-gray-400" />
              <button type="button" onClick={saveMedicineTemplate} disabled={savingMedicineTemplate}
                className="px-3 py-1.5 text-sm font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {savingMedicineTemplate ? 'Saving...' : 'Save'}
              </button>
              <button type="button" onClick={() => { setShowMedicineTemplateInput(false); setMedicineTemplateName(''); }}
                className="p-1.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-all">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            {templates.map(tpl => (
              <button key={tpl.id} type="button" onClick={() => loadMedicineTemplate(tpl)}
                className="group relative px-3 py-1.5 text-sm font-semibold leading-6 rounded-lg border border-violet-200 dark:border-violet-700 bg-violet-50/50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-all active:scale-95">
                <Zap className="w-2.5 h-2.5 inline mr-1 text-violet-400" />
                {tpl.name}
                <span className="ml-1 text-xs text-violet-500 dark:text-violet-400">({tpl.medicines.length})</span>
              </button>
            ))}
          </div>
          <div className="border-t border-gray-100 dark:border-gray-800/50 my-2" />
        </div>
      )}

      {/* Filtered salts (visible when searching) */}
      {hasSearch && (
        <div className="flex flex-wrap gap-1 max-h-[140px] overflow-y-auto">
          {filteredSalts.map(salt => {
            const isSelected = allSelected.includes(salt);
            return (
              <button key={salt} type="button" onClick={() => toggleSalt(salt)}
                className={chipClass(salt, isSelected)}>
                {salt}
                {isSelected && <span className="ml-0.5">✓</span>}
              </button>
            );
          })}
          {filteredSalts.length === 0 && (
            <p className="text-base leading-7 text-gray-400 dark:text-gray-500 py-1">No matches</p>
          )}
        </div>
      )}

      {/* Selected Medicines */}
      {form.medicines.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="flex items-center justify-center w-5 h-5 rounded-full bg-violet-100 dark:bg-violet-900/40">
              <span className="text-xs font-bold text-violet-700 dark:text-violet-300">{form.medicines.length}</span>
            </div>
            <span className="text-base font-bold leading-6 text-gray-800 dark:text-gray-200">Selected Medicines</span>
          </div>
          {/* Desktop/Tablet Table Layout */}
          <div className="hidden md:block overflow-x-auto rounded-lg border border-gray-100 dark:border-gray-800">
            <table className="w-full text-base leading-6">
              <thead>
                <tr className="text-sm text-gray-500 dark:text-gray-400 uppercase tracking-wide bg-gray-50/50 dark:bg-gray-800/30">
                  <th className="text-left font-bold px-2 py-2">Medicine</th>
                  <th className="text-left font-bold px-2 py-2">Dose</th>
                  <th className="text-left font-bold px-2 py-2">Freq</th>
                  <th className="text-left font-bold px-2 py-2">Days</th>
                  <th className="text-left font-bold px-2 py-2">Timing</th>
                  <th className="text-left font-bold px-2 py-2">Rate</th>
                  <th className="w-6 px-2 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {form.medicines.map((med, idx) => (
                  <tr key={idx} className="border-t border-gray-50 dark:border-gray-800/50 group hover:bg-gray-50/50 dark:hover:bg-gray-800/20 transition-colors">
                    <td className="px-2 py-1.5">
                      <input type="text" value={med.name} onChange={e => updateMedicine(idx, 'name', e.target.value)}
                        placeholder="Medicine name"
                        className="w-full px-2 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-base leading-6 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-violet-200" />
                    </td>
                    <td className="px-2 py-1.5">
                      <input type="text" value={med.dosage} onChange={e => updateMedicine(idx, 'dosage', e.target.value)}
                        placeholder="Dose"
                        className="w-24 px-2 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-base leading-6 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-violet-200" />
                    </td>
                    <td className="px-2 py-1.5">
                      <select value={med.frequency} onChange={e => updateMedicine(idx, 'frequency', e.target.value)}
                        className="w-24 px-2 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-base leading-6 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-violet-200">
                        <option value="">—</option>
                        {FREQUENCY_OPTIONS.map(opt => (
                          <option key={opt} value={opt}>{freqShort[opt] || opt}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <select value={med.duration} onChange={e => updateMedicine(idx, 'duration', e.target.value)}
                        className="w-24 px-2 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-base leading-6 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-violet-200">
                        <option value="">—</option>
                        {DURATION_OPTIONS.map(d => (
                          <option key={d} value={`${d} days`}>{d}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <select value={med.timing || 'after'} onChange={e => updateMedicine(idx, 'timing', e.target.value)}
                        className="w-28 px-2 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-base leading-6 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-violet-200">
                        {TIMING_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label === 'After meal' ? 'After' : 'Before'}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <input type="number" min="0" value={med.rate ?? ''} onChange={e => updateMedicine(idx, 'rate', e.target.value)}
                        placeholder="0"
                        className="w-20 px-2 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-base leading-6 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-violet-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                    </td>
                    <td className="px-2 py-1">
                      <button type="button" onClick={() => removeMedicine(idx)}
                        className="p-0.5 text-gray-300 dark:text-gray-600 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Stacked Layout */}
          <div className="md:hidden space-y-3">
            {form.medicines.map((med, idx) => (
              <div key={idx} className="bg-gray-50 dark:bg-gray-800/30 border border-gray-100 dark:border-gray-800 rounded-xl p-3.5 space-y-3 relative">
                {/* Header: Medicine Name & Delete */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold text-violet-500 uppercase tracking-wider">Medicine #{idx + 1}</span>
                  <button type="button" onClick={() => removeMedicine(idx)}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Name</label>
                  <input type="text" value={med.name} onChange={e => updateMedicine(idx, 'name', e.target.value)}
                    placeholder="Medicine name"
                    className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-violet-200" />
                </div>

                {/* Grid for parameters */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Dose</label>
                    <input type="text" value={med.dosage} onChange={e => updateMedicine(idx, 'dosage', e.target.value)}
                      placeholder="Dose"
                      className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-violet-200" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Frequency</label>
                    <select value={med.frequency} onChange={e => updateMedicine(idx, 'frequency', e.target.value)}
                      className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-violet-200">
                      <option value="">—</option>
                      {FREQUENCY_OPTIONS.map(opt => (
                        <option key={opt} value={opt}>{freqShort[opt] || opt}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Duration</label>
                    <select value={med.duration} onChange={e => updateMedicine(idx, 'duration', e.target.value)}
                      className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-violet-200">
                      <option value="">—</option>
                      {DURATION_OPTIONS.map(d => (
                        <option key={d} value={`${d} days`}>{d} days</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Timing</label>
                    <select value={med.timing || 'after'} onChange={e => updateMedicine(idx, 'timing', e.target.value)}
                      className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-violet-200">
                      {TIMING_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Rate (₹)</label>
                  <input type="number" min="0" value={med.rate ?? ''} onChange={e => updateMedicine(idx, 'rate', e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-violet-200" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Custom add button */}
      <div className="flex items-center gap-2 pt-1">
        <button type="button" onClick={addMedicine}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-base font-semibold leading-6 rounded-lg border border-violet-200 dark:border-violet-700 bg-white dark:bg-gray-800 text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-all active:scale-95">
          <Plus className="w-3 h-3" /> Custom Medicine
        </button>
      </div>
    </div>
  );
}
