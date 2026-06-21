import { describe, it, expect, vi } from 'vitest';

// extractionClient tests — standalone file to avoid vi.mock hoisting conflicts
// with prescriptionExtractionService tests.

describe('extractionClient', () => {
  beforeEach(() => {
    vi.stubEnv('KALI_AI_URL', 'http://localhost:3002');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('throws when KALI_AI_URL is not configured', async () => {
    vi.stubEnv('KALI_AI_URL', '');
    const { extractPrescription } = await import('../../src/lib/ai/extractionClient');
    await expect(extractPrescription('some text')).rejects.toThrow('KALI_AI_URL not configured');
  });

  it('throws when rawText is empty', async () => {
    const { extractPrescription } = await import('../../src/lib/ai/extractionClient');
    await expect(extractPrescription('')).rejects.toThrow('rawText must be a non-empty string');
  });

  it('throws when rawText is not a string', async () => {
    const { extractPrescription } = await import('../../src/lib/ai/extractionClient');
    await expect(extractPrescription(123)).rejects.toThrow('rawText must be a non-empty string');
  });

  it('throws on non-ok response', async () => {
    const { extractPrescription } = await import('../../src/lib/ai/extractionClient');
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      text: () => Promise.resolve('Bad Gateway'),
    });
    await expect(extractPrescription('some text')).rejects.toThrow('Extraction API error 502');
  });

  it('throws when response has no structuredJson', async () => {
    const { extractPrescription } = await import('../../src/lib/ai/extractionClient');
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ model: 'qwen2.5-coder', processingMs: 500 }),
    });
    await expect(extractPrescription('some text')).rejects.toThrow('no structuredJson');
  });

  it('returns structuredJson on success', async () => {
    const { extractPrescription } = await import('../../src/lib/ai/extractionClient');
    const mockResponse = {
      structuredJson: {
        patient: { name: 'Test' },
        observations: [],
        diagnoses: [],
        treatment_recommendations: [],
        completed_treatments: [],
        medications: [],
        financial_estimates: [],
        followups: [],
        unclassified_notes: [],
      },
      model: 'qwen2.5-coder',
      processingMs: 3500,
    };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });
    const result = await extractPrescription('=== FRONT ===\nRCT for tooth 46\n=== BACK ===\n3000/-');
    expect(result.structuredJson.patient.name).toBe('Test');
    expect(result.model).toBe('qwen2.5-coder');
    expect(typeof result.processingMs).toBe('number');
  });
});
