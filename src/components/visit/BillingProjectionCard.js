import React from 'react';
import { Stethoscope, X, Trash2, Lightbulb } from 'lucide-react';

export default function BillingProjectionCard({ billingProjectionProps }) {
  const {

    setShowTemplateLoad,
    setShowTemplateInput,
    showTemplateInput,
    templateName,
    setTemplateName,
    saveTemplate,
    showTemplateLoad,
    templates,
    loadTemplate,
    deleteTemplate,
    symptomInput,
    setSymptomInput,
    showSuggestions,
    setShowSuggestions,
    suggestions,
    toggleTreatment,
    TREATMENTS,
    selectedTreatments,
    addCustomTreatment,
    errors,
    treatmentFees,
    adjustTreatmentFee,
    TREATMENT_STEP,
    form,
    setForm,
    totalFees,
    paymentStatus,
    setPaymentStatus,
    paidAmount,
    setPaidAmount,
    paymentMethod,
    setPaymentMethod,
    transactionId,
    setTransactionId,
    PAYMENT_METHODS,
    upiDeepLink,
    sendPaymentLink,
    sendingPaymentLink,
    patientProfile,
    appointmentMeta,
    withPhonePrefix,
    consultationFee,
    setConsultationFee,
    CONSULTATION_STEP
  } = billingProjectionProps;

  return (
    <div className="flex flex-col lg:flex-row rounded-3xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
      {/* LEFT PAGE — Treatments */}
      <div className="lg:w-1/2 px-6 py-5 border-b lg:border-b-0 lg:border-r border-gray-100 dark:border-gray-800 relative">
        {/* Page corner fold */}
        <div className="absolute -right-px top-0 w-3 h-3 bg-gradient-to-br from-transparent via-gray-50 dark:via-gray-800 to-gray-100 dark:to-gray-700 rounded-bl-sm" />

        <div className="flex items-center gap-2 mb-4">
          <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/30"><Stethoscope className="w-4 h-4 text-emerald-500 dark:text-emerald-400" /></div>
          <h2 className="font-bold text-gray-900 dark:text-gray-100 text-lg">Treatments</h2>
          <div className="ml-auto flex items-center gap-1">
            <button type="button" onClick={() => setShowTemplateLoad(true)} title="Load template"
              className="p-1.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:text-emerald-500 dark:hover:text-emerald-400 hover:border-emerald-200 dark:hover:border-emerald-700 transition-all">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            </button>
            <button type="button" onClick={() => { setShowTemplateInput(true); setShowTemplateLoad(false); }} title="Save as template"
              className="p-1.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:text-amber-500 dark:hover:text-amber-400 hover:border-amber-200 dark:hover:border-amber-700 transition-all">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
            </button>
          </div>
        </div>

        {/* Save template input */}
        {showTemplateInput && (
          <div className="mb-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-700">
            <div className="flex gap-2">
              <input type="text" value={templateName} onChange={e => setTemplateName(e.target.value)}
                placeholder="Template name..."
                className="flex-1 px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-200 dark:focus:ring-amber-800 transition-all placeholder-gray-400"
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveTemplate(); } }} />
              <button type="button" onClick={saveTemplate}
                className="px-3 py-1.5 text-xs font-medium bg-amber-100 dark:bg-amber-800 text-amber-800 dark:text-amber-200 rounded-lg hover:bg-amber-200 dark:hover:bg-amber-700 transition-all">Save</button>
              <button type="button" onClick={() => { setShowTemplateInput(false); setTemplateName(''); }}
                className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-all">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Load template */}
        {showTemplateLoad && (
          <div className="mb-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-blue-700 dark:text-blue-300">Load Template</span>
              <button type="button" onClick={() => setShowTemplateLoad(false)}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-all">
                <X className="w-3 h-3" />
              </button>
            </div>
            {templates.length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-3">No saved templates</p>
            ) : (
              <div className="space-y-1 max-h-[200px] overflow-y-auto">
                {templates.map(t => (
                  <div key={t.id} className="flex items-center justify-between px-2 py-1.5 bg-white dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700">
                    <span className="text-xs text-gray-700 dark:text-gray-300">{t.name}</span>
                    <div className="flex gap-1">
                      <button type="button" onClick={() => loadTemplate(t)}
                        className="px-2 py-0.5 text-xs font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-all">Apply</button>
                      <button type="button" onClick={() => deleteTemplate(t.id)}
                        className="p-0.5 text-gray-400 hover:text-red-500 transition-all">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Symptom-based treatment suggestion */}
        <div className="mb-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Lightbulb className="w-3 h-3 text-amber-500" />
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Describe symptoms</span>
          </div>
          <div className="relative">
            <input type="text" value={symptomInput}
              onChange={e => setSymptomInput(e.target.value)}
              placeholder="e.g. tooth pain, bleeding gums..."
              className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-200 dark:focus:ring-amber-800 focus:border-amber-400 dark:focus:border-amber-500 transition-all placeholder-gray-400 dark:placeholder-gray-500" />
            {showSuggestions && (
              <div className="absolute z-20 mt-1 w-full bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg overflow-hidden">
                {suggestions.map(s => (
                  <button key={s.id} type="button"
                    onClick={() => { toggleTreatment(s.name); setSymptomInput(''); setShowSuggestions(false); }}
                    className="w-full text-left px-3 py-2 hover:bg-amber-50 dark:hover:bg-amber-900/20 border-b border-gray-50 dark:border-gray-700 last:border-0 transition-colors flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center text-xs font-semibold text-amber-700 dark:text-amber-300 shrink-0">
                      <Lightbulb className="w-3 h-3" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-gray-900 dark:text-gray-100">{s.name}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">{s.symptom}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2.5">Tap treatments to add — select all that apply</p>

        <div className="space-y-1 max-h-[300px] overflow-y-auto pr-1">
          {TREATMENTS.map(t => {
            const isSelected = selectedTreatments.includes(t.id);
            return (
              <button key={t.id} type="button" onClick={() => toggleTreatment(t.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-all active:scale-[0.98] ${
                  isSelected
                    ? 'bg-emerald-50 dark:bg-emerald-900/25 border-emerald-200 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 ring-1 ring-emerald-200 dark:ring-emerald-700'
                    : 'bg-white dark:bg-gray-800/50 border-gray-150 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-emerald-200 dark:hover:border-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-900/40'
                }`}>
                <span className="text-base shrink-0 w-5 text-center">🩺</span>
                <span className="text-left truncate">{t.name}</span>
                {t.defaultFee > 0 && (
                  <span className={`ml-auto text-xs font-semibold shrink-0 ${isSelected ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 dark:text-gray-500'}`}>
                    ₹{t.defaultFee}
                  </span>
                )}
                {isSelected && (
                  <svg className="w-3 h-3 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            );
          })}
          <button type="button" onClick={addCustomTreatment}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border border-dashed border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500 hover:border-gray-400 dark:hover:border-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-all">
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add custom treatment
          </button>
        </div>

        {errors.treatment && (
          <p className="text-xs text-red-500 dark:text-red-400 mt-2">⚠ {errors.treatment}</p>
        )}
        {selectedTreatments.length > 0 && (
          <div className="mt-2.5 pt-2 border-t border-gray-100 dark:border-gray-800">
            <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
              {selectedTreatments.length} treatment{selectedTreatments.length > 1 ? 's' : ''} selected
            </p>
          </div>
        )}
      </div>

      {/* RIGHT PAGE — Bill Details */}
      <div className="lg:w-1/2 px-6 py-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/30">
            <svg className="w-4 h-4 text-emerald-500 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <h2 className="font-semibold text-gray-900 dark:text-gray-100 text-lg">Bill Details</h2>
        </div>

        <div className="space-y-2.5">
          {/* Consultation Fee */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-600 dark:text-gray-300">Consultation</span>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => adjustConsultation(-CONSULTATION_STEP)} disabled={consultationFee <= 0}
                className="w-5 h-5 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-200 transition-all flex items-center justify-center text-xs font-medium active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed shrink-0">−</button>
              <div className="relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 dark:text-gray-400">₹</span>
                <input type="number" min="0" value={consultationFee}
                  onChange={e => setConsultationFee(Math.max(0, Number(e.target.value) || 0))}
                  className="w-24 pl-5 pr-2 py-1.5 text-sm text-center font-medium text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-200 dark:focus:ring-emerald-800 focus:border-emerald-400 dark:focus:border-emerald-500 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
              </div>
              <button type="button" onClick={() => adjustConsultation(CONSULTATION_STEP)}
                className="w-5 h-5 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-200 transition-all flex items-center justify-center text-xs font-medium active:scale-90 shrink-0">+</button>
            </div>
          </div>

          {/* Selected Treatments */}
          {selectedTreatments.length === 0 ? (
            <div className="py-3 text-center">                      <p className="text-xs text-gray-500 dark:text-gray-400 italic">No treatments selected yet</p>
            </div>
          ) : (
            <div className="max-h-[200px] overflow-y-auto space-y-1.5 pr-0.5">
              {selectedTreatments.map(key => {
                const item = treatmentFees[key];
                const displayName = item.quantity > 1 ? `${item.label} ×${item.quantity}` : item.label;
                return (
                <div key={key} className="flex items-center justify-between py-0.5">
                  <div className="flex items-center gap-1.5 truncate max-w-[140px]">
                    <span className="text-xs text-gray-700 dark:text-gray-300 truncate" title={displayName}>{displayName}</span>
                    {item.source === 'auto' && (
                      <span className="text-xs font-medium px-1 py-0.5 bg-blue-50 text-blue-500 rounded border border-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800/50" title="Auto-added from chart">Auto</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button type="button" onClick={() => adjustTreatmentFee(key, -TREATMENT_STEP)} disabled={(item.amount || 0) <= 0}
                      className="w-5 h-5 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-200 transition-all flex items-center justify-center text-xs font-medium active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed shrink-0">−</button>
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 dark:text-gray-400">₹</span>
                      <input type="number" min="0" value={item.amount || 0}
                        onChange={e => adjustTreatmentFee(key, (Number(e.target.value) || 0) - (item.amount || 0))}
                        className="w-24 pl-5 pr-2 py-1.5 text-sm text-center font-medium text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-200 dark:focus:ring-emerald-800 focus:border-emerald-400 dark:focus:border-emerald-500 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                    </div>
                    <button type="button" onClick={() => adjustTreatmentFee(key, TREATMENT_STEP)}
                      className="w-5 h-5 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-200 transition-all flex items-center justify-center text-xs font-medium active:scale-90 shrink-0">+</button>
                  </div>
                </div>
              )})}
            </div>
          )}

          <div className="border-t border-gray-100 dark:border-gray-800" />

          {/* Medicine Charges */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-600 dark:text-gray-300">Medicines ({form.medicines?.filter(m => m.name).length || 0})</span>
            <div className="relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 dark:text-gray-400">₹</span>
              <input type="number" min="0" value={form.medicineCharges} onChange={e => setForm(f => ({ ...f, medicineCharges: e.target.value }))}
                className="w-24 pl-5 pr-2 py-1.5 text-sm text-center font-medium text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-200 dark:focus:ring-emerald-800 focus:border-emerald-400 dark:focus:border-emerald-500 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                placeholder="0" />
            </div>
          </div>

          {/* Total */}
          <div className="flex items-center justify-between pt-2 border-t-2 border-gray-200 dark:border-gray-700">
            <span className="text-base font-bold text-gray-900 dark:text-gray-100">Total</span>
            <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">₹{totalFees.toLocaleString('en-IN')}</span>
          </div>

          {/* Payment — compact */}
          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1 rounded-lg bg-emerald-50 dark:bg-emerald-900/30">
                <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
              </div>
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Payment</span>
            </div>

            <div className="flex items-center gap-1.5 mb-2">
              <button type="button" onClick={() => { setPaymentStatus('paid'); setPaidAmount(totalFees); if (!paymentMethod) setPaymentMethod('cash'); }}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                  paymentStatus === 'paid'
                    ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-300 dark:border-emerald-600 text-emerald-700 dark:text-emerald-300'
                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-emerald-200'
                }`}>
                <span className="flex items-center justify-center gap-1">{'\u2713'} Paid</span>
              </button>
              <button type="button" onClick={() => { setPaymentStatus('partial'); setPaidAmount(paidAmount || Math.round(totalFees / 2)); if (!paymentMethod) setPaymentMethod('cash'); }}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                  paymentStatus === 'partial'
                    ? 'bg-orange-50 dark:bg-orange-900/30 border-orange-300 dark:border-orange-600 text-orange-700 dark:text-orange-300'
                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-orange-200'
                }`}>
                <span className="flex items-center justify-center gap-1">{'\u00BD'} Partial</span>
              </button>
              <button type="button" onClick={() => setPaymentStatus('pending')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                  paymentStatus === 'pending'
                    ? 'bg-amber-50 dark:bg-amber-900/30 border-amber-300 dark:border-amber-600 text-amber-700 dark:text-amber-300'
                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-amber-200'
                }`}>
                <span className="flex items-center justify-center gap-1">{'\u23F3'} Pending</span>
              </button>
            </div>

            {(paymentStatus === 'paid' || paymentStatus === 'partial') && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5">Amount Paid</label>
                    <input type="number" value={paidAmount} onChange={e => setPaidAmount(Number(e.target.value) || 0)}
                      min={0} max={totalFees}
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-200 dark:focus:ring-emerald-800 transition-all placeholder-gray-400" />
                  </div>
                  {paidAmount < totalFees && (
                    <div className="flex-shrink-0 text-right">
                      <div className="text-xs text-gray-400 dark:text-gray-500">Due</div>
                      <div className="text-xs font-semibold text-red-500 dark:text-red-400">₹{(totalFees - paidAmount).toLocaleString('en-IN')}</div>
                    </div>
                  )}
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {PAYMENT_METHODS.map(m => (
                    <button key={m.value} type="button" onClick={() => setPaymentMethod(m.value)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                        paymentMethod === m.value
                          ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-300 dark:border-emerald-600 text-emerald-700 dark:text-emerald-300'
                          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300'
                      }`}>
                      {m.icon} {m.label}
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <input type="text" value={transactionId} onChange={e => setTransactionId(e.target.value)}
                    placeholder="Transaction ID / ref (optional)"
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-200 dark:focus:ring-emerald-800 transition-all placeholder-gray-400" />
                </div>
                {paymentMethod === 'upi' && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const url = upiDeepLink(paidAmount || totalFees, transactionId || Date.now().toString(36), `${form.patientName} ${form.diagnosis?.slice(0, 30) || ''}`);
                        window.open(url, '_blank', 'noopener,noreferrer');
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium rounded-lg border border-blue-200 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-all">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                      UPI Link
                    </button>
                    <span className="text-xs text-gray-400 dark:text-gray-500">Opens UPI app</span>
                  </div>
                )}
              </div>
            )}

            {(paymentStatus === 'pending' || paymentStatus === 'partial') && paidAmount < totalFees && (patientProfile?.phone || appointmentMeta?.patient_phone || withPhonePrefix(form.patientPhone)) && (
              <div className="mb-2">
                <button type="button" onClick={sendPaymentLink} disabled={sendingPaymentLink}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-xs font-medium rounded-lg border border-green-200 dark:border-green-700 hover:bg-green-100 dark:hover:bg-green-900/50 transition-all disabled:opacity-50">
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                {sendingPaymentLink ? 'Sending...' : `Send UPI Link on WhatsApp${paymentStatus === 'partial' ? ' (Due ₹' + (totalFees - paidAmount).toLocaleString('en-IN') + ')' : ''}`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  </div>
  );
}
