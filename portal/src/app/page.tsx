'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  onAuthChange,
  signInWithGoogle,
  signInWithGitHub,
  getIdToken,
  isFirebaseClientConfigured,
} from '@/lib/firebase';
import Navbar from '@/components/Navbar';
import PriceDisplay from '@/components/PriceDisplay';
import type { User } from 'firebase/auth';

export default function LandingPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const firebaseConfigured = isFirebaseClientConfigured();
  const previewAvailable = process.env.NODE_ENV === 'development' && !firebaseConfigured;

  useEffect(() => {
    if (!firebaseConfigured) {
      setLoading(false);
      return;
    }

    const unsub = onAuthChange(async (u) => {
      setUser(u);
      setLoading(false);
      if (u) {
        // Sync user to backend
        try {
          const token = await getIdToken();
          await fetch('/api/user/sync', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ display_name: u.displayName }),
          });
        } catch {
          // Non-critical - user will be synced on next action
        }
        router.push('/dashboard');
      }
    });
    return unsub;
  }, [firebaseConfigured, router]);

  async function handleGoogle() {
    setAuthLoading(true);
    setError('');
    try {
      await signInWithGoogle();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleGitHub() {
    setAuthLoading(true);
    setError('');
    try {
      await signInWithGitHub();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAuthLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-[var(--text-secondary)]">Loading...</p>
      </div>
    );
  }

  if (user) return null; // Redirecting to dashboard

  return (
    <>
      <Navbar />
      <main className="max-w-3xl mx-auto mt-20 px-6">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold mb-4">Credential Vault for TechMavie Digital's MCP Servers</h1>
          <p className="max-w-2xl mx-auto text-lg leading-8 text-[var(--text-secondary)]">
            MCP Key Service is the control panel for storing connector credentials once,
            issuing safer `usr_...` keys, and letting the correct TechMavie MCP server
            resolve those secrets only when it needs them.
          </p>
          <p className="max-w-2xl mx-auto mt-4 text-sm leading-7 text-[var(--text-secondary)]">
            Use it when you want Claude Desktop, Open WebUI, or other MCP clients to connect
            to services like Nextcloud, GitHub, Exa, Brave, Perplexity, GrabMaps, Reddit,
            Ghost CMS, Malaysia Open Data, Singapore LTA DataMall, and the rest of the
            supported MCP server set without exposing raw API credentials in your client config.
          </p>
        </div>

        <div className="rounded-xl border border-[var(--border)] p-6 bg-[var(--card)] space-y-4 shadow-[0_20px_80px_rgba(15,23,42,0.2)]">
          <h2 className="font-semibold text-center">
            {previewAvailable ? 'Portal Preview Mode' : 'Sign in to get started'}
          </h2>

          {!firebaseConfigured && (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-4 text-sm text-[var(--text-secondary)]">
              {previewAvailable ? (
                <>
                  Firebase isn&apos;t configured yet, so local sign-in is disabled.
                  You can still preview the dashboard and admin experience, inspect the
                  connection flow, and see how subscriptions, issued keys, and server-specific
                  access will look before wiring real auth.
                </>
              ) : (
                <>
                  Authentication is not available for this deployment yet.
                  Add valid `NEXT_PUBLIC_FIREBASE_*` values to enable Google and GitHub sign-in.
                </>
              )}
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <button
              onClick={handleGoogle}
              disabled={authLoading || !firebaseConfigured}
              className="w-full py-2.5 px-4 rounded-lg border border-[var(--border)] font-medium hover:bg-[var(--bg-secondary)] hover:border-[var(--primary)] hover:shadow-md active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:hover:border-[var(--border)] disabled:hover:shadow-none disabled:active:scale-100 flex items-center justify-center gap-2 cursor-pointer"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
              Continue with Google
            </button>

            <button
              onClick={handleGitHub}
              disabled={authLoading || !firebaseConfigured}
              className="w-full py-2.5 px-4 rounded-lg border border-[var(--border)] font-medium hover:bg-[var(--bg-secondary)] hover:border-[var(--primary)] hover:shadow-md active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:hover:border-[var(--border)] disabled:hover:shadow-none disabled:active:scale-100 flex items-center justify-center gap-2 cursor-pointer"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
              Continue with GitHub
            </button>
          </div>

          {error && (
            <p className="text-sm text-center" style={{ color: 'var(--danger)' }}>{error}</p>
          )}

          {previewAvailable && (
            <div className="grid gap-2 sm:grid-cols-2">
              <a
                href="/dashboard?preview=1"
                className="w-full rounded-lg border border-[var(--border)] px-4 py-2.5 text-center font-medium hover:bg-[var(--bg-secondary)]"
              >
                Preview Dashboard
              </a>
              <a
                href="/admin?preview=1"
                className="w-full rounded-lg border border-[var(--border)] px-4 py-2.5 text-center font-medium hover:bg-[var(--bg-secondary)]"
              >
                Preview Admin
              </a>
            </div>
          )}
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-2">
          <div className="rounded-xl border border-[var(--border)] p-6 bg-[var(--card)]">
            <h3 className="font-semibold text-lg mb-2">Free</h3>
            <p className="text-3xl font-bold mb-1">RM0</p>
            <p className="text-sm text-[var(--text-secondary)] mb-4">forever</p>
            <ul className="text-sm space-y-2 text-[var(--text-secondary)]">
              <li>1 MCP connection included</li>
              <li>Full credential encryption</li>
              <li>Per-server access control</li>
            </ul>
          </div>
          <div className="rounded-xl border-2 border-[var(--primary)] p-6 bg-[var(--card)] relative">
            <h3 className="font-semibold text-lg mb-2">Pro</h3>
            <p className="text-3xl font-bold mb-1"><PriceDisplay amountMYR={49} suffix="" /></p>
            <p className="text-sm text-[var(--text-secondary)] mb-4">per month</p>
            <p className="text-xs text-[var(--text-secondary)] mb-4">
              Local currency is an estimate. Stripe checkout bills RM49/month.
            </p>
            <ul className="text-sm space-y-2 text-[var(--text-secondary)]">
              <li>Unlimited MCP connections</li>
              <li>All supported connectors</li>
              <li>Key rotation &amp; management</li>
            </ul>
          </div>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3 text-sm text-[var(--text-secondary)]">
          <div>
            <p className="font-semibold text-[var(--text)]">Store Once</p>
            <p>Keep connector secrets in one encrypted vault instead of scattering them across MCP clients.</p>
          </div>
          <div>
            <p className="font-semibold text-[var(--text)]">Issue Safer Keys</p>
            <p>Hand clients a `usr_...` key instead of pasting raw tokens, app passwords, or API credentials into URLs.</p>
          </div>
          <div>
            <p className="font-semibold text-[var(--text)]">Resolve Per Server</p>
            <p>Only the matching TechMavie MCP server can access the connector credentials it is explicitly allowed to use.</p>
          </div>
        </div>

        <p className="text-center text-xs text-[var(--text-secondary)] mt-8">
          Powered by <a href="https://techmavie.digital" className="underline">TechMavie Digital</a>
        </p>
      </main>
    </>
  );
}
