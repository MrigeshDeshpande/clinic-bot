import { NextResponse } from 'next/server';
import { requireCsrf, checkRateLimit } from '@/lib/apiAuth';
import { csrfCookieName } from '@/lib/auth';

export async function POST(req) {
  const csrfErr = requireCsrf(req);
  if (csrfErr) return csrfErr;
  const rateErr = checkRateLimit(req);
  if (rateErr) return rateErr;

  const res = NextResponse.json({ ok: true });
  res.cookies.set('dashboard_token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  res.cookies.set(csrfCookieName(), '', {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  });
  return res;
}
