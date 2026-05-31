'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const NAV = [
  { href: '/dashboard', label: 'Overview', icon: '📊' },
  { href: '/dashboard/appointments', label: 'Appointments', icon: '📋' },
  { href: '/dashboard/patients', label: 'Patients', icon: '👥' },
  { href: '/dashboard/stats', label: 'Statistics', icon: '📈' },
  { href: '/dashboard/visit', label: 'Log Visit', icon: '✏️' },
];

export default function DashboardLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname === '/dashboard/login') {
    return children;
  }

  async function handleLogout() {
    await fetch('/api/dashboard/logout', { method: 'POST' });
    router.push('/dashboard/login');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <aside className="fixed left-0 top-0 h-full w-64 bg-white border-r border-gray-100 shadow-sm z-10">
        <div className="p-6 border-b border-gray-100">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-white text-sm font-bold">S</span>
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-sm leading-tight">Clinic</p>
              <p className="text-xs text-gray-400">Dashboard</p>
            </div>
          </Link>
        </div>

        <nav className="p-4 space-y-1">
          {NAV.map(item => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition ${
                  active
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-100">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition w-full"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
            Logout
          </button>
        </div>
      </aside>

      <main className="ml-64 p-8">
        {children}
      </main>
    </div>
  );
}
