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
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
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
  const usableKeyCount = keys.filter(key => key.status !== 'suspended').length;
  const canAddConnection = isSubscribed || usableKeyCount === 0;

  async function handleUpgrade() {
    if (previewMode) return;
    try {
      const token = await getIdToken();
      const res = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch (err) {
      console.error('Checkout error:', err);
    }
  }

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
            <p className="text-3xl font-bold">{usableKeyCount}</p>
            <p className="text-sm text-[var(--text-secondary)]">active connection{usableKeyCount !== 1 ? 's' : ''}</p>
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
        {canAddConnection && (
          <div className="mb-8">
            {!showForm ? (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowForm(true)}
                  className="py-2 px-4 rounded-lg font-medium text-white hover:brightness-110 hover:shadow-md active:scale-[0.98] transition-all duration-200 cursor-pointer"
                  style={{ backgroundColor: 'var(--primary)' }}
                >
                  + Add Connection
                </button>
                {!isSubscribed && keys.length === 0 && (
                  <span className="text-xs text-[var(--text-secondary)]">1 free connection included</span>
                )}
              </div>
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
                  onSubscriptionRequired={() => {
                    setShowForm(false);
                    setShowUpgradeModal(true);
                    void fetchData();
                  }}
                />
              </div>
            )}
          </div>
        )}

        {/* Upgrade prompt for free users who have used their free connection */}
        {!isSubscribed && usableKeyCount > 0 && (
          <div className="mb-8">
            <button
              onClick={() => setShowUpgradeModal(true)}
              className="py-2 px-4 rounded-lg font-medium text-white hover:brightness-110 hover:shadow-md active:scale-[0.98] transition-all duration-200 cursor-pointer"
              style={{ backgroundColor: 'var(--primary)' }}
            >
              + Add Connection
            </button>
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

        {keys.length === 0 && !showForm && (
          <p className="text-center text-[var(--text-secondary)] py-8">
            No connections yet. Click &quot;Add Connection&quot; to get started — your first one is free.
          </p>
        )}

        {previewMode && (
          <p className="mt-8 text-sm text-[var(--text-secondary)]">
            Preview mode is active. Configure `NEXT_PUBLIC_FIREBASE_*` values in `portal/.env.local`
            to enable real sign-in and live data.
          </p>
        )}

        {/* Upgrade Modal */}
        {showUpgradeModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowUpgradeModal(false)}>
            <div
              className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-8 max-w-md w-full mx-4 shadow-xl"
              onClick={e => e.stopPropagation()}
            >
              <h2 className="text-xl font-bold mb-2">Upgrade to add more connections</h2>
              <p className="text-[var(--text-secondary)] mb-6">
                Your free plan includes 1 connection. Subscribe to create unlimited MCP connections.
              </p>
              <p className="text-2xl font-bold mb-6">RM49<span className="text-sm font-normal">/month</span></p>
              <div className="flex gap-3">
                <button
                  onClick={handleUpgrade}
                  className="flex-1 py-2 px-4 rounded-lg font-medium text-white hover:brightness-110 hover:shadow-md active:scale-[0.98] transition-all duration-200 cursor-pointer"
                  style={{ backgroundColor: 'var(--primary)' }}
                >
                  Subscribe Now
                </button>
                <button
                  onClick={() => setShowUpgradeModal(false)}
                  className="flex-1 py-2 px-4 rounded-lg font-medium border border-[var(--border)] hover:bg-[var(--bg-secondary)] transition-all duration-200 cursor-pointer"
                >
                  Maybe Later
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
