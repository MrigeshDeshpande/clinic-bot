import { uploadToR2, r2Configured } from '@/lib/r2';
import { logger } from '@/lib/logger';
import { getSql } from '@/db/pool';

const META_API_VERSION = 'v19.0';

async function getMediaDownloadUrl(mediaId) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) {
    logger.warn('MEDIA_DOWNLOAD_TOKEN_MISSING');
    return null;
  }
  try {
    const res = await fetch(`https://graph.facebook.com/${META_API_VERSION}/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const err = await res.text();
      logger.error('MEDIA_META_INFO_ERROR', { mediaId, status: res.status, error: err });
      return null;
    }
    const data = await res.json();
    return { url: data.url, mimeType: data.mime_type, fileSize: data.file_size };
  } catch (error) {
    logger.error('MEDIA_META_INFO_NETWORK_ERROR', { mediaId, error: error.message });
    return null;
  }
}

export async function downloadMediaFromMeta(mediaId) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) return null;

  const info = await getMediaDownloadUrl(mediaId);
  if (!info) return null;

  try {
    const res = await fetch(info.url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      logger.error('MEDIA_DOWNLOAD_ERROR', { mediaId, status: res.status });
      return null;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    return { buffer, mimeType: info.mimeType, fileSize: info.fileSize };
  } catch (error) {
    logger.error('MEDIA_DOWNLOAD_NETWORK_ERROR', { mediaId, error: error.message });
    return null;
  }
}

export function getMediaExtension(mimeType) {
  const map = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'audio/ogg': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/amr': 'amr',
  };
  return map[mimeType] || 'bin';
}

export function getMediaType(mimeType) {
  if (mimeType?.startsWith('image/')) return 'photo';
  if (mimeType?.startsWith('audio/')) return 'audio';
  return 'file';
}

export async function processAndStoreMedia({ mediaId, mimeType, appointmentId, waId, patientId }) {
  if (!mediaId) return null;

  if (!r2Configured()) {
    logger.warn('MEDIA_R2_NOT_CONFIGURED');
    return null;
  }

  const download = await downloadMediaFromMeta(mediaId);
  if (!download) return null;

  const ext = getMediaExtension(download.mimeType);
  const mediaType = getMediaType(download.mimeType);
  const timestamp = Date.now();
  const key = `${patientId || 'unknown'}/${appointmentId || 'unknown'}/${timestamp}_${mediaType}.${ext}`;

  const uploaded = await uploadToR2({
    key,
    buffer: download.buffer,
    contentType: download.mimeType,
  });

  if (!uploaded) {
    logger.error('MEDIA_R2_UPLOAD_FAILED', { mediaId, key });
    return null;
  }

  // Dual-write: chit_media + media_assets in same transaction
  if (appointmentId) {
    const sql = getSql();
    if (sql) {
      try {
        await sql.begin(async (tx) => {
          await tx`
            UPDATE appointments
            SET chit_media = array_append(coalesce(chit_media, '{}'), ${key}),
                updated_at = NOW()
            WHERE id = ${appointmentId}
          `;
          const [asset] = await tx`
            INSERT INTO media_assets (appointment_id, patient_id, uploaded_by_type, media_type, mime_type, r2_key, size_bytes, source)
            VALUES (${appointmentId}, ${patientId || null}, 'doctor', ${mediaType}, ${download.mimeType}, ${key}, ${download.fileSize || null}, 'whatsapp')
            ON CONFLICT (r2_key) DO NOTHING
            RETURNING id
          `;
          logger.info('MEDIA_ASSET_CREATED', {
            appointmentId,
            mediaAssetId: asset?.id ?? null,
            source: 'whatsapp',
            r2Key: key,
            inserted: !!asset,
          });
        });
      } catch (dbError) {
        logger.error('MEDIA_DB_STORE_ERROR', { appointmentId, key, error: dbError.message });
      }
    }
  }

  return { key, mediaType };
}
