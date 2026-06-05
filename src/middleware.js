import { NextResponse } from 'next/server';
import { verify } from '@/lib/auth';

export async function middleware(req) {
  const { pathname } = req.nextUrl;

  if (!process.env.DASHBOARD_PASSWORD) {
    return new NextResponse('DASHBOARD_PASSWORD environment variable is not set', { status: 500 });
  }

  if (pathname.startsWith('/dashboard') || pathname.startsWith('/api/dashboard')) {
    if (pathname === '/dashboard/login' || pathname === '/api/dashboard/login') {
      return NextResponse.next();
    }

    const token = req.cookies.get('dashboard_token')?.value;
    if (!token || !(await verify(token))) {
      const loginUrl = new URL('/dashboard/login', req.url);
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/dashboard/:path*'],
};
