'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect, useContext } from 'react';
import { fetchCached, invalidateFetchCache } from '@/lib/clientFetchCache';
import { ToastContext } from '../../layout';
import {
  ArrowLeft, CheckCircle, XCircle, AlertCircle, Clock, User, Phone, Calendar,
  Cpu, ChevronDown, ChevronRight, FileSearch, Stethoscope,
  Pill, IndianRupee, MessageSquareText, ClipboardList, Syringe, Edit3, Trash2,
  Plus, Save, FlaskConical
} from 'lucide-react';

const PERSONAL_FIELDS = ['name', 'age', 'sex', 'phone', 'date'];

const SECTIONS = [
  { key: 'diagnoses', title: 'Diagnoses', icon: ClipboardList, multi: true },
  { key: 'observations', title: 'Observations & Findings', icon: Stethoscope, multi: true },
  { key: 'treatment_recommendations', title: 'Treatment Plans', icon: Syringe, multi: true },
  { key: 'completed_treatments', title: 'Completed Treatments', icon: CheckCircle, multi: true },
  { key: 'medications', title: 'Medications', icon: Pill, multi: true },
  { key: 'financial_estimates', title: 'Financial Estimates', icon: IndianRupee, multi: true },
  { key: 'followups', title: 'Follow-ups', icon: Calendar, multi: true },
];

function StatusBadge({ status }) {
  const styles = {
    extraction_completed: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    review_pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    approved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  };
  const labels = {
    extraction_completed: 'Extraction Done',
    review_pending: 'Needs Review',
    approved: 'Approved',
    rejected: 'Rejected',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
      {status === 'review_pending' && <AlertCircle className="w-3 h-3" />}
      {status === 'approved' && <CheckCircle className="w-3 h-3" />}
      {status === 'rejected' && <XCircle className="w-3 h-3" />}
      {(status === 'extraction_completed' || !status) && <Cpu className="w-3 h-3" />}
      {labels[status] || status}
    </span>
  );
}

function Input({ value, onChange, type = 'text', placeholder, className = '' }) {
  if (type === 'textarea') {
    return (
      <textarea
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={2}
        className={`w-full px-2.5 py-1.5 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none ${className}`}
      />
    );
  }
  return (
    <input
      type={type}
      value={value ?? ''}
      onChange={e => onChange(type === 'number' ? (e.target.value ? Number(e.target.value) : null) : e.target.value)}
      placeholder={placeholder}
      className={`w-full px-2.5 py-1.5 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 ${className}`}
    />
  );
}

function SectionCard({ title, icon: Icon, children, editing, onEdit, onSave, count }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
          {Icon && <Icon className="w-4 h-4 text-gray-400" />}
          {title}{count !== undefined ? <span className="text-gray-400 font-normal">({count})</span> : null}
        </span>
        {(onEdit || onSave) && (
          <button
            onClick={editing && onSave ? onSave : onEdit}
            className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg transition-colors ${
              editing
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            {editing ? <Save className="w-3.5 h-3.5" /> : <Edit3 className="w-3.5 h-3.5" />}
            {editing ? 'Save' : 'Edit'}
          </button>
        )}
      </div>
      <div className="px-4 py-3">{children}</div>
    </div>
  );
}

function PatientSection({ data, editing, onChange }) {
  const fields = [
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'age', label: 'Age', type: 'number' },
    { key: 'sex', label: 'Sex', type: 'select', options: ['', 'M', 'F', 'Other'] },
    { key: 'phone', label: 'Phone', type: 'text' },
    { key: 'date', label: 'Date', type: 'text' },
  ];

  if (!data) {
    return <p className="text-sm text-gray-400 italic">No patient data</p>;
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
      {fields.map(f => (
        <div key={f.key}>
          <span className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">{f.label}</span>
          {editing ? (
            f.type === 'select' ? (
              <select
                value={data[f.key] ?? ''}
                onChange={e => onChange(f.key, e.target.value || null)}
                className="w-full px-2.5 py-1.5 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              >
                {f.options.map(o => <option key={o} value={o}>{o || '—'}</option>)}
              </select>
            ) : (
              <Input value={data[f.key]} onChange={v => onChange(f.key, v)} type={f.type} />
            )
          ) : (
            <p className="text-gray-900 dark:text-gray-100">{data[f.key] ?? <span className="text-gray-400 italic">—</span>}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function ArrayItems({ items, fields, editing, onChange, onAdd, onRemove }) {
  if (!items || items.length === 0) {
    if (!editing) return <p className="text-sm text-gray-400 italic">None</p>;
    return (
      <div className="text-center py-4">
        <p className="text-sm text-gray-400 mb-2">No items yet</p>
        {onAdd && <button onClick={onAdd} className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"><Plus className="w-3.5 h-3.5" /> Add</button>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item, idx) => (
        <div key={idx} className={`relative ${editing ? 'bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700/50 rounded-lg p-3' : ''}`}>
          {editing && onRemove && (
            <button
              onClick={() => onRemove(idx)}
              className="absolute top-2 right-2 text-gray-400 hover:text-red-500 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <div className={editing ? 'space-y-2 pr-6' : ''}>
            {fields.map(f => {
              const val = item[f.key];
              const displayVal = Array.isArray(val) ? val.join(', ') : val;

              if (editing) {
                if (f.type === 'tooth_numbers') {
                  return (
                    <div key={f.key}>
                      <span className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">{f.label}</span>
                      <Input
                        value={Array.isArray(val) ? val.join(', ') : val}
                        onChange={v => onChange(idx, f.key, v ? v.split(',').map(s => s.trim()).filter(Boolean) : [])}
                        placeholder={f.placeholder}
                      />
                    </div>
                  );
                }
                if (f.type === 'select') {
                  return (
                    <div key={f.key}>
                      <span className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">{f.label}</span>
                      <select
                        value={val ?? ''}
                        onChange={e => onChange(idx, f.key, e.target.value || null)}
                        className="w-full px-2.5 py-1.5 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      >
                        <option value="">—</option>
                        {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                  );
                }
                return (
                  <div key={f.key}>
                    <span className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">{f.label}</span>
                    <Input
                      value={val}
                      onChange={v => onChange(idx, f.key, v)}
                      type={f.type || 'text'}
                      placeholder={f.placeholder}
                    />
                  </div>
                );
              }

              return (
                <div key={f.key} className="flex gap-2 items-baseline">
                  <span className="text-xs text-gray-500 dark:text-gray-400 min-w-[70px] shrink-0">{f.label}</span>
                  <span className="text-sm text-gray-900 dark:text-gray-100">
                    {displayVal != null && displayVal !== '' ? displayVal : <span className="text-gray-400 italic">—</span>}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {editing && onAdd && (
        <button
          onClick={onAdd}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline mt-1"
        >
          <Plus className="w-3.5 h-3.5" /> Add
        </button>
      )}
    </div>
  );
}

const SECTION_FIELDS = {
  diagnoses: [
    { key: 'diagnosis', label: 'Diagnosis' },
    { key: 'tooth_numbers', label: 'Teeth', type: 'tooth_numbers', placeholder: 'e.g. 11, 12, 13' },
    { key: 'surface', label: 'Surface', placeholder: 'e.g. O, M, B' },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ],
  observations: [
    { key: 'finding', label: 'Finding' },
    { key: 'tooth_numbers', label: 'Teeth', type: 'tooth_numbers', placeholder: 'e.g. 11, 12, 13' },
    { key: 'severity', label: 'Severity', type: 'select', options: ['mild', 'moderate', 'severe'] },
  ],
  treatment_recommendations: [
    { key: 'procedure', label: 'Procedure' },
    { key: 'tooth_numbers', label: 'Teeth', type: 'tooth_numbers', placeholder: 'e.g. 11, 12, 13' },
    { key: 'cost_estimate', label: 'Cost (₹)', type: 'number' },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ],
  completed_treatments: [
    { key: 'procedure', label: 'Procedure' },
    { key: 'tooth_numbers', label: 'Teeth', type: 'tooth_numbers', placeholder: 'e.g. 11, 12, 13' },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ],
  medications: [
    { key: 'name', label: 'Name' },
    { key: 'dosage', label: 'Dosage' },
    { key: 'duration', label: 'Duration' },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ],
  financial_estimates: [
    { key: 'item', label: 'Item' },
    { key: 'amount', label: 'Amount (₹)', type: 'number' },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ],
  followups: [
    { key: 'date', label: 'Date' },
    { key: 'instructions', label: 'Instructions', type: 'textarea' },
  ],
};

const SECTION_DEFAULTS = {
  diagnoses: { diagnosis: '', tooth_numbers: [], surface: null, notes: null },
  observations: { finding: '', tooth_numbers: [], severity: null },
  treatment_recommendations: { procedure: '', tooth_numbers: [], cost_estimate: null, notes: null },
  completed_treatments: { procedure: '', tooth_numbers: [], notes: null },
  medications: { name: '', dosage: null, duration: null, notes: null },
  financial_estimates: { item: '', amount: null, notes: null },
  followups: { date: null, instructions: null },
};

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function ExtractionDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { showToast } = useContext(ToastContext);
  const [extraction, setExtraction] = useState(null);
  const [editedData, setEditedData] = useState(null);
  const [editingSections, setEditingSections] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchCached(`/api/dashboard/extractions/${id}`);
        if (cancelled) return;
        if (!data.extraction) {
          setError('Extraction not found');
          return;
        }
        setExtraction(data.extraction);
        setEditedData(JSON.parse(JSON.stringify(data.extraction.structured_json || {})));
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [id]);

  function toggleEdit(key) {
    setEditingSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function saveSection(key) {
    try {
      const res = await fetch(`/api/dashboard/extractions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_section',
          section: key,
          structured_json: editedData,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Save failed');
      }
      invalidateFetchCache(`/api/dashboard/extractions/${id}`);
      toggleEdit(key);
      const labels = { patient: 'Patient', diagnoses: 'Diagnoses', observations: 'Observations', treatment_recommendations: 'Treatment Plans', completed_treatments: 'Completed Treatments', medications: 'Medications', financial_estimates: 'Financial Estimates', followups: 'Follow-ups' };
      showToast(`${labels[key] || key} saved`, 'success');
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  function updatePatientField(field, value) {
    setEditedData(prev => ({ ...prev, patient: { ...prev.patient, [field]: value } }));
  }

  function updateArrayItem(section, index, field, value) {
    setEditedData(prev => {
      const arr = [...(prev[section] || [])];
      arr[index] = { ...arr[index], [field]: value };
      return { ...prev, [section]: arr };
    });
  }

  function addArrayItem(section) {
    const defaults = SECTION_DEFAULTS[section];
    if (!defaults) return;
    setEditedData(prev => ({
      ...prev,
      [section]: [...(prev[section] || []), { ...defaults }],
    }));
  }

  function removeArrayItem(section, index) {
    setEditedData(prev => ({
      ...prev,
      [section]: (prev[section] || []).filter((_, i) => i !== index),
    }));
  }

  async function handleAction(act) {
    if (act === 'reject' && !reason.trim()) {
      showToast('Please provide a reason for rejection', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const body = { action: act };
      if (act === 'approve') {
        body.structured_json = editedData;
      }
      if (act === 'reject') {
        body.reason = reason.trim();
      }
      const res = await fetch(`/api/dashboard/extractions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update');
      }
      invalidateFetchCache(`/api/dashboard/extractions/${id}`);
      invalidateFetchCache('/api/dashboard/extractions');
      showToast(act === 'approve' ? 'Extraction approved with corrections' : 'Extraction rejected', 'success');
      setTimeout(() => router.push('/dashboard/extractions'), 800);
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="p-4 md:p-6 max-w-3xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-32" />
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-64" />
          <div className="h-32 bg-gray-100 dark:bg-gray-800 rounded-2xl" />
          <div className="h-48 bg-gray-100 dark:bg-gray-800 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error || !extraction) {
    return (
      <div className="p-4 md:p-6 max-w-3xl mx-auto">
        <Link href="/dashboard/extractions" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 mb-4 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Extractions
        </Link>
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-6 text-center">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-red-600 dark:text-red-400 font-medium">{error || 'Extraction not found'}</p>
        </div>
      </div>
    );
  }

  const isTerminal = extraction.extraction_status === 'approved' || extraction.extraction_status === 'rejected';

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <Link href="/dashboard/extractions" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 mb-4 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Extractions
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Extraction Review</h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" />{extraction.patient_name || 'Unknown'}</span>
            {extraction.patient_phone && <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{extraction.patient_phone}</span>}
            {extraction.appointment_date && <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{formatDate(extraction.appointment_date)}</span>}
            {extraction.extraction_completed_at && <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{formatDate(extraction.extraction_completed_at)}</span>}
            {extraction.extraction_model && <span className="flex items-center gap-1"><Cpu className="w-3.5 h-3.5" />{extraction.extraction_model}</span>}
          </div>
        </div>
        <StatusBadge status={extraction.extraction_status} />
      </div>

      <div className="space-y-3 mb-6">
        <SectionCard
          title="Patient"
          icon={User}
          editing={editingSections.has('patient')}
          onEdit={() => toggleEdit('patient')}
          onSave={() => saveSection('patient')}
        >
          <PatientSection data={editedData?.patient} editing={editingSections.has('patient')} onChange={updatePatientField} />
        </SectionCard>

        {SECTIONS.map(s => {
          const items = editedData?.[s.key] || [];
          if (!s.multi) return null;
          if (items.length === 0 && !editingSections.has(s.key)) return null;
          return (
            <SectionCard
              key={s.key}
              title={s.title}
              icon={s.icon}
              editing={editingSections.has(s.key)}
              onEdit={() => toggleEdit(s.key)}
              onSave={() => saveSection(s.key)}
              count={items.length}
            >
              <ArrayItems
                items={items}
                fields={SECTION_FIELDS[s.key] || []}
                editing={editingSections.has(s.key)}
                onChange={(idx, field, val) => updateArrayItem(s.key, idx, field, val)}
                onAdd={() => addArrayItem(s.key)}
                onRemove={(idx) => removeArrayItem(s.key, idx)}
              />
            </SectionCard>
          );
        })}
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">Review Decision</h2>
        {isTerminal ? (
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            {extraction.extraction_status === 'approved' ? (
              <><CheckCircle className="w-4 h-4 text-green-500" /> Approved</>
            ) : (
              <><XCircle className="w-4 h-4 text-red-500" /> Rejected{extraction.error_message ? `: ${extraction.error_message}` : ''}</>
            )}
          </div>
        ) : (
          <>
            <div className="mb-4">
              <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1.5">
                Rejection reason <span className="text-gray-400">(required if rejecting)</span>
              </label>
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Describe what needs to be corrected..."
                rows={3}
                className="w-full px-3.5 py-2.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
                disabled={submitting}
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => handleAction('approve')}
                disabled={submitting}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-xl text-sm font-medium transition-colors shadow-sm"
              >
                <CheckCircle className="w-4 h-4" />
                {submitting ? 'Submitting...' : 'Approve'}
              </button>
              <button
                onClick={() => handleAction('reject')}
                disabled={submitting}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-xl text-sm font-medium transition-colors shadow-sm"
              >
                <XCircle className="w-4 h-4" />
                {submitting ? 'Submitting...' : 'Reject'}
              </button>
            </div>
          </>
        )}
      </div>


    </div>
  );
}
