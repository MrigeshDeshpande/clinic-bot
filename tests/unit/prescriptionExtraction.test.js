import { describe, it, expect, vi } from 'vitest';
import { validateExtractionResponse } from '../../ai-gateway/validators';
import { buildExtractionPrompt } from '../../ai-gateway/prompts';

// ── Helpers ─────────────────────────────────────────────
function makeSql(returnValues) {
  const fn = vi.fn((...args) => {
    if (typeof returnValues === 'function') return returnValues(...args);
    const next = returnValues.shift();
    return Promise.resolve(next);
  });
  fn.json = vi.fn((val) => JSON.stringify(val));
  return fn;
}

// ──────────────────────────────────────────────
// Prompt Template Tests
// ──────────────────────────────────────────────
describe('buildExtractionPrompt', () => {
  it('contains all 9 target field names', () => {
    const prompt = buildExtractionPrompt();
    const expectedFields = [
      'patient', 'observations', 'diagnoses', 'treatment_recommendations',
      'completed_treatments', 'medications', 'financial_estimates', 'followups',
      'unclassified_notes',
    ];
    for (const field of expectedFields) {
      expect(prompt).toContain(field);
    }
  });

  it('instructs to return valid JSON only', () => {
    expect(buildExtractionPrompt()).toContain('Return valid JSON only');
  });

  it('instructs no markdown or code fences', () => {
    const p = buildExtractionPrompt();
    expect(p).toContain('No markdown');
    expect(p).toContain('No code fences');
  });

  it('includes extraction rules for observations', () => {
    const p = buildExtractionPrompt();
    expect(p).toContain('Deep caries');
    expect(p).toContain('Pocket');
    expect(p).toContain('Grossly decayed');
  });

  it('includes extraction rules for diagnoses', () => {
    const p = buildExtractionPrompt();
    expect(p).toContain('Periodontitis');
    expect(p).toContain('Gingivitis');
    expect(p).toContain('Periapical abscess');
  });

  it('includes extraction rules for treatments', () => {
    const p = buildExtractionPrompt();
    for (const t of ['RCT', 'Scaling', 'Extraction', 'Implant']) {
      expect(p).toContain(t);
    }
  });

  it('includes never discard information instruction', () => {
    const p = buildExtractionPrompt();
    expect(p).toContain('Never discard');
    expect(p).toContain('unclassified_notes');
  });
});

// ──────────────────────────────────────────────
// JSON Schema Validator Tests
// ──────────────────────────────────────────────
describe('validateExtractionResponse', () => {
  const validExtraction = () => ({
    patient: { name: 'Savita Nair', age: 48, sex: 'F', phone: null, date: null },
    observations: [{ finding: 'Deep caries', tooth_numbers: ['36', '15'], severity: null }],
    diagnoses: [{ diagnosis: 'Gingivitis', tooth_numbers: [], notes: null }],
    treatment_recommendations: [{ procedure: 'RCT', tooth_numbers: ['46'], notes: null }],
    completed_treatments: [],
    medications: [{ name: 'Metronidazole', dosage: '20g', duration: '5 days', notes: null }],
    financial_estimates: [{ procedure: 'RCT', cost: 3000, currency: 'INR', notes: null }],
    followups: [{ date: null, instruction: null, notes: null }],
    unclassified_notes: [],
  });

  it('accepts valid full extraction output', () => {
    expect(validateExtractionResponse(validExtraction())).toEqual(validExtraction());
  });

  it('accepts all-empty arrays', () => {
    const empty = {
      patient: { name: null, age: null, sex: null, phone: null, date: null },
      observations: [], diagnoses: [], treatment_recommendations: [],
      completed_treatments: [], medications: [], financial_estimates: [],
      followups: [], unclassified_notes: [],
    };
    expect(validateExtractionResponse(empty)).toEqual(empty);
  });

  it('rejects non-object response', () => {
    for (const val of ['string', null, 42, []]) {
      expect(() => validateExtractionResponse(val)).toThrow('must be a JSON object');
    }
  });

  it('rejects missing each required field', () => {
    const required = [
      'patient', 'observations', 'diagnoses', 'treatment_recommendations',
      'completed_treatments', 'medications', 'financial_estimates', 'followups',
      'unclassified_notes',
    ];
    for (const field of required) {
      const { [field]: _, ...rest } = validExtraction();
      expect(() => validateExtractionResponse(rest)).toThrow(`Missing required field "${field}"`);
    }
  });

  it('rejects wrong type for observations (string instead of array)', () => {
    expect(() => validateExtractionResponse({ ...validExtraction(), observations: 'caries' })).toThrow('must be an array');
  });

  it('rejects wrong type for patient (array or null)', () => {
    expect(() => validateExtractionResponse({ ...validExtraction(), patient: [] })).toThrow('must be an object');
    expect(() => validateExtractionResponse({ ...validExtraction(), patient: null })).toThrow('must be an object');
  });

  it('allows additional keys beyond required fields', () => {
    const extra = { ...validExtraction(), confidence: 0.92, source_sections: ['front', 'back'] };
    const result = validateExtractionResponse(extra);
    expect(result.confidence).toBe(0.92);
    expect(result.source_sections).toEqual(['front', 'back']);
  });
});

// ──────────────────────────────────────────────
// Extraction Service Tests
// ──────────────────────────────────────────────
vi.mock('../../src/lib/ai/extractionClient', () => ({
  extractPrescription: vi.fn(),
}));

describe('prescriptionExtractionService', () => {
  describe('performExtraction', () => {
    it('returns 400 when extractionId is missing', async () => {
      const { performExtraction } = await import('../../src/services/prescriptionExtractionService');
      await expect(performExtraction(makeSql([]), null)).rejects.toMatchObject({
        status: 400, message: 'extractionId is required',
      });
    });

    it('returns 404 when extraction not found', async () => {
      const { performExtraction } = await import('../../src/services/prescriptionExtractionService');
      await expect(performExtraction(makeSql([[]]), 'nonexistent')).rejects.toMatchObject({
        status: 404, message: 'Extraction record not found',
      });
    });

    it('returns 400 when raw_text is null', async () => {
      const { performExtraction } = await import('../../src/services/prescriptionExtractionService');
      await expect(performExtraction(makeSql([[{ id: 'ext-1', media_asset_id: 'ma-1', raw_text: null, extraction_status: 'pending' }]]), 'ext-1')).rejects.toMatchObject({
        status: 400, message: 'No raw_text available for extraction',
      });
    });

    it('skips when extraction_status is already extraction_completed', async () => {
      const { performExtraction } = await import('../../src/services/prescriptionExtractionService');
      const { extractPrescription } = await import('../../src/lib/ai/extractionClient');
      const sql = makeSql([[{ id: 'ext-1', media_asset_id: 'ma-1', raw_text: 'some text', extraction_status: 'extraction_completed' }]]);
      const result = await performExtraction(sql, 'ext-1');
      expect(result).toBeUndefined();
      expect(extractPrescription).not.toHaveBeenCalled();
    });

    it('performs full extraction flow successfully', async () => {
      const mockResult = {
        structuredJson: {
          patient: { name: 'Test Patient', age: 30, sex: 'M', phone: null, date: null },
          observations: [{ finding: 'Caries', tooth_numbers: ['46'], severity: 'moderate' }],
          diagnoses: [],
          treatment_recommendations: [{ procedure: 'RCT', tooth_numbers: ['46'], notes: null }],
          completed_treatments: [],
          medications: [],
          financial_estimates: [],
          followups: [],
          unclassified_notes: [],
        },
        model: 'qwen2.5-coder',
        processingMs: 4500,
      };
      const { extractPrescription } = await import('../../src/lib/ai/extractionClient');
      vi.mocked(extractPrescription).mockResolvedValue(mockResult);

      const { performExtraction } = await import('../../src/services/prescriptionExtractionService');

      let callIndex = 0;
      const sql = vi.fn(() => {
        callIndex++;
        if (callIndex === 1) return Promise.resolve([{ id: 'ext-1', media_asset_id: 'ma-1', raw_text: 'RCT advised for tooth 46', extraction_status: 'pending' }]);
        if (callIndex === 2) return Promise.resolve([]);
        return Promise.resolve([]);
      });
      sql.json = vi.fn((val) => JSON.stringify(val));

      const result = await performExtraction(sql, 'ext-1');
      expect(result.structuredJson.patient.name).toBe('Test Patient');
      expect(result.model).toBe('qwen2.5-coder');
      expect(result.processingMs).toBe(4500);
    });
  });

  describe('getPendingExtractions', () => {
    it('returns extractions pending review', async () => {
      const { getPendingExtractions } = await import('../../src/services/prescriptionExtractionService');
      const rows = [
        { id: 'ext-1', extraction_status: 'extraction_completed', raw_text: 'text', structured_json: {} },
        { id: 'ext-2', extraction_status: 'review_pending', raw_text: 'text', structured_json: {} },
      ];
      const result = await getPendingExtractions(makeSql([rows]), 10);
      expect(result).toHaveLength(2);
    });

    it('returns empty array when no pending extractions', async () => {
      const { getPendingExtractions } = await import('../../src/services/prescriptionExtractionService');
      const result = await getPendingExtractions(makeSql([[]]), 10);
      expect(result).toEqual([]);
    });
  });

  describe('approveExtraction', () => {
    it('approves extraction_completed or review_pending', async () => {
      const { approveExtraction } = await import('../../src/services/prescriptionExtractionService');
      for (const status of ['extraction_completed', 'review_pending']) {
        let callIndex = 0;
        const sql = vi.fn(() => {
          callIndex++;
          if (callIndex === 1) return Promise.resolve([{ extraction_status: status }]);
          return Promise.resolve([]);
        });
        sql.json = vi.fn();
        await expect(approveExtraction(sql, 'ext-1')).resolves.toBeUndefined();
      }
    });

    it('returns 404 when extraction not found', async () => {
      const { approveExtraction } = await import('../../src/services/prescriptionExtractionService');
      await expect(approveExtraction(makeSql([[]]), 'nonexistent')).rejects.toMatchObject({
        status: 404, message: 'Extraction record not found',
      });
    });

    it('rejects approving a pending extraction', async () => {
      const { approveExtraction } = await import('../../src/services/prescriptionExtractionService');
      await expect(approveExtraction(makeSql([[{ extraction_status: 'pending' }]]), 'ext-1')).rejects.toMatchObject({ status: 400 });
    });

    it('silently skips already approved', async () => {
      const { approveExtraction } = await import('../../src/services/prescriptionExtractionService');
      const sql = makeSql([[{ extraction_status: 'approved' }]]);
      await expect(approveExtraction(sql, 'ext-1')).resolves.toBeUndefined();
    });
  });

  describe('rejectExtraction', () => {
    it('rejects with reason', async () => {
      const { rejectExtraction } = await import('../../src/services/prescriptionExtractionService');
      let callIndex = 0;
      const sql = vi.fn(() => {
        callIndex++;
        if (callIndex === 1) return Promise.resolve([{ extraction_status: 'extraction_completed' }]);
        return Promise.resolve([]);
      });
      sql.json = vi.fn();
      await expect(rejectExtraction(sql, 'ext-1', 'Hallucinated')).resolves.toBeUndefined();
    });

    it('returns 404 when extraction not found', async () => {
      const { rejectExtraction } = await import('../../src/services/prescriptionExtractionService');
      await expect(rejectExtraction(makeSql([[]]), 'nonexistent', 'bad')).rejects.toMatchObject({ status: 404 });
    });
  });
});

// ──────────────────────────────────────────────
// End-to-End Shape Tests (extractionClient mocked)
// ──────────────────────────────────────────────
describe('end-to-end shape — simulated', () => {
  it('case-001: valid extraction from prescription OCR text', async () => {
    const { extractPrescription } = await import('../../src/lib/ai/extractionClient');
    vi.mocked(extractPrescription).mockResolvedValue({
      structuredJson: {
        patient: { name: 'Savita Nair', age: 48, sex: 'F', phone: null, date: null },
        observations: [{ finding: 'Deep caries', tooth_numbers: ['36', '15'], severity: null }],
        diagnoses: [{ diagnosis: 'Gingivitis', tooth_numbers: [], notes: null }],
        treatment_recommendations: [{ procedure: 'RCT', tooth_numbers: ['46'], notes: null }],
        completed_treatments: [],
        medications: [],
        financial_estimates: [{ procedure: 'RCT', cost: 3000, currency: 'INR', notes: null }],
        followups: [],
        unclassified_notes: ['Grossly Decayed', 'Missing'],
      },
      model: 'qwen2.5-coder',
      processingMs: 4200,
    });

    const { performExtraction } = await import('../../src/services/prescriptionExtractionService');
    let callIndex = 0;
    const sql = vi.fn(() => {
      callIndex++;
      if (callIndex === 1) return Promise.resolve([{ id: 'ext-case1', media_asset_id: 'ma-1', raw_text: 'Pt. Name: Savita Nair\nDeep caries 36.15.\nRCT-154 3000/-', extraction_status: 'pending' }]);
      return Promise.resolve([]);
    });
    sql.json = vi.fn((v) => JSON.stringify(v));

    const result = await performExtraction(sql, 'ext-case1');
    expect(result.structuredJson.patient.name).toBe('Savita Nair');
    expect(Array.isArray(result.structuredJson.observations)).toBe(true);
    expect(Array.isArray(result.structuredJson.diagnoses)).toBe(true);
    expect(result.structuredJson.observations[0].finding).toBe('Deep caries');
  });

  it('case-002: medication extraction', async () => {
    const { extractPrescription } = await import('../../src/lib/ai/extractionClient');
    vi.mocked(extractPrescription).mockResolvedValue({
      structuredJson: {
        patient: { name: 'Raynush Jaiswal', age: 53, sex: 'M', phone: null, date: '17/10/26' },
        observations: [{ finding: 'Deep caries (RCT)', tooth_numbers: ['16', '38'], severity: null }],
        diagnoses: [{ diagnosis: 'Periodontitis', tooth_numbers: [], notes: 'Pocket' }],
        treatment_recommendations: [{ procedure: 'RCT', tooth_numbers: ['16', '38'], notes: null }],
        completed_treatments: [],
        medications: [{ name: 'Metronidazole', dosage: '20g', duration: '5 days', notes: 'Tub Metronidazole 20g (4 days) x 5days' }],
        financial_estimates: [],
        followups: [],
        unclassified_notes: ['Gingivitis', 'Halitosis', 'St+f Cal++'],
      },
      model: 'qwen2.5-coder',
      processingMs: 3800,
    });

    const { performExtraction } = await import('../../src/services/prescriptionExtractionService');
    let callIndex = 0;
    const sql = vi.fn(() => {
      callIndex++;
      if (callIndex === 1) return Promise.resolve([{ id: 'ext-case2', media_asset_id: 'ma-2', raw_text: 'Pt. Name: Raynush Jaiswal\nDeep caries (RCT)\nTub Metronidazole 20g', extraction_status: 'pending' }]);
      return Promise.resolve([]);
    });
    sql.json = vi.fn((v) => JSON.stringify(v));

    const result = await performExtraction(sql, 'ext-case2');
    expect(result.structuredJson.patient.name).toBe('Raynush Jaiswal');
    expect(result.structuredJson.medications).toHaveLength(1);
    expect(result.structuredJson.medications[0].name).toBe('Metronidazole');
  });

  it('case-003: treatment recommendations', async () => {
    const { extractPrescription } = await import('../../src/lib/ai/extractionClient');
    vi.mocked(extractPrescription).mockResolvedValue({
      structuredJson: {
        patient: { name: 'Hardwinder Kaur', age: 60, sex: 'F', phone: null, date: '04/16/92' },
        observations: [
          { finding: 'Deep Carries', tooth_numbers: ['34', '18'], severity: null },
          { finding: 'Pocket', tooth_numbers: ['45', '46'], severity: null },
        ],
        diagnoses: [
          { diagnosis: 'Periodontitis', tooth_numbers: [], notes: null },
          { diagnosis: 'Periapical abscess', tooth_numbers: ['32'], notes: null },
        ],
        treatment_recommendations: [
          { procedure: 'Scaling', tooth_numbers: [], notes: null },
          { procedure: 'Extraction', tooth_numbers: ['18', '32'], notes: null },
          { procedure: 'RCT', tooth_numbers: [], notes: null },
          { procedure: 'Restoration', tooth_numbers: [], notes: null },
          { procedure: 'FPD/CD', tooth_numbers: [], notes: null },
          { procedure: 'Bridge', tooth_numbers: [], notes: null },
        ],
        completed_treatments: [],
        medications: [],
        financial_estimates: [
          { procedure: 'RCCT', cost: 3000, currency: 'INR', notes: null },
          { procedure: 'Est', cost: 800, currency: 'INR', notes: '700-800/-' },
        ],
        followups: [],
        unclassified_notes: ['Gingivitis Halitosis', 'RtL & Cleft', 'Molar Endocement (BP)'],
      },
      model: 'qwen2.5-coder',
      processingMs: 5100,
    });

    const { performExtraction } = await import('../../src/services/prescriptionExtractionService');
    let callIndex = 0;
    const sql = vi.fn(() => {
      callIndex++;
      if (callIndex === 1) return Promise.resolve([{ id: 'ext-case3', media_asset_id: 'ma-3', raw_text: 'Pt. Name: Hardwinder Kaur\nDeep Carries 34,18\nPocket = 45+46.', extraction_status: 'pending' }]);
      return Promise.resolve([]);
    });
    sql.json = vi.fn((v) => JSON.stringify(v));

    const result = await performExtraction(sql, 'ext-case3');
    expect(result.structuredJson.patient.name).toBe('Hardwinder Kaur');
    expect(result.structuredJson.treatment_recommendations).toHaveLength(6);
    expect(result.structuredJson.observations).toHaveLength(2);
    expect(result.structuredJson.diagnoses).toHaveLength(2);
  });
});
