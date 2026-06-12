'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect, useRef, createContext, useContext } from 'react';
import dynamic from 'next/dynamic';
import { LayoutDashboard, CalendarDays, Users, BarChart3, PenSquare, ClipboardList, Star, CalendarOff, Bell, Settings, Sun, Moon, X, Menu } from 'lucide-react';

const NotificationPanel = dynamic(() => import('@/components/NotificationPanel'), { ssr: false });

export const DateContext = createContext();
export const ThemeContext = createContext();
export const ToastContext = createContext();
export const SidebarContext = createContext();

const NAV_GROUPS = [
  {
    label: 'MAIN',
    items: [
      { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
      { href: '/dashboard/appointments', label: 'Appointments', icon: CalendarDays },
      { href: '/dashboard/patients', label: 'Patients', icon: Users },
      { href: '/dashboard/stats', label: 'Statistics', icon: BarChart3 },
      { href: '/dashboard/visit', label: 'Log Visit', icon: PenSquare },
    ],
  },
  {
    label: 'OPERATIONS',
    items: [
      { href: '/dashboard/queue', label: 'Queue Board', icon: ClipboardList },
      { href: '/dashboard/schedule', label: 'Schedule', icon: CalendarOff },
      { href: '/dashboard/feedback', label: 'Feedback', icon: Star },
      { href: '/dashboard/due-reminders', label: 'Due Reminders', icon: Bell },
    ],
  },
  {
    label: 'SYSTEM',
    items: [
      { href: '/dashboard/settings', label: 'Settings', icon: Settings },
    ],
  },
];

function ThemeToggle({ compact }) {
  const { darkMode, setDarkMode } = useContext(ThemeContext);
  return (
    <button
      onClick={() => setDarkMode(!darkMode)}
      className={`flex items-center gap-2 rounded-xl text-sm font-medium transition-all duration-200 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 ${compact ? 'p-2' : 'px-3.5 py-2'}`}
      title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {darkMode ? (
        <Sun className="w-4 h-4 text-amber-400" />
      ) : (
        <Moon className="w-4 h-4 text-gray-400" />
      )}
      {!compact && <span className="hidden sm:inline text-xs">{darkMode ? 'Light' : 'Dark'}</span>}
    </button>
  );
}

function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);
  const inputRef = useRef(null);
  const router = useRouter();

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    function handleKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (query.length < 2) return;
    const timer = setTimeout(() => {
      setLoading(true);
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
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); if (e.target.value.length < 2) { setResults([]); } }}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Search patients..."
          className="w-full pl-9 pr-10 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 focus:bg-white dark:focus:bg-gray-800 focus:border-gray-300 dark:focus:border-gray-600 focus:ring-2 focus:ring-gray-100 dark:focus:ring-gray-700 outline-none text-sm text-gray-700 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-500 transition-all duration-200"
        />
        <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-xs font-medium text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-1.5 py-0.5 rounded leading-none">
          ⌘K
        </kbd>
        {loading && (
          <div className="absolute right-10 top-1/2 -translate-y-1/2">
            <div className="animate-spin w-3 h-3 border-2 border-gray-200 dark:border-gray-600 border-t-gray-600 dark:border-t-gray-300 rounded-full" />
          </div>
        )}
      </div>
      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-lg dark:shadow-gray-900/50 z-50 overflow-hidden animate-slide-down">
          {results.map(p => (
            <button
              key={p.id}
              onClick={() => handleSelect(p.id)}
              className="w-full text-left px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-sm flex items-center gap-3 border-b border-gray-50 dark:border-gray-700 last:border-0 group"
            >
              <span className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                {(p.name || '?')[0].toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{p.name || 'Unnamed'}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{p.phone || '—'} · {p.visit_count || 0} visits</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SidebarContent({ pathname, onNavClick }) {
  const router = useRouter();
  const { sidebarCollapsed: collapsed, setSidebarCollapsed } = useContext(SidebarContext);

  async function handleLogout() {
    await fetch('/api/dashboard/logout', { method: 'POST' });
    router.push('/dashboard/login');
  }

  return (
    <>
      {/* Logo */}
      <div className={`${collapsed ? 'flex justify-center py-3 border-b border-gray-100 dark:border-gray-800' : 'p-4 md:p-6 border-b border-gray-100 dark:border-gray-800'}`}>
        <Link href="/dashboard" onClick={onNavClick} className={`flex items-center ${collapsed ? '' : 'gap-3'}`}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0">
            <img src="/logo1.png" alt="Shri Balaji Dental Clinic" className="w-7 h-7 rounded-lg object-contain" />
          </div>
          {!collapsed && (
            <div>
              <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm leading-tight">Shri Balaji</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">Dental Clinic</p>
            </div>
          )}
        </Link>
      </div>

      {/* Search */}
      {!collapsed && (
        <div className="px-4 py-3">
          <GlobalSearch />
        </div>
      )}

      {/* Navigation */}
      <nav className={`flex-1 overflow-y-auto ${collapsed ? 'px-1.5 py-3 space-y-5' : 'px-3 pb-4'}`}>
        {NAV_GROUPS.map((group, gi) => (
          <div key={group.label}>
            {!collapsed && gi > 0 && <div className="mt-4" />}
            {!collapsed && (
              <p className="px-3.5 pb-1 text-xs uppercase tracking-widest text-gray-400 dark:text-gray-500 font-semibold select-none">
                {group.label}
              </p>
            )}
            <div className={`${collapsed ? 'flex flex-col items-center gap-1' : 'space-y-0.5'}`}>
              {group.items.map(item => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavClick}
                    title={collapsed ? item.label : undefined}
                    className={`relative flex items-center transition-all duration-200 ${
                      collapsed
                        ? 'w-10 h-10 justify-center rounded-xl'
                        : 'gap-3 px-3.5 py-2 rounded-xl text-sm font-medium'
                    } ${
                      active
                        ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30'
                        : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                  >
                    {active && !collapsed && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-blue-500 rounded-full" />
                    )}
                    {active && collapsed && (
                      <span className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-1 h-6 bg-blue-500 rounded-full" />
                    )}
                    <Icon className={`${collapsed ? 'w-5 h-5' : 'w-4 h-4'} ${active ? 'text-blue-600 dark:text-blue-400' : ''}`} />
                    {!collapsed && item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Notifications */}
      <div className={collapsed ? 'border-t border-gray-100 dark:border-gray-800 flex justify-center py-2' : 'px-3'}>
        <NotificationPanel compact={collapsed} />
      </div>

      {/* Bottom section */}
      <div className={`border-t border-gray-100 dark:border-gray-800 ${collapsed ? 'py-2 flex flex-col items-center gap-1' : 'p-4 space-y-1'}`}>
        <ThemeToggle compact={collapsed} />
        <button
          onClick={handleLogout}
          title={collapsed ? 'Logout' : undefined}
          className={`flex items-center rounded-xl transition-all ${
            collapsed
              ? 'w-10 h-10 justify-center text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
              : 'gap-3 px-3.5 py-2.5 w-full text-sm font-medium text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
          }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          {!collapsed && 'Logout'}
        </button>
        <button
          onClick={() => setSidebarCollapsed(!collapsed)}
          className={`flex items-center rounded-xl transition-all ${
            collapsed
              ? 'w-10 h-10 justify-center text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300'
              : 'gap-2 px-3.5 py-2.5 w-full text-sm font-medium text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300'
          }`}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <svg className={`w-4 h-4 transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          {!collapsed && <span className="text-xs">Collapse</span>}
        </button>
      </div>
    </>
  );
}

function Toasts({ toasts, removeToast }) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`px-4 py-3 rounded-xl shadow-lg text-sm font-medium animate-slide-up flex items-center gap-2 ${
            t.type === 'error' ? 'bg-red-600 text-white' :
            t.type === 'success' ? 'bg-emerald-600 text-white' :
            'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
          }`}
        >
          <span className="flex-1">{t.message}</span>
          <button onClick={() => removeToast(t.id)} className="opacity-70 hover:opacity-100">&times;</button>
        </div>
      ))}
    </div>
  );
}

export default function DashboardLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [darkMode, setDarkMode] = useState(false);
  // Shared selectedDate state persists across page navigations
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  // Hydrate dark mode from localStorage after first mount (avoids hydration mismatch)
  useEffect(() => {
    const saved = localStorage.getItem('dashboard-dark-mode');
    if (saved === 'true') setDarkMode(true);
  }, []);

  // Apply/remove dark class on <html> and persist to localStorage
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('dashboard-dark-mode', String(darkMode));
  }, [darkMode]);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSidebarOpen(false);
  }, [pathname]);

  function showToast(message, type = 'info', opts) {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), opts?.duration || 4000);
  }

  function removeToast(id) {
    setToasts(prev => prev.filter(t => t.id !== id));
  }

  // Prevent body scroll when sidebar is open on mobile
  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [sidebarOpen]);

  if (pathname === '/dashboard/login' || pathname === '/dashboard/prescription-preview') {
    return children;
  }

  return (
    <ThemeContext.Provider value={{ darkMode, setDarkMode }}>
      <SidebarContext.Provider value={{ sidebarCollapsed, setSidebarCollapsed }}>
      <DateContext.Provider value={{ selectedDate, setSelectedDate }}>
        <ToastContext.Provider value={{ showToast }}>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors duration-200">
          {/* Mobile Header Bar */}
          <div className="md:hidden fixed top-0 left-0 right-0 z-20 flex items-center justify-between px-4 h-14 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 -ml-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-600 dark:text-gray-300"
              aria-label="Open sidebar"
            >
              <Menu className="w-5 h-5" />
            </button>
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md flex items-center justify-center">
                <img src="/logo1.png" alt="Shri Balaji Dental Clinic" className="w-7 h-7 rounded-md object-contain" />
              </div>
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Shri Balaji</span>
            </Link>
            <ThemeToggle compact />
          </div>

          {/* Mobile Sidebar Drawer */}
          <div className={`md:hidden fixed inset-0 z-30 transition-opacity duration-300 ${sidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm"
              onClick={() => setSidebarOpen(false)}
            />
            {/* Drawer */}
            <div className={`absolute left-0 top-0 h-full w-72 max-w-[85vw] bg-white dark:bg-gray-900 shadow-2xl transition-transform duration-300 ease-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
              <div className="flex flex-col h-full">
                {/* Close button */}
                <div className="absolute top-3 right-3 z-10">
                  <button
                    onClick={() => setSidebarOpen(false)}
                    className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-400 dark:text-gray-500"
                    aria-label="Close sidebar"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <SidebarContent pathname={pathname} onNavClick={() => setSidebarOpen(false)} />
              </div>
            </div>
          </div>

          {/* Desktop Sidebar */}
          <aside className={`hidden md:flex fixed left-0 top-0 h-full bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 shadow-sm z-10 flex-col transition-all duration-300 ${sidebarCollapsed ? 'w-16 overflow-hidden' : 'w-64'}`}>
            <div className="flex-1 flex flex-col">
              <SidebarContent pathname={pathname} />
            </div>
          </aside>

          {/* Main Content */}
          <main className={`pt-14 md:pt-0 p-4 md:p-8 min-h-screen transition-all duration-300 ${sidebarCollapsed ? 'md:ml-16' : 'md:ml-64'}`}>
            <div className="animate-fade-in mx-auto">
              {children}
            </div>
          </main>
        </div>
        <Toasts toasts={toasts} removeToast={removeToast} />
      </ToastContext.Provider>
      </DateContext.Provider>
      </SidebarContext.Provider>
    </ThemeContext.Provider>
  );
}
