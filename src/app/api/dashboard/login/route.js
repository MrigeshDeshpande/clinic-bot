import { NextResponse } from 'next/server';

const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD;

export async function POST(req) {
  try {
    const { password } = await req.json();
    if (password === DASHBOARD_PASSWORD) {
      const res = NextResponse.json({ ok: true });
      res.cookies.set('dashboard_token', password, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
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
