import { NextResponse } from 'next/server';
import { getSql } from '@/db/pool';
import { uploadToR2, r2Configured } from '@/lib/r2';
import { logger } from '@/lib/logger';
import { requireCsrf, checkRateLimit, jsonError } from '@/lib/apiAuth';

export async function POST(req) {
  const csrfErr = requireCsrf(req);
  if (csrfErr) return csrfErr;
  const rateErr = checkRateLimit(req);
  if (rateErr) return rateErr;
  try {
    if (!r2Configured()) {
      console.log('[MEDIA_API] R2 not configured — check env vars');
      return NextResponse.json({ error: 'R2 storage not configured' }, { status: 500 });
    }

    const formData = await req.formData();
    const file = formData.get('file');
    const appointmentId = formData.get('appointmentId');

    console.log('[MEDIA_API] Received:', { fileName: file?.name, fileType: file?.type, fileSize: file?.size, appointmentId });

    if (!file || !appointmentId) {
      console.log('[MEDIA_API] Missing file or appointmentId');
      return NextResponse.json({ error: 'file and appointmentId required' }, { status: 400 });
    }

    const mimeType = file.type || '';
    const ALLOWED_MIME_TYPES = ['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif','audio/mpeg','audio/ogg','audio/wav','audio/webm','video/mp4','video/webm','application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      console.log('[MEDIA_API] Rejected file type:', mimeType);
      return NextResponse.json({ error: `File type ${mimeType} not allowed` }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    if (buffer.length > MAX_FILE_SIZE) {
      console.log('[MEDIA_API] File too large:', buffer.length);
      return NextResponse.json({ error: 'File exceeds 10MB limit' }, { status: 400 });
    }
    const ext = mimeType.split('/')[1] || 'bin';
    const mediaType = mimeType.startsWith('image/') ? 'photo' : mimeType.startsWith('audio/') ? 'audio' : 'file';
    const timestamp = Date.now();
    const key = `dashboard/${appointmentId}/${timestamp}_${mediaType}.${ext}`;

    console.log('[MEDIA_API] Uploading to R2:', key);
    const uploaded = await uploadToR2({ key, buffer, contentType: mimeType });
    if (!uploaded) {
      console.log('[MEDIA_API] R2 upload returned null/false');
      return NextResponse.json({ error: 'Upload to R2 failed' }, { status: 500 });
    }
    console.log('[MEDIA_API] R2 upload success:', key);

    const sql = getSql();
    if (sql) {
      await sql.begin(async (tx) => {
        const [appt] = await tx`
          SELECT patient_id FROM appointments WHERE id = ${appointmentId}
        `;

        await tx`
          UPDATE appointments
          SET chit_media = array_append(coalesce(chit_media, '{}'), ${key}),
              compiled_document_key = NULL,
              updated_at = NOW()
          WHERE id = ${appointmentId}
        `;

        const [asset] = await tx`
          INSERT INTO media_assets (appointment_id, patient_id, uploaded_by_type, media_type, mime_type, r2_key, size_bytes, source)
          VALUES (${appointmentId}, ${appt?.patient_id || null}, 'system', ${mediaType}, ${mimeType}, ${key}, ${buffer.length}, 'dashboard')
          ON CONFLICT (r2_key) DO NOTHING
          RETURNING id
        `;

        console.log('[MEDIA_API] DB updated for appointment:', appointmentId);
        logger.info('MEDIA_ASSET_CREATED', {
          appointmentId,
          mediaAssetId: asset?.id ?? null,
          source: 'dashboard',
          r2Key: key,
          inserted: !!asset,
        });
      });
    } else {
      console.log('[MEDIA_API] No DB — skipped chit_media update');
    }

    return NextResponse.json({ key, mediaType, appointmentId });
  } catch (error) {
    console.error('[MEDIA_API] Unexpected error:', error);
    logger.error('DASHBOARD_MEDIA_UPLOAD_ERROR', { error: error.message });
    return jsonError(error);
  }
}
