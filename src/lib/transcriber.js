import { logger } from '@/lib/logger';

const WHISPER_API = 'https://api.openai.com/v1/audio/transcriptions';

export async function transcribeAudio(audioBuffer, mimeType) {
  const apiKey = process.env.OPENAI_API_KEY || process.env.WHISPER_API_KEY;
  if (!apiKey) {
    logger.warn('TRANSCRIBER_API_KEY_MISSING');
    return null;
  }

  const ext = mimeType === 'audio/ogg' ? 'ogg' :
              mimeType === 'audio/mpeg' ? 'mp3' :
              mimeType === 'audio/mp4' ? 'm4a' :
              mimeType === 'audio/amr' ? 'amr' : 'webm';

  try {
    const form = new FormData();
    const blob = new Blob([audioBuffer], { type: mimeType });
    form.append('file', blob, `audio.${ext}`);
    form.append('model', 'whisper-1');
    form.append('language', 'en');

    const res = await fetch(WHISPER_API, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    if (!res.ok) {
      const err = await res.text();
      logger.error('TRANSCRIBER_API_ERROR', { status: res.status, error: err });
      return null;
    }

    const data = await res.json();
    return (data.text || '').trim();
  } catch (error) {
    logger.error('TRANSCRIBER_NETWORK_ERROR', { error: error.message });
    return null;
  }
}
