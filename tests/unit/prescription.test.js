import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('@/lib/r2', () => ({
  uploadToR2: vi.fn().mockResolvedValue('prescriptions/mock_key.pdf'),
  getR2SignedUrl: vi.fn().mockResolvedValue('https://r2.example.com/prescriptions/mock_key.pdf?signature=abc'),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('generatePrescription', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('generates a valid PDF with all fields', async () => {
    const { generatePrescription } = await import('@/lib/prescription');
    const { uploadToR2, getR2SignedUrl } = await import('@/lib/r2');

    const result = await generatePrescription({
      patient: { name: 'Ramesh Kumar', phone: '9876543210', age: 28, sex: 'M' },
      visit: {
        treatment: 'Root Canal',
        consultationFee: 500,
        treatmentCharges: 2500,
        medicineCharges: 300,
        nextVisit: { date: '2026-06-09', time: '10:00 AM' },
        notes: 'Avoid hard foods for 24 hours.',
      },
      appointment: { id: 42, date: '2026-06-02' },
    });

    expect(result).toBeTruthy();
    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.buffer.length).toBeGreaterThan(1000);
    expect(result.key).toMatch(/^prescriptions\/42_\d+\.pdf$/);
    expect(result.url).toMatch(/^https:\/\/r2\.example\.com/);
    expect(uploadToR2).toHaveBeenCalledOnce();
    expect(uploadToR2).toHaveBeenCalledWith({
      key: expect.stringMatching(/^prescriptions\/.*\.pdf$/),
      buffer: expect.any(Buffer),
      contentType: 'application/pdf',
    });
    expect(getR2SignedUrl).toHaveBeenCalledOnce();
    expect(getR2SignedUrl).toHaveBeenCalledWith(expect.stringMatching(/^prescriptions\/42_\d+\.pdf$/), 604800);
  });

  it('generates minimal PDF with only required fields', async () => {
    const { generatePrescription } = await import('@/lib/prescription');

    const result = await generatePrescription({
      patient: { name: 'Priya Sharma', phone: '9988776655' },
      visit: { treatment: 'Cleaning' },
      appointment: { id: 10 },
    });

    expect(result.buffer.length).toBeGreaterThan(500);
    expect(result.buffer.toString().startsWith('%PDF')).toBe(true);
  });

  it('handles missing optional data gracefully', async () => {
    const { generatePrescription } = await import('@/lib/prescription');

    const result = await generatePrescription({
      patient: { name: 'Test' },
      visit: {},
      appointment: {},
    });

    expect(result.buffer.length).toBeGreaterThan(500);
  });
});
