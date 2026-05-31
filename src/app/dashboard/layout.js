'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect, useRef, createContext } from 'react';

export const DateContext = createContext();

const NAV = [
  { href: '/dashboard', label: 'Overview', icon: '📊' },
  { href: '/dashboard/appointments', label: 'Appointments', icon: '📋' },
  { href: '/dashboard/patients', label: 'Patients', icon: '👥' },
  { href: '/dashboard/stats', label: 'Statistics', icon: '📈' },
  { href: '/dashboard/visit', label: 'Log Visit', icon: '✏️' },
];

function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);
  const router = useRouter();

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    setLoading(true);
    const timer = setTimeout(() => {
      fetch(`/api/dashboard/patients?q=${encodeURIComponent(query)}&limit=5`)
        .then(r => r.json())
        .then(d => { setResults(d.patients || []); setOpen(true); setLoading(false); })
        .catch(() => setLoading(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  function handleSelect(id) {
    setOpen(false);
    setQuery('');
    router.push(`/dashboard/patients/${id}`);
  }

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Search patients..."
          className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 bg-gray-50 focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100/50 outline-none text-xs text-gray-700 placeholder-gray-400 transition-all duration-200"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="animate-spin w-3 h-3 border-2 border-blue-200 border-t-blue-600 rounded-full" />
          </div>
        )}
      </div>
      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-white rounded-lg border border-gray-200 shadow-lg z-50 overflow-hidden animate-slide-down">
          {results.map(p => (
            <button
              key={p.id}
              onClick={() => handleSelect(p.id)}
              className="w-full text-left px-4 py-2.5 hover:bg-blue-50 transition-colors text-sm flex items-center gap-3 border-b border-gray-50 last:border-0 group"
            >
              <span className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-100 to-blue-50 text-blue-700 flex items-center justify-center text-xs font-semibold flex-shrink-0 group-hover:from-blue-200 group-hover:to-blue-100 transition-all">
                {(p.name || '?')[0].toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="font-medium text-gray-900 truncate">{p.name || 'Unnamed'}</p>
                <p className="text-xs text-gray-400 truncate">{p.phone || '—'} · {p.visit_count || 0} visits</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DashboardLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [pageKey, setPageKey] = useState(0);

  // Shared selectedDate state persists across page navigations
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  useEffect(() => {
    setPageKey(prev => prev + 1);
  }, [pathname]);

  if (pathname === '/dashboard/login') {
    return children;
  }

  async function handleLogout() {
    await fetch('/api/dashboard/logout', { method: 'POST' });
    router.push('/dashboard/login');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-full w-64 bg-white border-r border-gray-100 shadow-sm z-10 flex flex-col">
        {/* Logo */}
        <div className="p-6 border-b border-gray-100">
          <Link href="/dashboard" className="flex items-center gap-3 group">
            <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm group-hover:shadow-md transition-shadow">
              <span className="text-white text-sm font-bold">S</span>
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-sm leading-tight">Smile Dental</p>
              <p className="text-xs text-gray-400">Clinic Dashboard</p>
            </div>
          </Link>
        </div>

        {/* Search */}
        <div className="px-4 py-3">
          <GlobalSearch />
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 pb-4 space-y-0.5 overflow-y-auto">
          {NAV.map(item => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 relative ${
                  active
                    ? 'bg-gradient-to-r from-blue-50 to-blue-50/50 text-blue-700 shadow-sm'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-blue-600 rounded-full" />
                )}
                <span className="text-lg">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="p-4 border-t border-gray-100">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 transition-all w-full group"
          >
            <svg className="w-5 h-5 group-hover:rotate-180 transition-transform duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <DateContext.Provider value={{ selectedDate, setSelectedDate }}>
        <main className="ml-64 p-8 min-h-screen" key={pageKey}>
          <div className="animate-fade-in max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </DateContext.Provider>
    </div>
  );
}
