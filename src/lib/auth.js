const ALGORITHM = 'HS256';
const TOKEN_EXPIRY = 12 * 60 * 60;
const ISSUER = 'clinic-bot';

function base64urlEncode(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const raw = atob(str);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function getCryptoKey() {
  const pw = process.env.DASHBOARD_PASSWORD;
  if (!pw) throw new Error('DASHBOARD_PASSWORD is not set');
  const keyData = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pw));
  return crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function sign(payload) {
  const header = { alg: ALGORITHM, typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = { ...payload, iss: ISSUER, iat: now, exp: now + TOKEN_EXPIRY };
  const enc = new TextEncoder();
  const headerEncoded = base64urlEncode(enc.encode(JSON.stringify(header)));
  const payloadEncoded = base64urlEncode(enc.encode(JSON.stringify(fullPayload)));
  const key = await getCryptoKey();
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(`${headerEncoded}.${payloadEncoded}`));
  const signature = base64urlEncode(sigBuf);
  return `${headerEncoded}.${payloadEncoded}.${signature}`;
}

async function verify(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerEncoded, payloadEncoded, signature] = parts;
    const key = await getCryptoKey();
    let sigStr = signature.replace(/-/g, '+').replace(/_/g, '/');
    while (sigStr.length % 4) sigStr += '=';
    const raw = atob(sigStr);
    const sigBytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) sigBytes[i] = raw.charCodeAt(i);
    const valid = await crypto.subtle.verify(
      'HMAC', key, sigBytes,
      new TextEncoder().encode(`${headerEncoded}.${payloadEncoded}`)
    );
    if (!valid) return null;
    const payload = JSON.parse(base64urlDecode(payloadEncoded));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) return null;
    return payload;
  } catch {
    return null;
  }
}

function generateCsrfToken() {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return Array.from(buf, b => b.toString(16).padStart(2, '0')).join('');
}

function csrfCookieName() {
  return 'csrf_token';
}

export { sign, verify, generateCsrfToken, csrfCookieName };
