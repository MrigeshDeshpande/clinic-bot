export async function extractPrescription(rawText) {
  const KALI_AI_URL = process.env.KALI_AI_URL;
  const EXTRACTION_TIMEOUT_MS = parseInt(process.env.EXTRACTION_TIMEOUT_MS || '60000', 10);

  if (!KALI_AI_URL) {
    throw new Error('KALI_AI_URL not configured');
  }

  if (!rawText || typeof rawText !== 'string') {
    throw new Error('rawText must be a non-empty string');
  }

  const startTime = Date.now();

  const response = await Promise.race([
    fetch(`${KALI_AI_URL}/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawText }),
    }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('EXTRACTION_TIMEOUT')), EXTRACTION_TIMEOUT_MS)
    ),
  ]);

  if (!response.ok) {
    const errText = await response.text().catch(() => 'unknown');
    throw new Error(`Extraction API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const processingMs = Date.now() - startTime;

  if (!data.structuredJson) {
    throw new Error('Extraction API returned no structuredJson');
  }

  return {
    structuredJson: data.structuredJson,
    model: data.model || 'qwen2.5-coder',
    processingMs,
  };
}
