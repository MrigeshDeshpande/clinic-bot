'use client';
import { useState, useEffect, useRef } from 'react';
import PrescriptionHeader from './PrescriptionHeader';
import { getTreatmentName } from '@/lib/treatments';

const A4_W = 794;
const A4_H = 1123;
const LABEL_CLS = 'text-xs font-semibold text-gray-400 uppercase tracking-wider';
const VALUE_CLS = 'text-xs text-gray-900';
const SECTION_TITLE = 'text-xs font-bold text-[#1e3a5f] uppercase tracking-wider mb-1.5';

function ToothTypeLabel({ diagnoses }) {
  if (!diagnoses || diagnoses.length === 0) return null;
  const colors = ['bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-yellow-500', 'bg-emerald-500'];
  return (
    <span className="inline-flex gap-0.5">
      {diagnoses.map((d, i) => (
        <span key={i} className={`w-1.5 h-1.5 rounded-full ${colors[i % colors.length]}`} title={d} />
      ))}
    </span>
  );
}

export default function PrescriptionPreview({ form, patientProfile, treatmentFees, consultationFee, onClose }) {
  const containerRef = useRef(null);
  const [scale, setScale] = useState(0.6);

  useEffect(() => {
    function calcScale() {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      setScale(Math.min(w / A4_W, 1));
    }
    calcScale();
    window.addEventListener('resize', calcScale);
    return () => window.removeEventListener('resize', calcScale);
  }, []);

  const primaryColor = '#0d1b2a';
  const accentColor = '#3a86c8';

  const pName = patientProfile?.name || form.patientName || '__________________';
  const pPhone = patientProfile?.phone || form.patientPhone || '';
  const pAge = patientProfile?.age || form.patientAge || '';
  const pSex = patientProfile?.sex || form.patientSex || '';
  const ageSex = [pAge, pSex].filter(Boolean).join(' / ') || '__________';
  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const getFeeAmount = (v) => typeof v === 'number' ? v : (v?.amount ?? 0);
  const selectedTreatments = Object.keys(treatmentFees || {});
  const totalFees = (consultationFee || 0) + Object.values(treatmentFees || {}).reduce((s, v) => s + getFeeAmount(v), 0) + (Number(form.medicineCharges) || 0);
  const scaledW = A4_W * scale;
  const scaledH = A4_H * scale;

  return (
    <div className="w-[680px] bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 h-full flex flex-col shadow-2xl" style={{ fontFamily: "'Poppins', 'DejaVu Sans', system-ui, sans-serif" }}>
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Prescription Preview</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 dark:text-gray-500">{Math.round(scale * 100)}%</span>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-all"
            title="Close preview"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
      {/* Scaled A4 page */}
      <div ref={containerRef} className="flex-1 overflow-y-auto flex items-start justify-center bg-white dark:bg-gray-900">
        <div style={{ width: scaledW, height: scaledH, overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.12)', borderRadius: 2, flexShrink: 0 }}>
          <div style={{ width: A4_W, height: A4_H, transform: `scale(${scale})`, transformOrigin: 'top left', background: '#fff', color: '#111827' }}>
            <PrescriptionHeader />

            {/* === PATIENT INFO === */}
            <div style={{ padding: '18px 28px 10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <span className={LABEL_CLS}>Pt. Name:</span>
                  <span className={VALUE_CLS} style={{ marginLeft: 8 }}>{pName}</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span className={LABEL_CLS}>Date:</span>
                  <span className={VALUE_CLS} style={{ marginLeft: 8 }}>{today}</span>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                <div>
                  <span className={LABEL_CLS}>Age / Sex:</span>
                  <span className={VALUE_CLS} style={{ marginLeft: 8 }}>{ageSex}</span>
                </div>
                {pPhone && (
                  <div>
                    <span className={LABEL_CLS}>Phone:</span>
                    <span className={VALUE_CLS} style={{ marginLeft: 8 }}>{pPhone}</span>
                  </div>
                )}
              </div>
            </div>
            <hr style={{ margin: '0 28px', border: 'none', borderTop: '1px solid #ccc', opacity: 0.5 }} />

            {/* === TREATMENT === */}
            {selectedTreatments.length > 0 && (
              <div style={{ padding: '10px 28px 4px' }}>
                <div className={SECTION_TITLE}>Treatment</div>
                {selectedTreatments.map((t, i) => (
                  <div key={i} style={{ fontSize: 10, lineHeight: 1.8, marginLeft: 8 }}>{i + 1}. {t}</div>
                ))}
              </div>
            )}

            {/* === NOTES === */}
            {form.diagnosis && (
              <div style={{ padding: '4px 28px' }}>
                <div className={SECTION_TITLE}>Notes</div>
                <div style={{ fontSize: 10, lineHeight: 1.5, color: '#374151' }}>{form.diagnosis}</div>
              </div>
            )}

            {/* === TOOTH DIAGNOSIS TABLE === */}
            {form.toothDiagnoses?.length > 0 && (
              <div style={{ padding: '8px 28px' }}>
                <div className={SECTION_TITLE}>Tooth Diagnosis</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                  <thead>
                    <tr>
                      <th style={{ ...styleTH, width: '15%' }}>Tooth</th>
                      <th style={{ ...styleTH, width: '12%' }}>Surf.</th>
                      <th style={{ ...styleTH, width: '20%' }}>Plan</th>
                      <th style={{ ...styleTH, width: '53%' }}>Diagnosis</th>
                    </tr>
                  </thead>
                  <tbody>
                    {form.toothDiagnoses.map((td, i) => (
                      <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f3f4f6' }}>
                        <td style={{ ...styleTD, fontWeight: 700 }}>#{td.tooth}</td>
                        <td style={styleTD}>{td.surface || '—'}</td>
                        <td style={styleTD}>{getTreatmentName(td.treatment) || '—'}</td>
                        <td style={{ ...styleTD, borderRight: 'none' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span>{td.diagnoses?.join(', ') || '—'}</span>
                            {td.diagnoses?.length > 1 && <ToothTypeLabel diagnoses={td.diagnoses} />}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* === Rx + MEDICINES TABLE === */}
            <div style={{ padding: '8px 28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 24, color: accentColor, fontWeight: 700 }}>&#8478;</span>
                <span className={SECTION_TITLE} style={{ margin: 0 }}>Prescription</span>
              </div>
              {form.medicines?.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                  <thead>
                    <tr>
                      <th style={{ ...styleTH, width: '30%' }}>Medicine</th>
                      <th style={{ ...styleTH, width: '16%' }}>Dosage</th>
                      <th style={{ ...styleTH, width: '18%' }}>Frequency</th>
                      <th style={{ ...styleTH, width: '14%' }}>Duration</th>
                      <th style={{ ...styleTH, width: '12%' }}>Timing</th>
                      <th style={{ ...styleTH, width: '10%', borderRight: 'none' }}>Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {form.medicines.map((med, i) => (
                      <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f3f4f6' }}>
                        <td style={{ ...styleTD, fontWeight: 600 }}>{med.name || '—'}</td>
                        <td style={styleTD}>{med.dosage || '—'}</td>
                        <td style={styleTD}>{med.frequency || '—'}</td>
                        <td style={styleTD}>{med.duration || '—'}</td>
                        <td style={styleTD}>{med.timing === 'before' ? 'Before meal' : 'After meal'}</td>
                        <td style={{ ...styleTD, borderRight: 'none' }}>₹{med.rate || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ fontSize: 10, padding: '4px 0', color: '#9ca3af', fontStyle: 'italic' }}>No medicines prescribed</div>
              )}
              <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 4 }}>
                <span style={{ border: '1px solid #d1d5db', width: 12, height: 12, display: 'inline-block', marginRight: 4, verticalAlign: 'text-bottom' }} />
                Generic substitution allowed
              </div>
            </div>

            {/* === DIET & ADVICE === */}
            {form.adviceSelected?.length > 0 && (
              <div style={{ padding: '4px 28px' }}>
                <div className={SECTION_TITLE}>Diet &amp; Advice</div>
                {form.adviceSelected.map((a, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, lineHeight: 1.8, color: '#374151' }}>
                    <span style={{ color: accentColor }}>✓</span> {a}
                  </div>
                ))}
              </div>
            )}

            {/* === FEES === */}
            {(consultationFee > 0 || totalFees > 0) && (
              <div style={{ padding: '8px 28px', marginTop: 4 }}>
                <div className={SECTION_TITLE}>Fees</div>
                <div style={{ fontSize: 10 }}>
                  {consultationFee > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                      <span style={{ color: '#4b5563' }}>Consultation Fee</span>
                      <span style={{ fontWeight: 500 }}>Rs. {consultationFee.toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  {selectedTreatments.map(t => {
                    const fee = treatmentFees[t];
                    const amount = getFeeAmount(fee);
                    return (
                      <div key={t} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                        <span style={{ color: '#4b5563' }}>{t}</span>
                        <span style={{ fontWeight: 500 }}>Rs. {amount.toLocaleString('en-IN')}</span>
                      </div>
                    );
                  })}
                  {Number(form.medicineCharges) > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                      <span style={{ color: '#4b5563' }}>Medicine Charges</span>
                      <span style={{ fontWeight: 500 }}>Rs. {(Number(form.medicineCharges) || 0).toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  <hr style={{ border: 'none', borderTop: '1px dashed #999', margin: '4px 0' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontWeight: 700 }}>
                    <span>Total</span>
                    <span>Rs. {totalFees.toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </div>
            )}

            {/* === FOLLOW-UP === */}
            {(form.followUpDate || form.followUpInstructions || form.notes) && (
              <div style={{ padding: '8px 28px' }}>
                {form.followUpDate && (
                  <div style={{ display: 'flex', gap: 32, fontSize: 10 }}>
                    <div><span className={LABEL_CLS}>Next Visit:</span><span className={VALUE_CLS} style={{ marginLeft: 6 }}>{form.followUpDate}</span></div>
                  </div>
                )}
                {form.followUpInstructions && (
                  <div style={{ marginTop: 4 }}><span className={LABEL_CLS}>Follow-up:</span><span className={VALUE_CLS} style={{ marginLeft: 6 }}>{form.followUpInstructions}</span></div>
                )}
                {form.notes && (
                  <div style={{ marginTop: 4 }}><span className={LABEL_CLS}>Notes:</span><span className={VALUE_CLS} style={{ marginLeft: 6 }}>{form.notes}</span></div>
                )}
              </div>
            )}

            {/* === DOCTOR SIGNATURE === */}
            <div style={{ padding: '18px 28px', marginTop: 8, textAlign: 'right' }}>
              <div style={{ width: 200, display: 'inline-block', textAlign: 'center' }}>
                <div style={{ borderTop: '1px solid #ccc', paddingTop: 6, fontSize: 10, color: '#374151' }}>
                  DR. M. VISHNU VARDHAN, BDS, MOI
                </div>
              </div>
            </div>

            {/* === STICKY FOOTER === */}
            <div style={{ background: primaryColor, color: '#fff', padding: '6px 28px', fontSize: 8, lineHeight: 1.4, marginTop: 16 }}>
              <span style={{ fontWeight: 700 }}>NOTE:</span>{' '}
              Please inform the doctor of any medical conditions (BP, Diabetes, Thyroid, Asthma, Allergies, Pregnancy, HIV, etc.) before treatment.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const styleTH = {
  background: '#1e3a5f',
  color: '#fff',
  fontWeight: 700,
  padding: '5px 8px',
  textAlign: 'left',
  fontSize: 10,
  borderRight: '1px solid #2a4a6f',
};

const styleTD = {
  padding: '4px 8px',
  borderBottom: '1px solid #e5e7eb',
  borderRight: '1px solid #e5e7eb',
  fontSize: 10,
  verticalAlign: 'top',
};
