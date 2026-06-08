'use client';
import PrescriptionHeader from '@/components/PrescriptionHeader';

export default function PrescriptionPreviewPage() {
  return (
    <div
      style={{
        backgroundColor: '#e9edf2',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '40px 20px',
      }}
    >
      <PrescriptionHeader />
    </div>
  );
}
