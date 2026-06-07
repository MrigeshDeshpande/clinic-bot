'use client';

import { useState, useEffect, Suspense, useRef, useContext } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { ToastContext } from '../layout';
import { Stethoscope, FileText, Pill, Calendar, Plus, Trash2, ClipboardCheck, Activity, ArrowLeft, Upload, Search, X, Lightbulb, Clock, MessageSquare, Heart, Users, TrendingUp, AlertTriangle, CheckCircle2, Download } from 'lucide-react';
import { TREATMENTS, TREATMENT_NAMES, suggestTreatment } from '@/lib/treatments';
import { MEDICINE_SALTS } from '@/lib/medicines';
import MediaViewer from '@/components/MediaViewer';
import { fetchCached } from '@/lib/clientFetchCache';

const DRAFT_KEY = 'visit_draft';
const TEMPLATES_KEY = 'visit_templates';

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

const PRESET_FEES = [
  { label: 'General Checkup', fee: 300, icon: '🏥' },
  { label: 'Teeth Cleaning', fee: 400, icon: '✨' },
  { label: 'Root Canal', fee: 3000, icon: '🔬' },
  { label: 'Dental Filling', fee: 800, icon: '🩹' },
  { label: 'Whitening', fee: 2500, icon: '🦷' },
  { label: 'Implants', fee: 8000, icon: '🦷' },
  { label: 'Braces Adjustment', fee: 1500, icon: '😁' },
  { label: 'Crown', fee: 3500, icon: '👑' },
  { label: 'Extraction', fee: 600, icon: '🦷' },
  { label: 'Scaling', fee: 500, icon: '🦷' },
  { label: 'Veneers', fee: 5000, icon: '✨' },
  { label: 'Pediatric Dentistry', fee: 400, icon: '🧒' },
  { label: 'Other', fee: 500, icon: '🩺' },
];

const CONSULTATION_DEFAULT = 2000;
const LOCATIONS = ['Hudco', 'Bhilai', 'Durg', 'Nehru Nagar', 'Borsi'];
const PHONE_PREFIX = '+91';
function stripPhonePrefix(v) { return v?.replace(/^(\+91|91)/, '') || v || ''; }
function withPhonePrefix(v) { const s = stripPhonePrefix(v); return s ? `${PHONE_PREFIX}${s}` : ''; }
const CONSULTATION_STEP = 100;
const TREATMENT_STEP = 50;

function getDefaultFee(name) {
  const preset = PRESET_FEES.find(p => p.label === name);
  return preset?.fee || 0;
}

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
  });
  const [adviceOptions, setAdviceOptions] = useState([]);
  const [diagnosisOptions, setDiagnosisOptions] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [errors, setErrors] = useState({});
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [mediaFiles, setMediaFiles] = useState([]);
  const [compiling, setCompiling] = useState(false);

  // Full context data
  const [appointmentMeta, setAppointmentMeta] = useState(null);
  const [patientProfile, setPatientProfile] = useState(null);
  const [patientVisits, setPatientVisits] = useState([]);
  const [patientMessages, setPatientMessages] = useState([]);
  const [patientFamily, setPatientFamily] = useState([]);
  const [medicalHistory, setMedicalHistory] = useState({ allergies: '', chronicConditions: '', bloodGroup: '', bp: '', weight: '', medications: '' });
  const [loadingExtra, setLoadingExtra] = useState(false);

  // Multi-treatment state (book-style)
  const [treatmentFees, setTreatmentFees] = useState(() => {
    const initial = {};
    if (prefillTreatment) {
      initial[prefillTreatment] = getDefaultFee(prefillTreatment);
    }
    return initial;
  });
  const [consultationFee, setConsultationFee] = useState(CONSULTATION_DEFAULT);

  const selectedTreatments = Object.keys(treatmentFees);
  const computedTreatmentCharges = Object.values(treatmentFees).reduce((sum, fee) => sum + fee, 0);
  const totalFees = consultationFee + computedTreatmentCharges + (Number(form.medicineCharges) || 0);

  function toggleTreatment(name) {
    setTreatmentFees(prev => {
      if (prev[name] !== undefined) {
        const next = { ...prev };
        delete next[name];
        return next;
      }
      return { ...prev, [name]: getDefaultFee(name) };
    });
  }

  function addCustomTreatment() {
    const name = prompt('Enter treatment name:');
    if (name && name.trim()) {
      setTreatmentFees(prev => {
        if (prev[name.trim()] !== undefined) return prev;
        return { ...prev, [name.trim()]: 0 };
      });
    }
  }

  function adjustConsultation(delta) {
    setConsultationFee(prev => Math.max(0, prev + delta));
  }

  function adjustTreatmentFee(name, delta) {
    setTreatmentFees(prev => ({
      ...prev,
      [name]: Math.max(0, (prev[name] || 0) + delta),
    }));
  }
  const [symptomInput, setSymptomInput] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef(null);
  const fileInputRef = useRef(null);
  const formReadyRef = useRef(false);

  // Auto-save draft
  const [draftRestored, setDraftRestored] = useState(false);
  const [draftAvailable, setDraftAvailable] = useState(false);

  // Templates
  const [templates, setTemplates] = useState([]);
  const [templateName, setTemplateName] = useState('');
  const [showTemplateInput, setShowTemplateInput] = useState(false);
  const [showTemplateLoad, setShowTemplateLoad] = useState(false);

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
            patientPhone: stripPhonePrefix(a.patient_phone) || '',
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
    if (appointmentId || form.patientName.trim().length < 2) {
      setSearchResults([]);
      setShowSearch(false);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/dashboard/patients/search?q=${encodeURIComponent(form.patientName.trim())}`);
        const data = await res.json();
        setSearchResults(data.patients || []);
        setShowSearch(data.patients?.length > 0);
      } catch {}
      setSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [form.patientName, appointmentId]);

  // ── Auto-save draft to localStorage ──
  useEffect(() => {
    if (!formReadyRef.current) return;
    if (submitting) return;
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
    return () => clearTimeout(timer);
  }, [form, treatmentFees, consultationFee, medicalHistory, mediaFiles, submitting, appointmentId, paymentStatus, paymentMethod, transactionId, paidAmount]);

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
              if (data.visits) setPatientVisits(data.visits);
            }
          }
        } catch {}
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
        setShowSearch(false);
        setShowSuggestions(false);
        setShowTemplateLoad(false);
        setShowTemplateInput(false);
        setSaltSearch('');
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  async function selectPatient(p) {
    setForm(f => ({
      ...f,
      patientName: p.name,
      patientPhone: stripPhonePrefix(p.phone) || f.patientPhone,
      patientAge: p.age?.toString() || '',
      patientSex: normalizeSex(p.sex),
      patientLocation: p.location || '',
    }));
    if (p.location && !LOCATIONS.includes(p.location)) setShowCustomLocation(true);
    setShowSearch(false);
    setSearchResults([]);
    if (p.id) {
      setLoadingExtra(true);
      try {
        const data = await fetchCached(`/api/dashboard/patients/${p.id}`);
        if (data.patient) {
          const profile = data.patient;
          setPatientProfile(profile);
          if (profile.allergies !== undefined || profile.chronicConditions !== undefined || profile.bloodGroup !== undefined || profile.bp !== undefined || profile.weight !== undefined || profile.medications !== undefined) {
            setMedicalHistory({
              allergies: profile.allergies || '',
              chronicConditions: profile.chronicConditions || '',
              bloodGroup: profile.bloodGroup || '',
              bp: profile.bp || '',
              weight: profile.weight || '',
              medications: profile.medications || '',
            });
          }
          if (data.visits) setPatientVisits(data.visits);
          Promise.all([
            fetchCached(`/api/dashboard/patients/${p.id}/messages?limit=10`)
              .then(mData => { if (mData.messages) setPatientMessages(mData.messages); })
              .catch(() => {}),
            fetchCached(`/api/dashboard/patients/${p.id}/family`)
              .then(fData => { if (fData.family) setPatientFamily(fData.family); })
              .catch(() => {}),
          ]);
        }
      } catch {}
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

  // ── Salt tap-to-add ──
  function toggleSalt(salt) {
    const existing = form.medicines.findIndex(m => m.name === salt);
    if (existing >= 0) {
      setForm(f => ({ ...f, medicines: f.medicines.filter((_, i) => i !== existing) }));
    } else {
      setForm(f => ({ ...f, medicines: [...f.medicines, { name: salt, dosage: '\u2014', frequency: '', duration: '' }] }));
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

  function removeMediaFile(idx) {
    setMediaFiles(prev => prev.filter((_, i) => i !== idx));
  }

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
      const primaryTreatment = selectedTreatments[0] || form.treatment || 'Walk-in';
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
            treatments: selectedTreatments,
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
            status: 'completed',
            ...paymentPayload,
          }
        : {
            patient_name: form.patientName.trim(),
            patient_phone: withPhonePrefix(form.patientPhone.trim()) || undefined,
            patient_age: walkInAge,
            patient_sex: form.patientSex || undefined,
            patient_location: form.patientLocation.trim() || undefined,
            treatment: primaryTreatment,
            treatments: selectedTreatments,
            consultationFee,
            treatmentCharges: computedTreatmentCharges,
            medicineCharges: Number(form.medicineCharges) || 0,
            diagnosis: form.diagnosis.trim() || undefined,
            medicines: form.medicines.filter(m => m.name.trim()),
            followUpDate: form.followUpDate || undefined,
            followUpInstructions: form.followUpInstructions.trim() || undefined,
            advice_selected: form.adviceSelected,
            diagnosis_selected: form.diagnosisSelected,
            notes: form.notes.trim() || undefined,
            ...paymentPayload,
          };

      const res = await fetch('/api/dashboard/visit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        // Save medical history
        const patientIdForHistory = patientProfile?.id || appointmentMeta?.patient_id || data.appointment?.patient_id;
        if (patientIdForHistory) {
          const mhPayload = {};
          if (medicalHistory.allergies) mhPayload.allergies = medicalHistory.allergies;
          if (medicalHistory.chronicConditions) mhPayload.chronicConditions = medicalHistory.chronicConditions;
          if (medicalHistory.bloodGroup) mhPayload.bloodGroup = medicalHistory.bloodGroup;
          if (medicalHistory.bp) mhPayload.bp = medicalHistory.bp;
          if (medicalHistory.weight) mhPayload.weight = medicalHistory.weight;
          if (medicalHistory.medications) mhPayload.medications = medicalHistory.medications;
          if (Object.keys(mhPayload).length > 0) {
            await fetch(`/api/dashboard/patients/${patientIdForHistory}/medical-history`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(mhPayload),
            });
          }
        }

        const appointmentIdForMedia = data.appointment?.id || appointmentId;
        console.log('[MEDIA] Visit saved, uploading', mediaFiles.length, 'file(s) for appointment', appointmentIdForMedia);
        if (appointmentIdForMedia && mediaFiles.length > 0) {
          for (const file of mediaFiles) {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('appointmentId', appointmentIdForMedia);
            console.log('[MEDIA] Uploading:', file.name, file.type, file.size);
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
          }
        } else {
          console.log('[MEDIA] No files to upload or missing appointment ID');
        }
        localStorage.removeItem(DRAFT_KEY);
        const appointmentIdForResult = data.appointment?.id || appointmentId;
        setResult({ patient_name: form.patientName, treatment: primaryTreatment, appointment_id: appointmentIdForResult });
      } else {
        showToast(data.error || 'Failed to log visit', 'error');
      }
    } catch (err) {
      console.error('[VISIT] Submit error:', err);
      showToast('Network error — could not save visit', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setForm({ patientName: '', patientPhone: '', patientAge: '', patientSex: '', patientLocation: '', treatment: '', consultationFee: '', treatmentCharges: '', medicineCharges: '', diagnosis: '', medicines: [], followUpDate: '', followUpInstructions: '', notes: '' });
    setTreatmentFees({});
    setConsultationFee(CONSULTATION_DEFAULT);
    setPatientProfile(null);
    setAppointmentMeta(null);
    setPatientVisits([]);
    setPatientMessages([]);
    setPatientFamily([]);
    setMedicalHistory({ allergies: '', chronicConditions: '', bloodGroup: '', bp: '', weight: '', medications: '' });
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
        <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-8 md:p-12 max-w-md w-full text-center shadow-lg transition-colors duration-200">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/30 dark:to-emerald-800/30 mb-6">
            <ClipboardCheck className="w-10 h-10 text-emerald-500 dark:text-emerald-400" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">{isEdit ? 'Visit Updated Successfully' : 'Visit Logged Successfully'}</h2>
          <div className="text-gray-500 dark:text-gray-400 text-sm mb-6 space-y-1">
            <p><span className="font-medium text-gray-700 dark:text-gray-300">{result.patient_name}</span> — {result.treatment}</p>
          </div>
          <div className="flex gap-3 justify-center">
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
                const res = await fetch(`/api/dashboard/visits/${id}/prescription`, { method: 'POST' });
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
                const res = await fetch(`/api/dashboard/visits/${id}/compile`, { method: 'POST' });
                const data = await res.json();
                if (res.ok && data.url) {
                  showToast('✅ PDF compiled — opening in new tab', 'success', { duration: 4000 });
                  window.open(data.url, '_blank');
                  // Also send via WhatsApp if phone number exists
                  showToast('📤 Sending to patient via WhatsApp...', 'info', { duration: 6000 });
                  const sendRes = await fetch(`/api/dashboard/visits/${id}/compile/send`, { method: 'POST' });
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
          <div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">{isEdit ? 'Edit Visit' : 'Log Visit'}</h1>              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {isEdit ? `Editing visit for ${prefillName || 'patient'}` : appointmentId ? `Completing appointment for ${prefillName}` : patientProfile ? `Logging visit for ${patientProfile.name}` : 'Record a patient consultation'}
            </p>
          </div>
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
                {appointmentMeta?.chit_media?.length > 0 && (
                  <div className="col-span-full">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 block">Media Shared ({appointmentMeta.chit_media.length})</span>
                    <MediaViewer mediaKeys={appointmentMeta.chit_media} getSignedUrl={getSignedUrl} />
                  </div>
                )}
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

          {/* ── Visit History + WhatsApp Snippets ── */}
          {patientProfile && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Visit History */}
              <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
                <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-gray-100 dark:border-gray-800">
                  <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/30"><Clock className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" /></div>
                  <h2 className="font-bold text-gray-900 dark:text-gray-100 text-lg">Visit History</h2>
                  <span className="text-xs text-gray-500 dark:text-gray-400 font-normal">Past {Math.min(patientVisits.length, 5)} visits</span>
                </div>
                <div className="px-5 py-3 space-y-0 max-h-[300px] overflow-y-auto">
                  {patientVisits.length === 0 ? (
                    <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-6">No past visits recorded</p>
                  ) : (
                    patientVisits.slice(0, 5).map((v, i) => (
                      <div key={v.id} className="flex gap-3 py-2.5 border-b border-gray-50 dark:border-gray-800 last:border-0">
                        <div className="flex flex-col items-center gap-1">
                          <div className={`w-2 h-2 rounded-full ${v.status === 'completed' ? 'bg-emerald-400' : v.status === 'no_show' ? 'bg-red-400' : 'bg-blue-400'}`} />
                          {i < Math.min(patientVisits.length, 5) - 1 && <div className="w-px flex-1 bg-gray-100 dark:bg-gray-800" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-medium text-gray-900 dark:text-gray-100">{v.date?.slice(0, 10)}{v.time ? ` ${v.time?.slice(0, 5)}` : ''}</p>
                            <div className="flex items-center gap-1">
                              {v.status === 'completed' && (
                                <button onClick={() => {
                                  fetch(`/api/dashboard/visits/${v.id}/prescription`, { method: 'POST' })
                                    .then(r => r.json())
                                    .then(data => {
                                      if (data.url) {
                                        showToast('PDF generated successfully', 'success');
                                        window.open(data.url, '_blank');
                                      }
                                    })
                                    .catch(() => {});
                                }}
                                  className="p-0.5 rounded text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-colors"
                                  title="View prescription">
                                  <FileText className="w-3 h-3" />
                                </button>
                              )}
                              <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${
                                v.status === 'completed' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' :
                                v.status === 'no_show' ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400' :
                                'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                              }`}>{!v.time && v.status === 'completed' ? 'Walk-in' : v.status === 'completed' ? 'Done' : v.status === 'no_show' ? 'Missed' : 'Scheduled'}</span>
                            </div>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{Array.isArray(v.treatments) && v.treatments.length ? v.treatments.join(', ') : (v.treatment || 'Visit')}{v.diagnosis ? ` — ${v.diagnosis.slice(0, 60)}${v.diagnosis.length > 60 ? '...' : ''}` : ''}</p>
                          {(v.consultation_fee || v.treatment_charges || v.medicine_charges) ? (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">₹{((v.consultation_fee || 0) + (v.treatment_charges || 0) + (v.medicine_charges || 0)).toLocaleString('en-IN')}</p>
                          ) : null}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* WhatsApp Conversation Snippets */}
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
            </div>
          )}

          {/* ── Medical History + Family ── */}
          {patientProfile && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Medical History Flags */}
              <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="p-1.5 rounded-lg bg-red-50 dark:bg-red-900/30"><Heart className="w-3.5 h-3.5 text-red-500 dark:text-red-400" /></div>
                  <h2 className="font-bold text-gray-900 dark:text-gray-100 text-lg">Medical History</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">BP / Weight</label>
                    <div className="flex gap-2">
                      <input type="text" value={medicalHistory.bp} onChange={e => setMedicalHistory(h => ({ ...h, bp: e.target.value }))}
                        className="w-1/2 px-2.5 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 focus:border-blue-400 dark:focus:border-blue-500 transition-all placeholder-gray-400"
                        placeholder="BP" />
                      <input type="text" value={medicalHistory.weight} onChange={e => setMedicalHistory(h => ({ ...h, weight: e.target.value }))}
                        className="w-1/2 px-2.5 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 focus:border-blue-400 dark:focus:border-blue-500 transition-all placeholder-gray-400"
                        placeholder="Weight" />
                    </div>
                  </div>
                </div>
                <div className="mt-2">
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Current Medications</label>
                  <input type="text" value={medicalHistory.medications} onChange={e => setMedicalHistory(h => ({ ...h, medications: e.target.value }))}
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-200 dark:focus:ring-violet-800 focus:border-violet-400 dark:focus:border-violet-500 transition-all placeholder-gray-400"
                    placeholder="e.g. Metformin 500mg, Amlodipine 5mg" />
                </div>
              </div>

              {/* Family Members */}
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
                  <input type="text" value={form.patientName}
                    onChange={e => { setForm(f => ({ ...f, patientName: e.target.value })); setErrors(ev => { const n={...ev}; delete n.patientName; return n; }); }}
                    className={`w-full px-4 py-2.5 bg-white dark:bg-gray-800 border rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 transition-all ${errors.patientName ? 'border-red-300 dark:border-red-700 focus:ring-red-200 dark:focus:ring-red-800' : 'border-gray-200 dark:border-gray-700 focus:ring-blue-200 dark:focus:ring-blue-800 focus:border-blue-400 dark:focus:border-blue-500'}`}
                    placeholder="e.g. Rajesh Kumar" />
                  {errors.patientName && <p className="text-xs text-red-500 dark:text-red-400 mt-1">{errors.patientName}</p>}
                  {showSearch && searchResults.length > 0 && (
                    <div ref={searchRef} className="absolute z-20 mt-1 w-full bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg overflow-hidden">
                      {searchResults.map(p => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => selectPatient(p)}
                          className="w-full text-left px-4 py-3 hover:bg-blue-50 dark:hover:bg-blue-900/20 border-b border-gray-50 dark:border-gray-700 last:border-0 transition-colors flex items-center gap-3"
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
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Phone</label>
                  <div className="flex">
                    <span className="inline-flex items-center px-3 py-2.5 bg-gray-100 dark:bg-gray-700 border border-r-0 border-gray-200 dark:border-gray-600 rounded-l-xl text-sm font-medium text-gray-600 dark:text-gray-300 shrink-0">{PHONE_PREFIX}</span>
                    <input type="tel" value={stripPhonePrefix(form.patientPhone)} onChange={e => setForm(f => ({ ...f, patientPhone: stripPhonePrefix(e.target.value) }))}
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
                {TREATMENT_NAMES.map(name => {
                  const isSelected = selectedTreatments.includes(name);
                  const preset = PRESET_FEES.find(p => p.label === name);
                  return (
                    <button key={name} type="button" onClick={() => toggleTreatment(name)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-all active:scale-[0.98] ${
                        isSelected
                          ? 'bg-emerald-50 dark:bg-emerald-900/25 border-emerald-200 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 ring-1 ring-emerald-200 dark:ring-emerald-700'
                          : 'bg-white dark:bg-gray-800/50 border-gray-150 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-emerald-200 dark:hover:border-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-900/40'
                      }`}>
                      <span className="text-base shrink-0 w-5 text-center">{preset?.icon || '🩺'}</span>
                      <span className="text-left truncate">{name}</span>
                      {preset && (
                        <span className={`ml-auto text-xs font-semibold shrink-0 ${isSelected ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 dark:text-gray-500'}`}>
                          ₹{preset.fee}
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
                    {selectedTreatments.map(name => (
                      <div key={name} className="flex items-center justify-between py-0.5">
                        <span className="text-xs text-gray-700 dark:text-gray-300 truncate max-w-[120px]" title={name}>{name}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          <button type="button" onClick={() => adjustTreatmentFee(name, -TREATMENT_STEP)} disabled={(treatmentFees[name] || 0) <= 0}
                            className="w-5 h-5 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-200 transition-all flex items-center justify-center text-xs font-medium active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed shrink-0">−</button>
                          <div className="relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 dark:text-gray-400">₹</span>
                            <input type="number" min="0" value={treatmentFees[name] || 0}
                              onChange={e => adjustTreatmentFee(name, (Number(e.target.value) || 0) - (treatmentFees[name] || 0))}
                              className="w-24 pl-5 pr-2 py-1.5 text-sm text-center font-medium text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-200 dark:focus:ring-emerald-800 focus:border-emerald-400 dark:focus:border-emerald-500 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                          </div>
                          <button type="button" onClick={() => adjustTreatmentFee(name, TREATMENT_STEP)}
                            className="w-5 h-5 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-200 transition-all flex items-center justify-center text-xs font-medium active:scale-90 shrink-0">+</button>
                        </div>
                      </div>
                    ))}
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

          {/* Diagnosis chips */}
          <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-6 shadow-sm">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/30">
                <svg className="w-4 h-4 text-blue-500 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
              </div>
              <h2 className="font-bold text-gray-900 dark:text-gray-100 text-lg">Diagnosis</h2>
              <span className="text-xs text-gray-500 dark:text-gray-400 font-normal">Tap to select</span>
            </div>
            {diagnosisOptions.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-4 italic">
                No diagnosis items configured. Add them in{' '}
                <Link href="/dashboard/settings" className="text-blue-500 hover:text-blue-600 underline">Settings</Link>.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {diagnosisOptions.map((item, i) => {
                  const selected = form.diagnosisSelected.includes(item);
                  return (
                    <button key={i} type="button" onClick={() => {
                      setForm(f => ({
                        ...f,
                        diagnosisSelected: selected
                          ? f.diagnosisSelected.filter(d => d !== item)
                          : [...f.diagnosisSelected, item],
                      }));
                    }}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all active:scale-95 ${
                        selected
                          ? 'bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-600 text-blue-800 dark:text-blue-200 ring-1 ring-blue-200 dark:ring-blue-700'
                          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-blue-200 dark:hover:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                      }`}>
                      {item}
                      {selected && <span className="ml-1.5 text-blue-600 dark:text-blue-400">✓</span>}
                    </button>
                  );
                })}
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

          {/* Right side items: Attachments + Follow-up + Notes */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Attachments */}
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
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingMedia}
                  className="w-full py-5 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl hover:border-purple-300 dark:hover:border-purple-600 hover:bg-purple-50/30 dark:hover:bg-purple-900/10 transition-all flex flex-col items-center gap-2 text-gray-400 dark:text-gray-500 hover:text-purple-500 dark:hover:text-purple-400"
                >
                  <Upload className="w-4 h-4" />
                  <span className="text-xs font-medium">
                    {uploadingMedia ? 'Uploading...' : 'Click to upload'}
                  </span>
                  <span className="text-xs">Photos, documents, audio</span>
                </button>
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

            {/* Follow-up */}
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

            {/* Notes */}
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

          {/* Medicines — full width */}
          <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-6 shadow-sm">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="p-1.5 rounded-lg bg-violet-50 dark:bg-violet-900/30"><Pill className="w-4 h-4 text-violet-500 dark:text-violet-400" /></div>
              <h2 className="font-bold text-gray-900 dark:text-gray-100 text-lg">Prescribed Medicines</h2>
              <span className="text-xs text-gray-500 dark:text-gray-400 font-normal">Tap a salt to add</span>
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
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                      <div>
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
                        <input type="text" value={med.frequency} onChange={e => updateMedicine(idx, 'frequency', e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 transition-all"
                          placeholder="e.g. Twice daily" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Duration</label>
                        <input type="text" value={med.duration} onChange={e => updateMedicine(idx, 'duration', e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 transition-all"
                          placeholder="e.g. 5 days" />
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
      </div>
    </div>
  );
}
