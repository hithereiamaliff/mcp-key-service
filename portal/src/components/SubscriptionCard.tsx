'use client';

import { useState } from 'react';
import { getIdToken } from '@/lib/firebase';

interface Props {
  status: string;
  periodEnd: string | null;
  previewMode?: boolean;
}

export default function SubscriptionCard({ status, periodEnd, previewMode = false }: Props) {
  const [loading, setLoading] = useState(false);

  const isActive = status === 'active';
  const statusColor = isActive ? 'var(--success)' : status === 'past_due' ? 'var(--warning)' : 'var(--text-secondary)';

  async function handleSubscribe() {
    if (previewMode) return;
    setLoading(true);
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
    } finally {
      setLoading(false);
    }
  }

  async function handleManage() {
    if (previewMode) return;
    setLoading(true);
    try {
      const token = await getIdToken();
      const res = await fetch('/api/stripe/create-portal', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch (err) {
      console.error('Portal error:', err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-[var(--border)] p-6 bg-[var(--card)]">
      <h3 className="font-semibold mb-2">Subscription</h3>
      <div className="flex items-center gap-2 mb-4">
        <span
          className="inline-block w-2 h-2 rounded-full"
          style={{ backgroundColor: statusColor }}
        />
        <span className="text-sm capitalize">{status === 'none' ? 'No subscription' : status}</span>
        {periodEnd && isActive && (
          <span className="text-xs text-[var(--text-secondary)] ml-2">
            Renews {new Date(periodEnd).toLocaleDateString()}
          </span>
        )}
      </div>

      {!isActive ? (
        <div>
          <p className="text-sm text-[var(--text-secondary)] mb-3">
            Subscribe to store your MCP server credentials securely.
          </p>
          <p className="text-2xl font-bold mb-4">RM49<span className="text-sm font-normal">/month</span></p>
          <button
            onClick={handleSubscribe}
            disabled={loading || previewMode}
            className="w-full py-2 px-4 rounded-lg font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: 'var(--primary)' }}
          >
            {previewMode ? 'Preview Only' : loading ? 'Loading...' : 'Subscribe Now'}
          </button>
        </div>
      ) : (
        <button
          onClick={handleManage}
          disabled={loading || previewMode}
          className="text-sm px-4 py-2 rounded border border-[var(--border)] hover:bg-[var(--bg-secondary)] disabled:opacity-50"
        >
          {previewMode ? 'Preview Only' : loading ? 'Loading...' : 'Manage Billing'}
        </button>
      )}
    </div>
  );
}
