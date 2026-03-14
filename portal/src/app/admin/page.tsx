'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthChange, getIdToken, isFirebaseClientConfigured } from '@/lib/firebase';
import Navbar from '@/components/Navbar';
import type { User } from 'firebase/auth';

interface UserRow {
  firebase_uid: string;
  email: string;
  display_name: string | null;
  subscription_status: string;
  is_admin: number;
  created_at: string;
}

interface KeyMeta {
  key_prefix: string;
  label: string;
  connector_id: string;
  created_at: string;
  usage_count: number;
  user_id: string | null;
  status: string;
}

interface Stats {
  totalKeys: number;
  totalRevoked: number;
  totalValidations: number;
  totalUsers: number;
  byConnector: Record<string, number>;
}

export default function AdminPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [keys, setKeys] = useState<KeyMeta[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'stats' | 'users' | 'keys'>('stats');
  const [previewMode, setPreviewMode] = useState(false);
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

  useEffect(() => {
    if (previewMode) {
      setUsers([
        {
          firebase_uid: 'preview-admin',
          email: 'admin@techmavie.digital',
          display_name: 'Preview Admin',
          subscription_status: 'active',
          is_admin: 1,
          created_at: new Date().toISOString(),
        },
        {
          firebase_uid: 'preview-user',
          email: 'user@techmavie.digital',
          display_name: 'Preview User',
          subscription_status: 'past_due',
          is_admin: 0,
          created_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
        },
      ]);
      setKeys([
        {
          key_prefix: 'usr_preview01...a1b2',
          label: 'Main Nextcloud',
          connector_id: 'nextcloud',
          created_at: new Date().toISOString(),
          usage_count: 24,
          user_id: 'preview-user',
          status: 'active',
        },
        {
          key_prefix: 'usr_preview02...c3d4',
          label: 'Traffic Research',
          connector_id: 'datagovmy',
          created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          usage_count: 3,
          user_id: null,
          status: 'suspended',
        },
      ]);
      setStats({
        totalKeys: 2,
        totalRevoked: 1,
        totalValidations: 27,
        totalUsers: 2,
        byConnector: {
          nextcloud: 1,
          datagovmy: 1,
        },
      });
      setLoading(false);
      return;
    }

    const unsub = onAuthChange((u) => {
      setUser(u);
      setLoading(false);
      if (!u) router.push('/');
    });
    return unsub;
  }, [previewMode, router]);

  useEffect(() => {
    if (!previewMode && user) fetchAll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewMode, user]);

  async function fetchAll() {
    const token = await getIdToken();
    if (!token) return;
    const headers = { 'Authorization': `Bearer ${token}` };

    try {
      const [usersRes, keysRes, statsRes] = await Promise.all([
        fetch('/api/admin/users', { headers }),
        fetch('/api/admin/keys', { headers }),
        fetch('/api/admin/stats', { headers }),
      ]);

      if (usersRes.status === 403) {
        setError('You do not have admin access.');
        return;
      }

      if (usersRes.ok) {
        const data = await usersRes.json();
        setUsers(data.users || []);
      }
      if (keysRes.ok) {
        const data = await keysRes.json();
        setKeys(data.keys || []);
      }
      if (statsRes.ok) {
        setStats(await statsRes.json());
      }
    } catch {
      setError('Failed to load admin data');
    }
  }

  async function revokeKey(prefix: string) {
    if (previewMode) return;
    const token = await getIdToken();
    await fetch(`/api/admin/keys?prefix=${encodeURIComponent(prefix)}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    fetchAll();
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-[var(--text-secondary)]">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <>
        <Navbar />
        <main className="max-w-4xl mx-auto px-6 py-8">
          <p style={{ color: 'var(--danger)' }}>{error}</p>
          <a href="/dashboard" className="text-sm underline mt-2 block">Back to Dashboard</a>
        </main>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <main className="max-w-6xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold mb-6">Admin Dashboard</h1>

        {previewMode && (
          <div className="mb-6 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-4 text-sm text-[var(--text-secondary)]">
            Preview mode is active. This page is showing mock data because Firebase auth
            hasn&apos;t been configured locally yet.
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-[var(--border)]">
          {(['stats', 'users', 'keys'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px ${
                tab === t
                  ? 'border-[var(--primary)] text-[var(--primary)]'
                  : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text)]'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Stats Tab */}
        {tab === 'stats' && stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Active Keys" value={stats.totalKeys} />
            <StatCard label="Revoked Keys" value={stats.totalRevoked} />
            <StatCard label="Total Resolves" value={stats.totalValidations} />
            <StatCard label="Users" value={stats.totalUsers} />
            {Object.entries(stats.byConnector).map(([id, count]) => (
              <StatCard key={id} label={id} value={count} />
            ))}
          </div>
        )}

        {/* Users Tab */}
        {tab === 'users' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left">
                  <th className="py-2 pr-4">Email</th>
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Subscription</th>
                  <th className="py-2 pr-4">Admin</th>
                  <th className="py-2">Joined</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.firebase_uid} className="border-b border-[var(--border)]">
                    <td className="py-2 pr-4">{u.email}</td>
                    <td className="py-2 pr-4">{u.display_name || '-'}</td>
                    <td className="py-2 pr-4 capitalize">{u.subscription_status}</td>
                    <td className="py-2 pr-4">{u.is_admin ? 'Yes' : 'No'}</td>
                    <td className="py-2">{new Date(u.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Keys Tab */}
        {tab === 'keys' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left">
                  <th className="py-2 pr-4">Prefix</th>
                  <th className="py-2 pr-4">Label</th>
                  <th className="py-2 pr-4">Connector</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Usage</th>
                  <th className="py-2 pr-4">Owner</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {keys.map(k => (
                  <tr key={k.key_prefix} className="border-b border-[var(--border)]">
                    <td className="py-2 pr-4"><code className="text-xs">{k.key_prefix}</code></td>
                    <td className="py-2 pr-4">{k.label}</td>
                    <td className="py-2 pr-4">{k.connector_id}</td>
                    <td className="py-2 pr-4 capitalize">{k.status}</td>
                    <td className="py-2 pr-4">{k.usage_count}</td>
                    <td className="py-2 pr-4">{k.user_id || 'legacy'}</td>
                    <td className="py-2">
                      <button
                        onClick={() => revokeKey(k.key_prefix)}
                        disabled={previewMode}
                        className="text-xs px-2 py-1 rounded"
                        style={{ color: 'var(--danger)' }}
                      >
                        {previewMode ? 'Preview' : 'Revoke'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-[var(--border)] p-4 bg-[var(--card)]">
      <p className="text-sm text-[var(--text-secondary)]">{label}</p>
      <p className="text-2xl font-bold">{value.toLocaleString()}</p>
    </div>
  );
}
