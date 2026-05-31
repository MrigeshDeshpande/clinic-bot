import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { logger } from '@/lib/logger';

const R2_ENDPOINT = process.env.R2_ENDPOINT;
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY;
const R2_SECRET_KEY = process.env.R2_SECRET_KEY;
const R2_BUCKET = process.env.R2_BUCKET || 'clinic-bot-chits';

let client;

function getClient() {
  if (client) return client;
  if (!R2_ENDPOINT || !R2_ACCESS_KEY || !R2_SECRET_KEY) {
    logger.warn('R2_CREDENTIALS_MISSING');
    return null;
  }
  client = new S3Client({
    region: 'auto',
    endpoint: R2_ENDPOINT,
    credentials: {
      accessKeyId: R2_ACCESS_KEY,
      secretAccessKey: R2_SECRET_KEY,
    },
  });
  return client;
}

export function r2Configured() {
  return !!getClient();
}

export async function uploadToR2({ key, buffer, contentType }) {
  const s3 = getClient();
  if (!s3) return null;
  try {
    await s3.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType || 'application/octet-stream',
    }));
    logger.info('R2_UPLOAD_SUCCESS', { key, bucket: R2_BUCKET });
    return key;
  } catch (error) {
    logger.error('R2_UPLOAD_ERROR', { key, error: error.message });
    return null;
  }
}

export async function deleteFromR2(key) {
  const s3 = getClient();
  if (!s3) return false;
  try {
    await s3.send(new DeleteObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
    }));
    return true;
  } catch (error) {
    logger.error('R2_DELETE_ERROR', { key, error: error.message });
    return false;
  }
}

export async function getR2SignedUrl(key, expiresIn = 3600) {
  const s3 = getClient();
  if (!s3) return null;
  try {
    const command = new GetObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
    });
    return await getSignedUrl(s3, command, { expiresIn });
  } catch (error) {
    logger.error('R2_SIGNED_URL_ERROR', { key, error: error.message });
    return null;
  }
}
