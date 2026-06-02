import { NextResponse } from 'next/server';
import { sign, generateCsrfToken, csrfCookieName } from '@/lib/auth';
import { LOGIN_LIMITER } from '@/lib/rateLimit';

export async function POST(req) {
  const rateCheck = LOGIN_LIMITER(req);
  if (rateCheck.blocked) {
    return NextResponse.json({ error: 'Too many attempts. Try again later.' }, {
      status: 429,
      headers: { 'Retry-After': String(rateCheck.retryAfter) },
    });
  }
  try {
    const { password } = await req.json();
    if (password === process.env.DASHBOARD_PASSWORD) {
      const token = await sign({ role: 'admin' });
      const csrfToken = generateCsrfToken();
      const res = NextResponse.json({ ok: true, csrfToken });
      res.cookies.set('dashboard_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 12,
      });
      res.cookies.set(csrfCookieName(), csrfToken, {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: 60 * 60 * 12,
      });
      return res;
    }
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}
