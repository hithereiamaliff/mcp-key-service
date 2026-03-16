'use client';

import { useEffect, useState } from 'react';
import { onAuthChange, signOut } from '@/lib/firebase';
import type { User } from 'firebase/auth';

export default function Navbar() {
  const [user, setUser] = useState<User | null>(null);
  const [dark, setDark] = useState(true);

  useEffect(() => {
    const unsub = onAuthChange(setUser);
    setDark(document.documentElement.classList.contains('dark'));
    return unsub;
  }, []);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
  }

  return (
    <nav className="border-b border-[var(--border)] px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <a href="/" className="font-bold text-lg">MCP Key Service</a>
        {user && (
          <>
            <a href="/dashboard" className="text-sm text-[var(--text-secondary)] hover:text-[var(--text)]">
              Dashboard
            </a>
          </>
        )}
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={toggleTheme}
          className="p-2 rounded hover:bg-[var(--bg-secondary)] text-sm"
          title="Toggle theme"
        >
          {dark ? 'Light Mode' : 'Dark Mode'}
        </button>
        {user && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-[var(--text-secondary)]">{user.email}</span>
            <button
              onClick={() => signOut()}
              className="text-sm px-3 py-1 rounded border border-[var(--border)] hover:bg-[var(--bg-secondary)]"
            >
              Sign Out
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
