'use client';

import { useState, useEffect, Suspense, useRef, useContext, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { ToastContext, SidebarContext } from '../layout';
import { Stethoscope, FileText, Pill, Calendar, Plus, Trash2, ClipboardCheck, Activity, ArrowLeft, Upload, Search, X, Lightbulb, Clock, MessageSquare, Heart, Users, TrendingUp, AlertTriangle, CheckCircle2, Download, Camera, Images } from 'lucide-react';
import { TREATMENTS, TREATMENT_NAMES, suggestTreatment } from '@/lib/treatments';
import { MEDICINE_SALTS } from '@/lib/medicines';
import MediaViewer from '@/components/MediaViewer';
import { apiFetch } from '@/lib/clientApi';
import { fetchCached } from '@/lib/clientFetchCache';
import ToothGrid from '@/components/ToothGrid';
import PerToothDiagnosisPanel from '@/components/PerToothDiagnosisPanel';
import PrescriptionPreview from '@/components/PrescriptionPreview';
import CameraViewfinder from '@/components/CameraViewfinder';

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

function getDefaultFee(idOrName) {
  const t = TREATMENTS.find(t => t.id === idOrName || t.name === idOrName);
  return t?.defaultFee || 0;
}

function getTreatmentName(idOrName) {
  const t = TREATMENTS.find(t => t.id === idOrName || t.name === idOrName);
  return t ? t.name : idOrName;
}
const FREQUENCY_OPTIONS = ['Daily one time', 'Twice a day', 'Thrice a day'];
const DURATION_OPTIONS = [3, 5, 7, 10, 14, 21, 30];
const TIMING_OPTIONS = [
  { value: 'after', label: 'After meal' },
  { value: 'before', label: 'Before meal' },
];

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

function VisitPageInner() {
  const { showToast } = useContext(ToastContext);
  const { setSidebarCollapsed } = useContext(SidebarContext);
  const searchParams = useSearchParams();
  const router = useRouter();

  const appointmentId = searchParams.get('appointmentId');
  const prefillName = searchParams.get('name') || '';
  const prefillTreatment = searchParams.get('treatment') || '';
  const isEdit = searchParams.get('edit') === 'true';
  const returnTo = searchParams.get('returnTo') || 'appointments';

  const [form, setForm] = useState({
    patientName: prefillName,
    patientPhone: '',
    patientAge: '',
    patientSex: '',
    patientLocation: '',
    treatment: prefillTreatment,
    consultationFee: '',
    treatmentCharges: '',
    medicineCharges: '',
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
  });
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

  // Escape closes preview
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape' && showPreview) { setShowPreview(false); setSidebarCollapsed(false); } }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showPreview, setSidebarCollapsed]);

  // Restore sidebar on unmount
  useEffect(() => () => setSidebarCollapsed(false), [setSidebarCollapsed]);

  // Load google maps review URL from settings
  useEffect(() => {
    fetch('/api/dashboard/settings')
      .then(r => r.json())
      .then(data => {
        if (data.settings?.google_maps?.review_url) setGoogleMapsUrl(data.settings.google_maps.review_url);
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
      const next = diagnoses.length > 0
        ? [...existing, { tooth, diagnoses, surface: prev?.surface || '', treatment: prev?.treatment || '', severity: prev?.severity || '', status: prev?.status || 'active' }]
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
      const next = entry.diagnoses.length > 0
        ? [...existing, entry]
        : existing;
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
          next[key] = { amount: getDefaultFee(key) * count, quantity: count, source: 'auto', label };
          changed = true;
        } else if (next[key].source === 'auto' && next[key].quantity !== count) {
          next[key] = { ...next[key], quantity: count, amount: getDefaultFee(key) * count };
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
  }, [form.toothDiagnoses]);

  function toggleTreatment(name) {
    setTreatmentFees(prev => {
      const key = TREATMENTS.find(t => t.id === name || t.name === name)?.id || name;
      if (prev[key] !== undefined) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: { amount: getDefaultFee(key), quantity: 1, source: 'manual', label: getTreatmentName(key) } };
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
          source: 'manual' // Explicitly mark as manual on user edit
        }
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

  // Load existing visit data (auto-fill all fields)
  useEffect(() => {
    if (!appointmentId) return;
    fetchCached(`/api/dashboard/appointments?id=${appointmentId}`)
      .then(data => {
        const a = data.appointment || data;
        if (a) {
          setAppointmentMeta(a);
          setForm({
            patientName: a.patient_name || '',
            patientPhone: (a.patient_phone || '').replace(/\D/g, ''),
            patientAge: '',
            patientSex: '',
            treatment: a.treatment || '',
            consultationFee: '',
            treatmentCharges: '',
            medicineCharges: a.medicine_charges?.toString() || '',
            diagnosis: a.diagnosis || '',
            medicines: Array.isArray(a.medicines) ? a.medicines : [],
            followUpDate: a.follow_up_date?.slice(0, 10) || '',
            followUpInstructions: a.follow_up_instructions || '',
            notes: a.notes || '',
            adviceSelected: Array.isArray(a.advice_selected) ? a.advice_selected : [],
            diagnosisSelected: Array.isArray(a.diagnosis_selected) ? a.diagnosis_selected : [],
            toothDiagnoses: Array.isArray(a.tooth_diagnoses) ? a.tooth_diagnoses : [],
          });
          const savedTreatments = Array.isArray(a.treatments) && a.treatments.length > 0
            ? a.treatments
            : a.treatment ? [a.treatment] : [];
          const fees = {};
          const savedTotal = Number(a.treatment_charges) || 0;
          const defaultTotal = savedTreatments.reduce((sum, n) => sum + getDefaultFee(n), 0);
          savedTreatments.forEach(name => {
            const defaultFee = getDefaultFee(name);
            fees[name] = savedTotal > 0 && defaultTotal > 0
              ? Math.round(defaultFee * savedTotal / defaultTotal)
              : defaultFee;
          });
          setTreatmentFees(fees);
          if (a.consultation_fee) {
            setConsultationFee(a.consultation_fee);
          }
          if (a.payment_status) setPaymentStatus(a.payment_status);
          if (a.payment_method) setPaymentMethod(a.payment_method);
          if (a.transaction_id) setTransactionId(a.transaction_id);
          if (a.paid_amount) setPaidAmount(a.paid_amount);
          // Fetch patient demographics + extra data (visits, messages, family)
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
            if (p.id) {
              Promise.all([
                fetchCached(`/api/dashboard/patients/${p.id}/messages?limit=10`)
                  .then(mData => { if (mData.messages) setPatientMessages(mData.messages); })
                  .catch(() => {}),
                fetchCached(`/api/dashboard/patients/${p.id}/family`)
                  .then(fData => { if (fData.family) setPatientFamily(fData.family); })
                  .catch(() => {}),
              ]);
            }
            setLoadingExtra(false);
          }
          async function loadPatientProfile(id) {
            const pData = await fetchCached(`/api/dashboard/patients/${id}`);
            if (pData.patient) applyPatientProfile({ ...pData.patient, visits: pData.visits });
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
                  if (match.id) {
                    const full = await fetchCached(`/api/dashboard/patients/${match.id}`);
                    if (full.visits) setPatientVisits(full.visits);
                  }
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
    const query = form.patientName.trim();
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
      setForm(draft.form);
      setTreatmentFees(draft.treatmentFees || {});
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
                toothDiagnoses: Array.isArray(lastVisit.tooth_diagnoses) ? lastVisit.tooth_diagnoses : [],
              }));
              const savedTreatments = Array.isArray(lastVisit.treatments) && lastVisit.treatments.length > 0
                ? lastVisit.treatments
                : lastVisit.treatment ? [lastVisit.treatment] : [];
              if (lastVisit.consultation_fee) setConsultationFee(Number(lastVisit.consultation_fee));
              if (savedTreatments.length > 0) {
                const fees = {};
                savedTreatments.forEach(name => {
                  fees[name] = getDefaultFee(name);
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

  async function selectPatient(p) {
    setForm(f => ({
      ...f,
      patientName: p.name,
      patientPhone: (p.phone || '').replace(/\D/g, '') || f.patientPhone,
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
                toothDiagnoses: Array.isArray(lastVisit.tooth_diagnoses) ? lastVisit.tooth_diagnoses : [],
              }));
              const savedTreatments = Array.isArray(lastVisit.treatments) && lastVisit.treatments.length > 0
                ? lastVisit.treatments
                : lastVisit.treatment ? [lastVisit.treatment] : [];
              if (lastVisit.consultation_fee) setConsultationFee(Number(lastVisit.consultation_fee));
              if (savedTreatments.length > 0) {
                const fees = {};
                savedTreatments.forEach(name => {
                  fees[name] = getDefaultFee(name);
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
    setTreatmentFees({ ...tpl.treatmentFees });
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
      setForm(f => ({ ...f, medicines: [...f.medicines, { name: salt, dosage: '\u2014', frequency: '', duration: '', timing: 'after' }] }));
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
    ? MEDICINE_SALTS.filter(s => s.toLowerCase().includes(saltSearch.toLowerCase()))
    : MEDICINE_SALTS;

  async function handleMediaUpload(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    console.log('[MEDIA] Files selected:', files.map(f => ({ name: f.name, size: f.size, type: f.type })));
    setUploadingMedia(true);
    try {
      setMediaFiles(prev => [...prev, ...files]);
      console.log('[MEDIA] Added to local state, total files:', mediaFiles.length + files.length);
    } catch (err) {
      console.error('[MEDIA] Error adding files:', err);
      showToast('Failed to add media', 'error');
    } finally {
      setUploadingMedia(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function handleCameraCapture(file) {
    setMediaFiles(prev => [...prev, file]);
    showToast('Photo captured', 'success');
  }

  function removeMediaFile(idx) {
    setMediaFiles(prev => prev.filter((_, i) => i !== idx));
  }

  function addMedicine() {
    setForm(f => ({ ...f, medicines: [...f.medicines, { name: '', dosage: '', frequency: '', duration: '', timing: 'after' }] }));
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
    if (selectedTreatments.length === 0) e.treatment = 'Please select at least one treatment';
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
            appointmentId,
            treatment: primaryTreatment,
            treatments: mappedTreatments,
            diagnosis: form.diagnosis.trim() || undefined,
            medicines: form.medicines.filter(m => m.name.trim()),
            consultationFee,
            treatmentCharges: computedTreatmentCharges,
            medicineCharges: Number(form.medicineCharges) || 0,
            notes: form.notes.trim() || undefined,
            followUpDate: form.followUpDate || undefined,
            followUpInstructions: form.followUpInstructions.trim() || undefined,
            advice_selected: form.adviceSelected,
            diagnosis_selected: form.diagnosisSelected,
            tooth_diagnoses: form.toothDiagnoses,
            status: 'completed',
            chiefComplaint: form.chiefComplaint.trim() || undefined,
            generalExamination: form.generalExamination.trim() || undefined,
            extraOralExamination: form.extraOralExamination.trim() || undefined,
            ...paymentPayload,
          }
        : {
            patient_name: form.patientName.trim(),
            patient_phone: form.patientPhone ? `+91${form.patientPhone}` : undefined,
            patient_age: walkInAge,
            patient_sex: form.patientSex || undefined,
            patient_location: form.patientLocation.trim() || undefined,
            treatment: primaryTreatment,
            treatments: mappedTreatments,
            consultationFee,
            treatmentCharges: computedTreatmentCharges,
            medicineCharges: Number(form.medicineCharges) || 0,
            diagnosis: form.diagnosis.trim() || undefined,
            chiefComplaint: form.chiefComplaint.trim() || undefined,
            generalExamination: form.generalExamination.trim() || undefined,
            extraOralExamination: form.extraOralExamination.trim() || undefined,
            medicines: form.medicines.filter(m => m.name.trim()),
            followUpDate: form.followUpDate || undefined,
            followUpInstructions: form.followUpInstructions.trim() || undefined,
            advice_selected: form.adviceSelected,
            diagnosis_selected: form.diagnosisSelected,
            tooth_diagnoses: form.toothDiagnoses,
            notes: form.notes.trim() || undefined,
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
        for (const file of mediaFiles) {
          try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('appointmentId', appointmentIdForMedia);
            const mediaRes = await fetch('/api/dashboard/media', {
              method: 'POST',
              body: formData,
            });
            const mediaData = await mediaRes.json();
            if (mediaRes.ok) {
              console.log('[MEDIA] Upload success:', mediaData);
            } else {
              console.error('[MEDIA] Upload failed:', mediaData);
              showToast(`Upload failed for ${file.name}: ${mediaData.error}`, 'error');
            }
          } catch (mediaErr) {
            console.error('[MEDIA] Upload network error:', mediaErr);
            showToast(`Upload failed for ${file.name}`, 'error');
          }
        }
      }

      localStorage.removeItem(DRAFT_KEY);
      const appointmentIdForResult = data.appointment?.id || appointmentId;
      setResult({ patient_name: form.patientName, treatment: primaryTreatment, appointment_id: appointmentIdForResult });
    } catch (err) {
      console.error('[VISIT] Submit error:', err);
      showToast('Network error — could not save visit', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setForm({ patientName: '', patientPhone: '', patientAge: '', patientSex: '', patientLocation: '', treatment: '', consultationFee: '', treatmentCharges: '', medicineCharges: '', diagnosis: '', medicines: [], followUpDate: '', followUpInstructions: '', notes: '', adviceSelected: [], diagnosisSelected: [], toothDiagnoses: [], chiefComplaint: '', generalExamination: '', extraOralExamination: '' });
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
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3 text-center">
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
                      <span className="ml-1.5 text-[10px] font-medium text-gray-400 dark:text-gray-500 min-w-[20px]">
                        {patientRatings[cat.key] || 0}/5
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <p className="text-[10px] text-gray-400 dark:text-gray-500">Rate the patient across these categories</p>
                <button
                  onClick={saveRatings}
                  disabled={savingRatings}
                  className="px-3 py-1.5 text-[11px] font-medium bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white rounded-lg transition-all active:scale-95"
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100/50 dark:from-gray-950 dark:to-gray-900">
      <div className="p-5 md:p-7 lg:p-10 max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          {appointmentId && (
            <button onClick={() => router.push(returnTo === 'queue' ? '/dashboard/queue' : '/dashboard/appointments')} className="p-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <ArrowLeft className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            </button>
          )}
          <div className="p-3 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-200 dark:shadow-emerald-900/50">
            <Stethoscope className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">{isEdit ? 'Edit Visit' : 'Log Visit'}</h1>              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {isEdit ? `Editing visit for ${prefillName || 'patient'}` : appointmentId ? `Completing appointment for ${prefillName}` : patientProfile ? `Logging visit for ${patientProfile.name}` : 'Record a patient consultation'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowPreview(s => { const next = !s; setSidebarCollapsed(next); return next; })}
            className={`px-4 py-2 text-xs font-medium rounded-xl border transition-all active:scale-95 flex items-center gap-1.5 ${
              showPreview
                ? 'bg-blue-500 text-white border-blue-500 hover:bg-blue-600 shadow-sm'
                : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 hover:text-blue-600 dark:hover:text-blue-400'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            {showPreview ? 'Hide Preview' : 'Preview'}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* ── Draft restore banner ── */}
          {draftAvailable && (
            <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-2xl p-4 flex items-center justify-between shadow-sm">
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
            <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 rounded-2xl p-3 flex items-center justify-between shadow-sm">
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

          {/* Keyboard shortcut hint */}
          <div className="text-right text-xs text-gray-400 dark:text-gray-500">
            <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 font-mono text-xs">Ctrl+Enter</kbd> to submit
          </div>

          {/* ── Patient Profile + Appointment Context ── */}
          {(appointmentId && (appointmentMeta || patientProfile)) || patientProfile ? (
            <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
              <div className="flex items-center gap-3 px-6 py-4 bg-gradient-to-r from-emerald-50/80 to-blue-50/80 dark:from-emerald-900/20 dark:to-blue-900/20 border-b border-gray-100 dark:border-gray-800">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-sm font-bold shadow-sm shrink-0">
                  {((patientProfile?.name || appointmentMeta?.patient_name || 'P'))[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="font-semibold text-gray-900 dark:text-gray-100 text-sm truncate">{patientProfile?.name || appointmentMeta?.patient_name || 'Patient'}</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {appointmentMeta?.date?.slice(0, 10)}{appointmentMeta?.time ? ` at ${appointmentMeta.time?.slice(0, 5)}` : ''}
                    {appointmentMeta?.location ? ` · ${appointmentMeta.location}` : ''}
                    {!appointmentId && patientProfile ? `${patientProfile.visit_count ? `${patientProfile.visit_count} visit${patientProfile.visit_count > 1 ? 's' : ''}${patientVisits[0]?.date ? ` · Last: ${patientVisits[0].date.slice(0, 10)}` : ''}` : 'New patient'}` : ''}
                  </p>
                </div>
                {appointmentMeta ? (
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                  appointmentMeta?.status === 'completed' ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800' :
                  appointmentMeta?.status === 'no_show' ? 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800' :
                  appointmentMeta?.arrival_status === 'called' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800' :
                  appointmentMeta?.arrival_status === 'arrived' ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800' :
                  'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700'
                }`}>
                  {appointmentMeta?.status === 'completed' ? 'Completed' :
                   appointmentMeta?.status === 'no_show' ? 'No Show' :
                   appointmentMeta?.arrival_status === 'called' ? 'In Session' :
                   appointmentMeta?.arrival_status === 'arrived' ? 'Waiting' : 'Scheduled'}
                </span>
                ) : null}
              </div>
              <div className="px-6 py-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Phone</span>
                  <p className="text-sm text-gray-700 dark:text-gray-300 mt-0.5">{appointmentMeta?.patient_phone || patientProfile?.phone || '—'}</p>
                </div>
                <div>
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Age</span>
                  <p className="text-sm text-gray-700 dark:text-gray-300 mt-0.5">{patientProfile?.age ? `${patientProfile.age} yrs` : '—'}</p>
                </div>
                <div>
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Sex</span>
                  <p className="text-sm text-gray-700 dark:text-gray-300 mt-0.5">{patientProfile?.sex ? (patientProfile.sex.charAt(0).toUpperCase() + patientProfile.sex.slice(1)) : '—'}</p>
                </div>
                <div>
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Location</span>
                  <p className="text-sm text-gray-700 dark:text-gray-300 mt-0.5">{appointmentMeta?.location || patientProfile?.location || '—'}</p>
                </div>
                {patientProfile?.visit_count !== undefined && (
                  <div>
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total Visits</span>
                    <p className="text-sm text-gray-700 dark:text-gray-300 mt-0.5">{patientProfile.visit_count}</p>
                  </div>
                )}
                {patientProfile?.total_spent !== undefined && (
                  <div>
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total Spent</span>
                    <p className="text-sm text-gray-700 dark:text-gray-300 mt-0.5">₹{Number(patientProfile.total_spent).toLocaleString('en-IN')}</p>
                  </div>
                )}
                {appointmentMeta?.chit_media?.length > 0 ? (
                  <div className="col-span-full">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 block">Media Shared ({appointmentMeta.chit_media.length})</span>
                    <MediaViewer mediaKeys={appointmentMeta.chit_media} getSignedUrl={getSignedUrl} />
                  </div>
                ) : !appointmentMeta && (() => {
                  const latestWithMedia = patientVisits.find(v => Array.isArray(v.chit_media) && v.chit_media.length > 0);
                  if (!latestWithMedia) return null;
                  return (
                    <div className="col-span-full">
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 block">Media from Previous Visits ({latestWithMedia.chit_media.length})</span>
                      <MediaViewer mediaKeys={latestWithMedia.chit_media} getSignedUrl={getSignedUrl} />
                    </div>
                  );
                })()}
                {appointmentMeta?.status === 'completed' && (
                  <div>
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Prescription</span>
                    <button onClick={async () => {
                        try {
                          const res = await fetch(`/api/dashboard/visits/${appointmentMeta.id}/prescription`, { method: 'POST' });
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
                      }}
                        className="inline-flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 mt-0.5 hover:text-blue-700 dark:hover:text-blue-300 transition-colors">
                        <Download className="w-3.5 h-3.5" />
                        Generate
                      </button>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {/* ── Quick Stats Row ── */}
          {patientProfile && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total Visits</span>
                </div>
                <p className="text-2xl font-bold leading-tight text-gray-900 dark:text-gray-100">{patientProfile.visit_count || 0}</p>                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {patientVisits.length > 0 ? `Last: ${patientVisits[0]?.date?.slice(0, 10) || 'N/A'}` : 'First visit'}
                </p>
              </div>
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-blue-500" />
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total Spent</span>
                </div>
                <p className="text-2xl font-bold leading-tight text-gray-900 dark:text-gray-100">₹{Number(patientProfile.total_spent || 0).toLocaleString('en-IN')}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  {patientProfile.visit_count > 0 ? `Avg: ₹${Math.round(Number(patientProfile.total_spent || 0) / (patientProfile.visit_count || 1)).toLocaleString('en-IN')}` : '—'}
                </p>
              </div>
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Patient Since</span>
                </div>
                <p className="text-xl font-bold text-gray-900 dark:text-gray-100 text-sm leading-tight">{patientProfile.created_at?.slice(0, 10) || '—'}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  {patientProfile.created_at ? `${Math.floor((Date.now() - new Date(patientProfile.created_at).getTime()) / (1000 * 60 * 60 * 24 * 30))} months ago` : ''}
                </p>
              </div>
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-violet-500" />
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Follow-up</span>
                </div>
                {(() => {
                  const lastVisit = patientVisits.find(v => v.follow_up_date);
                  const fupDate = lastVisit?.follow_up_date;
                  const isOverdue = fupDate && new Date(fupDate) < new Date();
                  const hasReturned = fupDate && patientVisits.some(v => v.date === fupDate || (v.date > fupDate && v.date < new Date(Date.now() + 86400000).toISOString().slice(0, 10)));
                  if (!fupDate) return <><p className="text-xl font-bold text-gray-400 dark:text-gray-500">—</p><p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">No follow-up set</p></>;
                  if (hasReturned) return <><p className="text-xl font-bold text-emerald-500">✓</p><p className="text-xs text-emerald-500 mt-0.5">Completed</p></>;
                  if (isOverdue) return <><p className="text-xl font-bold text-red-500">{Math.floor((Date.now() - new Date(fupDate).getTime()) / (1000 * 60 * 60 * 24))}d</p><p className="text-xs text-red-500 mt-0.5">Overdue since {fupDate}</p></>;
                  return <><p className="text-xl font-bold text-amber-500">⏳</p><p className="text-xs text-amber-500 mt-0.5">Due {fupDate}</p></>;
                })()}
              </div>
            </div>
          )}

          {/* ── Habits & Risk Factors (Compact) ── */}
          {patientProfile && (() => {
            const h = medicalHistory.habits || {};
            const hasHabits = Object.keys(h).length > 0 && Object.values(h).some(v => v);
            if (!hasHabits) return null;
            const habitLabels = {
              smoking: { never: ['Smoking', 'Never', 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-100 dark:border-green-800'], former: ['Smoking', 'Former', 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-100 dark:border-amber-800'], current: ['Smoking', 'Current', 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-100 dark:border-red-800'] },
              tobaccoChewing: { never: ['Tobacco', 'Never', 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-100 dark:border-green-800'], former: ['Tobacco', 'Former', 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-100 dark:border-amber-800'], current: ['Tobacco', 'Current', 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-100 dark:border-red-800'] },
              panMasala: { never: ['Pan Masala', 'Never', 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-100 dark:border-green-800'], former: ['Pan Masala', 'Former', 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-100 dark:border-amber-800'], current: ['Pan Masala', 'Current', 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-100 dark:border-red-800'] },
              alcohol: { never: ['Alcohol', 'Never', 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-100 dark:border-green-800'], occasional: ['Alcohol', 'Occasional', 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-100 dark:border-amber-800'], regular: ['Alcohol', 'Regular', 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-100 dark:border-red-800'] },
              brushingFrequency: { once: ['Brushing', 'Once/day', 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-100 dark:border-amber-800'], twice: ['Brushing', 'Twice/day', 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-100 dark:border-green-800'], irregular: ['Brushing', 'Irregular', 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-100 dark:border-red-800'] },
              sugaryDiet: { low: ['Sugary Diet', 'Low', 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-100 dark:border-green-800'], moderate: ['Sugary Diet', 'Moderate', 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-100 dark:border-amber-800'], high: ['Sugary Diet', 'High', 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-100 dark:border-red-800'] },
            };
            return (
              <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/30"><AlertTriangle className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" /></div>
                  <h2 className="font-bold text-gray-900 dark:text-gray-100 text-sm">Habits &amp; Risk Factors</h2>
                  <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">Editable below</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(habitLabels).map(([key, levels]) => {
                    const val = h[key];
                    if (!val || !levels[val]) return null;
                    const [label, statusLabel, cls] = levels[val];
                    const icon = statusLabel === 'Current' || statusLabel === 'Regular' || statusLabel === 'Irregular' || statusLabel === 'High'
                      ? 'M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
                      : 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z';
                    return (
                      <span key={key} className={'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ' + cls}>
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} /></svg>
                        {label}: {statusLabel}
                      </span>
                    );
                  })}
                  {h.other && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs font-medium border border-gray-200 dark:border-gray-700">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      Other: {h.other}
                    </span>
                  )}
                </div>
              </div>
            );
          })()}

          {/* ── Medical & Dental History (Compact) ── */}
          {patientProfile && (() => {
            const hasEntries = medicalHistory.allergies || medicalHistory.chronicConditions || medicalHistory.bloodGroup || medicalHistory.bp || medicalHistory.weight || medicalHistory.medications;
            if (!hasEntries) return null;
            return (
              <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-1.5 rounded-lg bg-red-50 dark:bg-red-900/30"><Heart className="w-3.5 h-3.5 text-red-500 dark:text-red-400" /></div>
                  <h2 className="font-bold text-gray-900 dark:text-gray-100 text-sm">Medical & Dental History</h2>
                  <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">Reference — editable below</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {medicalHistory.allergies && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-xs font-medium border border-red-100 dark:border-red-800">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      Allergies: {medicalHistory.allergies}
                    </span>
                  )}
                  {medicalHistory.chronicConditions && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 text-xs font-medium border border-orange-100 dark:border-orange-800">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      Chronic: {medicalHistory.chronicConditions}
                    </span>
                  )}
                  {medicalHistory.bloodGroup && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium border border-blue-100 dark:border-blue-800">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                      Blood: {medicalHistory.bloodGroup}
                    </span>
                  )}
                  {(medicalHistory.bp || medicalHistory.weight) && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 text-xs font-medium border border-teal-100 dark:border-teal-800">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                      {[medicalHistory.bp, medicalHistory.weight].filter(Boolean).join(' / ')}
                    </span>
                  )}
                  {medicalHistory.medications && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 text-xs font-medium border border-violet-100 dark:border-violet-800">
                      <Pill className="w-3 h-3" />
                      Meds: {medicalHistory.medications}
                    </span>
                  )}
                </div>
              </div>
            );
          })()}

          {/* ── WhatsApp Conversation ── */}
          {patientProfile && (
            <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
              <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-gray-100 dark:border-gray-800">
                <div className="p-1.5 rounded-lg bg-green-50 dark:bg-green-900/30"><MessageSquare className="w-3.5 h-3.5 text-green-500 dark:text-green-400" /></div>
                <h2 className="font-bold text-gray-900 dark:text-gray-100 text-lg">WhatsApp Conversation</h2>
                <span className="text-xs text-gray-500 dark:text-gray-400 font-normal">Recent messages</span>
              </div>
              <div className="px-5 py-3 max-h-[300px] overflow-y-auto">
                {loadingExtra ? (
                  <div className="flex items-center justify-center py-6">
                    <div className="w-4 h-4 border-2 border-gray-200 dark:border-gray-700 border-t-emerald-500 rounded-full animate-spin" />
                  </div>
                ) : patientMessages.length === 0 ? (
                  <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-6">No WhatsApp messages found</p>
                ) : (
                  <div className="space-y-2">
                    {patientMessages.filter(m => m.role === 'user' || m.intent).slice(-6).reverse().map((m, i) => (
                      <div key={m.id || i} className={`flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                        <div className={`max-w-[85%] px-3 py-2 rounded-xl text-xs ${
                          m.role === 'user'
                            ? 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-bl-sm'
                            : 'bg-emerald-50 dark:bg-emerald-900/30 text-gray-700 dark:text-gray-300 rounded-br-sm'
                        }`}>
                          <p className="leading-relaxed">{m.content || '(no content)'}</p>
                          <p className="text-[9px] text-gray-400 dark:text-gray-500 mt-0.5">
                            {m.role === 'user' ? 'Patient' : 'Clinic'} · {m.created_at ? new Date(m.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                            {m.intent && <span className="ml-1 px-1 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-[8px]">{m.intent}</span>}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Family Members ── */}
          {patientProfile && (
              <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="p-1.5 rounded-lg bg-teal-50 dark:bg-teal-900/30"><Users className="w-3.5 h-3.5 text-teal-500 dark:text-teal-400" /></div>
                  <h2 className="font-bold text-gray-900 dark:text-gray-100 text-lg">Family Members</h2>
                  <span className="text-xs text-gray-500 dark:text-gray-400 font-normal">{patientFamily.length > 0 ? `${patientFamily.length} linked` : ''}</span>
                </div>
                {loadingExtra ? (
                  <div className="flex items-center justify-center py-6">
                    <div className="w-4 h-4 border-2 border-gray-200 dark:border-gray-700 border-t-emerald-500 rounded-full animate-spin" />
                  </div>
                ) : patientFamily.length === 0 ? (
                  <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-6">No family members linked</p>
                ) : (
                  <div className="space-y-2">
                    {patientFamily.map(f => (
                      <div key={f.relationship_id || f.id} className="flex items-center gap-3 px-3 py-2 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-700">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-100 to-teal-50 dark:from-teal-900/30 dark:to-teal-800/30 flex items-center justify-center text-xs font-semibold text-teal-700 dark:text-teal-300 shrink-0">
                          {(f.name || '?')[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">{f.name}</p>
                          <p className="text-xs text-gray-400 dark:text-gray-500">
                            {f.relationship_type ? f.relationship_type.charAt(0).toUpperCase() + f.relationship_type.slice(1) : 'Family'}
                            {f.age ? ` · ${f.age} yrs` : ''}{f.sex ? ` · ${f.sex.charAt(0).toUpperCase() + f.sex.slice(1)}` : ''}
                          </p>
                        </div>
                        {f.id && (
                          <button type="button" onClick={() => router.push(`/dashboard/patients/${f.id}`)}
                            className="px-2.5 py-1 text-xs font-medium rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-teal-300 dark:hover:border-teal-600 transition-all shrink-0">
                            View
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
          )}

          {/* Patient Info — for walk-ins (no appointmentId, no patient selected yet) */}
          {!appointmentId && !patientProfile && (
            <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-6 shadow-sm relative">
              <div className="flex items-center gap-2.5 mb-5">
                <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/30"><Search className="w-4 h-4 text-blue-500 dark:text-blue-400" /></div>
                <h2 className="font-bold text-gray-900 dark:text-gray-100 text-lg">Patient Information</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Patient Name *</label>
                  <div className="relative">
                    <input type="text" value={form.patientName}
                      onChange={e => { setForm(f => ({ ...f, patientName: e.target.value })); setErrors(ev => { const n={...ev}; delete n.patientName; return n; }); }}
                      onKeyDown={e => {
                        if (searchState === 'success' && searchResults.length > 0) {
                          if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            setHighlightedIndex(prev => (prev + 1) % searchResults.length);
                          } else if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            setHighlightedIndex(prev => (prev - 1 + searchResults.length) % searchResults.length);
                          } else if (e.key === 'Enter') {
                            e.preventDefault();
                            if (highlightedIndex >= 0 && highlightedIndex < searchResults.length) {
                              selectPatient(searchResults[highlightedIndex]);
                            }
                          }
                        }
                      }}
                      className={`w-full px-4 py-2.5 bg-white dark:bg-gray-800 border rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 transition-all ${errors.patientName ? 'border-red-300 dark:border-red-700 focus:ring-red-200 dark:focus:ring-red-800' : 'border-gray-200 dark:border-gray-700 focus:ring-blue-200 dark:focus:ring-blue-800 focus:border-blue-400 dark:focus:border-blue-500'}`}
                      placeholder="e.g. Rajesh Kumar" />
                    {searchState === 'searching' && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <div className="w-3.5 h-3.5 border-2 border-gray-200 dark:border-gray-600 border-t-gray-600 dark:border-t-gray-300 rounded-full animate-spin" />
                      </div>
                    )}
                  </div>
                  {errors.patientName && <p className="text-xs text-red-500 dark:text-red-400 mt-1">{errors.patientName}</p>}
                  {searchState === 'success' && (
                    <div ref={searchRef} className="absolute z-20 mt-1 w-full bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg overflow-hidden">
                      {searchResults.map((p, i) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => selectPatient(p)}
                          onMouseEnter={() => setHighlightedIndex(i)}
                          ref={el => { if (highlightedIndex === i && el) el.scrollIntoView({ block: 'nearest' }); }}
                          className={`w-full text-left px-4 py-3 transition-colors flex items-center gap-3 border-b border-gray-50 dark:border-gray-700 last:border-0 ${
                            highlightedIndex === i
                              ? 'bg-blue-100 dark:bg-blue-900/40'
                              : 'hover:bg-blue-50 dark:hover:bg-blue-900/20'
                          }`}
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
                  {searchState === 'empty' && (
                    <div ref={searchRef} className="absolute z-20 mt-1 w-full bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden p-5 text-center">
                      <Search className="w-6 h-6 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No patients found</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">A new patient record will be created when you book.</p>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Phone</label>
                  <div className="flex">
                    <span className="inline-flex items-center px-3 py-2.5 bg-gray-100 dark:bg-gray-700 border border-r-0 border-gray-200 dark:border-gray-600 rounded-l-xl text-sm font-medium text-gray-600 dark:text-gray-300 shrink-0">{PHONE_PREFIX}</span>
                    <input type="tel" value={form.patientPhone} onChange={e => setForm(f => ({ ...f, patientPhone: e.target.value.replace(/\D/g, '') }))}
                      className="flex-1 px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-r-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 focus:border-blue-400 dark:focus:border-blue-500 transition-all"
                      placeholder="9876543210" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Age</label>
                  <input type="number" min="0" max="150" value={form.patientAge || ''}
                    onChange={e => setForm(f => ({ ...f, patientAge: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 focus:border-blue-400 dark:focus:border-blue-500 transition-all"
                    placeholder="e.g. 35" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Sex</label>
                    <select value={form.patientSex || ''} onChange={e => setForm(f => ({ ...f, patientSex: e.target.value }))}
                    className={`w-full px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 focus:border-blue-400 dark:focus:border-blue-500 transition-all appearance-none ${!form.patientSex ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-gray-100'}`}>
                    <option value="">Select...</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div className={showCustomLocation ? 'md:col-span-2' : ''}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Location</label>
                  <div className={showCustomLocation ? 'flex flex-col sm:flex-row gap-2' : ''}>
                    <select value={showCustomLocation ? 'Other' : (LOCATIONS.includes(form.patientLocation) ? form.patientLocation : '')} onChange={e => {
                      if (e.target.value === 'Other') { setShowCustomLocation(true); setForm(f => ({ ...f, patientLocation: '' })); }
                      else { setShowCustomLocation(false); setForm(f => ({ ...f, patientLocation: e.target.value })); }
                    }}
                      className={`${showCustomLocation ? 'sm:w-1/2' : 'w-full'} px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 focus:border-blue-400 dark:focus:border-blue-500 transition-all appearance-none ${!showCustomLocation && form.patientLocation ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'}`}>
                      <option value="">Select...</option>
                      <option value="Hudco">Hudco</option>
                      <option value="Bhilai">Bhilai</option>
                      <option value="Durg">Durg</option>
                      <option value="Nehru Nagar">Nehru Nagar</option>
                      <option value="Borsi">Borsi</option>
                      <option value="Other">Other (type)</option>
                    </select>
                    {showCustomLocation && (
                      <input type="text" value={form.patientLocation} onChange={e => setForm(f => ({ ...f, patientLocation: e.target.value }))} autoFocus
                        className="sm:w-1/2 px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 focus:border-blue-400 dark:focus:border-blue-500 transition-all"
                        placeholder="Type location..." />
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Basic Details ── */}
          {patientProfile && (
            <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/30"><Users className="w-4 h-4 text-blue-500 dark:text-blue-400" /></div>
                <h2 className="font-bold text-gray-900 dark:text-gray-100 text-lg">Basic Details</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Address</label>
                  <input type="text" value={medicalHistory.address} onChange={e => setMedicalHistory(h => ({ ...h, address: e.target.value }))}
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 focus:border-blue-400 dark:focus:border-blue-500 transition-all placeholder-gray-400"
                    placeholder="e.g. 123, Main Street, Durg" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Occupation</label>
                  <input type="text" value={medicalHistory.occupation} onChange={e => setMedicalHistory(h => ({ ...h, occupation: e.target.value }))}
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 focus:border-blue-400 dark:focus:border-blue-500 transition-all placeholder-gray-400"
                    placeholder="e.g. Engineer, Teacher" />
                </div>
              </div>
            </div>
          )}

          {/* ── Chief Complaint ── */}
          {patientProfile && (
            <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="p-1.5 rounded-lg bg-orange-50 dark:bg-orange-900/30"><FileText className="w-4 h-4 text-orange-500 dark:text-orange-400" /></div>
                <h2 className="font-bold text-gray-900 dark:text-gray-100 text-lg">Chief Complaint</h2>
                <span className="text-xs text-gray-500 dark:text-gray-400 font-normal">C/C</span>
              </div>
              <textarea value={form.chiefComplaint} onChange={e => setForm(f => ({ ...f, chiefComplaint: e.target.value }))}
                rows={2} className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-200 dark:focus:ring-orange-800 focus:border-orange-400 dark:focus:border-orange-500 transition-all resize-none placeholder-gray-400"
                placeholder="e.g. Pt complains of pain in upper left back tooth region, since 4 days." />
            </div>
          )}

          {/* ── Dental History (PDH) + Family History (FH) ── */}
          {patientProfile && (
            <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Dental History <span className="text-gray-400 font-normal">(PDH)</span></label>
                  <textarea value={medicalHistory.dentalHistory} onChange={e => setMedicalHistory(h => ({ ...h, dentalHistory: e.target.value }))}
                    rows={2} className="w-full px-2.5 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-200 dark:focus:ring-orange-800 focus:border-orange-400 dark:focus:border-orange-500 transition-all resize-none placeholder-gray-400"
                    placeholder="e.g. Previous RCT + cap done 3 yrs back in 46" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Family History <span className="text-gray-400 font-normal">(FH)</span></label>
                  <textarea value={medicalHistory.familyHistory} onChange={e => setMedicalHistory(h => ({ ...h, familyHistory: e.target.value }))}
                    rows={2} className="w-full px-2.5 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-200 dark:focus:ring-orange-800 focus:border-orange-400 dark:focus:border-orange-500 transition-all resize-none placeholder-gray-400"
                    placeholder="e.g. Mother has ortho problem and diabetes" />
                </div>
              </div>
            </div>
          )}

          {/* ══ Book-like two-page spread: Treatments left, Bill right ══ */}
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
                            <span className="text-[9px] font-medium px-1 py-0.5 bg-blue-50 text-blue-500 rounded border border-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800/50" title="Auto-added from chart">Auto</span>
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
                  <span className="text-xs text-gray-600 dark:text-gray-300">Medicine</span>
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
                          <a href={upiDeepLink(paidAmount || totalFees, transactionId || Date.now().toString(36), `${form.patientName} ${form.diagnosis?.slice(0, 30) || ''}`)}
                            target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium rounded-lg border border-blue-200 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-all">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                            UPI Link
                          </a>
                          <span className="text-[9px] text-gray-400 dark:text-gray-500">Opens UPI app</span>
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

          {/* ── General Examination ── */}
          {patientProfile && (
            <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="p-1.5 rounded-lg bg-teal-50 dark:bg-teal-900/30"><Activity className="w-4 h-4 text-teal-500 dark:text-teal-400" /></div>
                <h2 className="font-bold text-gray-900 dark:text-gray-100 text-lg">General Examination</h2>
              </div>
              <textarea value={form.generalExamination} onChange={e => setForm(f => ({ ...f, generalExamination: e.target.value }))}
                rows={2} className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-200 dark:focus:ring-teal-800 focus:border-teal-400 dark:focus:border-teal-500 transition-all resize-none placeholder-gray-400"
                placeholder="e.g. Pallor, anemia, vitals stable" />
            </div>
          )}

          {/* ── Extra-Oral Examination ── */}
          {patientProfile && (
            <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="p-1.5 rounded-lg bg-violet-50 dark:bg-violet-900/30"><Activity className="w-4 h-4 text-violet-500 dark:text-violet-400" /></div>
                <h2 className="font-bold text-gray-900 dark:text-gray-100 text-lg">Extra-Oral Examination</h2>
              </div>
              <textarea value={form.extraOralExamination} onChange={e => setForm(f => ({ ...f, extraOralExamination: e.target.value }))}
                rows={2} className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-200 dark:focus:ring-violet-800 focus:border-violet-400 dark:focus:border-violet-500 transition-all resize-none placeholder-gray-400"
                placeholder="e.g. Swelling, lymphadenopathy" />
            </div>
          )}

          {/* Tooth Grid + Per-Tooth Diagnosis */}
          <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-6 shadow-sm">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/30">
                <svg className="w-4 h-4 text-blue-500 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
              </div>
              <h2 className="font-bold text-gray-900 dark:text-gray-100 text-lg">Tooth Chart</h2>
              <span className="text-xs text-gray-500 dark:text-gray-400 font-normal">Tap a tooth to add diagnosis</span>
            </div>

            {diagnosisOptions.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-4 italic">
                No diagnosis items configured. Add them in{' '}
                <Link href="/dashboard/settings" className="text-blue-500 hover:text-blue-600 underline">Settings</Link>.
              </p>
            ) : (
              <div className="space-y-3">
                <ToothGrid
                  toothData={form.toothDiagnoses}
                  onToothSelect={stableSetSelectedTooth}
                  selectedTooth={selectedTooth}
                  diagnosisOptions={diagnosisOptions}
                  onQuickDiagnosis={handleQuickDiagnosis}
                  onToothEntryUpdate={handleToothEntryUpdate}
                  loading={appointmentId && !appointmentMeta && !form.toothDiagnoses.length}
                />

                {selectedTooth && (
                  <div className="mt-3">
                    <PerToothDiagnosisPanel
                      toothNumber={selectedTooth}
                      currentEntry={form.toothDiagnoses.find(t => t.tooth === selectedTooth)}
                      diagnosisOptions={diagnosisOptions}
                      onSave={handleToothSave}
                      onClose={handleToothClose}
                    />
                  </div>
                )}

                {/* Summary of all tooth entries */}
                {form.toothDiagnoses.length > 0 && (
                  <div className="border-t border-gray-100 dark:border-gray-800 pt-3 mt-3">
                    <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-2">
                      {form.toothDiagnoses.length} tooth/teeth affected
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {form.toothDiagnoses.map(entry => (
                        <button
                          key={entry.tooth}
                          type="button"
                          onClick={() => setSelectedTooth(entry.tooth)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                            selectedTooth === entry.tooth
                              ? 'bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-600 text-blue-700 dark:text-blue-300'
                              : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-blue-200'
                          }`}
                        >
                          <span>#{entry.tooth}</span>
                          {entry.surface && <span className="opacity-60">{entry.surface}</span>}
                          <span className="opacity-75">{entry.diagnoses.slice(0, 2).join(', ')}{entry.diagnoses.length > 2 ? ` +${entry.diagnoses.length - 2}` : ''}</span>
                          {entry.treatment && <span className="text-[9px] text-emerald-500 dark:text-emerald-400 font-medium">{entry.treatment}</span>}
                          {entry.severity && <span className={`text-[9px] font-medium ${entry.severity === 'severe' ? 'text-red-500' : entry.severity === 'moderate' ? 'text-orange-500' : 'text-amber-500'}`}>{entry.severity}</span>}
                          <X className="w-3 h-3 ml-0.5 opacity-40 hover:opacity-100" onClick={(e) => {
                            e.stopPropagation();
                            setForm(f => ({ ...f, toothDiagnoses: f.toothDiagnoses.filter(t => t.tooth !== entry.tooth) }));
                            if (selectedTooth === entry.tooth) setSelectedTooth(null);
                          }} />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Diagnosis */}
          <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-6 shadow-sm">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/30"><FileText className="w-4 h-4 text-blue-500 dark:text-blue-400" /></div>                <h2 className="font-bold text-gray-900 dark:text-gray-100 text-lg">Diagnosis / Observations</h2>
            </div>
            <textarea value={form.diagnosis} onChange={e => setForm(f => ({ ...f, diagnosis: e.target.value }))}
              rows={3} className="w-full px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 focus:border-blue-400 dark:focus:border-blue-500 transition-all resize-none"
              placeholder="Describe the diagnosis, observations, and any clinical notes..." />
          </div>

          {/* ── Attachments ── */}
          <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-6 shadow-sm">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="p-1.5 rounded-lg bg-purple-50 dark:bg-purple-900/30"><Upload className="w-4 h-4 text-purple-500 dark:text-purple-400" /></div>
                <h2 className="font-bold text-gray-900 dark:text-gray-100 text-lg">Attachments</h2>
                <span className="text-xs text-gray-500 dark:text-gray-400 font-normal">(optional)</span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,audio/*,video/*,.pdf,.doc,.docx"
                onChange={handleMediaUpload}
                className="hidden"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingMedia}
                  className="flex-1 py-5 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl hover:border-purple-300 dark:hover:border-purple-600 hover:bg-purple-50/30 dark:hover:bg-purple-900/10 transition-all flex flex-col items-center gap-2 text-gray-400 dark:text-gray-500 hover:text-purple-500 dark:hover:text-purple-400"
                >
                  <Upload className="w-4 h-4" />
                  <span className="text-xs font-medium">
                    {uploadingMedia ? 'Uploading...' : 'Click to upload'}
                  </span>
                  <span className="text-xs">Photos, documents, audio</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowCamera(true)}
                  disabled={uploadingMedia}
                  className="w-20 py-5 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl hover:border-purple-300 dark:hover:border-purple-600 hover:bg-purple-50/30 dark:hover:bg-purple-900/10 transition-all flex flex-col items-center gap-2 text-gray-400 dark:text-gray-500 hover:text-purple-500 dark:hover:text-purple-400 shrink-0"
                >
                  <Camera className="w-4 h-4" />
                  <span className="text-xs font-medium">Camera</span>
                </button>
                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  disabled={uploadingMedia}
                  className="w-20 py-5 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl hover:border-purple-300 dark:hover:border-purple-600 hover:bg-purple-50/30 dark:hover:bg-purple-900/10 transition-all flex flex-col items-center gap-2 text-gray-400 dark:text-gray-500 hover:text-purple-500 dark:hover:text-purple-400 shrink-0"
                >
                  <Images className="w-4 h-4" />
                  <span className="text-xs font-medium">Gallery</span>
                </button>
              </div>
              <input
                ref={galleryInputRef}
                type="file"
                multiple
                accept="image/*"
                onChange={handleMediaUpload}
                className="hidden"
              />
              {mediaFiles.length > 0 && (
                <div className="mt-2.5 space-y-1.5">
                  {mediaFiles.map((file, idx) => (
                    <div key={idx} className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 text-sm">
                      {getFilePreview(file) ? (
                        <img src={getFilePreview(file)} alt="" className="w-8 h-8 rounded-lg object-cover" />
                      ) : (
                        <span className="text-base">{getFileIcon(file)}</span>
                      )}
                      <span className="flex-1 truncate text-gray-700 dark:text-gray-300">{file.name}</span>
                      <button type="button" onClick={() => removeMediaFile(idx)}
                        className="p-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

          {/* ── Follow-up & Additional Notes ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-6 shadow-sm">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/30"><Calendar className="w-4 h-4 text-amber-500 dark:text-amber-400" /></div>
                <h2 className="font-bold text-gray-900 dark:text-gray-100 text-lg">Follow-up</h2>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Follow-up Date</label>
                  <input type="date" value={form.followUpDate} onChange={e => setForm(f => ({ ...f, followUpDate: e.target.value }))}
                    className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 focus:border-blue-400 dark:focus:border-blue-500 transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Instructions</label>
                  <input type="text" value={form.followUpInstructions} onChange={e => setForm(f => ({ ...f, followUpInstructions: e.target.value }))}
                    className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 focus:border-blue-400 dark:focus:border-blue-500 transition-all"
                    placeholder="e.g. Return in 2 weeks" />
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-6 shadow-sm">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="p-1.5 rounded-lg bg-gray-100 dark:bg-gray-800"><FileText className="w-4 h-4 text-gray-500 dark:text-gray-400" /></div>
                <h2 className="font-bold text-gray-900 dark:text-gray-100 text-lg">Additional Notes</h2>
              </div>
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={3} className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 focus:border-blue-400 dark:focus:border-blue-500 transition-all resize-none"
                placeholder="Any additional notes or instructions..." />
            </div>
          </div>

          {/* ── Medical & Dental History (Editable) ── */}
          {patientProfile && (
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
          )}

          {/* Medicines — full width */}
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

          {/* Diet & Advice */}
          <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-6 shadow-sm">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="p-1.5 rounded-lg bg-orange-50 dark:bg-orange-900/30">
                <svg className="w-4 h-4 text-orange-500 dark:text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
              </div>
              <h2 className="font-bold text-gray-900 dark:text-gray-100 text-lg">Diet & Advice</h2>
              <span className="text-xs text-gray-500 dark:text-gray-400 font-normal">Select relevant advice for this patient</span>
            </div>
            {adviceOptions.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-4 italic">
                No advice items configured. Add them in{' '}
                <Link href="/dashboard/settings" className="text-blue-500 hover:text-blue-600 underline">Settings</Link>.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {adviceOptions.map((item, i) => {
                  const selected = form.adviceSelected.includes(item);
                  return (
                    <button key={i} type="button" onClick={() => {
                      setForm(f => ({
                        ...f,
                        adviceSelected: selected
                          ? f.adviceSelected.filter(a => a !== item)
                          : [...f.adviceSelected, item],
                      }));
                    }}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all active:scale-95 ${
                        selected
                          ? 'bg-emerald-100 dark:bg-emerald-900/40 border-emerald-300 dark:border-emerald-600 text-emerald-800 dark:text-emerald-200 ring-1 ring-emerald-200 dark:ring-emerald-700'
                          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-emerald-200 dark:hover:border-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                      }`}>
                      {item}
                      {selected && <span className="ml-1.5 text-emerald-600 dark:text-emerald-400">✓</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <button type="submit" disabled={submitting}
            className="block mx-auto w-full sm:w-auto sm:min-w-[360px] py-3.5 sm:py-3 px-8 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white text-sm font-semibold rounded-xl hover:from-emerald-600 hover:to-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:opacity-60 disabled:cursor-not-allowed transition-all active:scale-[0.99] shadow-lg shadow-emerald-200 dark:shadow-emerald-900/50">
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                Saving...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <ClipboardCheck className="w-4 h-4" />
                {isEdit ? 'Save Changes' : appointmentId ? 'Complete & Save Visit' : 'Log Visit'}
              </span>
            )}
          </button>
        </form>
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
      </div>
    </div>
  );
}
