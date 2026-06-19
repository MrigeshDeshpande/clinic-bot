import { buildSystemPrompt } from '../prompts.js';
import { validateResponse } from '../validators.js';

const OLLAMA_BASE = process.env.OLLAMA_BASE || 'http://localhost:11434';
const MODEL = process.env.QWEN_MODEL || 'qwen2.5-coder:latest';
const TIMEOUT_MS = parseInt(process.env.QWEN_TIMEOUT_MS || '15000', 10);

export async function classify({ message, currentState, availableIntents }) {
  const systemPrompt = buildSystemPrompt({ currentState, availableIntents });

  const body = {
    model: MODEL,
    stream: false,
    options: {
      temperature: 0.1,
      top_p: 0.9,
    },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Message: "${message}"` },
    ],
  };

  const startTime = Date.now();

  const response = await Promise.race([
    fetch(`${OLLAMA_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('QWEN_TIMEOUT')), TIMEOUT_MS)
    ),
  ]);

  if (!response.ok) {
    const errText = await response.text().catch(() => 'unknown');
    throw new Error(`Qwen API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const processingMs = Date.now() - startTime;

  const content = data?.message?.content || '';
  // Strip markdown code fences before JSON extraction
  const cleaned = content.replace(/```(?:json)?\s*/gi, '').replace(/\s*```/g, '');
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in Qwen response');
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error('Failed to parse Qwen JSON response');
  }

  const validated = validateResponse(parsed, availableIntents);

  return {
    intent: validated.intent,
    entities: validated.entities,
    language: validated.language,
    provider: 'qwen',
    processingMs,
    rawModelResponse: content,
  };
}
