'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthChange, getIdToken, isFirebaseClientConfigured, linkGoogle, linkGitHub, unlinkProvider, getFirebaseAuth } from '@/lib/firebase';
import Navbar from '@/components/Navbar';
import SubscriptionCard from '@/components/SubscriptionCard';
import ConnectionForm from '@/components/ConnectionForm';
import ConnectionCard from '@/components/ConnectionCard';
import KeyDisplay from '@/components/KeyDisplay';
import LinkedAccounts from '@/components/LinkedAccounts';
import type { User } from 'firebase/auth';

interface Profile {
  email: string;
  display_name: string | null;
  subscription_status: string;
  current_period_end: string | null;
  is_admin: boolean;
  key_count: number;
}

interface KeyMeta {
  key_prefix: string;
  label: string;
  connector_id: string;
  created_at: string;
  last_used: string | null;
  usage_count: number;
  status: string;
}

interface NewKey {
  api_key: string;
  label: string;
  connector_id: string;
  usage: { url_example: string; supported_servers: string[] };
}

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [keys, setKeys] = useState<KeyMeta[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [newKey, setNewKey] = useState<NewKey | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [linkingProvider, setLinkingProvider] = useState<'google' | 'github' | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const router = useRouter();
  const firebaseConfigured = isFirebaseClientConfigured();
  const previewAvailable = process.env.NODE_ENV === 'development' && !firebaseConfigured;

  useEffect(() => {
    if (previewAvailable) {
      const params = new URLSearchParams(window.location.search);
      setPreviewMode(params.get('preview') === '1');
      return;
    }
    setPreviewMode(false);
  }, [previewAvailable]);

  const fetchData = useCallback(async () => {
    if (previewMode) {
      setProfile({
        email: 'preview@techmavie.digital',
        display_name: 'Preview User',
        subscription_status: 'active',
        current_period_end: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        is_admin: true,
        key_count: 2,
      });
      setKeys([
        {
          key_prefix: 'usr_preview01...a1b2',
          label: 'Main Nextcloud',
          connector_id: 'nextcloud',
          created_at: new Date().toISOString(),
          last_used: new Date().toISOString(),
          usage_count: 24,
          status: 'active',
        },
        {
          key_prefix: 'usr_preview02...c3d4',
          label: 'Docs Research',
          connector_id: 'exa',
          created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          last_used: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
          usage_count: 8,
          status: 'active',
        },
      ]);
      setLoading(false);
      return;
    }

    const token = await getIdToken();
    if (!token) return;

    try {
      const syncRes = await fetch('/api/user/sync', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ display_name: user?.displayName }),
      });

      if (syncRes.ok) {
        const { user: userData } = await syncRes.json();
        if (userData) {
          setProfile({
            email: userData.email,
            display_name: userData.display_name,
            subscription_status: userData.subscription_status,
            current_period_end: userData.current_period_end,
            is_admin: userData.is_admin === 1,
            key_count: 0,
          });
        }
      }

      const keysRes = await fetch('/api/connections', {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (keysRes.ok) {
        const data = await keysRes.json();
        setKeys(data.keys || []);
      }
    } catch (err) {
      console.error('Failed to refresh dashboard data:', err);
    }
  }, [previewMode, user]);

  useEffect(() => {
    if (previewMode) {
      void fetchData();
      return;
    }

    const unsub = onAuthChange((u) => {
      setUser(u);
      setLoading(false);
      if (!u) router.push('/');
    });
    return unsub;
  }, [fetchData, previewMode, router]);

  useEffect(() => {
    if (!previewMode && user) void fetchData();
  }, [previewMode, user, fetchData]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-[var(--text-secondary)]">Loading...</p>
      </div>
    );
  }

  if (!user && !previewMode) return null;

  const isSubscribed = profile?.subscription_status === 'active';

  return (
    <>
      <Navbar />
      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Dashboard</h1>
          {profile?.is_admin && (
            <a
              href="/admin"
              className="text-sm px-3 py-1 rounded border border-[var(--border)] hover:bg-[var(--bg-secondary)]"
            >
              Admin Panel
            </a>
          )}
        </div>

        <div className="grid gap-6 md:grid-cols-2 mb-8">
          <SubscriptionCard
            status={profile?.subscription_status || 'none'}
            periodEnd={profile?.current_period_end || null}
            previewMode={previewMode}
          />
          <div className="rounded-lg border border-[var(--border)] p-6 bg-[var(--card)]">
            <h3 className="font-semibold mb-2">Connections</h3>
            <p className="text-3xl font-bold">{keys.length}</p>
            <p className="text-sm text-[var(--text-secondary)]">active connection{keys.length !== 1 ? 's' : ''}</p>
          </div>
        </div>

        {/* Linked Accounts */}
        {user && !previewMode && (
          <LinkedAccounts
            user={user}
            linkingProvider={linkingProvider}
            linkError={linkError}
            onLinkGoogle={async () => {
              setLinkingProvider('google');
              setLinkError(null);
              try {
                await linkGoogle(user);
                const auth = getFirebaseAuth();
                await auth?.currentUser?.reload();
                setUser(auth?.currentUser ?? null);
              } catch (err: unknown) {
                const e = err as { code?: string; message?: string };
                if (e.code === 'auth/credential-already-in-use') {
                  setLinkError('This Google account is already linked to another user.');
                } else if (e.code !== 'auth/popup-closed-by-user') {
                  setLinkError(e.message || 'Failed to link Google account');
                }
              } finally {
                setLinkingProvider(null);
              }
            }}
            onLinkGitHub={async () => {
              setLinkingProvider('github');
              setLinkError(null);
              try {
                await linkGitHub(user);
                const auth = getFirebaseAuth();
                await auth?.currentUser?.reload();
                setUser(auth?.currentUser ?? null);
              } catch (err: unknown) {
                const e = err as { code?: string; message?: string };
                if (e.code === 'auth/credential-already-in-use') {
                  setLinkError('This GitHub account is already linked to another user.');
                } else if (e.code !== 'auth/popup-closed-by-user') {
                  setLinkError(e.message || 'Failed to link GitHub account');
                }
              } finally {
                setLinkingProvider(null);
              }
            }}
            onUnlink={async (providerId: string) => {
              if (user.providerData.length <= 1) {
                setLinkError('You must have at least one sign-in method linked.');
                return;
              }
              setLinkError(null);
              try {
                await unlinkProvider(user, providerId);
                const auth = getFirebaseAuth();
                await auth?.currentUser?.reload();
                setUser(auth?.currentUser ?? null);
              } catch (err: unknown) {
                const e = err as { message?: string };
                setLinkError(e.message || 'Failed to unlink account');
              }
            }}
          />
        )}

        {/* New Key Display */}
        {newKey && (
          <div className="mb-8">
            <KeyDisplay
              apiKey={newKey.api_key}
              label={newKey.label}
              connectorId={newKey.connector_id}
              usage={newKey.usage}
              onDismiss={() => {
                setNewKey(null);
                fetchData();
              }}
            />
          </div>
        )}

        {/* Add Connection */}
        {isSubscribed && (
          <div className="mb-8">
            {!showForm ? (
              <button
                onClick={() => setShowForm(true)}
                className="py-2 px-4 rounded-lg font-medium text-white hover:brightness-110 hover:shadow-md active:scale-[0.98] transition-all duration-200 cursor-pointer"
                style={{ backgroundColor: 'var(--primary)' }}
              >
                + Add Connection
              </button>
            ) : (
              <div className="rounded-lg border border-[var(--border)] p-6 bg-[var(--card)]">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold">New Connection</h3>
                  <button
                    onClick={() => setShowForm(false)}
                    className="text-sm text-[var(--text-secondary)]"
                  >
                    Cancel
                  </button>
                </div>
                <ConnectionForm
                  previewMode={previewMode}
                  onCreated={(result) => {
                    setNewKey(result);
                    setShowForm(false);
                  }}
                />
              </div>
            )}
          </div>
        )}

        {/* Existing Connections */}
        {keys.length > 0 && (
          <div>
            <h3 className="font-semibold mb-3">Your Connections</h3>
            <div className="grid gap-4">
              {keys.map(key => (
                <ConnectionCard
                  key={key.key_prefix}
                  connection={key}
                  previewMode={previewMode}
                  onRevoked={fetchData}
                />
              ))}
            </div>
          </div>
        )}

        {keys.length === 0 && isSubscribed && !showForm && (
          <p className="text-center text-[var(--text-secondary)] py-8">
            No connections yet. Click &quot;Add Connection&quot; to get started.
          </p>
        )}

        {previewMode && (
          <p className="mt-8 text-sm text-[var(--text-secondary)]">
            Preview mode is active. Configure `NEXT_PUBLIC_FIREBASE_*` values in `portal/.env.local`
            to enable real sign-in and live data.
          </p>
        )}
      </main>
    </>
  );
}
