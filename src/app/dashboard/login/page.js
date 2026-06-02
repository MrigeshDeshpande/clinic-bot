'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [dark, setDark] = useState(false);
  const router = useRouter();

  // Read dark mode preference from localStorage and apply to <html>
  useEffect(() => {
    const saved = localStorage.getItem('dashboard-dark-mode') === 'true';
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDark(saved);
    if (saved) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/dashboard/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        router.push('/dashboard');
      } else {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'Invalid password');
        setLoading(false);
      }
    } catch {
      setError('Network error — please try again');
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-gray-950 dark:to-gray-900">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg dark:shadow-gray-900/80 shadow-blue-100/50 p-10 w-full max-w-md transition-colors duration-200">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Clinic Dashboard</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Enter your password to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:border-blue-400 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900 outline-none transition text-gray-700 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-500"
              autoFocus
            />
          </div>

          {error && (
            <p className="text-red-500 dark:text-red-400 text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full py-3 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
