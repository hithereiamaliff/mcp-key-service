'use client';

import { useState } from 'react';
import { getIdToken } from '@/lib/firebase';

interface KeyMeta {
  key_prefix: string;
  label: string;
  connector_id: string;
  created_at: string;
  last_used: string | null;
  usage_count: number;
  status: string;
}

interface Props {
  connection: KeyMeta;
  previewMode?: boolean;
  onRevoked: () => void;
}

export default function ConnectionCard({ connection, previewMode = false, onRevoked }: Props) {
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleRevoke() {
    if (previewMode) return;
    setLoading(true);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/connections/${encodeURIComponent(connection.key_prefix)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (res.ok) {
        onRevoked();
      }
    } catch (err) {
      console.error('Revoke failed:', err);
    } finally {
      setLoading(false);
      setConfirmRevoke(false);
    }
  }

  const statusColor = connection.status === 'active' ? 'var(--success)' : 'var(--warning)';

  return (
    <div className="rounded-lg border border-[var(--border)] p-4 bg-[var(--card)] hover:bg-[var(--card-hover)] transition-colors">
      <div className="flex items-start justify-between">
        <div>
          <h4 className="font-medium">{connection.label}</h4>
          <p className="text-sm text-[var(--text-secondary)]">{connection.connector_id}</p>
        </div>
        <span
          className="text-xs px-2 py-1 rounded-full capitalize"
          style={{ backgroundColor: statusColor, color: 'white' }}
        >
          {connection.status}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-4 text-sm text-[var(--text-secondary)]">
        <div>
          <span className="block text-xs">Key Prefix</span>
          <code className="text-xs">{connection.key_prefix}</code>
        </div>
        <div>
          <span className="block text-xs">Created</span>
          {new Date(connection.created_at).toLocaleDateString()}
        </div>
        <div>
          <span className="block text-xs">Usage</span>
          {connection.usage_count} resolve{connection.usage_count !== 1 ? 's' : ''}
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        {!confirmRevoke ? (
          <button
            onClick={() => setConfirmRevoke(true)}
            disabled={previewMode}
            className="text-xs px-3 py-1 rounded border border-[var(--border)] hover:bg-[var(--bg-secondary)]"
            style={{ color: 'var(--danger)' }}
          >
            {previewMode ? 'Preview' : 'Revoke'}
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={handleRevoke}
              disabled={loading}
              className="text-xs px-3 py-1 rounded text-white disabled:opacity-50"
              style={{ backgroundColor: 'var(--danger)' }}
            >
              {loading ? 'Revoking...' : 'Confirm Revoke'}
            </button>
            <button
              onClick={() => setConfirmRevoke(false)}
              className="text-xs px-3 py-1 rounded border border-[var(--border)]"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
