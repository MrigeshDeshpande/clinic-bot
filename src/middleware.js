import { NextResponse } from 'next/server';

const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD;

export function middleware(req) {
  const { pathname } = req.nextUrl;

  if (!DASHBOARD_PASSWORD) {
    return new Response('DASHBOARD_PASSWORD environment variable is not set', { status: 500 });
  }

  if (pathname.startsWith('/dashboard')) {
    if (pathname === '/dashboard/login') {
      return NextResponse.next();
    }

    const token = req.cookies.get('dashboard_token')?.value;
    if (token !== DASHBOARD_PASSWORD) {
      return NextResponse.redirect(new URL('/dashboard/login', req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/dashboard/:path*',
};
