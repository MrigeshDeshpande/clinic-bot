const HTML_TAG_RE = /<[^>]*>/g;
const SCRIPT_RE = /<script[\s\S]*?>[\s\S]*?<\/script>/gi;
const ON_EVENT_RE = /\son\w+\s*=\s*["'][^"']*["']/gi;
const JS_PROTOCOL_RE = /javascript\s*:/gi;

export function sanitize(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(SCRIPT_RE, '')
    .replace(ON_EVENT_RE, '')
    .replace(JS_PROTOCOL_RE, '')
    .replace(HTML_TAG_RE, '');
}

export function sanitizeObj(obj, fields) {
  if (!obj || typeof obj !== 'object') return obj;
  const result = Array.isArray(obj) ? [...obj] : { ...obj };
  for (const field of fields) {
    if (typeof result[field] === 'string') {
      result[field] = sanitize(result[field]);
    }
  }
  return result;
}
