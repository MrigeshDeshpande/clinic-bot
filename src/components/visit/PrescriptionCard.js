import React from 'react';
import { Pill, FileText, X, Plus, Search, Trash2 } from 'lucide-react';

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
    TIMING_OPTIONS
  } = prescriptionProps;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-6 shadow-sm">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="p-1.5 rounded-lg bg-violet-50 dark:bg-violet-900/30"><Pill className="w-4 h-4 text-violet-500 dark:text-violet-400" /></div>
        <h2 className="font-bold text-gray-900 dark:text-gray-100 text-lg">Prescribed Medicines</h2>
        <span className="text-xs text-gray-500 dark:text-gray-400 font-normal">Tap a salt to add</span>
      </div>

      {/* Rx Presets */}
      <div className="flex flex-wrap items-center gap-2 mb-4 bg-gray-50 dark:bg-gray-800/50 p-2 rounded-lg border border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-1.5 px-2 text-xs font-medium text-gray-500 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
          <FileText className="w-3.5 h-3.5" /> Presets
        </div>
        
        <div className="flex flex-wrap gap-1.5 flex-1 items-center">
          {rxTemplates.map(tpl => (
            <div key={tpl.id} className="relative group flex items-center">
              <button type="button" onClick={() => loadRxTemplate(tpl)}
                className="px-2.5 py-1 text-xs font-medium bg-white dark:bg-gray-800 border border-violet-200 dark:border-violet-800/50 text-violet-700 dark:text-violet-300 rounded hover:bg-violet-50 dark:hover:bg-violet-900/30 transition-all rounded-r-none border-r-0">
                {tpl.name}
              </button>
              <button type="button" onClick={() => deleteRxTemplate(tpl.id)}
                className="px-1.5 py-1 text-xs bg-white dark:bg-gray-800 border border-violet-200 dark:border-violet-800/50 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all rounded-l-none border-l-0 rounded">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>

        {!showRxTemplateInput ? (
          <button type="button" onClick={() => setShowRxTemplateInput(true)} disabled={form.medicines.length === 0 && form.adviceSelected.length === 0}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20 hover:bg-violet-100 dark:hover:bg-violet-900/40 rounded transition-all disabled:opacity-50 disabled:cursor-not-allowed">
            <Plus className="w-3.5 h-3.5" /> Save Current
          </button>
        ) : (
          <div className="flex items-center gap-1.5">
            <input type="text" value={rxTemplateName} onChange={e => setRxTemplateName(e.target.value)}
              placeholder="Preset name..." autoFocus
              className="w-32 px-2 py-1 text-xs bg-white dark:bg-gray-800 border border-violet-300 dark:border-violet-700 rounded focus:outline-none focus:ring-2 focus:ring-violet-200 dark:focus:ring-violet-800" />
            <button type="button" onClick={saveRxTemplate}
              className="px-2 py-1 text-xs font-medium text-white bg-violet-600 hover:bg-violet-700 rounded transition-colors">
              Save
            </button>
            <button type="button" onClick={() => setShowRxTemplateInput(false)}
              className="p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Salt search */}
      <div className="relative mb-3">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
        <input type="text" value={saltSearch} onChange={e => setSaltSearch(e.target.value)}
          placeholder="Search salts..."
          className="w-full pl-8 pr-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-200 dark:focus:ring-violet-800 transition-all placeholder-gray-400" />
        {saltSearch && (
          <button type="button" onClick={() => setSaltSearch('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Salt chips grid */}
      <div className="flex flex-wrap gap-1.5 mb-4 max-h-[180px] overflow-y-auto">
        {filteredSalts.map(salt => {
          const isSelected = form.medicines.some(m => m.name === salt);
          return (
            <button key={salt} type="button" onClick={() => toggleSalt(salt)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all active:scale-95 ${
                isSelected
                  ? 'bg-violet-100 dark:bg-violet-900/40 border-violet-300 dark:border-violet-600 text-violet-800 dark:text-violet-200 ring-1 ring-violet-200 dark:ring-violet-700'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-violet-200 dark:hover:border-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/20'
              }`}>
              {salt}
              {isSelected && <span className="ml-1">✓</span>}
            </button>
          );
        })}
        {filteredSalts.length === 0 && saltSearch && (
          <p className="text-xs text-gray-400 dark:text-gray-500 py-2">No salts match &quot;{saltSearch}&quot;</p>
        )}
      </div>

      {/* Custom salt input */}
      <div className="mb-4">
        <button type="button" onClick={addMedicine}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/30 rounded-xl hover:bg-violet-100 dark:hover:bg-violet-900/50 transition-all active:scale-95">
          <Plus className="w-3 h-3" /> Add custom medicine
        </button>
      </div>

      {/* Selected medicines rows */}
      {form.medicines.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-4 italic">Tap a salt above or add a custom medicine</p>
      ) : (
        <div className="space-y-2.5">
          {form.medicines.map((med, idx) => (
            <div key={idx} className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-3.5 border border-gray-100 dark:border-gray-700 relative group">
              <button type="button" onClick={() => removeMedicine(idx)}
                className="absolute -top-2 -right-2 w-6 h-6 bg-white dark:bg-gray-800 rounded-full border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-700 transition-all opacity-0 group-hover:opacity-100 shadow-sm">
                <Trash2 className="w-3 h-3" />
              </button>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
                <div className="md:col-span-1">
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Medicine</label>
                  <input type="text" value={med.name} onChange={e => updateMedicine(idx, 'name', e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 transition-all"
                    placeholder="e.g. Amoxicillin" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Dosage</label>
                  <input type="text" value={med.dosage} onChange={e => updateMedicine(idx, 'dosage', e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 transition-all"
                    placeholder="e.g. 500mg" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Frequency</label>
                  <select value={med.frequency} onChange={e => updateMedicine(idx, 'frequency', e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 transition-all appearance-none">
                    <option value="">Select</option>
                    {FREQUENCY_OPTIONS.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Duration</label>
                  <select value={med.duration} onChange={e => updateMedicine(idx, 'duration', e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 transition-all appearance-none">
                    <option value="">Select</option>
                    {DURATION_OPTIONS.map(d => (
                      <option key={d} value={`${d} days`}>{d} days</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">When</label>
                  <select value={med.timing || 'after'} onChange={e => updateMedicine(idx, 'timing', e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 transition-all appearance-none">
                    {TIMING_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
