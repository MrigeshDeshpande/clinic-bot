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

/**
 * Download a file from R2 as a Buffer.
 * @param {string} key - The R2 object key
 * @returns {Promise<Buffer|null>} The file contents as a Buffer, or null on failure
 */
export async function getR2Object(key) {
  const s3 = getClient();
  if (!s3) return null;
  try {
    const command = new GetObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
    });
    const response = await s3.send(command);
    if (!response.Body) return null;

    // If Body is already a Buffer (SDK may collect it depending on config)
    if (Buffer.isBuffer(response.Body)) return response.Body;
    if (response.Body instanceof Uint8Array) return Buffer.from(response.Body);

    // Convert the readable stream to a Buffer using the stream 'data'/'end' pattern
    // for maximum compatibility across AWS SDK versions
    const chunks = [];
    const stream = response.Body;

    if (typeof stream.on === 'function' && typeof stream.read === 'function') {
      // Node.js Readable stream — use event-based approach
      await new Promise((resolve, reject) => {
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', resolve);
        stream.on('error', reject);
        // Resume in case it's in paused mode
        stream.resume();
      });
    } else if (typeof stream[Symbol.asyncIterator] === 'function') {
      // Async iterable (AWS SDK SdkStream wrapper)
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
    } else {
      // Unknown body type — try transformToByteArray (SDK v3 helper)
      const bytes = await stream.transformToByteArray();
      return Buffer.from(bytes);
    }

    return Buffer.concat(chunks);
  } catch (error) {
    logger.error('R2_GET_OBJECT_ERROR', { key, error: error.message });
    return null;
  }
}
