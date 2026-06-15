import { NextResponse } from 'next/server';
import { csrfCookieName } from '@/lib/auth';
import { DASHBOARD_API_LIMITER } from '@/lib/rateLimit';

export function requireCsrf(req) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return null;
  }

  // Same-origin requests are safe — SameSite=Lax on the auth cookie already
  // provides CSRF protection. This check catches cross-origin requests as
  // defense-in-depth.
  const origin = req.headers.get('origin');
  const host = req.headers.get('host');
  if (origin) {
    try {
      const originUrl = new URL(origin);
      if (originUrl.host === host) {
        return null;
      }
    } catch {
      // Invalid origin URL — fall through to token check
    }
  }

  // Cross-origin request — require CSRF token
  const headerToken = req.headers.get('x-csrf-token');
  const cookieToken = req.cookies.get(csrfCookieName())?.value;
  if (!headerToken || !cookieToken || headerToken !== cookieToken) {
    return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
  }
  return null;
}

export function checkRateLimit(req) {
  const result = DASHBOARD_API_LIMITER(req);
  if (result.blocked) {
    return NextResponse.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: {
          'Retry-After': String(result.retryAfter),
          'X-RateLimit-Remaining': '0',
        },
      }
    );
  }
  return null;
}

const JSON_BODY_LIMIT = 100 * 1024; // 100KB for JSON
const FORM_BODY_LIMIT = 15 * 1024 * 1024; // 15MB for form data

export function checkBodySize(req) {
  const contentType = req.headers.get('content-type') || '';
  const maxBytes = contentType.includes('multipart/form-data') ? FORM_BODY_LIMIT : JSON_BODY_LIMIT;
  const contentLength = parseInt(req.headers.get('content-length') || '0', 10);
  if (contentLength > maxBytes) {
    return NextResponse.json({ error: 'Request body too large' }, { status: 413 });
  }
  return null;
}

export function jsonError(error, status = 500) {
  let message;
  if (typeof error === 'string') {
    message = error;
  } else if (Array.isArray(error?.errors)) {
    const details = error.errors.map((e, i) => {
      if (typeof e === 'string') return `[${i}] ${e}`;
      return `[${i}] ${e?.message || String(e)}`;
    }).join('; ');
    message = `${error.name || 'Error'}: ${details}`;
  } else {
    message = error?.message || String(error) || 'Internal server error';
  }
  return NextResponse.json({ error: message }, { status });
}

const SENSITIVE_FIELDS = [
  'patient_name', 'treatment', 'diagnosis', 'notes',
  'comment', 'name', 'reason',
];

export function sanitizeResponse(data) {
  if (Array.isArray(data)) {
    return data.map(item => sanitizeResponse(item));
  }
  if (data && typeof data === 'object') {
    if (data instanceof Date) return data.toISOString();
    const result = {};
    for (const [key, value] of Object.entries(data)) {
      if (SENSITIVE_FIELDS.includes(key) && typeof value === 'string') {
        result[key] = value
          .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
          .replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '')
          .replace(/javascript\s*:/gi, '')
          .replace(/<[^>]*>/g, '');
      } else if (key === 'medicines' && Array.isArray(value)) {
        result[key] = value.map(m => {
          if (typeof m === 'string') {
            return m.replace(/<[^>]*>/g, '');
          }
          return sanitizeResponse(m);
        });
      } else if (value && typeof value === 'object') {
        result[key] = sanitizeResponse(value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }
  return data;
}
