'use client';

import { useState, useEffect, useContext, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ToastContext } from '../layout';
import { Settings, Stethoscope, FileText, ClipboardCheck, Star, Plus, Trash2, Save, Image, Palette, CheckSquare, Languages, AlertTriangle, Pill, Search, ChevronDown, RotateCcw } from 'lucide-react';
import { CATEGORIES, TREATMENTS, getTreatmentName } from '@/lib/treatments';

const MEDICINE_CATEGORIES = {
  antibiotics: { label: 'Antibiotics', salts: ['Amoxicillin', 'Amoxicillin + Clavulanic Acid', 'Azithromycin', 'Cefixime', 'Ceftriaxone Injection', 'Cefuroxime', 'Cephalexin', 'Ciprofloxacin', 'Clindamycin', 'Doxycycline', 'Erythromycin', 'Metronidazole', 'Penicillin V', 'Tetracycline', 'Mouthwash - Chlorhexidine', 'Mouthwash - Povidone Iodine'] },
  painkillers: { label: 'Painkillers / NSAIDs', salts: ['Aceclofenac', 'Combiflam (Ibuprofen + Paracetamol)', 'Diclofenac', 'Gabapentin', 'Ibuprofen', 'Ketorolac', 'Ketorolac Injection', 'Lornoxicam', 'Mefenamic Acid', 'Naproxen', 'Paracetamol', 'Paracetamol + Diclofenac Combination', 'Pregabalin'] },
  corticosteroids: { label: 'Corticosteroids', salts: ['Betamethasone', 'Dexamethasone', 'Prednisolone', 'Triamcinolone Acetonide', 'Triamcinolone Ointment'] },
  anaesthetics: { label: 'Anaesthetics', salts: ['Articaine', 'Bupivacaine', 'Lignocaine', 'Lignocaine Gel', 'Lignocaine Spray', 'Lignocaine with Adrenaline', 'Mepivacaine'] },
  antifungals: { label: 'Antifungals', salts: ['Amphotericin B Oral Suspension', 'Clotrimazole Gel', 'Clotrimazole Mouth Paint', 'Fluconazole', 'Itraconazole', 'Miconazole Gel', 'Nystatin Oral Suspension'] },
  antivirals: { label: 'Antivirals', salts: ['Acyclovir', 'Acyclovir Cream', 'Valacyclovir'] },
  analgesics: { label: 'Analgesics', salts: ['Codeine Phosphate', 'Tramadol'] },
  gi: { label: 'Antacids / GI', salts: ['Domperidone', 'Metoclopramide', 'Omeprazole', 'Ondansetron', 'Pantoprazole', 'Ranitidine'] },
  vitamins: { label: 'Vitamins / Supplements', salts: ['Calcium + Vitamin D3', 'Iron + Folic Acid', 'Multivitamin Tablet', 'Vitamin B Complex', 'Vitamin C', 'Vitamin D3', 'Zinc'] },
  sedatives: { label: 'Sedatives', salts: ['Alprazolam', 'Diazepam', 'Ketamine', 'Lorazepam', 'Midazolam', 'Nitrous Oxide'] },
  hemostatics: { label: 'Hemostatics', salts: ['Tranexamic Acid', 'Tranexamic Acid Injection'] },
  mouthwashes_topical: { label: 'Mouthwashes / Topical', salts: ['Benzocaine Gel', 'Chlorhexidine Mouthwash', 'Choline Salicylate Gel (Bonjela)', 'Hydrogen Peroxide Mouthwash', 'Metronidazole Gel', 'Saline Mouthwash', 'Triamcinolone Oral Paste'] },
  other_dental: { label: 'Other Dental', salts: ['Calcium Hydroxide Paste', 'Desensitizing Paste', 'Fluoride Varnish', 'Formocresol', 'MTA (Mineral Trioxide Aggregate)', 'Potassium Nitrate Gel', 'Sensodyne Toothpaste', 'Sodium Fluoride Gel', 'Tetracycline Ointment', 'Zinc Oxide Eugenol Paste'] },
};

const TABS = [
  { id: 'clinic', label: 'Clinic', icon: Settings },
  { id: 'doctor', label: 'Doctor', icon: Stethoscope },
  { id: 'prescription', label: 'Prescription', icon: FileText },
  { id: 'treatments', label: 'Treatments', icon: Star },
  { id: 'checklists', label: 'Checklists', icon: ClipboardCheck },
  { id: 'medicines', label: 'Medicines', icon: Pill },
];

const DEFAULT_COLOR = '#0d1b2a';
const DEFAULT_ACCENT = '#3a86c8';

export default function SettingsPage() {
  const { showToast } = useContext(ToastContext);
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('clinic');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [medicineSearch, setMedicineSearch] = useState('');
  const [openCategories, setOpenCategories] = useState(new Set(Object.keys(MEDICINE_CATEGORIES)));
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customMedicineName, setCustomMedicineName] = useState('');
  const [customMedicineCategory, setCustomMedicineCategory] = useState('other_dental');
  const [editingTemplate, setEditingTemplate] = useState(null);
  const customInputRef = useRef(null);
  const [settings, setSettings] = useState({
    clinic: { subtitle: '', email: '', instagram: '', timing_mon_sat: '', timing_sun: '' },
    doctor: { qualifications: '', registration: '', designation: '' },
    prescription: { primary_color: DEFAULT_COLOR, accent_color: DEFAULT_ACCENT, watermark_text: '', show_watermark: true, font_size: 10, show_rx: true, generic_substitution: true, border_enabled: true },
    checklists: { diagnosis: [], treatments_hindi: [], treatments_english: [], advice: [] },
    treatments: { favorites: [], recent: [], hidden: [], custom: [], feeOverrides: {} },
    google_maps: { review_url: '' },
    medicines: { salts: {}, custom: [], usage: {}, templates: [] },
  });

  useEffect(() => {
    fetch('/api/dashboard/settings')
      .then(r => r.json())
      .then(data => {
        if (data.settings) {
          setSettings(prev => {
            const merged = { ...prev };
            for (const [key, value] of Object.entries(data.settings)) {
              if (merged[key] && typeof merged[key] === 'object' && !Array.isArray(merged[key])) {
                merged[key] = { ...merged[key], ...value };
              } else {
                merged[key] = value;
              }
            }
            return merged;
          });
        }
      })
      .catch(() => showToast('Failed to load settings', 'error'))
      .finally(() => setLoading(false));
  }, []);

  async function saveSettings(key) {
    setSaving(true);
    try {
      const res = await fetch('/api/dashboard/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: settings[key] }),
      });
      if (res.ok) {
        showToast(`${key.charAt(0).toUpperCase() + key.slice(1)} settings saved`, 'success');
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to save', 'error');
      }
    } catch {
      showToast('Network error', 'error');
    }
    setSaving(false);
  }

  function updateSetting(key, field, value) {
    setSettings(prev => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
  }

  function addListItem(key, field) {
    setSettings(prev => {
      const list = [...(prev[key][field] || [])];
      list.push('');
      return { ...prev, [key]: { ...prev[key], [field]: list } };
    });
  }

  function updateListItem(key, field, index, value) {
    setSettings(prev => {
      const list = [...(prev[key][field] || [])];
      list[index] = value;
      return { ...prev, [key]: { ...prev[key], [field]: list } };
    });
  }

  function toggleFavorite(treatmentId) {
    setSettings(prev => {
      const favs = [...(prev.treatments?.favorites || [])];
      const idx = favs.indexOf(treatmentId);
      if (idx >= 0) {
        favs.splice(idx, 1);
      } else {
        favs.push(treatmentId);
      }
      return { ...prev, treatments: { ...prev.treatments, favorites: favs } };
    });
  }

  function updateFeeOverride(treatmentId, value) {
    setSettings(prev => {
      const fee = Math.max(0, Number(value) || 0);
      const overrides = { ...(prev.treatments?.feeOverrides || {}) };
      const t = TREATMENTS.find(t => t.id === treatmentId);
      if (t && fee === t.defaultFee) {
        delete overrides[treatmentId];
      } else if (fee > 0) {
        overrides[treatmentId] = fee;
      } else {
        delete overrides[treatmentId];
      }
      return { ...prev, treatments: { ...prev.treatments, feeOverrides: overrides } };
    });
  }

  function addCustomTreatment() {
    const id = 'custom-' + Date.now();
    setSettings(prev => ({
      ...prev,
      treatments: {
        ...prev.treatments,
        custom: [...(prev.treatments?.custom || []), { id, name: '', fee: 0, category: 'restorative' }],
      },
    }));
  }

  function updateCustomTreatment(index, field, value) {
    setSettings(prev => {
      const list = [...(prev.treatments?.custom || [])];
      if (!list[index]) return prev;
      list[index] = { ...list[index], [field]: value };
      return { ...prev, treatments: { ...prev.treatments, custom: list } };
    });
  }

  function removeCustomTreatment(index) {
    setSettings(prev => {
      const list = [...(prev.treatments?.custom || [])];
      const removed = list[index];
      list.splice(index, 1);
      const favs = (prev.treatments?.favorites || []).filter(id => id !== removed?.id);
      const overrides = { ...(prev.treatments?.feeOverrides || {}) };
      delete overrides[removed?.id];
      return {
        ...prev,
        treatments: { ...prev.treatments, custom: list, favorites: favs, feeOverrides: overrides },
      };
    });
  }

  function toggleMedicine(name) {
    setSettings(prev => {
      const salts = { ...(prev.medicines?.salts || {}) };
      if (salts[name]) {
        salts[name] = { ...salts[name], enabled: !salts[name].enabled };
      }
      return { ...prev, medicines: { ...prev.medicines, salts } };
    });
  }

  function setCategoryEnabled(category, enabled) {
    setSettings(prev => {
      const salts = { ...(prev.medicines?.salts || {}) };
      const defaultSalts = MEDICINE_CATEGORIES[category]?.salts || [];
      const customNames = (prev.medicines?.custom || [])
        .filter(s => (typeof s === 'string' ? null : s.category === category))
        .map(s => s.name);
      for (const name of [...defaultSalts, ...customNames]) {
        if (salts[name]) {
          salts[name] = { ...salts[name], enabled };
        }
      }
      return { ...prev, medicines: { ...prev.medicines, salts } };
    });
  }

  function addCustomMedicine(name, category) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSettings(prev => ({
      ...prev,
      medicines: {
        ...prev.medicines,
        salts: { ...prev.medicines?.salts, [trimmed]: { category, enabled: true } },
        custom: [...(prev.medicines?.custom || []), { name: trimmed, category }],
      },
    }));
  }

  function removeCustomMedicine(name) {
    setSettings(prev => {
      const salts = { ...(prev.medicines?.salts || {}) };
      delete salts[name];
      return {
        ...prev,
        medicines: {
          ...prev.medicines,
          salts,
          custom: (prev.medicines?.custom || []).filter(s => (typeof s === 'string' ? s : s.name) !== name),
        },
      };
    });
  }

  function resetMedicines() {
    const salts = {};
    for (const [, cat] of Object.entries(MEDICINE_CATEGORIES)) {
      for (const name of cat.salts) {
        salts[name] = { category: Object.entries(MEDICINE_CATEGORIES).find(([, v]) => v.salts.includes(name))?.[0] || 'other_dental', enabled: true };
      }
    }
    setSettings(prev => ({ ...prev, medicines: { salts, custom: [], usage: {}, templates: [] } }));
    showToast('Medicines reset to defaults', 'success');
  }

  function updateTemplateField(tplId, field, value) {
    setSettings(prev => ({
      ...prev,
      medicines: {
        ...prev.medicines,
        templates: (prev.medicines?.templates || []).map(t => t.id === tplId ? { ...t, [field]: value } : t),
      },
    }));
  }

  function addTemplateMedicine(tplId) {
    setSettings(prev => ({
      ...prev,
      medicines: {
        ...prev.medicines,
        templates: (prev.medicines?.templates || []).map(t => t.id === tplId
          ? { ...t, medicines: [...t.medicines, { name: '', dosage: '', frequency: '', duration: '', timing: 'after' }] }
          : t),
      },
    }));
  }

  function removeTemplateMedicine(tplId, index) {
    setSettings(prev => ({
      ...prev,
      medicines: {
        ...prev.medicines,
        templates: (prev.medicines?.templates || []).map(t => t.id === tplId
          ? { ...t, medicines: t.medicines.filter((_, i) => i !== index) }
          : t),
      },
    }));
  }

  function updateTemplateMedicine(tplId, medIndex, field, value) {
    setSettings(prev => ({
      ...prev,
      medicines: {
        ...prev.medicines,
        templates: (prev.medicines?.templates || []).map(t => t.id === tplId
          ? { ...t, medicines: t.medicines.map((m, i) => i === medIndex ? { ...m, [field]: value } : m) }
          : t),
      },
    }));
  }

  function removeListItem(key, field, index) {
    setSettings(prev => {
      const list = [...(prev[key][field] || [])];
      list.splice(index, 1);
      return { ...prev, [key]: { ...prev[key], [field]: list } };
    });
  }

  function inputClass() {
    return 'w-full px-3.5 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all';
  }

  function labelClass() {
    return 'text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider';
  }

  function cardClass() {
    return 'bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden';
  }

  function renderTabButton(tab) {
    const Icon = tab.icon;
    return (
      <button key={tab.id} onClick={() => setActiveTab(tab.id)}
        className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl transition-all ${
          activeTab === tab.id
            ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 border border-transparent'
        }`}>
        <Icon className="w-4 h-4" />
        {tab.label}
      </button>
    );
  }

  function renderColorPicker(label, value, field) {
    return (
      <div className="flex items-center gap-3">
        <label className={labelClass()}>{label}</label>
        <div className="flex items-center gap-2">
          <input type="color" value={value} onChange={e => updateSetting(activeTab, field, e.target.value)}
            className="w-9 h-9 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer bg-transparent p-0.5" />
          <input type="text" value={value} onChange={e => updateSetting(activeTab, field, e.target.value)}
            className="w-28 px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 font-mono" />
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100/50 dark:from-gray-950 dark:to-gray-900 flex items-center justify-center">
        <div className="animate-pulse text-gray-400 dark:text-gray-500 text-sm">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100/50 dark:from-gray-950 dark:to-gray-900">
      <div className="p-5 md:p-7 lg:p-10 max-w-5xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-gray-700 to-gray-900 shadow-lg">
            <Settings className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">Settings</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Customize clinic info, doctor details, prescription design & checklists</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 mb-6">
          {TABS.map(renderTabButton)}
        </div>

        {/* ── CLINIC TAB ── */}
        {activeTab === 'clinic' && (
          <div className="space-y-6">
            <div className={cardClass()}>
              <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-gradient-to-r from-gray-50/80 to-blue-50/80 dark:from-gray-800/50 dark:to-blue-900/20">
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Clinic Details</h2>
              </div>
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="md:col-span-2">
                  <label className={labelClass()}>Clinic Tagline / Subtitle</label>
                  <input className={inputClass()} value={settings.clinic.subtitle || ''}
                    onChange={e => updateSetting('clinic', 'subtitle', e.target.value)}
                    placeholder="Advanced Dental Care & Implant Center" />
                </div>
                <div>
                  <label className={labelClass()}>Email</label>
                  <input className={inputClass()} value={settings.clinic.email || ''}
                    onChange={e => updateSetting('clinic', 'email', e.target.value)} placeholder="clinic@email.com" />
                </div>
                <div>
                  <label className={labelClass()}>Instagram Handle</label>
                  <input className={inputClass()} value={settings.clinic.instagram || ''}
                    onChange={e => updateSetting('clinic', 'instagram', e.target.value)} placeholder="shribalaji_adc" />
                </div>
                <div className="md:col-span-2">
                  <label className={labelClass()}>Google Maps Review URL</label>
                  <input className={inputClass()} value={settings.google_maps?.review_url || ''}
                    onChange={e => setSettings(prev => ({ ...prev, google_maps: { ...prev.google_maps, review_url: e.target.value } }))}
                    placeholder="https://g.page/r/your-clinic-review-link" />
                  <p className="text-xs text-gray-400 mt-1">Paste your Google Maps review short link. This will be sent via WhatsApp so patients can leave a review.</p>
                </div>
                <div>
                  <label className={labelClass()}>Timing — Mon–Sat</label>
                  <input className={inputClass()} value={settings.clinic.timing_mon_sat || ''}
                    onChange={e => updateSetting('clinic', 'timing_mon_sat', e.target.value)} placeholder="10:00 AM – 8:00 PM" />
                </div>
                <div>
                  <label className={labelClass()}>Timing — Sunday</label>
                  <input className={inputClass()} value={settings.clinic.timing_sun || ''}
                    onChange={e => updateSetting('clinic', 'timing_sun', e.target.value)} placeholder="10:00 AM – 2:00 PM" />
                </div>
              </div>
              <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex justify-end">
                <button onClick={async () => { await saveSettings('clinic'); await saveSettings('google_maps'); }} disabled={saving}
                  className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-medium rounded-xl hover:bg-gray-800 dark:hover:bg-gray-100 transition-all disabled:opacity-50">
                  <Save className="w-4 h-4" />
                  {saving ? 'Saving...' : 'Save Clinic Settings'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── DOCTOR TAB ── */}
        {activeTab === 'doctor' && (
          <div className="space-y-6">
            <div className={cardClass()}>
              <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-gradient-to-r from-gray-50/80 to-blue-50/80 dark:from-gray-800/50 dark:to-blue-900/20">
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Doctor Information</h2>
              </div>
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className={labelClass()}>Qualifications</label>
                  <input className={inputClass()} value={settings.doctor.qualifications || ''}
                    onChange={e => updateSetting('doctor', 'qualifications', e.target.value)} placeholder="BDS, MOI" />
                </div>
                <div>
                  <label className={labelClass()}>Registration Number</label>
                  <input className={inputClass()} value={settings.doctor.registration || ''}
                    onChange={e => updateSetting('doctor', 'registration', e.target.value)} placeholder="CGDC/G/24/4198" />
                </div>
                <div className="md:col-span-2">
                  <label className={labelClass()}>Designation / Title</label>
                  <input className={inputClass()} value={settings.doctor.designation || ''}
                    onChange={e => updateSetting('doctor', 'designation', e.target.value)}
                    placeholder="Dental Surgeon | Oral Implantologist" />
                </div>
                <div className="md:col-span-2">
                  <label className={labelClass()}>Signature Image</label>
                  <p className="text-xs text-gray-400 mt-1">Upload a scanned signature image to appear on prescriptions</p>
                  <div className="mt-2 flex items-center gap-4">
                    <label className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-all">
                      <Image className="w-4 h-4 text-gray-500" />
                      Upload Signature
                      <input type="file" accept="image/*" className="hidden" />
                    </label>
                    <button className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-all">
                      <Image className="w-4 h-4 text-gray-500" />
                      Upload Stamp
                    </button>
                  </div>
                </div>
              </div>
              <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex justify-end">
                <button onClick={() => saveSettings('doctor')} disabled={saving}
                  className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-medium rounded-xl hover:bg-gray-800 dark:hover:bg-gray-100 transition-all disabled:opacity-50">
                  <Save className="w-4 h-4" />
                  {saving ? 'Saving...' : 'Save Doctor Settings'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── PRESCRIPTION TAB ── */}
        {activeTab === 'prescription' && (
          <div className="space-y-6">
            <div className={cardClass()}>
              <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-gradient-to-r from-gray-50/80 to-blue-50/80 dark:from-gray-800/50 dark:to-blue-900/20">
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Design & Layout</h2>
              </div>
              <div className="p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <label className={labelClass()}>Primary Color</label>
                    <p className="text-xs text-gray-400 mt-0.5">Header and note banner background</p>
                  </div>
                  {renderColorPicker('', settings.prescription.primary_color, 'primary_color')}
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <label className={labelClass()}>Accent Color</label>
                    <p className="text-xs text-gray-400 mt-0.5">Subtitle and highlights</p>
                  </div>
                  {renderColorPicker('', settings.prescription.accent_color, 'accent_color')}
                </div>
                <div>
                  <label className={labelClass()}>Watermark Text</label>
                  <input className={inputClass()} value={settings.prescription.watermark_text || ''}
                    onChange={e => updateSetting('prescription', 'watermark_text', e.target.value)} placeholder="Shri Balaji" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-all">
                    <input type="checkbox" checked={!!settings.prescription.show_watermark}
                      onChange={e => updateSetting('prescription', 'show_watermark', e.target.checked)}
                      className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                    <div>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Show Watermark</span>
                      <p className="text-xs text-gray-400">Faint background watermark on prescription</p>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-all">
                    <input type="checkbox" checked={!!settings.prescription.show_rx}
                      onChange={e => updateSetting('prescription', 'show_rx', e.target.checked)}
                      className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                    <div>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Show Rx Symbol</span>
                      <p className="text-xs text-gray-400">Display the prescription symbol (℞)</p>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-all">
                    <input type="checkbox" checked={!!settings.prescription.generic_substitution}
                      onChange={e => updateSetting('prescription', 'generic_substitution', e.target.checked)}
                      className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                    <div>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Generic Substitution</span>
                      <p className="text-xs text-gray-400">Show &apos;Generic substitution allowed&apos; checkbox</p>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-all">
                    <input type="checkbox" checked={!!settings.prescription.border_enabled}
                      onChange={e => updateSetting('prescription', 'border_enabled', e.target.checked)}
                      className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                    <div>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Page Border</span>
                      <p className="text-xs text-gray-400">Thin decorative border around the page</p>
                    </div>
                  </label>
                </div>
              </div>
              <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex justify-end">
                <button onClick={() => saveSettings('prescription')} disabled={saving}
                  className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-medium rounded-xl hover:bg-gray-800 dark:hover:bg-gray-100 transition-all disabled:opacity-50">
                  <Save className="w-4 h-4" />
                  {saving ? 'Saving...' : 'Save Prescription Settings'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── TREATMENTS TAB ── */}
        {activeTab === 'treatments' && (
          <div className="space-y-6">
            {/* ═══ Favorites + Rate Editor ═══ */}
            <div className={cardClass()}>
              <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-gradient-to-r from-gray-50/80 to-amber-50/80 dark:from-gray-800/50 dark:to-amber-900/20 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">&#9733; Treatments</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Select favorites and adjust default rates. Custom rates are stored per-clinic.</p>
                </div>
                <button onClick={() => saveSettings('treatments')} disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-all disabled:opacity-50">
                  <Save className="w-3 h-3" />
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-[auto_1fr_auto] gap-2 text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 mb-2">
                  <span>Fav</span>
                  <span>Treatment</span>
                  <span>Fee (&#x20B9;)</span>
                </div>
                {CATEGORIES.map(cat => {
                  const catTreatments = TREATMENTS.filter(t => t.category === cat.id);
                  if (catTreatments.length === 0) return null;
                  const favs = settings.treatments?.favorites || [];
                  const overrides = settings.treatments?.feeOverrides || {};
                  return (
                    <div key={cat.id} className="mb-4 last:mb-0">
                      <h3 className="text-base font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-2 ml-1">{cat.label}</h3>
                      <div className="space-y-1">
                        {catTreatments.map(t => {
                          const isFav = favs.includes(t.id);
                          const orderNum = isFav ? favs.indexOf(t.id) + 1 : null;
                          const currentFee = overrides[t.id] ?? t.defaultFee;
                          const isOverridden = overrides[t.id] !== undefined;
                          return (
                            <div
                              key={t.id}
                              className={`grid grid-cols-[auto_1fr_auto] items-center gap-3 px-3 py-2 rounded-xl transition-all ${
                                isFav
                                  ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700'
                                  : 'hover:bg-gray-50 dark:hover:bg-gray-800 border border-transparent'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isFav}
                                onChange={() => toggleFavorite(t.id)}
                                className="rounded border-gray-300 text-amber-500 focus:ring-amber-400 shrink-0"
                              />
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{t.name}</span>
                                {orderNum && (
                                  <span className="text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 rounded-full shrink-0">
                                    #{orderNum}
                                  </span>
                                )}
                              </div>
                              <div className="relative w-24 shrink-0">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">&#x20B9;</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="50"
                                  value={currentFee}
                                  onChange={e => updateFeeOverride(t.id, e.target.value)}
                                  className={`w-full pl-6 pr-2 py-1.5 text-xs text-right font-medium rounded-lg border transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                                    isOverridden
                                      ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200'
                                      : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'
                                  } focus:outline-none focus:ring-2 focus:ring-amber-200 dark:focus:ring-amber-800`}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ═══ Custom Treatments ═══ */}
            <div className={cardClass()}>
              <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-gradient-to-r from-gray-50/80 to-amber-50/80 dark:from-gray-800/50 dark:to-amber-900/20 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Custom Treatments</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Clinic-specific procedures not in the standard catalog.</p>
                </div>
                <button onClick={addCustomTreatment}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-all">
                  <Plus className="w-3 h-3" /> Add Custom
                </button>
              </div>
              <div className="p-6">
                {(settings.treatments?.custom || []).length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">No custom treatments yet. Click &quot;Add Custom&quot; to create one.</p>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-[1fr_100px_120px_36px] gap-2 text-xs font-semibold text-gray-400 uppercase tracking-wider px-1">
                      <span>Name</span>
                      <span>Fee (&#x20B9;)</span>
                      <span>Category</span>
                      <span />
                    </div>
                    {(settings.treatments?.custom || []).map((ct, i) => (
                      <div key={ct.id} className="grid grid-cols-[1fr_100px_120px_36px] gap-2 items-center">
                        <input
                          value={ct.name}
                          onChange={e => updateCustomTreatment(i, 'name', e.target.value)}
                          placeholder="Procedure name"
                          className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 placeholder-gray-400"
                        />
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">&#x20B9;</span>
                          <input
                            type="number"
                            min="0"
                            step="50"
                            value={ct.fee}
                            onChange={e => updateCustomTreatment(i, 'fee', Math.max(0, Number(e.target.value) || 0))}
                            className="w-full pl-6 pr-2 py-1.5 text-xs text-right font-medium rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                        </div>
                        <select
                          value={ct.category}
                          onChange={e => updateCustomTreatment(i, 'category', e.target.value)}
                          className="w-full px-2 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                        >
                          {CATEGORIES.map(c => (
                            <option key={c.id} value={c.id}>{c.label}</option>
                          ))}
                        </select>
                        <button onClick={() => removeCustomTreatment(i)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-all">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex justify-between items-center">
                <p className="text-xs text-gray-400">Custom treatments appear in the treatment selector alongside catalog treatments.</p>
                <button onClick={() => saveSettings('treatments')} disabled={saving}
                  className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-medium rounded-xl hover:bg-gray-800 dark:hover:bg-gray-100 transition-all disabled:opacity-50">
                  <Save className="w-4 h-4" />
                  {saving ? 'Saving...' : 'Save All'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── CHECKLISTS TAB ── */}
        {activeTab === 'checklists' && (
          <div className="space-y-6">
            {[
              { key: 'diagnosis', label: 'Diagnosis Checkboxes', desc: 'Common conditions shown as checkboxes on the prescription' },
              { key: 'advice', label: 'Diet & Advice', desc: 'Pre-printed precautionary advice checkboxes' },
            ].map(section => (
              <div key={section.key} className={cardClass()}>
                <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-gradient-to-r from-gray-50/80 to-blue-50/80 dark:from-gray-800/50 dark:to-blue-900/20 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{section.label}</h2>
                    <p className="text-xs text-gray-400 mt-0.5">{section.desc}</p>
                  </div>
                  <button onClick={() => addListItem('checklists', section.key)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-all">
                    <Plus className="w-3 h-3" /> Add
                  </button>
                </div>
                <div className="p-6 space-y-2">
                  {(settings.checklists[section.key] || []).map((item, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input className={`flex-1 ${inputClass()}`} value={item}
                        onChange={e => updateListItem('checklists', section.key, i, e.target.value)}
                        placeholder={`Item ${i + 1}`} />
                      <button onClick={() => removeListItem('checklists', section.key, i)}
                        className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-all">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  {(!settings.checklists[section.key] || settings.checklists[section.key].length === 0) && (
                    <p className="text-sm text-gray-400 text-center py-4">No items yet. Click &quot;Add&quot; to create one.</p>
                  )}
                </div>
                <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex justify-end">
                  <button onClick={() => saveSettings('checklists')} disabled={saving}
                    className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-medium rounded-xl hover:bg-gray-800 dark:hover:bg-gray-100 transition-all disabled:opacity-50">
                    <Save className="w-4 h-4" />
                    {saving ? 'Saving...' : 'Save Checklists'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* MEDICINES TAB */}
        {activeTab === 'medicines' && (
          <div className="space-y-6">
            <div className={cardClass()}>
              <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-gradient-to-r from-gray-50/80 to-emerald-50/80 dark:from-gray-800/50 dark:to-emerald-900/20 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Medicine Salts</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Enable/disable medicine salts available in the prescription search.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={resetMedicines}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all">
                    <RotateCcw className="w-3 h-3" /> Reset
                  </button>
                  <button onClick={() => saveSettings('medicines')} disabled={saving}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-all disabled:opacity-50">
                    <Save className="w-3 h-3" />
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
              {/* Search */}
              <div className="px-6 pt-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input type="text" value={medicineSearch} onChange={e => setMedicineSearch(e.target.value)}
                    placeholder="Search medicine salts..."
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 placeholder-gray-400" />
                </div>
              </div>
              {/* Categories */}
              <div className="p-6 space-y-3">
                {Object.entries(MEDICINE_CATEGORIES).map(([catId, cat]) => {
                  const customInCat = (settings.medicines?.custom || [])
                    .filter(s => (typeof s === 'string' ? null : s.category === catId))
                    .map(s => s.name);
                  const catSalts = [...cat.salts, ...customInCat].filter(s =>
                    s.toLowerCase().includes(medicineSearch.toLowerCase()));
                  if (catSalts.length === 0) return null;
                  const allEnabled = catSalts.every(s => settings.medicines?.salts?.[s]?.enabled !== false);
                  const anyEnabled = catSalts.some(s => settings.medicines?.salts?.[s]?.enabled !== false);
                  const isOpen = openCategories.has(catId);
                  return (
                    <div key={catId} className="rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                      <button onClick={() => setOpenCategories(prev => { const next = new Set(prev); next.has(catId) ? next.delete(catId) : next.add(catId); return next; })}
                        className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all text-left">
                        <div className="flex items-center gap-3">
                          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-0' : '-rotate-90'}`} />
                          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{cat.label}</span>
                          <span className="text-xs text-gray-400">({anyEnabled ? catSalts.filter(s => settings.medicines?.salts?.[s]?.enabled !== false).length : 0}/{catSalts.length})</span>
                        </div>
                        <label className="flex items-center gap-1.5 cursor-pointer" onClick={e => e.stopPropagation()}>
                          <span className="text-xs text-gray-400">{allEnabled ? 'On' : anyEnabled ? 'Partial' : 'Off'}</span>
                          <input type="checkbox" checked={allEnabled} onChange={() => setCategoryEnabled(catId, !allEnabled)}
                            className="rounded border-gray-300 text-emerald-500 focus:ring-emerald-400" />
                        </label>
                      </button>
                      {isOpen && (
                        <div className="px-4 py-2 space-y-1">
                          {catSalts.map(s => {
                            const entry = settings.medicines?.salts?.[s] || { enabled: true };
                            const isCustom = customInCat.includes(s);
                            return (
                              <div key={s} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-all">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm text-gray-800 dark:text-gray-200">{s}</span>
                                  {isCustom && <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded-full">custom</span>}
                                </div>
                                <input type="checkbox" checked={entry.enabled !== false} onChange={() => toggleMedicine(s)}
                                  className="rounded border-gray-300 text-emerald-500 focus:ring-emerald-400" />
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Custom Medicines */}
            <div className={cardClass()}>
              <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-gradient-to-r from-gray-50/80 to-emerald-50/80 dark:from-gray-800/50 dark:to-emerald-900/20 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Custom Medicines</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Add custom salts not in the default catalog.</p>
                </div>
                <button onClick={() => setShowCustomInput(true)} disabled={showCustomInput}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-all">
                  <Plus className="w-3 h-3" /> Add Custom
                </button>
              </div>
              <div className="p-6">
                {showCustomInput && (
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mb-4">
                    <input ref={customInputRef} type="text" value={customMedicineName} onChange={e => setCustomMedicineName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && customMedicineName.trim()) { addCustomMedicine(customMedicineName, customMedicineCategory); setCustomMedicineName(''); setCustomMedicineCategory('other_dental'); setShowCustomInput(false); } if (e.key === 'Escape') { setShowCustomInput(false); setCustomMedicineName(''); setCustomMedicineCategory('other_dental'); } }}
                      placeholder="Enter salt name..."
                      className="flex-1 px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 placeholder-gray-400" autoFocus />
                    <select value={customMedicineCategory} onChange={e => setCustomMedicineCategory(e.target.value)}
                      className="px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40">
                      {Object.entries(MEDICINE_CATEGORIES).map(([id, cat]) => (
                        <option key={id} value={id}>{cat.label}</option>
                      ))}
                    </select>
                    <button onClick={() => { if (customMedicineName.trim()) { addCustomMedicine(customMedicineName, customMedicineCategory); setCustomMedicineName(''); setCustomMedicineCategory('other_dental'); setShowCustomInput(false); } }}
                      className="px-4 py-2 text-xs font-medium rounded-xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-all">Add</button>
                    <button onClick={() => { setShowCustomInput(false); setCustomMedicineName(''); setCustomMedicineCategory('other_dental'); }}
                      className="px-4 py-2 text-xs font-medium rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all">Cancel</button>
                  </div>
                )}
                {(settings.medicines?.custom || []).length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">No custom medicines yet.</p>
                ) : (
                  <div className="space-y-1">
                    {settings.medicines.custom.map(s => {
                      const name = typeof s === 'string' ? s : s.name;
                      const cat = typeof s === 'string' ? 'other_dental' : s.category;
                      const catLabel = MEDICINE_CATEGORIES[cat]?.label || cat;
                      return (
                        <div key={name} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-all">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-800 dark:text-gray-200">{name}</span>
                            <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded-full">{catLabel}</span>
                          </div>
                          <button onClick={() => removeCustomMedicine(name)}
                            className="p-1 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-all">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex justify-end">
                <button onClick={() => saveSettings('medicines')} disabled={saving}
                  className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-medium rounded-xl hover:bg-gray-800 dark:hover:bg-gray-100 transition-all disabled:opacity-50">
                  <Save className="w-4 h-4" />
                  {saving ? 'Saving...' : 'Save Medicines'}
                </button>
              </div>
            </div>

            {/* Quick Templates */}
            <div className={cardClass()}>
              <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-gradient-to-r from-gray-50/80 to-violet-50/80 dark:from-gray-800/50 dark:to-violet-900/20 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Quick Templates</h2>
                  <p className="text-xs text-gray-400 mt-0.5">One-click prescription templates for common procedures.</p>
                </div>
                <button onClick={() => {
                  const tpl = { id: 'tpl_' + Date.now(), name: '', medicines: [{ name: '', dosage: '', frequency: '', duration: '', timing: 'after' }] };
                  setSettings(prev => ({ ...prev, medicines: { ...prev.medicines, templates: [...(prev.medicines?.templates || []), tpl] } }));
                  setEditingTemplate(tpl.id);
                }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-900/50 transition-all">
                  <Plus className="w-3 h-3" /> Add Template
                </button>
              </div>
              <div className="p-6 space-y-3">
                {(settings.medicines?.templates || []).length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">No quick templates yet.</p>
                ) : (
                  settings.medicines.templates.map(tpl => {
                    const isEditing = editingTemplate === tpl.id;
                    return (
                      <div key={tpl.id} className="rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 dark:bg-gray-800/50">
                          {isEditing ? (
                            <input type="text" value={tpl.name} onChange={e => updateTemplateField(tpl.id, 'name', e.target.value)}
                              placeholder="Template name..."
                              className="flex-1 px-2 py-1 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-500/40 placeholder-gray-400" autoFocus />
                          ) : (
                            <button onClick={() => setEditingTemplate(tpl.id === editingTemplate ? null : tpl.id)}
                              className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:text-violet-600 dark:hover:text-violet-400 transition-colors">
                              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isEditing ? 'rotate-0' : '-rotate-90'}`} />
                              {tpl.name || <span className="text-gray-400 italic">Unnamed template</span>}
                              <span className="text-xs text-gray-400 font-normal">({tpl.medicines.length} meds)</span>
                            </button>
                          )}
                          <div className="flex items-center gap-1">
                            {!isEditing && (
                              <button onClick={() => setEditingTemplate(tpl.id)}
                                className="p-1 rounded text-gray-400 hover:text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/30 transition-all">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                              </button>
                            )}
                            <button onClick={() => {
                              setSettings(prev => ({ ...prev, medicines: { ...prev.medicines, templates: prev.medicines.templates.filter(t => t.id !== tpl.id) } }));
                              if (editingTemplate === tpl.id) setEditingTemplate(null);
                            }}
                              className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-all">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        {isEditing && (
                          <div className="px-4 py-3 space-y-2">
                            {tpl.medicines.map((med, mi) => (
                              <div key={mi} className="flex items-center gap-1.5 flex-wrap">
                                <input type="text" value={med.name} onChange={e => updateTemplateMedicine(tpl.id, mi, 'name', e.target.value)}
                                  placeholder="Medicine" className="w-28 px-2 py-1 text-xs rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-violet-500/40 placeholder-gray-400" />
                                <input type="text" value={med.dosage} onChange={e => updateTemplateMedicine(tpl.id, mi, 'dosage', e.target.value)}
                                  placeholder="Dose" className="w-14 px-2 py-1 text-xs rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-violet-500/40 placeholder-gray-400" />
                                <select value={med.frequency} onChange={e => updateTemplateMedicine(tpl.id, mi, 'frequency', e.target.value)}
                                  className="w-14 px-1 py-1 text-xs rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-violet-500/40">
                                  <option value="">Freq</option>
                                  <option value="Once">Once</option>
                                  <option value="Twice a day">BD</option>
                                  <option value="Thrice a day">TDS</option>
                                </select>
                                <select value={med.duration} onChange={e => updateTemplateMedicine(tpl.id, mi, 'duration', e.target.value)}
                                  className="w-14 px-1 py-1 text-xs rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-violet-500/40">
                                  <option value="">Days</option>
                                  {[3,5,7,10,14].map(d => (<option key={d} value={`${d} days`}>{d}</option>))}
                                </select>
                                <select value={med.timing || 'after'} onChange={e => updateTemplateMedicine(tpl.id, mi, 'timing', e.target.value)}
                                  className="w-14 px-1 py-1 text-xs rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-violet-500/40">
                                  <option value="after">After</option>
                                  <option value="before">Before</option>
                                </select>
                                <button onClick={() => removeTemplateMedicine(tpl.id, mi)}
                                  className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-all">
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                            <button onClick={() => addTemplateMedicine(tpl.id)}
                              className="flex items-center gap-1 text-xs font-medium text-violet-500 dark:text-violet-400 hover:text-violet-600 transition-colors">
                              <Plus className="w-2.5 h-2.5" /> Add medicine
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
              <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex justify-end">
                <button onClick={() => saveSettings('medicines')} disabled={saving}
                  className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-medium rounded-xl hover:bg-gray-800 dark:hover:bg-gray-100 transition-all disabled:opacity-50">
                  <Save className="w-4 h-4" />
                  {saving ? 'Saving...' : 'Save All'}
                </button>
              </div>
            </div>

            {/* Usage Stats */}
            {(Object.keys(settings.medicines?.usage || {}).length > 0) && (
              <div className={cardClass()}>
                <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-gradient-to-r from-gray-50/80 to-amber-50/80 dark:from-gray-800/50 dark:to-amber-900/20">
                  <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Usage Stats</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Most prescribed medicine salts. Updates automatically when visits are saved.</p>
                </div>
                <div className="p-6">
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(settings.medicines.usage)
                      .map(([name, value]) => {
                        const count = typeof value === 'number' ? value : Number(value?.count || 0);
                        return [name, count];
                      })
                      .sort(([, a], [, b]) => b - a)
                      .slice(0, 20)
                      .map(([name, count]) => {
                        const cat = settings.medicines?.salts?.[name]?.category;
                        const catLabel = cat ? (MEDICINE_CATEGORIES[cat]?.label || cat) : null;
                        return (
                          <div key={name} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50">
                            <span className="text-xs font-medium text-gray-800 dark:text-gray-200">{name}</span>
                            {catLabel && <span className="text-xs text-gray-400 bg-white dark:bg-gray-800 px-1 rounded-full">{catLabel}</span>}
                            <span className="text-xs font-bold text-amber-600 dark:text-amber-400 ml-0.5">{count}</span>
                          </div>
                        );
                      })}
                  </div>
                  <p className="text-xs text-gray-400 mt-3 text-center">Top 20 most prescribed medicines</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
