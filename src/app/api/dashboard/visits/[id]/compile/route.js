import { NextResponse } from 'next/server';
import { getSql, runMigrations } from '@/db/pool';
import { getR2SignedUrl } from '@/lib/r2';
import { compileVisitDocument } from '@/lib/compileDocument';
import { logger } from '@/lib/logger';
import { requireCsrf, checkRateLimit, jsonError } from '@/lib/apiAuth';

/**
 * POST /api/dashboard/visits/[id]/compile
 *
 * Compile the prescription summary + all images from a visit into a single PDF.
 * Returns a signed URL to download the compiled document.
 * If a compiled document already exists and the media hasn't changed (same key),
 * returns the cached version.
 */
export async function POST(req, { params }) {
  const csrfErr = requireCsrf(req);
  if (csrfErr) return csrfErr;
  const rateErr = checkRateLimit(req);
  if (rateErr) return rateErr;

  try {
    const { id } = await params;

    // Ensure schema is up to date (compiled_document_key column)
    await runMigrations();

    // Check for cached compiled document
    const sql = getSql();
    if (sql) {
      const existing = await sql`
        SELECT compiled_document_key FROM appointments WHERE id = ${id} LIMIT 1
      `;
      if (existing && existing.length > 0 && existing[0].compiled_document_key) {
        const cachedUrl = await getR2SignedUrl(existing[0].compiled_document_key, 604800);
        if (cachedUrl) {
          logger.info('COMPILE_CACHED', { appointmentId: id, key: existing[0].compiled_document_key });
          return NextResponse.json({
            key: existing[0].compiled_document_key,
            url: cachedUrl,
            cached: true,
          });
        }
      }
    }

    // Compile the document
    logger.info('COMPILE_START', { appointmentId: id });
    const result = await compileVisitDocument(id);

    if (!result || !result.url) {
      return NextResponse.json({ error: 'Failed to compile document' }, { status: 500 });
    }

    logger.info('COMPILE_SUCCESS', { appointmentId: id, key: result.key });
    return NextResponse.json({ key: result.key, url: result.url, cached: false });
  } catch (error) {
    logger.error('COMPILE_ERROR', { error: error.message, stack: error.stack });
    return jsonError(error);
  }
}
