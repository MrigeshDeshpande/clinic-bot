'use client';

import { useState, useEffect, Suspense, useRef, useContext, useCallback, Fragment } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { ToastContext, SidebarContext } from '../layout';
import { Stethoscope, ClipboardCheck, ArrowLeft, Search, X, CheckCircle2, Clock, ChevronDown, ChevronRight, Pencil, Plus } from 'lucide-react';
import { TREATMENTS, TREATMENT_NAMES, getTreatmentName, getDefaultFee, normalizeTreatmentFee, suggestTreatment } from '@/lib/treatments';
import { COMMON_MEDICINES } from '@/lib/medicines';

import { apiFetch } from '@/lib/clientApi';
import { fetchCached, invalidateFetchCache } from '@/lib/clientFetchCache';
import { VISIT_MODES, deriveVisitMode } from '@/lib/visitModes';
import PrescriptionPreview from '@/components/PrescriptionPreview';
import CameraViewfinder from '@/components/CameraViewfinder';

import PerToothDiagnosisPanel from '@/components/PerToothDiagnosisPanel';
import ToothGridLegend from '@/components/ToothGridLegend';
import ToothChartCard from '@/components/visit/ToothChartCard';
import AttachmentsPanel from '@/components/visit/AttachmentsPanel';
import PrescriptionCard from '@/components/visit/PrescriptionCard';
import AdviceCard from '@/components/visit/AdviceCard';
import Findings from '@/components/visit/IntraOralFindings';
import VisitSummary from '@/components/visit/VisitSummary';
import ContextSidebar from '@/components/visit/ContextSidebar';
import WalkInDrawer from '@/components/visit/WalkInDrawer';
import EditPatientDrawer from '@/components/visit/EditPatientDrawer';

const DRAFT_KEY = 'visit_draft';
const TEMPLATES_KEY = 'visit_templates';
const RX_TEMPLATES_KEY = 'rx_templates';

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash', icon: '\u{1F4B5}' },
  { value: 'upi', label: 'UPI', icon: '\u{1F4F1}' },
  { value: 'card', label: 'Card', icon: '\u{1F4B3}' },
  { value: 'other', label: 'Other', icon: '\u{1FA99}' },
];

function upiDeepLink(amount, txnRef, note) {
  const pa = encodeURIComponent(process.env.NEXT_PUBLIC_UPI_ID || 'clinic@upi');
  const am = encodeURIComponent(amount.toString());
  const tr = encodeURIComponent(txnRef || '');
  const tn = encodeURIComponent(note || '');
  return `upi://pay?pa=${pa}&am=${am}&tn=${tn}${tr ? `&tr=${tr}` : ''}`;
}

const CONSULTATION_DEFAULT = 2000;
const LOCATIONS = ['Hudco', 'Bhilai', 'Durg', 'Nehru Nagar', 'Borsi'];
const PHONE_PREFIX = '+91';
function stripPhonePrefix(v) { return v?.replace(/^(\+91|91)/, '') || v || ''; }
function withPhonePrefix(v) { const s = stripPhonePrefix(v); return s ? `${PHONE_PREFIX}${s}` : ''; }
const CONSULTATION_STEP = 100;
const TREATMENT_STEP = 50;

const DEFAULT_VISIT_LAYOUT = {
  leftColumn: [
    { id: 'chiefComplaint', label: 'Chief Complaint', enabled: true },
    { id: 'medicalHistory', label: 'Medical / Dental History', enabled: true },
    { id: 'toothChart', label: 'Tooth Chart', enabled: true },
    { id: 'findings', label: 'Findings', enabled: true },
    { id: 'overallDiagnosis', label: 'Overall Diagnosis', enabled: true },
    { id: 'treatmentPlan', label: 'Treatment Plan', enabled: true },
    { id: 'examination', label: 'Examination', enabled: true },
    { id: 'prescription', label: 'Prescription', enabled: true },
    { id: 'advice', label: 'Advice', enabled: true },
    { id: 'visitSummary', label: 'Visit Summary', enabled: true },
  ],
  rightColumn: [
    { id: 'patientSummary', label: 'Patient Summary', enabled: true },
    { id: 'toothGridLegend', label: 'Dental Legend', enabled: true },
    { id: 'attachments', label: 'Attachments', enabled: true },
    { id: 'contextSidebar', label: 'Context Sidebar', enabled: true },
  ],
};

const EMPTY_VISIT_FORM = {
  patientName: '',
  patientPhone: '',
  patientAge: '',
  patientSex: '',
  patientLocation: '',
  treatment: '',
  consultationFee: '',
  treatmentCharges: '',
  medicineCharges: 0,
  diagnosis: '',
  medicines: [],
  followUpDate: '',
  followUpInstructions: '',
  notes: '',
  adviceSelected: [],
  diagnosisSelected: [],
  toothDiagnoses: [],
  chiefComplaint: '',
  generalExamination: '',
  extraOralExamination: '',
};

function cleanOptionalText(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || undefined;
}

function normalizeVisitForm(value = {}) {
  const next = { ...EMPTY_VISIT_FORM, ...value };
  for (const key of [
    'patientName', 'patientPhone', 'patientAge', 'patientSex', 'patientLocation',
    'treatment', 'consultationFee', 'treatmentCharges', 'diagnosis',
    'followUpDate', 'followUpInstructions', 'notes',
    'chiefComplaint', 'generalExamination', 'extraOralExamination',
  ]) {
    next[key] = typeof next[key] === 'string' ? next[key] : '';
  }
  next.medicineCharges = next.medicineCharges ?? 0;
  next.medicines = Array.isArray(next.medicines) ? next.medicines : [];
  next.adviceSelected = Array.isArray(next.adviceSelected) ? next.adviceSelected : [];
  next.diagnosisSelected = Array.isArray(next.diagnosisSelected) ? next.diagnosisSelected : [];
  next.toothDiagnoses = Array.isArray(next.toothDiagnoses) ? next.toothDiagnoses : [];
  return next;
}

const FREQUENCY_OPTIONS = ['Daily one time', 'Twice a day', 'Thrice a day'];
const DURATION_OPTIONS = [3, 5, 7, 10, 14, 21, 30];
const TIMING_OPTIONS = [
  { value: 'after', label: 'After meal' },
  { value: 'before', label: 'Before meal' },
];

function resolveTreatmentId(value) {
  if (!value) return null;
  if (typeof value === 'object') return value.treatmentId || value.id || null;
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  const treatment = TREATMENTS.find(t =>
    t.id === value ||
    t.name.toLowerCase() === normalized ||
    t.aliases?.some(alias => alias.toLowerCase() === normalized)
  );
  return treatment?.id || value;
}

const RATING_CATEGORIES = [
  { key: 'payment_time', label: 'Payment on Time' },
  { key: 'timely_appointment', label: 'Timely Appointment' },
  { key: 'behaviour', label: 'Behaviour' },
  { key: 'cooperative_treatment', label: 'Cooperative to Treatment' },
];

function normalizeSex(sex) {
  if (!sex) return '';
  const lower = sex.toLowerCase();
  if (lower === 'm' || lower === 'male') return 'Male';
  if (lower === 'f' || lower === 'female') return 'Female';
  if (lower === 'o' || lower === 'other') return 'Other';
  return sex.charAt(0).toUpperCase() + sex.slice(1);
}

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

function toothQuadrant(num) {
  const q = Math.floor(num / 10);
  if (q === 1) return 'UR';
  if (q === 2) return 'UL';
  if (q === 3) return 'LL';
  if (q === 4) return 'LR';
  return '';
}

function VisitPageInner() {
  const { showToast } = useContext(ToastContext);
  const { setSidebarCollapsed } = useContext(SidebarContext);
  const searchParams = useSearchParams();
  const router = useRouter();

  const [appointmentId, setAppointmentId] = useState(searchParams.get('appointmentId'));
  const prefillName = searchParams.get('name') || '';
  const prefillTreatment = searchParams.get('treatment') || '';
  const returnTo = searchParams.get('returnTo') || 'appointments';

  const [visitMode, setVisitMode] = useState(() => {
    const derived = deriveVisitMode(searchParams, null);
    console.log('[DEBUG init] searchParams keys:', [...searchParams.keys()], 'mode param:', searchParams.get('mode'), 'derived:', derived);
    return derived;
  });

  const isEdit = visitMode === VISIT_MODES.EDIT_COMPLETED_VISIT;

  const [form, setForm] = useState(() => normalizeVisitForm({
    ...EMPTY_VISIT_FORM,
    patientName: prefillName,
    treatment: prefillTreatment,
  }));
  const [adviceOptions, setAdviceOptions] = useState([]);
  const [diagnosisOptions, setDiagnosisOptions] = useState([]);
  const [selectedTooth, setSelectedTooth] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [errors, setErrors] = useState({});
  const [searchResults, setSearchResults] = useState([]);
  const [searchState, setSearchState] = useState('idle');
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [mediaFiles, setMediaFiles] = useState([]);
  const [showCamera, setShowCamera] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const [googleMapsUrl, setGoogleMapsUrl] = useState('');
  const [sendingReviewLink, setSendingReviewLink] = useState(false);
  const [patientRatings, setPatientRatings] = useState({});
  const [savingRatings, setSavingRatings] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [treatmentFavorites, setTreatmentFavorites] = useState([]);
  const [feeOverrides, setFeeOverrides] = useState({});
  const [customTreatments, setCustomTreatments] = useState([]);
  const [medicineList, setMedicineList] = useState([]);
  const [medicineSettings, setMedicineSettings] = useState({ salts: {}, custom: [], usage: {}, templates: [] });
  const [medicineTemplates, setMedicineTemplates] = useState([]);
  const [showMedicineTemplateInput, setShowMedicineTemplateInput] = useState(false);
  const [medicineTemplateName, setMedicineTemplateName] = useState('');
  const [savingMedicineTemplate, setSavingMedicineTemplate] = useState(false);
  const [medicineUsage, setMedicineUsage] = useState({});

  // Merge catalog defaults with settings overrides
  const getFee = useCallback((id) => {
    if (feeOverrides[id] !== undefined) return feeOverrides[id];
    return getDefaultFee(id);
  }, [feeOverrides]);

  // Escape closes preview and per-tooth panel
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') {
        if (showPreview) { setShowPreview(false); setSidebarCollapsed(false); }
        if (selectedTooth) { setSelectedTooth(null); }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showPreview, selectedTooth, setSidebarCollapsed]);

  // Restore sidebar on unmount
  useEffect(() => () => setSidebarCollapsed(false), [setSidebarCollapsed]);

  // Load settings — google maps URL + treatment favorites
  useEffect(() => {
    fetch('/api/dashboard/settings')
      .then(r => r.json())
      .then(data => {
        if (data.settings?.google_maps?.review_url) setGoogleMapsUrl(data.settings.google_maps.review_url);
        if (data.settings?.treatments?.favorites) setTreatmentFavorites(data.settings.treatments.favorites);
        if (data.settings?.treatments?.feeOverrides) setFeeOverrides(data.settings.treatments.feeOverrides);
        if (data.settings?.treatments?.custom) setCustomTreatments(data.settings.treatments.custom);
        const ms = data.settings?.medicines;
        if (ms?.salts && Object.keys(ms.salts).length > 0) {
          const customNames = (ms.custom || []).map(s => typeof s === 'string' ? s : s.name);
          const names = Object.entries(ms.salts)
            .filter(([_, v]) => v.enabled !== false)
            .map(([k]) => k)
            .concat(customNames)
            .sort();
          setMedicineList(names);
        } else {
          setMedicineList(COMMON_MEDICINES);
        }
        if (ms) setMedicineSettings({ salts: ms.salts || {}, custom: ms.custom || [], usage: ms.usage || {}, templates: ms.templates || [] });
        if (ms?.usage) setMedicineUsage(ms.usage);
        if (ms?.templates) setMedicineTemplates(ms.templates);
        if (data.settings?.visit_layout) setVisitLayout(data.settings.visit_layout);
      })
      .catch(() => {});
  }, []);

  // Stable callbacks for ToothGrid + PerToothDiagnosisPanel
  const stableSetSelectedTooth = useCallback(setSelectedTooth, []);
  const handleQuickDiagnosis = useCallback((tooth, diag) => {
    setForm(f => {
      const existing = f.toothDiagnoses.filter(t => t.tooth !== tooth);
      if (diag === null) return { ...f, toothDiagnoses: existing };
      const prev = f.toothDiagnoses.find(t => t.tooth === tooth);
      const diagnoses = prev?.diagnoses?.includes(diag)
        ? prev.diagnoses.filter(d => d !== diag)
        : [...(prev?.diagnoses || []), diag];
      const hasContent = diagnoses.length > 0 || prev?.severity || prev?.outcome || prev?.treatment || prev?.surface || prev?.notes;
      const next = hasContent
        ? [...existing, { tooth, diagnoses, surface: prev?.surface || '', treatment: prev?.treatment || '', severity: prev?.severity || '', status: prev?.status || 'active', outcome: prev?.outcome || '', notes: prev?.notes || '' }]
        : existing;
      return { ...f, toothDiagnoses: next };
    });
  }, []);
  const handleToothEntryUpdate = useCallback((tooth, entry) => {
    setForm(f => {
      const existing = f.toothDiagnoses.filter(t => t.tooth !== tooth);
      const next = [...existing, entry];
      return { ...f, toothDiagnoses: next };
    });
  }, []);
  const handleToothSave = useCallback((entry) => {
    setForm(f => {
      const existing = f.toothDiagnoses.filter(t => t.tooth !== entry.tooth);
      const hasContent = entry.diagnoses?.length > 0 || entry.severity || entry.outcome || entry.treatment || entry.surface || entry.notes;
      const next = hasContent ? [...existing, entry] : existing;
      return { ...f, toothDiagnoses: next };
    });
  }, []);
  const handleToothClose = useCallback(() => setSelectedTooth(null), []);

  // Full context data
  const [appointmentMeta, setAppointmentMeta] = useState(null);
  const [patientProfile, setPatientProfile] = useState(null);

  // Sync patient ratings from patient profile
  useEffect(() => {
    if (patientProfile?.patient_ratings) {
      setPatientRatings(patientProfile.patient_ratings);
    }
  }, [patientProfile]);

  const [patientVisits, setPatientVisits] = useState([]);
  const [patientMessages, setPatientMessages] = useState([]);
  const [patientFamily, setPatientFamily] = useState([]);
  const [medicalHistory, setMedicalHistory] = useState({ allergies: '', chronicConditions: '', bloodGroup: '', bp: '', weight: '', medications: '', habits: {}, address: '', occupation: '', dentalHistory: '', familyHistory: '' });
  const habits = medicalHistory.habits || {};
  const [loadingExtra, setLoadingExtra] = useState(false);

  // Multi-treatment state (book-style)
  const [treatmentFees, setTreatmentFees] = useState(() => {
    const initial = {};
    if (prefillTreatment) {
      const key = TREATMENTS.find(t => t.id === prefillTreatment || t.name === prefillTreatment)?.id || prefillTreatment;
      initial[key] = { amount: getDefaultFee(key), quantity: 1, source: 'manual', label: getTreatmentName(key) };
    }
    return initial;
  });
  const [consultationFee, setConsultationFee] = useState(CONSULTATION_DEFAULT);

  const selectedTreatments = Object.keys(treatmentFees);
  const computedTreatmentCharges = Object.values(treatmentFees).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const totalFees = consultationFee + computedTreatmentCharges + (Number(form.medicineCharges) || 0);

  // --- NEW Chart -> Billing Sync Effect ---
  useEffect(() => {
    if (!form.toothDiagnoses) return;
    
    // Aggregate treatments from chart
    const chartTreatments = {};
    for (const td of form.toothDiagnoses) {
      if (!td.treatment) continue;
      const t = TREATMENTS.find(tr => tr.id === td.treatment || tr.name === td.treatment);
      const key = t ? t.id : td.treatment;
      
      if (!chartTreatments[key]) {
        chartTreatments[key] = { count: 0, label: t ? t.name : td.treatment };
      }
      chartTreatments[key].count += 1;
    }

    setTreatmentFees(prev => {
      let changed = false;
      const next = { ...prev };

      // 1. Add or update auto items
      for (const [key, { count, label }] of Object.entries(chartTreatments)) {
        if (!next[key]) {
          next[key] = { amount: getFee(key) * count, quantity: count, source: 'auto', label };
          changed = true;
        } else if (next[key].source === 'auto' && next[key].quantity !== count) {
          next[key] = { ...next[key], quantity: count, amount: getFee(key) * count };
          changed = true;
        }
      }

      // 2. Remove auto items that are no longer in chart
      for (const key of Object.keys(next)) {
        if (next[key].source === 'auto' && !chartTreatments[key]) {
          delete next[key];
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [form.toothDiagnoses, feeOverrides]);

  // Auto-calculate medicine charges from individual rates
  useEffect(() => {
    const total = form.medicines.reduce((sum, m) => sum + (Number(m.rate) || 0), 0);
    if (Number(form.medicineCharges) !== total) {
      setForm(f => ({ ...f, medicineCharges: total }));
    }
  }, [form.medicines]);

  function toggleTreatment(name) {
    setTreatmentFees(prev => {
      const key = TREATMENTS.find(t => t.id === name || t.name === name)?.id || name;
      if (prev[key] !== undefined) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: { amount: getFee(key), quantity: 1, source: 'manual', label: getTreatmentName(key) } };
    });
  }

  function addCustomTreatment() {
    const name = prompt('Enter treatment name:');
    if (name && name.trim()) {
      const trimmed = name.trim();
      setTreatmentFees(prev => {
        if (prev[trimmed] !== undefined) return prev;
        return { ...prev, [trimmed]: { amount: 0, quantity: 1, source: 'manual', label: trimmed } };
      });
    }
  }

  function adjustConsultation(delta) {
    setConsultationFee(prev => Math.max(0, prev + delta));
  }

  function adjustTreatmentFee(key, delta) {
    setTreatmentFees(prev => {
      if (!prev[key]) return prev;
      return {
        ...prev,
        [key]: {
          ...prev[key],
          amount: Math.max(0, (prev[key].amount || 0) + delta),
          source: 'manual'
        }
      };
    });
  }

  function handleUpdateTreatmentFee(key, value) {
    setTreatmentFees(prev => ({
      ...prev,
      [key]: { ...prev[key], amount: Number(value) || 0, source: 'manual' }
    }));
  }

  function handleUpdateConsultationFee(value) {
    setConsultationFee(Number(value) || 0);
  }

  function handleAdjustQuantity(key, delta) {
    setTreatmentFees(prev => {
      const item = prev[key];
      if (!item) return prev;
      const newQty = Math.max(1, (item.quantity || 1) + delta);
      const unitFee = item.source === 'auto' && item.quantity > 0
        ? Math.round(item.amount / item.quantity)
        : getFee(key);
      return {
        ...prev,
        [key]: { ...item, quantity: newQty, amount: unitFee * newQty, source: 'manual' }
      };
    });
  }
  
  const [symptomInput, setSymptomInput] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef(null);
  const fileInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const formReadyRef = useRef(false);
  const queryRef = useRef('');
  const explicitMode = useRef(!!searchParams.get('mode'));
  const modeCorrected = useRef(false);

  // Auto-save draft
  const [draftRestored, setDraftRestored] = useState(false);
  const [draftAvailable, setDraftAvailable] = useState(false);

  // Templates
  const [templates, setTemplates] = useState([]);
  const [templateName, setTemplateName] = useState('');
  const [showTemplateInput, setShowTemplateInput] = useState(false);
  const [showTemplateLoad, setShowTemplateLoad] = useState(false);

  // Rx Templates
  const [rxTemplates, setRxTemplates] = useState([]);
  const [rxTemplateName, setRxTemplateName] = useState('');
  const [showRxTemplateInput, setShowRxTemplateInput] = useState(false);
  const [showRxTemplateLoad, setShowRxTemplateLoad] = useState(false);

  // Salt search
  const [saltSearch, setSaltSearch] = useState('');
  const [showCustomLocation, setShowCustomLocation] = useState(false);

  // Payment
  const [paymentStatus, setPaymentStatus] = useState('pending');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [paidAmount, setPaidAmount] = useState(0);
  const [sendingPaymentLink, setSendingPaymentLink] = useState(false);

  // Cockpit state
  const [showWalkInDrawer, setShowWalkInDrawer] = useState(false);
  const [showEditDrawer, setShowEditDrawer] = useState(false);
  const [visitSaved, setVisitSaved] = useState(false);
  const [formDirty, setFormDirty] = useState(false);
  const formDirtyTimerRef = useRef(null);
  const [examinationOpen, setExaminationOpen] = useState(null); // null=auto, true=open, false=collapsed
  const [showMedicalSummary, setShowMedicalSummary] = useState(false);
  const [showDentalSummary, setShowDentalSummary] = useState(false);
  const [visitLayout, setVisitLayout] = useState(null);
  const [showPatientSearch, setShowPatientSearch] = useState(false);

  // Derived per-tooth state for the editor
  const selectedToothEntry = selectedTooth
    ? form.toothDiagnoses.find(t => t.tooth === selectedTooth)
    : null;
  const selectedToothHistory = selectedTooth
    ? (patientVisits || []).filter(v => {
        const td = v.tooth_diagnoses;
        return td && Array.isArray(td) && td.some(e => e.tooth === selectedTooth);
      }).flatMap(v => {
        const entries = (v.tooth_diagnoses || []).filter(e => e.tooth === selectedTooth);
        return entries.map(e => ({
          year: v.date?.slice(0, 4),
          date: v.date,
          text: `${e.diagnoses?.join(', ') || v.diagnosis || ''}${e.treatment ? ' — ' + getTreatmentName(e.treatment) : ''}`,
        }));
      })
    : [];

  useEffect(() => {
    setForm(f => ({
      ...f,
      patientName: prefillName || f.patientName,
      treatment: prefillTreatment || f.treatment,
    }));
  }, [prefillName, prefillTreatment]);

  // Fetch diagnosis & advice options from settings
  useEffect(() => {
    fetch('/api/dashboard/settings')
      .then(r => r.json())
      .then(data => {
        if (data.settings?.checklists?.advice) {
          setAdviceOptions(data.settings.checklists.advice);
        }
        if (data.settings?.checklists?.diagnosis) {
          setDiagnosisOptions(data.settings.checklists.diagnosis);
        }
      })
      .catch(() => {});
  }, []);

  // ── Patient profile helpers (extracted for reuse) ──
  function loadPatientSideData(patientId) {
    if (!patientId) return;
    setLoadingExtra(true);
    Promise.all([
      fetchCached(`/api/dashboard/patients/${patientId}/messages?limit=10`)
        .then(mData => { if (mData.messages) setPatientMessages(mData.messages); })
        .catch(() => {}),
      fetchCached(`/api/dashboard/patients/${patientId}/family`)
        .then(fData => { if (fData.family) setPatientFamily(fData.family); })
        .catch(() => {}),
    ]).finally(() => setLoadingExtra(false));
  }

  function applyPatientProfile(p) {
    setPatientProfile(p);
    setForm(f => ({ ...f, patientAge: p.age?.toString() || '', patientSex: normalizeSex(p.sex), patientLocation: p.location || '' }));
    if (p.location && !LOCATIONS.includes(p.location)) setShowCustomLocation(true);
    if (p.allergies !== undefined || p.chronicConditions !== undefined || p.bloodGroup !== undefined || p.bp !== undefined || p.weight !== undefined || p.medications !== undefined) {
      setMedicalHistory({
        allergies: p.allergies || '',
        chronicConditions: p.chronicConditions || '',
        bloodGroup: p.bloodGroup || '',
        bp: p.bp || '',
        weight: p.weight || '',
        medications: p.medications || '',
      });
    }
    if (p.visits) setPatientVisits(p.visits);
  }

  async function loadPatientProfile(id) {
    const pData = await fetchCached(`/api/dashboard/patients/${id}`);
    if (pData.patient) {
      applyPatientProfile({ ...pData.patient, visits: pData.visits });
      loadPatientSideData(pData.patient.id);
    }
  }

  // Load patient profile when entering via patientId (e.g. New Visit from patient profile)
  useEffect(() => {
    const pid = searchParams.get('patientId');
    if (!pid || appointmentId) return;
    setLoadingExtra(true);
    fetchCached(`/api/dashboard/patients/${pid}`)
      .then(pData => {
        if (pData.patient) {
          applyPatientProfile({ ...pData.patient, visits: pData.visits });
          const mergedTooth = mergeToothDiagnoses(pData.visits);
          setForm(f => ({
            ...f,
            patientName: pData.patient.name || '',
            patientPhone: (pData.patient.phone || '').replace(/\D/g, ''),
            patientAge: pData.patient.age?.toString() || '',
            patientSex: normalizeSex(pData.patient.sex),
            patientLocation: pData.patient.location || '',
            toothDiagnoses: mergedTooth.length > 0 ? mergedTooth : f.toothDiagnoses,
          }));
          loadPatientSideData(pData.patient.id);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingExtra(false));
  }, []);

  // Load existing visit data (auto-fill all fields)
  useEffect(() => {
    if (!appointmentId) return;
    fetchCached(`/api/dashboard/appointments?id=${appointmentId}`)
      .then(data => {
        const a = data.appointment || data;
        if (a) {
          setAppointmentMeta(a);
          setForm(normalizeVisitForm({
            ...EMPTY_VISIT_FORM,
            patientName: a.patient_name || '',
            patientPhone: (a.patient_phone || '').replace(/\D/g, ''),
            patientAge: '',
            patientSex: '',
            patientLocation: a.location || '',
            treatment: a.treatment || '',
            consultationFee: '',
            treatmentCharges: '',
            medicineCharges: a.medicine_charges?.toString() || 0,
            diagnosis: a.diagnosis || '',
            medicines: Array.isArray(a.medicines) ? a.medicines : [],
            followUpDate: a.follow_up_date?.slice(0, 10) || '',
            followUpInstructions: a.follow_up_instructions || '',
            notes: a.notes || '',
            adviceSelected: Array.isArray(a.advice_selected) ? a.advice_selected : [],
            diagnosisSelected: Array.isArray(a.diagnosis_selected) ? a.diagnosis_selected : [],
            toothDiagnoses: Array.isArray(a.tooth_diagnoses) ? a.tooth_diagnoses.map(td => ({
              ...td,
              treatment: resolveTreatmentId(td.treatment) || td.treatment,
            })) : [],
            chiefComplaint: a.chief_complaint || '',
            generalExamination: a.general_examination || '',
            extraOralExamination: a.extra_oral_examination || '',
          }));
          const savedTreatments = Array.isArray(a.treatments) && a.treatments.length > 0
            ? a.treatments
            : a.treatment ? [a.treatment] : [];
          const fees = {};
          const savedTotal = Number(a.treatment_charges) || 0;
          const defaultTotal = savedTreatments.reduce((sum, n) => sum + getFee(n), 0);
          savedTreatments.forEach(name => {
            const id = resolveTreatmentId(name) || name;
            const defaultFee = getFee(id);
            const raw = savedTotal > 0 && defaultTotal > 0
              ? Math.round(defaultFee * savedTotal / defaultTotal)
              : defaultFee;
            fees[id] = normalizeTreatmentFee(raw, id);
          });
          setTreatmentFees(fees);
          if (a.consultation_fee) {
            setConsultationFee(a.consultation_fee);
          }
          if (a.payment_status) setPaymentStatus(a.payment_status);
          if (a.payment_method) setPaymentMethod(a.payment_method);
          if (a.transaction_id) setTransactionId(a.transaction_id);
          if (a.paid_amount) setPaidAmount(a.paid_amount);
          // Correct mode when appointment status disagrees with URL-derived mode
          console.log('[DEBUG stale-correction] explicitMode:', explicitMode.current, 'status:', a.status, 'modeCorrected:', modeCorrected.current, 'current visitMode:', visitMode);
          if (!explicitMode.current && a.status === 'completed' && !modeCorrected.current) {
            modeCorrected.current = true;
            setVisitMode(VISIT_MODES.EDIT_COMPLETED_VISIT);
          }
          if (a.patient_id) {
            loadPatientProfile(a.patient_id);
          } else if (a.patient_phone) {
            (async () => {
              try {
                const pData = await fetchCached(`/api/dashboard/patients/search?q=${encodeURIComponent(a.patient_phone)}`);
                const match = (pData.patients || []).find(p => p.phone === a.patient_phone);
                if (match) {
                  applyPatientProfile(match);
                  loadPatientSideData(match.id);
                }
              } catch {}
            })();
          }
        }
      })
      .catch(e => console.error('Failed to load appointment for edit:', e));
  }, [appointmentId, isEdit]);

  // Symptom auto-suggest
  useEffect(() => {
    if (symptomInput.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const timer = setTimeout(() => {
      const results = suggestTreatment(symptomInput);
      setSuggestions(results);
      setShowSuggestions(results.length > 0);
    }, 200);
    return () => clearTimeout(timer);
  }, [symptomInput]);

  // Patient search for walk-in
  useEffect(() => {
    const abort = new AbortController();
    const query = (form.patientName || '').trim();
    queryRef.current = query;
    if (appointmentId || query.length < 2) {
      setSearchResults([]);
      setSearchState('idle');
      return;
    }
    setSearchResults([]);
    setSearchState('searching');
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/dashboard/patients/search?q=${encodeURIComponent(query)}`, { signal: abort.signal });
        const data = await res.json();
        const results = data.patients || [];
        if (queryRef.current !== query) return; // stale
        setSearchResults(results);
        setSearchState(results.length > 0 ? 'success' : 'empty');
      } catch (e) { if (e.name !== 'AbortError') setSearchState('idle'); }
    }, 300);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [form.patientName, appointmentId]);

  // Auto-highlight first result
  useEffect(() => {
    setHighlightedIndex(searchState === 'success' && searchResults.length > 0 ? 0 : -1);
  }, [searchResults]);

  // ── Auto-save draft to localStorage ──
  useEffect(() => {
    if (!formReadyRef.current) return;
    if (submitting) return;
    // Don't save drafts while the success screen is showing (post-submit)
    if (result) return;
    // Don't save if form is empty — nothing to restore
    const hasContent = form.patientName || form.diagnosis || form.medicines.length > 0 || form.notes ||
      Object.keys(treatmentFees).length > 0 || form.followUpDate || form.adviceSelected.length > 0 ||
      form.diagnosisSelected.length > 0;
    if (!hasContent) return;
    const timer = setTimeout(() => {
      const draft = {
        form: { ...form },
        treatmentFees: { ...treatmentFees },
        consultationFee,
        medicalHistory: { ...medicalHistory },
        mediaFiles: mediaFiles.map(f => ({ name: f.name, size: f.size, type: f.type })),
        paymentStatus,
        paymentMethod,
        transactionId,
        paidAmount,
        savedAt: Date.now(),
        appointmentId,
      };
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      } catch {}
    }, 1000);
    return () => {
      clearTimeout(timer);
      // Flush the draft immediately on unmount (e.g. navigation away)
      if (!formReadyRef.current || submitting || result) return;
      const hasContent2 = form.patientName || form.diagnosis || form.medicines.length > 0 || form.notes ||
        Object.keys(treatmentFees).length > 0 || form.followUpDate;
      if (!hasContent2) return;
      try {
        const draft = {
          form: { ...form },
          treatmentFees: { ...treatmentFees },
          consultationFee,
          medicalHistory: { ...medicalHistory },
          mediaFiles: mediaFiles.map(f => ({ name: f.name, size: f.size, type: f.type })),
          paymentStatus,
          paymentMethod,
          transactionId,
          paidAmount,
          savedAt: Date.now(),
          appointmentId,
        };
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      } catch {}
    };
  }, [form, treatmentFees, consultationFee, medicalHistory, mediaFiles, submitting, result, appointmentId, paymentStatus, paymentMethod, transactionId, paidAmount]);

  // ── Save draft on tab close / refresh ──
  useEffect(() => {
    function handleBeforeUnload() {
      if (!formReadyRef.current) return;
      const hasContent = form.patientName || form.diagnosis || form.medicines.length > 0 || form.notes ||
        Object.keys(treatmentFees).length > 0 || form.followUpDate || form.adviceSelected.length > 0 ||
        form.diagnosisSelected.length > 0;
      if (!hasContent) return;
      try {
        const draft = {
          form: { ...form },
          treatmentFees: { ...treatmentFees },
          consultationFee,
          medicalHistory: { ...medicalHistory },
          mediaFiles: mediaFiles.map(f => ({ name: f.name, size: f.size, type: f.type })),
          paymentStatus,
          paymentMethod,
          transactionId,
          paidAmount,
          savedAt: Date.now(),
          appointmentId,
        };
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      } catch {}
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [form, treatmentFees, consultationFee, medicalHistory, mediaFiles, appointmentId, paymentStatus, paymentMethod, transactionId, paidAmount]);

  // Restore draft on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const draft = JSON.parse(saved);
        if (draft.appointmentId === appointmentId) {
          setDraftAvailable(true);
        }
      }
    } catch {}
    formReadyRef.current = true;
  }, [appointmentId]);

  async function restoreDraft() {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (!saved) return;
      const draft = JSON.parse(saved);
      if (draft.appointmentId !== appointmentId) return;
      setForm(normalizeVisitForm(draft.form));
      const restoredFees = {};
      Object.entries(draft.treatmentFees || {}).forEach(([k, v]) => { restoredFees[k] = normalizeTreatmentFee(v, k); });
      setTreatmentFees(restoredFees);
      if (draft.consultationFee) setConsultationFee(draft.consultationFee);
      if (draft.medicalHistory) setMedicalHistory(draft.medicalHistory);
      if (draft.paymentStatus) setPaymentStatus(draft.paymentStatus);
      if (draft.paymentMethod) setPaymentMethod(draft.paymentMethod);
      if (draft.transactionId) setTransactionId(draft.transactionId);
      if (draft.paidAmount !== undefined) setPaidAmount(draft.paidAmount);
      setDraftRestored(true);
      setDraftAvailable(false);
      // Reload patient profile if restoring a walk-in draft
      if (!draft.appointmentId && (draft.form?.patientPhone || draft.form?.patientName)) {
        setLoadingExtra(true);
        try {
          const query = withPhonePrefix(draft.form.patientPhone) || draft.form.patientName;
          const searchRes = await fetch(`/api/dashboard/patients/search?q=${encodeURIComponent(query)}`);
          const searchData = await searchRes.json();
          const match = draft.form.patientPhone
            ? (searchData.patients || []).find(p => stripPhonePrefix(p.phone) === draft.form.patientPhone)
            : (searchData.patients || [])[0];
          if (match && match.id) {
            const data = await fetchCached(`/api/dashboard/patients/${match.id}`);
            if (data.patient) {
              setPatientProfile(data.patient);
              setForm(f => ({ ...f, patientSex: normalizeSex(data.patient.sex) }));
          if (data.visits) {
            setPatientVisits(data.visits);
            const lastVisit = data.visits.sort((a, b) => new Date(b.date || b.created_at) - new Date(a.date || a.created_at))[0];
            if (lastVisit) {
              setForm(f => ({
                ...f,
                treatment: lastVisit.treatment || '',
                diagnosis: lastVisit.diagnosis || '',
                chiefComplaint: lastVisit.chief_complaint || '',
                generalExamination: lastVisit.general_examination || '',
                extraOralExamination: lastVisit.extra_oral_examination || '',
                medicines: Array.isArray(lastVisit.medicines) ? lastVisit.medicines : [],
                adviceSelected: Array.isArray(lastVisit.advice_selected) ? lastVisit.advice_selected : [],
                diagnosisSelected: Array.isArray(lastVisit.diagnosis_selected) ? lastVisit.diagnosis_selected : [],
                toothDiagnoses: mergeToothDiagnoses(data.visits),
              }));
              const savedTreatments = Array.isArray(lastVisit.treatments) && lastVisit.treatments.length > 0
                ? lastVisit.treatments
                : lastVisit.treatment ? [lastVisit.treatment] : [];
              if (lastVisit.consultation_fee) setConsultationFee(Number(lastVisit.consultation_fee));
              if (savedTreatments.length > 0) {
                const fees = {};
                savedTreatments.forEach(name => {
                  const id = resolveTreatmentId(name) || name;
                  fees[id] = normalizeTreatmentFee(getFee(id), id);
                });
                setTreatmentFees(fees);
              }
            }
          }
            }
          }
        } catch (e) { console.error('restoreDraft error:', e); }
        setLoadingExtra(false);
      }
      showToast('Draft restored', 'success');
    } catch {}
  }

  function dismissDraft() {
    localStorage.removeItem(DRAFT_KEY);
    setDraftAvailable(false);
  }

  // ── formDirty debounced ──
  useEffect(() => {
    if (formDirtyTimerRef.current) clearTimeout(formDirtyTimerRef.current);
    formDirtyTimerRef.current = setTimeout(() => {
      setFormDirty(true);
    }, 500);
    return () => { if (formDirtyTimerRef.current) clearTimeout(formDirtyTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, treatmentFees, consultationFee]);

  // Load templates on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(TEMPLATES_KEY);
      if (saved) setTemplates(JSON.parse(saved));
      const savedRx = localStorage.getItem(RX_TEMPLATES_KEY);
      if (savedRx) setRxTemplates(JSON.parse(savedRx));
    } catch {}
  }, []);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    function handleKeyDown(e) {
      // Ctrl+Enter or Cmd+Enter to submit
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        const submitBtn = document.querySelector('button[type="submit"]');
        if (submitBtn && !submitBtn.disabled) submitBtn.click();
      }
      // Escape to close dropdowns
      if (e.key === 'Escape') {
        setSearchResults([]);
        setSearchState('idle');
        setShowSuggestions(false);
        setShowTemplateLoad(false);
        setShowTemplateInput(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  function parseToothDiagnoses(raw) {
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
      try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; }
      catch { return []; }
    }
    return [];
  }

  function mergeToothDiagnoses(visits) {
    if (!visits?.length) return [];
    const sorted = [...visits].sort((a, b) => new Date(b.date || b.created_at) - new Date(a.date || a.created_at));
    const toothMap = {};
    for (const visit of sorted) {
      const entries = parseToothDiagnoses(visit.tooth_diagnoses);
      if (entries.length === 0) continue;
      for (const entry of entries) {
        if (entry.tooth == null) continue;
        if (toothMap[entry.tooth] !== undefined) continue;
        if (!entry.diagnoses?.length && !entry.treatment && !entry.severity) continue;
        toothMap[entry.tooth] = { ...entry, treatment: resolveTreatmentId(entry.treatment) || entry.treatment };
      }
    }
    return Object.values(toothMap);
  }

  async function selectPatient(p) {
    if (!p) return;
    setForm(f => ({
      ...f,
      patientName: p.name || '',
      patientPhone: (p.phone || '').replace(/\D/g, '').slice(0, 10) || f.patientPhone,
      patientAge: p.age?.toString() || '',
      patientSex: normalizeSex(p.sex),
      patientLocation: p.location || '',
    }));
    if (p.location && !LOCATIONS.includes(p.location)) setShowCustomLocation(true);
    setSearchState('idle');
    setSearchResults([]);
    if (p.id) {
      setLoadingExtra(true);
      try {
        const data = await fetchCached(`/api/dashboard/patients/${p.id}`);
        if (data.patient) {
          const profile = data.patient;
          setPatientProfile(profile);
          if (profile.allergies !== undefined || profile.chronicConditions !== undefined || profile.bloodGroup !== undefined || profile.bp !== undefined || profile.weight !== undefined || profile.medications !== undefined || profile.habits !== undefined || profile.address !== undefined || profile.occupation !== undefined || profile.dental_history !== undefined || profile.family_history !== undefined) {
            setMedicalHistory(mh => ({
              ...mh,
              allergies: profile.allergies || '',
              chronicConditions: profile.chronicConditions || '',
              bloodGroup: profile.bloodGroup || '',
              bp: profile.bp || '',
              weight: profile.weight || '',
              medications: profile.medications || '',
              habits: profile.habits || {},
              address: profile.address || '',
              occupation: profile.occupation || '',
              dentalHistory: profile.dental_history || '',
              familyHistory: profile.family_history || '',
            }));
          }
          if (data.visits) {
            setPatientVisits(data.visits);
            const lastVisit = data.visits.sort((a, b) => new Date(b.date || b.created_at) - new Date(a.date || a.created_at))[0];
            if (lastVisit) {
              setForm(f => ({
                ...f,
                treatment: lastVisit.treatment || '',
                diagnosis: lastVisit.diagnosis || '',
                chiefComplaint: lastVisit.chief_complaint || '',
                generalExamination: lastVisit.general_examination || '',
                extraOralExamination: lastVisit.extra_oral_examination || '',
                medicines: Array.isArray(lastVisit.medicines) ? lastVisit.medicines : [],
                adviceSelected: Array.isArray(lastVisit.advice_selected) ? lastVisit.advice_selected : [],
                diagnosisSelected: Array.isArray(lastVisit.diagnosis_selected) ? lastVisit.diagnosis_selected : [],
                toothDiagnoses: mergeToothDiagnoses(data.visits),
              }));
              const savedTreatments = Array.isArray(lastVisit.treatments) && lastVisit.treatments.length > 0
                ? lastVisit.treatments
                : lastVisit.treatment ? [lastVisit.treatment] : [];
              if (lastVisit.consultation_fee) setConsultationFee(Number(lastVisit.consultation_fee));
              if (savedTreatments.length > 0) {
                const fees = {};
                savedTreatments.forEach(name => {
                  const id = resolveTreatmentId(name) || name;
                  fees[id] = normalizeTreatmentFee(getFee(id), id);
                });
                setTreatmentFees(fees);
              }
            }
          }
          Promise.all([
            fetchCached(`/api/dashboard/patients/${p.id}/messages?limit=10`)
              .then(mData => { if (mData.messages) setPatientMessages(mData.messages); })
              .catch(() => {}),
            fetchCached(`/api/dashboard/patients/${p.id}/family`)
              .then(fData => { if (fData.family) setPatientFamily(fData.family); })
              .catch(() => {}),
          ]);
        }
      } catch (e) { console.error('selectPatient error:', e); }
      setLoadingExtra(false);
    }
  }

  async function handleWalkInComplete(patientData) {
    // If patient has an id, they already exist
    if (patientData.id) {
      setAppointmentId(null);
      setAppointmentMeta(null);
      await selectPatient(patientData);
      setShowWalkInDrawer(false);
      return true;
    }

    setForm(f => ({
      ...f,
      patientName: patientData.name,
      patientPhone: stripPhonePrefix(patientData.phone || ''),
      patientAge: patientData.age?.toString() || '',
      patientSex: patientData.sex || '',
      patientLocation: patientData.location || '',
    }));
    if (patientData.location && !LOCATIONS.includes(patientData.location)) setShowCustomLocation(true);

    // No existing patient: create a real patient record before consultation starts.
    try {
      const res = await apiFetch('/api/dashboard/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: patientData.name,
          phone: patientData.phone || null,
          age: patientData.age || null,
          sex: patientData.sex || '',
          location: patientData.location || '',
        }),
      });
      const data = await res.json();
      if (res.ok && data.patient) {
        setPatientProfile(data.patient);
        setForm(f => ({
          ...f,
          patientName: data.patient.name || patientData.name,
          patientPhone: stripPhonePrefix(data.patient.phone || patientData.phone || ''),
          patientAge: data.patient.age?.toString() || patientData.age?.toString() || '',
          patientSex: normalizeSex(data.patient.sex || patientData.sex),
          patientLocation: data.patient.location || patientData.location || '',
        }));
        setAppointmentId(null);
        setAppointmentMeta(null);
        setShowWalkInDrawer(false);
        return true;
      }

      if (res.status === 409) {
        showToast(data.error || 'Phone already belongs to another patient', 'error');
        return false;
      }

      showToast(data.error || 'Could not register patient yet', 'error');
      return false;
    } catch {
      showToast('Network error — could not register patient', 'error');
      return false;
    }
  }

  // ── Treatment Templates ──
  function saveTemplate() {
    if (!templateName.trim()) { showToast('Enter a template name', 'error'); return; }
    const newTemplate = {
      id: Date.now().toString(),
      name: templateName.trim(),
      treatmentFees: { ...treatmentFees },
      consultationFee,
    };
    const updated = [...templates, newTemplate];
    setTemplates(updated);
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(updated));
    setTemplateName('');
    setShowTemplateInput(false);
    showToast(`Template "${newTemplate.name}" saved`, 'success');
  }

  function loadTemplate(tpl) {
    const normalized = {};
    Object.entries(tpl.treatmentFees || {}).forEach(([k, v]) => { normalized[k] = normalizeTreatmentFee(v, k); });
    setTreatmentFees(normalized);
    if (tpl.consultationFee) setConsultationFee(tpl.consultationFee);
    setShowTemplateLoad(false);
    showToast(`Template "${tpl.name}" loaded`, 'success');
  }

  function deleteTemplate(id) {
    const updated = templates.filter(t => t.id !== id);
    setTemplates(updated);
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(updated));
  }

  // ── Rx Templates ──
  function saveRxTemplate() {
    if (!rxTemplateName.trim()) { showToast('Enter a preset name', 'error'); return; }
    const newTemplate = {
      id: Date.now().toString(),
      name: rxTemplateName.trim(),
      medicines: [...form.medicines],
      advice: [...form.adviceSelected],
      diet: [],
      followUp: form.followUpDate || null
    };
    const updated = [...rxTemplates, newTemplate];
    setRxTemplates(updated);
    localStorage.setItem(RX_TEMPLATES_KEY, JSON.stringify(updated));
    setRxTemplateName('');
    setShowRxTemplateInput(false);
    showToast(`Preset "${newTemplate.name}" saved`, 'success');
  }

  function loadRxTemplate(tpl) {
    setForm(f => ({
      ...f,
      medicines: tpl.medicines && tpl.medicines.length > 0 ? [...tpl.medicines] : f.medicines,
      adviceSelected: tpl.advice && tpl.advice.length > 0 ? [...tpl.advice] : f.adviceSelected,
      followUpDate: tpl.followUp || f.followUpDate
    }));
    setShowRxTemplateLoad(false);
    showToast(`Preset "${tpl.name}" loaded`, 'success');
  }

  function deleteRxTemplate(id) {
    const updated = rxTemplates.filter(t => t.id !== id);
    setRxTemplates(updated);
    localStorage.setItem(RX_TEMPLATES_KEY, JSON.stringify(updated));
    showToast('Preset deleted', 'info');
  }

  // ── Salt tap-to-add ──
  function toggleSalt(salt) {
    const existing = form.medicines.findIndex(m => m.name === salt);
    if (existing >= 0) {
      setForm(f => ({ ...f, medicines: f.medicines.filter((_, i) => i !== existing) }));
    } else {
      setForm(f => ({ ...f, medicines: [...f.medicines, { name: salt, dosage: '\u2014', frequency: '', duration: '', timing: 'after', rate: medicineSettings?.salts?.[salt]?.price || 0 }] }));
    }
  }

  function loadMedicineTemplate(tpl) {
    setForm(f => {
      const existingNames = new Set(f.medicines.map(m => m.name));
      const newMeds = tpl.medicines
        .filter(m => m.name && !existingNames.has(m.name))
        .map(m => ({ name: m.name, dosage: m.dosage || '\u2014', frequency: m.frequency || '', duration: m.duration || '', timing: m.timing || 'after', rate: m.rate || 0 }));
      if (newMeds.length === 0) { showToast('All medicines already added', 'info'); return f; }
      showToast(`Loaded "${tpl.name}" (${newMeds.length} medicines)`, 'success');
      return { ...f, medicines: [...f.medicines, ...newMeds] };
    });
  }

  async function saveMedicineTemplate() {
    if (form.medicines.length === 0) {
      showToast('Add medicines before saving a quick template', 'error');
      return;
    }
    if (!medicineTemplateName.trim()) {
      showToast('Enter a medicine template name', 'error');
      return;
    }

    const newTemplate = {
      id: `tpl_${Date.now()}`,
      name: medicineTemplateName.trim(),
      medicines: form.medicines
        .map(m => ({
          name: m.name || '',
          dosage: m.dosage || '',
          frequency: m.frequency || '',
          duration: m.duration || '',
          timing: m.timing || 'after',
          rate: m.rate || 0,
        }))
        .filter(m => m.name),
    };

    if (newTemplate.medicines.length === 0) {
      showToast('Add at least one named medicine', 'error');
      return;
    }

    setSavingMedicineTemplate(true);
    try {
      const nextTemplates = [...medicineTemplates, newTemplate];
      const nextSettings = {
        ...medicineSettings,
        usage: medicineUsage || medicineSettings.usage || {},
        templates: nextTemplates,
      };
      const res = await apiFetch('/api/dashboard/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'medicines', value: nextSettings }),
      });
      if (!res.ok) throw new Error('Failed to save medicine template');
      setMedicineSettings(nextSettings);
      setMedicineTemplates(nextTemplates);
      setMedicineTemplateName('');
      setShowMedicineTemplateInput(false);
      showToast(`Medicine template "${newTemplate.name}" saved`, 'success');
    } catch {
      showToast('Failed to save medicine template', 'error');
    } finally {
      setSavingMedicineTemplate(false);
    }
  }

  async function saveRatings() {
    const patientId = patientProfile?.id || appointmentMeta?.patient_id;
    if (!patientId) { showToast('No patient selected — cannot save ratings', 'error'); return; }
    setSavingRatings(true);
    try {
      const res = await fetch(`/api/dashboard/patients/${patientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patient_ratings: patientRatings }),
      });
      if (res.ok) showToast('Ratings saved', 'success');
      else showToast('Failed to save ratings', 'error');
    } catch {
      showToast('Network error', 'error');
    } finally {
      setSavingRatings(false);
    }
  }

  async function sendPaymentLink() {
    const phone = patientProfile?.phone || appointmentMeta?.patient_phone || withPhonePrefix(form.patientPhone);
    if (!phone) { showToast('No patient phone number', 'error'); return; }
    setSendingPaymentLink(true);
    try {
      const dueAmount = totalFees - paidAmount;
      const payAmount = dueAmount > 0 ? dueAmount : totalFees;
      const link = upiDeepLink(payAmount, Date.now().toString(36), `${form.patientName} - ${form.diagnosis?.slice(0, 30) || 'Payment'}`);
      const message = `Dear ${form.patientName},\n\nPlease pay ₹${payAmount.toLocaleString('en-IN')} for your recent visit to Shri Balaji Dental Clinic.\n\nClick to pay: ${link}\n\nThank you!`;
      const waId = phone.startsWith('+') ? phone.slice(1) : phone;
      const res = await fetch('/api/dashboard/send-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: waId, message }),
      });
      if (res.ok) {
        showToast('Payment link sent on WhatsApp', 'success');
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to send', 'error');
      }
    } catch {
      showToast('Network error', 'error');
    } finally {
      setSendingPaymentLink(false);
    }
  }

  const filteredSalts = saltSearch.trim().length >= 1
    ? medicineList.filter(s => s.toLowerCase().includes(saltSearch.toLowerCase()))
    : medicineList;

  async function uploadMediaFiles(files, targetAppointmentId) {
    if (!targetAppointmentId || files.length === 0) return { uploaded: 0, failed: files.length };

    setUploadingMedia(true);
    const uploadedFiles = new Set();
    const uploadedKeys = [];

    try {
      for (const file of files) {
        try {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('appointmentId', targetAppointmentId);

          const mediaRes = await apiFetch('/api/dashboard/media', {
            method: 'POST',
            body: formData,
          });
          const mediaData = await mediaRes.json();

          if (mediaRes.ok) {
            uploadedFiles.add(file);
            if (mediaData.key) uploadedKeys.push(mediaData.key);
          } else {
            console.error('[MEDIA] Upload failed:', mediaData);
            showToast(`Upload failed for ${file.name}: ${mediaData.error || 'Unknown error'}`, 'error', { duration: 7000 });
          }
        } catch (mediaErr) {
          console.error('[MEDIA] Upload network error:', mediaErr);
          showToast(`Upload failed for ${file.name}`, 'error', { duration: 7000 });
        }
      }
    } finally {
      if (uploadedFiles.size > 0) {
        setMediaFiles(prev => prev.filter(file => !uploadedFiles.has(file)));
      }
      if (uploadedKeys.length > 0) {
        setAppointmentMeta(prev => prev
          ? { ...prev, chit_media: [...(Array.isArray(prev.chit_media) ? prev.chit_media : []), ...uploadedKeys] }
          : prev);
      }
      setUploadingMedia(false);
    }

    const uploaded = uploadedFiles.size;
    if (uploaded > 0) {
      showToast(`${uploaded} attachment${uploaded === 1 ? '' : 's'} uploaded`, 'success');
    }
    return { uploaded, failed: files.length - uploaded };
  }

  async function handleMediaUpload(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    console.log('[MEDIA] Files selected:', files.map(f => ({ name: f.name, size: f.size, type: f.type })));
    try {
      setMediaFiles(prev => [...prev, ...files]);
      const targetAppointmentId = appointmentMeta?.id || appointmentId;
      if (targetAppointmentId) {
        showToast(`Uploading ${files.length} attachment${files.length === 1 ? '' : 's'}...`, 'info');
        await uploadMediaFiles(files, targetAppointmentId);
      } else {
        showToast(`${files.length} attachment${files.length === 1 ? '' : 's'} queued. Save the visit to upload.`, 'info');
      }
    } catch (err) {
      console.error('[MEDIA] Error adding files:', err);
      showToast('Failed to add media', 'error');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (galleryInputRef.current) galleryInputRef.current.value = '';
    }
  }

  async function handleCameraCapture(file) {
    setMediaFiles(prev => [...prev, file]);
    const targetAppointmentId = appointmentMeta?.id || appointmentId;
    if (targetAppointmentId) {
      showToast('Uploading captured photo...', 'info');
      await uploadMediaFiles([file], targetAppointmentId);
    } else {
      showToast('Photo queued. Save the visit to upload.', 'success');
    }
  }

  function removeMediaFile(idx) {
    setMediaFiles(prev => prev.filter((_, i) => i !== idx));
  }

  function addMedicine() {
    setForm(f => ({ ...f, medicines: [...f.medicines, { name: '', dosage: '', frequency: '', duration: '', timing: 'after', rate: 0 }] }));
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
    if (selectedTreatments.length === 0 && visitMode !== VISIT_MODES.CREATE_WALK_IN) {
      e.treatment = 'Please select at least one treatment';
    }
    setErrors(e);
    const valid = Object.keys(e).length === 0;
    if (!valid) showToast('Please fill in all required fields (name + treatment)', 'error');
    return valid;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      const mappedTreatments = selectedTreatments.map(id => getTreatmentName(id));
      const primaryTreatment = mappedTreatments[0] || form.treatment || 'Walk-in';
      const walkInAge = form.patientAge ? parseInt(form.patientAge, 10) : undefined;
      const paymentPayload = {
        paymentStatus,
        paidAmount,
        paymentMethod: paymentStatus === 'paid' || paymentStatus === 'partial' ? paymentMethod : undefined,
        transactionId: transactionId.trim() || undefined,
      };

      const payload = appointmentId
        ? {
            mode: visitMode,
            appointmentId,
            treatment: primaryTreatment,
            treatments: mappedTreatments,
            treatmentFees,
            diagnosis: cleanOptionalText(form.diagnosis),
            medicines: form.medicines.filter(m => cleanOptionalText(m?.name)),
            consultationFee,
            treatmentCharges: computedTreatmentCharges,
            medicineCharges: Number(form.medicineCharges) || 0,
            notes: cleanOptionalText(form.notes),
            followUpDate: form.followUpDate || undefined,
            followUpInstructions: cleanOptionalText(form.followUpInstructions),
            advice_selected: form.adviceSelected,
            diagnosis_selected: form.diagnosisSelected,
            tooth_diagnoses: form.toothDiagnoses,
            status: isEdit ? undefined : 'completed',
            chiefComplaint: cleanOptionalText(form.chiefComplaint),
            generalExamination: cleanOptionalText(form.generalExamination),
            extraOralExamination: cleanOptionalText(form.extraOralExamination),
            ...paymentPayload,
          }
        : {
            mode: VISIT_MODES.CREATE_WALK_IN,
            patient_id: patientProfile?.id || undefined,
            patient_name: form.patientName.trim(),
            patient_phone: form.patientPhone ? `+91${form.patientPhone}` : undefined,
            patient_age: walkInAge,
            patient_sex: form.patientSex || undefined,
            patient_location: cleanOptionalText(form.patientLocation),
            treatment: primaryTreatment,
            treatments: mappedTreatments,
            treatmentFees,
            consultationFee,
            treatmentCharges: computedTreatmentCharges,
            medicineCharges: Number(form.medicineCharges) || 0,
            diagnosis: cleanOptionalText(form.diagnosis),
            chiefComplaint: cleanOptionalText(form.chiefComplaint),
            generalExamination: cleanOptionalText(form.generalExamination),
            extraOralExamination: cleanOptionalText(form.extraOralExamination),
            medicines: form.medicines.filter(m => cleanOptionalText(m?.name)),
            followUpDate: form.followUpDate || undefined,
            followUpInstructions: cleanOptionalText(form.followUpInstructions),
            advice_selected: form.adviceSelected,
            diagnosis_selected: form.diagnosisSelected,
            tooth_diagnoses: form.toothDiagnoses,
            notes: cleanOptionalText(form.notes),
            ...paymentPayload,
          };

      const res = await apiFetch('/api/dashboard/visit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Failed to log visit', 'error');
        if (mediaFiles.length > 0) {
          showToast('Visit was not saved, so queued attachments were not uploaded', 'info', { duration: 7000 });
        }
        return;
      }

      // Post-save: medical history + media upload (failures don't block success)
      const patientIdForHistory = patientProfile?.id || appointmentMeta?.patient_id || data.appointment?.patient_id;
      if (patientIdForHistory) {
        const mhPayload = {};
        if (medicalHistory.allergies) mhPayload.allergies = medicalHistory.allergies;
        if (medicalHistory.chronicConditions) mhPayload.chronicConditions = medicalHistory.chronicConditions;
        if (medicalHistory.bloodGroup) mhPayload.bloodGroup = medicalHistory.bloodGroup;
        if (medicalHistory.bp) mhPayload.bp = medicalHistory.bp;
        if (medicalHistory.weight) mhPayload.weight = medicalHistory.weight;
        if (medicalHistory.medications) mhPayload.medications = medicalHistory.medications;
        if (medicalHistory.habits && Object.keys(medicalHistory.habits).length > 0) mhPayload.habits = medicalHistory.habits;
        if (medicalHistory.address) mhPayload.address = medicalHistory.address;
        if (medicalHistory.occupation) mhPayload.occupation = medicalHistory.occupation;
        if (medicalHistory.dentalHistory) mhPayload.dentalHistory = medicalHistory.dentalHistory;
        if (medicalHistory.familyHistory) mhPayload.familyHistory = medicalHistory.familyHistory;
        if (Object.keys(mhPayload).length > 0) {
          try {
            const mhRes = await fetch(`/api/dashboard/patients/${patientIdForHistory}/medical-history`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(mhPayload),
            });
            if (!mhRes.ok) console.error('[VISIT] Medical history save failed');
          } catch (mhErr) {
            console.error('[VISIT] Medical history network error:', mhErr);
          }
        }
      }

      const appointmentIdForMedia = data.appointment?.id || appointmentId;
      if (appointmentIdForMedia && mediaFiles.length > 0) {
        await uploadMediaFiles(mediaFiles, appointmentIdForMedia);
      }

      localStorage.removeItem(DRAFT_KEY);
      const appointmentIdForResult = data.appointment?.id || appointmentId;
      setResult({ patient_name: form.patientName, treatment: primaryTreatment, appointment_id: appointmentIdForResult });
      setVisitSaved(true);
      setFormDirty(false);
      const cachedPatientId = data.appointment?.patient_id || patientProfile?.id || appointmentMeta?.patient_id;
      if (cachedPatientId) invalidateFetchCache(`/api/dashboard/patients/${cachedPatientId}`);

      // Refresh patient profile from server so age/sex/phone display correctly
      if (!patientProfile?.id && data.appointment?.patient_id) {
        fetch(`/api/dashboard/patients/${data.appointment.patient_id}`)
          .then(r => r.json())
          .then(pData => {
            if (pData.patient) {
              setPatientProfile(pData.patient);
              setForm(f => ({
                ...f,
                patientPhone: (pData.patient.phone || '').replace(/\D/g, ''),
                patientAge: pData.patient.age?.toString() || '',
                patientSex: pData.patient.sex || '',
                patientLocation: pData.patient.location || '',
              }));
            }
          })
          .catch(() => {});
      }
    } catch (err) {
      console.error('[VISIT] Submit error:', err);
      showToast('Network error — could not save visit', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setForm({ patientName: '', patientPhone: '', patientAge: '', patientSex: '', patientLocation: '', treatment: '', consultationFee: '', treatmentCharges: '', medicineCharges: 0, diagnosis: '', medicines: [], followUpDate: '', followUpInstructions: '', notes: '', adviceSelected: [], diagnosisSelected: [], toothDiagnoses: [], chiefComplaint: '', generalExamination: '', extraOralExamination: '' });
    setTreatmentFees({});
    setConsultationFee(CONSULTATION_DEFAULT);
    setPatientProfile(null);
    setAppointmentMeta(null);
    setPatientVisits([]);
    setPatientMessages([]);
    setPatientFamily([]);
    setMedicalHistory({ allergies: '', chronicConditions: '', bloodGroup: '', bp: '', weight: '', medications: '', habits: {}, address: '', occupation: '', dentalHistory: '', familyHistory: '' });
    setResult(null);
    setErrors({});
    setMediaFiles([]);
    setSymptomInput('');
    setShowCustomLocation(false);
    setShowTemplateInput(false);
    setShowTemplateLoad(false);
    setTemplateName('');
    setDraftRestored(false);
    setDraftAvailable(false);
    setSaltSearch('');
    setPaymentStatus('pending');
    setPaymentMethod('');
    setTransactionId('');
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

  function getSignedUrl(key) {
    return `/api/dashboard/media/signed?key=${encodeURIComponent(key)}`;
  }

  // ── Mode A: No patient selected — Patient Selection ──
  if (!patientProfile && !appointmentId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100/50 dark:from-gray-950 dark:to-gray-900 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-8 md:p-12 max-w-lg w-full text-center shadow-lg">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/30 dark:to-emerald-800/30 mb-6">
            <Stethoscope className="w-8 h-8 text-emerald-500 dark:text-emerald-400" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Start Consultation</h2>

          {/* Patient search */}
          <div className="relative mb-6">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" value={form.patientName}
              onChange={e => setForm(f => ({ ...f, patientName: e.target.value }))}
              placeholder="Search existing patient..."
              className="w-full pl-10 pr-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 transition-all" />
            {searchState === 'searching' && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="w-4 h-4 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
              </div>
            )}
          </div>

          {searchResults.length > 0 && (
            <div className="mb-6 border border-gray-200 dark:border-gray-700 rounded-xl divide-y divide-gray-100 dark:divide-gray-800 max-h-[240px] overflow-y-auto text-left">
              {searchResults.slice(0, 5).map(p => (
                <button key={p.id} type="button" onClick={() => selectPatient(p)}
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-100 to-emerald-50 dark:from-emerald-900/30 dark:to-emerald-800/30 flex items-center justify-center text-xs font-semibold text-emerald-700 dark:text-emerald-300 shrink-0">
                    {(p.name || '?')[0].toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{p.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{p.phone || ''}{p.phone && p.age ? ' · ' : ''}{p.age ? `${p.age} yrs` : ''}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3 mb-6">
            <hr className="flex-1 border-gray-200 dark:border-gray-700" />
            <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">or</span>
            <hr className="flex-1 border-gray-200 dark:border-gray-700" />
          </div>

          <button type="button" onClick={() => setShowWalkInDrawer(true)}
            className="w-full py-2.5 text-sm font-semibold rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white hover:from-emerald-600 hover:to-emerald-700 shadow-lg shadow-emerald-200 dark:shadow-emerald-900/50 transition-all active:scale-[0.99]">
            + Register Walk-in
          </button>
        </div>

        {showWalkInDrawer && (
          <WalkInDrawer onComplete={handleWalkInComplete} onClose={() => setShowWalkInDrawer(false)} />
        )}
      </div>
    );
  }

  // ── Result (post-save) Screen ──
  if (result) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100/50 dark:from-gray-950 dark:to-gray-900 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-8 md:p-12 max-w-lg w-full text-center shadow-lg transition-colors duration-200">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/30 dark:to-emerald-800/30 mb-6">
            <ClipboardCheck className="w-10 h-10 text-emerald-500 dark:text-emerald-400" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">{isEdit ? 'Visit Updated Successfully' : 'Visit Logged Successfully'}</h2>
          <div className="text-gray-500 dark:text-gray-400 text-sm mb-6 space-y-1">
            <p><span className="font-medium text-gray-700 dark:text-gray-300">{result.patient_name}</span> — {result.treatment}</p>
          </div>

          {/* Doctor's Patient Rating */}
          {(patientProfile?.id || appointmentMeta?.patient_id) && (
            <div className="mb-6 text-left bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-4 border border-gray-100 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-3 text-center">
                Rate this Patient
              </h3>
              <div className="space-y-2.5">
                {RATING_CATEGORIES.map(cat => (
                  <div key={cat.key} className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400 min-w-[110px] sm:min-w-[140px]">{cat.label}</span>
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map(star => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setPatientRatings(prev => ({ ...prev, [cat.key]: (prev[cat.key] || 0) === star ? 0 : star }))}
                          className={`w-5 h-5 flex items-center justify-center rounded-sm transition-all hover:scale-110 active:scale-90 ${
                            (patientRatings[cat.key] || 0) >= star
                              ? 'text-amber-400'
                              : 'text-gray-300 dark:text-gray-600'
                          }`}
                        >
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                        </button>
                      ))}
                      <span className="ml-1.5 text-xs font-medium text-gray-400 dark:text-gray-500 min-w-[20px]">
                        {patientRatings[cat.key] || 0}/5
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <p className="text-xs text-gray-400 dark:text-gray-500">Rate the patient across these categories</p>
                <button
                  onClick={saveRatings}
                  disabled={savingRatings}
                  className="px-3 py-1.5 text-xs font-medium bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white rounded-lg transition-all active:scale-95"
                >
                  {savingRatings ? 'Saving...' : 'Save Ratings'}
                </button>
              </div>
            </div>
          )}

          <div className="flex gap-3 justify-center flex-wrap">
              {isEdit ? (
                <button onClick={() => router.push(`/dashboard/patients/${searchParams.get('patientId') || ''}`)} className="px-6 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-medium rounded-xl hover:bg-gray-800 dark:hover:bg-gray-100 transition-all active:scale-95">
                  Back to Patient
                </button>
              ) : appointmentId ? (
              <button onClick={() => router.push(returnTo === 'queue' ? '/dashboard/queue' : '/dashboard/appointments')} className="px-6 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-medium rounded-xl hover:bg-gray-800 dark:hover:bg-gray-100 transition-all active:scale-95">
                Back to {returnTo === 'queue' ? 'Queue' : 'Appointments'}
              </button>
            ) : (
              <>
                <button onClick={() => router.push('/dashboard')} className="px-6 py-2.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all">
                  Back to Dashboard
                </button>
                <button onClick={resetForm} className="px-6 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-medium rounded-xl hover:bg-gray-800 dark:hover:bg-gray-100 transition-all active:scale-95">
                  Log Another Visit
                </button>
              </>
            )}
            <button onClick={async () => {
              try {
                const id = result.appointment_id;
                if (!id) { showToast('No appointment ID — cannot generate prescription', 'error'); return; }
                const res = await apiFetch(`/api/dashboard/visits/${id}/prescription`, { method: 'POST' });
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
            }} className="px-6 py-2.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all">
              Print
            </button>
            <button onClick={async () => {
              if (compiling) return;
              setCompiling(true);
              try {
                const id = result.appointment_id;
                if (!id) { showToast('No appointment ID', 'error'); setCompiling(false); return; }
                showToast('⏳ Compiling document with images...', 'info', { duration: 8000 });
                const res = await apiFetch(`/api/dashboard/visits/${id}/compile`, { method: 'POST' });
                const data = await res.json();
                if (res.ok && data.url) {
                  showToast('✅ PDF compiled — opening in new tab', 'success', { duration: 4000 });
                  window.open(data.url, '_blank');
                  // Also send via WhatsApp if phone number exists
                  showToast('📤 Sending to patient via WhatsApp...', 'info', { duration: 6000 });
                  const sendRes = await apiFetch(`/api/dashboard/visits/${id}/compile/send`, { method: 'POST' });
                  const sendData = await sendRes.json();
                  if (sendRes.ok && sendData.success) {
                    showToast('✅ Document sent to patient on WhatsApp', 'success');
                  } else if (sendData.url) {
                    showToast('⚠️ PDF ready but WhatsApp send failed. You can share the link manually.', 'info');
                  } else {
                    showToast('⚠️ Document compiled but could not send via WhatsApp.', 'info');
                  }
                } else {
                  showToast(data.error || 'Failed to compile document', 'error');
                }
              } catch (err) {
                showToast('Network error: ' + (err.message || 'Could not compile'), 'error');
              } finally {
                setCompiling(false);
              }
            }}
              disabled={compiling}
              className={`px-6 py-2.5 text-sm font-medium rounded-xl shadow-lg transition-all active:scale-95 cursor-pointer ${
                compiling
                  ? 'bg-gray-400 text-white cursor-not-allowed shadow-none'
                  : 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-emerald-200 dark:shadow-emerald-900/50 hover:from-emerald-600 hover:to-emerald-700'
              }`}>
              {compiling ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Compiling...
                </span>
              ) : (
                'Compile & Send'
              )}
            </button>
            <button onClick={async () => {
              if (!googleMapsUrl) { showToast('Set Google Maps review URL in settings first', 'error'); return; }
              setSendingReviewLink(true);
              try {
                const phone = result?.patient_name ? (appointmentMeta?.patient_phone || form.patientPhone) : '';
                const waId = appointmentMeta?.patient_phone?.startsWith('+') ? appointmentMeta.patient_phone.slice(1) : appointmentMeta?.patient_phone || '';
                if (!waId && form.patientPhone) {
                  const p = withPhonePrefix(form.patientPhone);
                  const cleanWaId = p.startsWith('+') ? p.slice(1) : p;
                  if (cleanWaId) {
                    const msg = `Dear ${result.patient_name},\n\nThank you for visiting Shri Balaji Dental Clinic! 🙏\n\nWe would love to hear about your experience. Please take a moment to leave us a Google review:\n\n${googleMapsUrl}\n\nYour feedback helps us serve you better!`;
                    const res = await fetch('/api/dashboard/send-whatsapp', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ to: cleanWaId, message: msg }),
                    });
                    if (res.ok) showToast('Google review link sent on WhatsApp', 'success');
                    else showToast('Failed to send', 'error');
                    setSendingReviewLink(false);
                    return;
                  }
                }
                if (waId) {
                  const msg = `Dear ${result.patient_name},\n\nThank you for visiting Shri Balaji Dental Clinic! 🙏\n\nWe would love to hear about your experience. Please take a moment to leave us a Google review:\n\n${googleMapsUrl}\n\nYour feedback helps us serve you better!`;
                  const res = await fetch('/api/dashboard/send-whatsapp', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ to: waId, message: msg }),
                  });
                  if (res.ok) showToast('Google review link sent on WhatsApp', 'success');
                  else showToast('Failed to send', 'error');
                } else {
                  showToast('No phone number available', 'error');
                }
              } catch { showToast('Network error', 'error'); }
              setSendingReviewLink(false);
            }}
              disabled={sendingReviewLink}
              className={`px-6 py-2.5 text-sm font-medium rounded-xl shadow-lg transition-all active:scale-95 cursor-pointer ${
                sendingReviewLink
                  ? 'bg-gray-400 text-white cursor-not-allowed shadow-none'
                  : 'bg-orange-500 text-white shadow-orange-200 dark:shadow-orange-900/50 hover:bg-orange-600'
              }`}>
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M21.35 11.1H12v3h5.46c-.69 2.01-2.43 3.46-4.96 3.46-3.04 0-5.5-2.46-5.5-5.5s2.46-5.5 5.5-5.5c1.46 0 2.68.53 3.67 1.42l2.52-2.52C16.87 3.96 14.57 3 12 3 7.03 3 3 7.03 3 12s4.03 9 9 9c4.54 0 8.29-3.22 8.99-7.5l.36-2.4z" /></svg>
                {sendingReviewLink ? 'Sending...' : 'Google Review'}
              </span>
            </button>
          </div>
        </div>
      </div>
    );
  }
  const toothChartProps = { diagnosisOptions, form, stableSetSelectedTooth, selectedTooth, handleQuickDiagnosis, handleToothEntryUpdate, appointmentId, appointmentMeta };
  const mediaProps = { fileInputRef, handleMediaUpload, uploadingMedia, setShowCamera, galleryInputRef, mediaFiles, getFilePreview, getFileIcon, removeMediaFile };
  const currentAppointmentMedia = Array.isArray(appointmentMeta?.chit_media) ? appointmentMeta.chit_media : [];
  const previousVisitMediaGroups = (patientVisits || [])
    .filter(visit => visit.id !== appointmentId && Array.isArray(visit.chit_media) && visit.chit_media.length > 0)
    .map(visit => ({
      id: visit.id,
      title: visit.status === 'completed' ? 'Previous Visit' : 'Scheduled Visit',
      date: visit.date,
      media: visit.chit_media,
    }));
  const prescriptionProps = { rxTemplates, loadRxTemplate, deleteRxTemplate, showRxTemplateInput, setShowRxTemplateInput, form, setForm, rxTemplateName, setRxTemplateName, saveRxTemplate, saltSearch, setSaltSearch, filteredSalts, toggleSalt, addMedicine, removeMedicine, updateMedicine, FREQUENCY_OPTIONS, DURATION_OPTIONS, TIMING_OPTIONS, medicineUsage, medicineTemplates, loadMedicineTemplate, showMedicineTemplateInput, setShowMedicineTemplateInput, medicineTemplateName, setMedicineTemplateName, saveMedicineTemplate, savingMedicineTemplate };
  const adviceProps = { adviceOptions, form, setForm };

  const layout = visitLayout || DEFAULT_VISIT_LAYOUT;

  const SECTIONS = {
    chiefComplaint: () => patientProfile && (
      <div className="border-b border-gray-200 dark:border-gray-700 pb-4 mb-6">
        <h3 className="text-xl font-bold leading-7 text-gray-900 dark:text-gray-100 mb-3">Chief Complaint</h3>
        <textarea value={form.chiefComplaint} onChange={e => setForm(f => ({ ...f, chiefComplaint: e.target.value }))}
          rows={Math.min(4, Math.max(2, (form.chiefComplaint || '').split('\n').length))}
          className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-base leading-7 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-200 dark:focus:ring-orange-800 focus:border-orange-400 dark:focus:border-orange-500 transition-all resize-none placeholder-gray-400"
          placeholder="Chief Complaint — e.g. Pt complains of pain in upper left back tooth region, since 4 days." />
      </div>
    ),

    medicalHistory: () => patientProfile && (
      <div className="border-b border-gray-200 dark:border-gray-700 pb-4 mb-6 space-y-2">
        {(medicalHistory.allergies || medicalHistory.chronicConditions || medicalHistory.bloodGroup || medicalHistory.bp || medicalHistory.weight || medicalHistory.medications) && (
          <div>
            <button type="button" onClick={() => setShowMedicalSummary(!showMedicalSummary)}
              className="flex items-center gap-2 w-full text-left">
              {showMedicalSummary
                ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                : <ChevronRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              }
              <span className="text-base font-bold leading-6 text-gray-700 dark:text-gray-300 uppercase tracking-wide">Medical History</span>
            </button>
            {showMedicalSummary && (
              <div className="mt-2 ml-5 text-base text-gray-700 dark:text-gray-300 space-y-1.5 leading-7">
                {medicalHistory.allergies && <p><span className="font-medium">Allergies:</span> {medicalHistory.allergies}</p>}
                {medicalHistory.chronicConditions && <p><span className="font-medium">Conditions:</span> {medicalHistory.chronicConditions}</p>}
                {medicalHistory.bloodGroup && <p><span className="font-medium">Blood Group:</span> {medicalHistory.bloodGroup}</p>}
                {medicalHistory.bp && <p><span className="font-medium">BP:</span> {medicalHistory.bp}</p>}
                {medicalHistory.weight && <p><span className="font-medium">Weight:</span> {medicalHistory.weight}</p>}
                {medicalHistory.medications && <p><span className="font-medium">Medications:</span> {medicalHistory.medications}</p>}
              </div>
            )}
          </div>
        )}
        {medicalHistory.dentalHistory && (
          <div>
            <button type="button" onClick={() => setShowDentalSummary(!showDentalSummary)}
              className="flex items-center gap-2 w-full text-left">
              {showDentalSummary
                ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                : <ChevronRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              }
              <span className="text-base font-bold leading-6 text-gray-700 dark:text-gray-300 uppercase tracking-wide">Dental History</span>
            </button>
            {showDentalSummary && (
              <div className="mt-2 ml-5 text-base text-gray-700 dark:text-gray-300 leading-7">
                {medicalHistory.dentalHistory}
              </div>
            )}
          </div>
        )}
      </div>
    ),

    toothChart: () => (
      <div className="border-b border-gray-200 dark:border-gray-700 pb-4 mb-6">
        <h2 className="text-xl font-bold leading-7 text-gray-900 dark:text-gray-100 mb-3">Tooth Chart</h2>
        <ToothChartCard toothChartProps={toothChartProps} />
      </div>
    ),

    perToothEditor: () => selectedTooth && (
      <div id="per-tooth-editor" className="border-b border-gray-200 dark:border-gray-700 pb-4 mb-6">
        <PerToothDiagnosisPanel
          toothNumber={selectedTooth}
          currentEntry={selectedToothEntry}
          diagnosisOptions={diagnosisOptions}
          treatmentsFavorites={treatmentFavorites}
          customTreatments={customTreatments}
          history={selectedToothHistory}
          onSave={handleToothSave}
          onClose={handleToothClose}
        />
      </div>
    ),

    findings: () => patientProfile && (
      <div className="border-b border-gray-200 dark:border-gray-700 pb-4 mb-6">
        <Findings
          toothDiagnoses={form.toothDiagnoses}
          notes={form.notes}
          onToothSelect={(t) => { setSelectedTooth(t); }}
        />
      </div>
    ),

    overallDiagnosis: () => patientProfile && (
      <div className="border-b border-gray-200 dark:border-gray-700 pb-4 mb-6">
        <h3 className="text-xl font-bold leading-7 text-gray-900 dark:text-gray-100 mb-3">Overall Diagnosis</h3>
        <input type="text" value={form.diagnosis} onChange={e => setForm(f => ({ ...f, diagnosis: e.target.value }))}
          className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-base leading-7 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 transition-all placeholder-gray-400"
          placeholder="Overall diagnosis — e.g. Generalized chronic periodontitis with focal carious lesions" />
      </div>
    ),

    treatmentPlan: () => patientProfile && (
      <div className="border-b border-gray-200 dark:border-gray-700 pb-4 mb-6">
        <h3 className="text-xl font-bold leading-7 text-gray-900 dark:text-gray-100 mb-3">Treatment Plan</h3>
        {(() => {
          const perTooth = form.toothDiagnoses.filter(e => e.diagnoses?.length > 0 || e.treatment);
          const toothTreatmentIds = new Set(form.toothDiagnoses.filter(e => e.treatment).map(e => e.treatment));
          const general = selectedTreatments.filter(t => !toothTreatmentIds.has(t));
          if (perTooth.length === 0 && general.length === 0) {
            return <p className="text-base leading-7 text-gray-400 dark:text-gray-500 italic">No procedures planned yet.</p>;
          }
          return (
            <div className="space-y-3">
              {perTooth.map(e => (
                <div key={e.tooth} className="flex items-start gap-3">
                  <span className="text-xl shrink-0 mt-0.5">🦷</span>
                  <div className="flex-1">
                    <span className="text-lg font-bold leading-7 text-gray-900 dark:text-gray-100">Tooth {e.tooth}</span>
                    {e.diagnoses?.length > 0 && (
                      <div className="mt-1">
                        <span className="text-sm font-bold leading-6 text-gray-600 dark:text-gray-300 uppercase tracking-wide">Diagnosis</span>
                        <div className="ml-3 mt-0.5 space-y-0.5">
                          {e.diagnoses.map((d, di) => (
                            <p key={di} className="text-base leading-7 text-gray-700 dark:text-gray-300">• {d}</p>
                          ))}
                        </div>
                      </div>
                    )}
                    {e.treatment && (
                      <div className="mt-1">
                        <span className="text-sm font-bold leading-6 text-gray-600 dark:text-gray-300 uppercase tracking-wide">Planned</span>
                        <div className="ml-3 mt-0.5">
                          <p className="text-base leading-7 text-emerald-700 dark:text-emerald-300 font-semibold">• {getTreatmentName(e.treatment)}{e.surface ? ` (${e.surface})` : ''}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {general.length > 0 && (
                <div className="flex items-start gap-3">
                  <span className="text-xl shrink-0 mt-0.5">🌐</span>
                  <div className="flex-1">
                    <span className="text-lg font-bold leading-7 text-gray-900 dark:text-gray-100">General</span>
                    <div className="mt-1 ml-3 space-y-0.5">
                      {general.map(g => (
                        <p key={g} className="text-base leading-7 text-emerald-700 dark:text-emerald-300 font-semibold">• {getTreatmentName(g)}</p>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </div>
    ),

    examination: () => patientProfile && (() => {
      const hasContent = form.generalExamination || form.extraOralExamination;
      const isOpen = examinationOpen === true || (examinationOpen === null && hasContent);
      return (
        <div className="border-b border-gray-200 dark:border-gray-700 pb-4 mb-6">
          <button type="button" onClick={() => setExaminationOpen(prev => prev === null ? false : !prev)}
            className="flex items-center gap-2 w-full text-left mb-3">
            {isOpen
              ? <ChevronDown className="w-4 h-4 text-gray-400" />
              : <ChevronRight className="w-4 h-4 text-gray-400" />
            }
            <h3 className="text-xl font-bold leading-7 text-gray-900 dark:text-gray-100">Examination</h3>
          </button>
          {isOpen && (
            <div className="space-y-3">
              <textarea value={form.generalExamination} onChange={e => setForm(f => ({ ...f, generalExamination: e.target.value }))}
                rows={2} className="w-full px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-base leading-7 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 transition-all resize-none placeholder-gray-400"
                placeholder="General Examination — e.g. Extraoral: no swelling, TMJ normal. Intraoral: poor OH, generalized calculus..." />
              <textarea value={form.extraOralExamination} onChange={e => setForm(f => ({ ...f, extraOralExamination: e.target.value }))}
                rows={2} className="w-full px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-base leading-7 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 transition-all resize-none placeholder-gray-400"
                placeholder="Extra-Oral — e.g. Facial asymmetry, lymphadenopathy, TMJ tenderness..." />
            </div>
          )}
        </div>
      );
    })(),

    prescription: () => (
      <div className="border-b border-gray-200 dark:border-gray-700 pb-4 mb-6">
        <PrescriptionCard prescriptionProps={prescriptionProps} />
      </div>
    ),

    advice: () => (
      <div className="border-b border-gray-200 dark:border-gray-700 pb-4 mb-6">
        <AdviceCard adviceProps={adviceProps} />
      </div>
    ),

    visitSummary: () => (
      <div className="border-b border-gray-200 dark:border-gray-700 pb-4 mb-6">
        <VisitSummary
          form={form}
          toothDiagnoses={form.toothDiagnoses}
          selectedTreatments={selectedTreatments}
          treatmentFees={treatmentFees}
          consultationFee={consultationFee}
          medicines={form.medicines}
        />
      </div>
    ),

    patientSummary: () => {
      const entries = form.toothDiagnoses || [];
      const total = entries.filter(e => e.diagnoses?.length > 0).length;
      const active = entries.filter(e => e.diagnoses?.length > 0 && !e.treatment && e.status !== 'treated' && e.severity !== 'severe').length;
      const planned = entries.filter(e => e.treatment && e.status !== 'treated').length;
      const completed = entries.filter(e => e.status === 'treated' || e.outcome === 'successful').length;
      const urgent = entries.filter(e => e.severity === 'severe').length;
      return patientProfile && total > 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4">
          <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-3 uppercase tracking-wider">Treatment Summary</h4>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-2.5 text-center">
              <span className="text-xl font-bold text-amber-600 dark:text-amber-400">{active}</span>
              <p className="text-xs text-amber-500 dark:text-amber-400 mt-0.5">Active</p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-2.5 text-center">
              <span className="text-xl font-bold text-blue-600 dark:text-blue-400">{planned}</span>
              <p className="text-xs text-blue-500 dark:text-blue-400 mt-0.5">Planned</p>
            </div>
            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-2.5 text-center">
              <span className="text-xl font-bold text-green-600 dark:text-green-400">{completed}</span>
              <p className="text-xs text-green-500 dark:text-green-400 mt-0.5">Done</p>
            </div>
            <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-2.5 text-center">
              <span className="text-xl font-bold text-red-600 dark:text-red-400">{urgent}</span>
              <p className="text-xs text-red-500 dark:text-red-400 mt-0.5">Urgent</p>
            </div>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 text-center">{total} teeth with diagnoses</p>
        </div>
      ) : null;
    },

    toothGridLegend: () => (
      <ToothGridLegend toothData={form.toothDiagnoses} />
    ),

    attachments: () => (
      <AttachmentsPanel
        mediaProps={mediaProps}
        currentMedia={currentAppointmentMedia}
        visitMediaGroups={previousVisitMediaGroups}
        getSignedUrl={getSignedUrl}
      />
    ),

    contextSidebar: () => (
      <ContextSidebar
        patientProfile={patientProfile}
        patientVisits={patientVisits}
        medicalHistory={medicalHistory}
        form={form} setForm={setForm}
        submitting={submitting} visitMode={visitMode}
        visitSaved={visitSaved}
        onCheckout={() => handleSubmit()}
        selectedTreatments={selectedTreatments}
        treatmentFees={treatmentFees}
        totalFees={totalFees}
        consultationFee={consultationFee}
        medicines={form.medicines}
        medicineCharges={form.medicineCharges}
        onUpdateTreatmentFee={handleUpdateTreatmentFee}
        onUpdateConsultationFee={handleUpdateConsultationFee}
        onEditPatient={() => setShowEditDrawer(true)}
        onToggleTreatment={toggleTreatment}
        onAdjustQuantity={handleAdjustQuantity}
        getFee={getFee}
        onMedicalHistorySave={async (payload) => {
          const patientId = patientProfile?.id || appointmentMeta?.patient_id;
          if (!patientId) { showToast('No patient selected', 'error'); return; }
          try {
            const res = await fetch(`/api/dashboard/patients/${patientId}/medical-history`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });
            if (res.ok) {
              const data = await res.json();
              setMedicalHistory(prev => ({ ...prev, ...payload }));
              showToast('Saved', 'success');
            } else {
              showToast('Failed to save', 'error');
            }
          } catch {
            showToast('Network error', 'error');
          }
        }}
      />
    ),
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100/50 dark:from-gray-950 dark:to-gray-900">
      <div className="p-3">
        {/* ── Title Bar ── */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            {appointmentId && (
              <button onClick={() => router.push(returnTo === 'queue' ? '/dashboard/queue' : '/dashboard/appointments')} className="p-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <ArrowLeft className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              </button>
            )}
            <div className="p-3 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-200 dark:shadow-emerald-900/50">
              <Stethoscope className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">Log Visit</h1>
          </div>
          <div className="flex items-center gap-3">
            {formDirty && !visitSaved && (
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-700 flex items-center gap-1.5 shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                Unsaved
              </span>
            )}
            {!formDirty && visitSaved && (
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-700 flex items-center gap-1.5 shadow-sm">
                <CheckCircle2 className="w-3 h-3" />
                Saved
              </span>
            )}
            <button type="button"
              onClick={() => setShowPreview(s => { const next = !s; setSidebarCollapsed(next); return next; })}
              className={`px-4 py-2 text-xs font-medium rounded-xl border transition-all active:scale-95 flex items-center gap-1.5 ${
                showPreview
                  ? 'bg-blue-500 text-white border-blue-500 hover:bg-blue-600 shadow-sm'
                  : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 hover:text-blue-600 dark:hover:text-blue-400'
              }`}>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              {showPreview ? 'Hide Preview' : 'Preview'}
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {/* ── Draft restore banner ── */}
          {draftAvailable && (
            <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-2xl p-4 flex items-center justify-between shadow-sm mb-4">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-500" />
                <p className="text-sm text-amber-800 dark:text-amber-300">You have an unsaved draft</p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={restoreDraft}
                  className="px-3 py-1.5 text-xs font-medium bg-amber-100 dark:bg-amber-800 text-amber-800 dark:text-amber-200 rounded-lg hover:bg-amber-200 dark:hover:bg-amber-700 transition-all">Restore</button>
                <button type="button" onClick={dismissDraft}
                  className="px-3 py-1.5 text-xs font-medium bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-all">Dismiss</button>
              </div>
            </div>
          )}

          {/* ── Draft restored indicator ── */}
          {draftRestored && (
            <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 rounded-2xl p-3 flex items-center justify-between shadow-sm mb-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <p className="text-xs text-emerald-700 dark:text-emerald-300">Draft restored — changes auto-save every few seconds</p>
              </div>
              <button type="button" onClick={() => setDraftRestored(false)}
                className="p-1 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-800/50 text-emerald-500 transition-all">
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-16 gap-6 items-start">

            {/* ── Clinical Pane (Left) — lg:col-span-12 ── */}
            <div className="lg:col-span-12 space-y-6">

              {/* ── Patient Context Card ── */}
              {patientProfile && (
                <div className="border border-gray-200 dark:border-gray-700 rounded-2xl bg-white dark:bg-gray-900 p-4 shadow-sm">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-100 to-emerald-50 dark:from-emerald-900/30 dark:to-emerald-800/30 flex items-center justify-center text-lg font-bold text-emerald-700 dark:text-emerald-300 shrink-0">
                      {(patientProfile.name || form.patientName || '?')[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
                          {patientProfile.name || form.patientName}
                        </span>
                        {(form.patientAge || patientProfile.age) && (
                          <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                            {form.patientAge || patientProfile.age}{form.patientSex || patientProfile.sex ? '/': ''}{form.patientSex || patientProfile.sex || ''}
                          </span>
                        )}
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {patientProfile.phone || form.patientPhone || <span className="text-gray-300 dark:text-gray-600 italic">No phone</span>}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap text-xs text-gray-400 dark:text-gray-500">
                        {patientProfile.location && <span>📍 {patientProfile.location}</span>}
                        {patientProfile.occupation && <span>💼 {patientProfile.occupation}</span>}
                        {patientProfile.blood_group && <span>🩸 {patientProfile.blood_group}</span>}
                        {patientProfile.address && <span>🏠 {patientProfile.address}</span>}
                        {patientProfile.created_at && (
                          <span>Patient since {patientProfile.created_at?.slice(0, 10)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                    <button type="button" onClick={() => setShowEditDrawer(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all">
                      <Pencil className="w-3 h-3" /> Edit
                    </button>
                    <button type="button" onClick={() => setShowWalkInDrawer(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-all">
                      <Plus className="w-3 h-3" /> Walk-in
                    </button>
                    <button type="button" onClick={() => {
                      setShowPatientSearch(s => !s);
                      if (!showPatientSearch) setForm(f => ({ ...f, patientName: '' }));
                    }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all">
                      <Search className="w-3 h-3" /> {showPatientSearch ? 'Cancel' : 'Change patient'}
                    </button>
                  </div>
                  {showPatientSearch && (
                    <div className="mt-3 relative">
                      <input type="text" value={form.patientName}
                        onChange={e => setForm(f => ({ ...f, patientName: e.target.value }))}
                        placeholder="Search patient by name or phone..."
                        className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 transition-all placeholder-gray-400"
                        autoFocus />
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      {searchResults.length > 0 && form.patientName.trim().length >= 2 && (
                        <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-50 max-h-[200px] overflow-y-auto">
                          {searchResults.slice(0, 5).map((p) => (
                            <button key={p.id} type="button"
                              className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center gap-3"
                              onClick={() => { setAppointmentId(null); setAppointmentMeta(null); selectPatient(p); setShowPatientSearch(false); }}>
                              <span className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-100 to-emerald-50 dark:from-emerald-900/30 dark:to-emerald-800/30 flex items-center justify-center text-xs font-semibold text-emerald-700 dark:text-emerald-300 shrink-0">
                                {(p.name || '?')[0].toUpperCase()}
                              </span>
                              <span className="font-medium text-gray-900 dark:text-gray-100 truncate">{p.name}</span>
                              <span className="text-gray-400 shrink-0 text-xs">{p.phone || ''}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {layout.leftColumn.filter(s => s.enabled).map(section => (
                <Fragment key={section.id}>
                  {SECTIONS[section.id]?.()}
                </Fragment>
              ))}
            </div>

            {/* ── Context Sidebar (Right) — lg:col-span-4, sticky ── */}
            <div className="lg:col-span-4 sticky top-20 self-start space-y-4">
              {layout.rightColumn.filter(s => s.enabled || s.id === 'contextSidebar').map(section => (
                <Fragment key={section.id}>
                  {SECTIONS[section.id]?.()}
                </Fragment>
              ))}
            </div>
          </div>
        </form>

        {/* ── Overlays ── */}
        {showPreview && (
          <div className="fixed right-0 top-14 z-40 h-[calc(100vh-3.5rem)]">
            <PrescriptionPreview
              form={form}
              patientProfile={patientProfile}
              treatmentFees={treatmentFees}
              consultationFee={consultationFee}
              onClose={() => { setShowPreview(false); setSidebarCollapsed(false); }}
            />
          </div>
        )}
        {showCamera && (
          <CameraViewfinder
            onCapture={handleCameraCapture}
            onClose={() => setShowCamera(false)}
          />
        )}
        {showWalkInDrawer && (
          <WalkInDrawer onComplete={handleWalkInComplete} onClose={() => setShowWalkInDrawer(false)} />
        )}
        {showEditDrawer && (
          <EditPatientDrawer patientProfile={patientProfile} onClose={() => setShowEditDrawer(false)} showToast={showToast} onSaved={(updated) => {
            const p = updated?.patient || updated;
            if (p?.id) {
              setPatientProfile(p);
              setForm(f => ({
                ...f,
                patientName: p.name || '',
                patientPhone: stripPhonePrefix(p.phone || ''),
                patientAge: p.age?.toString() || '',
                patientSex: normalizeSex(p.sex),
                patientLocation: p.location || '',
              }));
              return;
            }
            setPatientProfile(p);
            setForm(f => ({
              ...f,
              patientName: p?.name || '',
              patientPhone: stripPhonePrefix(p?.phone || ''),
              patientAge: p?.age?.toString() || '',
              patientSex: normalizeSex(p?.sex),
              patientLocation: p?.location || '',
            }));
          }} />
        )}

        {/* ── Per-Tooth Side Panel ── */}
        {selectedTooth && (
          <div className="fixed inset-0 z-50 flex justify-end">
            <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={handleToothClose} />
            <div className="relative w-full max-w-md bg-white dark:bg-gray-900 shadow-2xl border-l border-gray-200 dark:border-gray-700 overflow-y-auto">
              <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between z-10">
                <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
                  Tooth #{selectedTooth} — {toothQuadrant(selectedTooth)}
                </span>
                <button type="button" onClick={handleToothClose}
                  className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>
              <div className="p-4">
                <PerToothDiagnosisPanel
                  toothNumber={selectedTooth}
                  currentEntry={selectedToothEntry}
                  diagnosisOptions={diagnosisOptions}
                  treatmentsFavorites={treatmentFavorites}
                  customTreatments={customTreatments}
                  history={selectedToothHistory}
                  onSave={handleToothSave}
                  onClose={handleToothClose}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
