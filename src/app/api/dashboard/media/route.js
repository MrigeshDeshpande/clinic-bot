import { NextResponse } from 'next/server';
import { getSql } from '@/db/pool';
import { uploadToR2, r2Configured } from '@/lib/r2';
import { logger } from '@/lib/logger';

export async function POST(req) {
  try {
    if (!r2Configured()) {
      return NextResponse.json({ error: 'R2 storage not configured' }, { status: 500 });
    }

    const formData = await req.formData();
    const file = formData.get('file');
    const appointmentId = formData.get('appointmentId');

    if (!file || !appointmentId) {
      return NextResponse.json({ error: 'file and appointmentId required' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const mimeType = file.type || 'application/octet-stream';
    const ext = mimeType.split('/')[1] || 'bin';
    const mediaType = mimeType.startsWith('image/') ? 'photo' : mimeType.startsWith('audio/') ? 'audio' : 'file';
    const timestamp = Date.now();
    const key = `dashboard/${appointmentId}/${timestamp}_${mediaType}.${ext}`;

    const uploaded = await uploadToR2({ key, buffer, contentType: mimeType });
    if (!uploaded) {
      return NextResponse.json({ error: 'Upload to R2 failed' }, { status: 500 });
    }

    const sql = getSql();
    if (sql) {
      await sql`
        UPDATE appointments
        SET chit_media = array_append(coalesce(chit_media, '{}'), ${key}),
            updated_at = NOW()
        WHERE id = ${appointmentId}
      `;
    }

    return NextResponse.json({ key, mediaType, appointmentId });
  } catch (error) {
    logger.error('DASHBOARD_MEDIA_UPLOAD_ERROR', { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
