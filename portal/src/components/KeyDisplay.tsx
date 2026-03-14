'use client';

import { useState } from 'react';

interface Props {
  apiKey: string;
  label: string;
  connectorId: string;
  usage: {
    url_example: string;
    supported_servers: string[];
  };
  onDismiss: () => void;
}

export default function KeyDisplay({ apiKey, label, usage, onDismiss }: Props) {
  const [copied, setCopied] = useState<'key' | 'url' | null>(null);

  function copyToClipboard(text: string, type: 'key' | 'url') {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="rounded-lg border-2 p-6 bg-[var(--card)]" style={{ borderColor: 'var(--success)' }}>
      <h3 className="font-semibold text-lg mb-1" style={{ color: 'var(--success)' }}>
        Connection Created: {label}
      </h3>
      <p className="text-sm text-[var(--text-secondary)] mb-4">
        Save this API key now — it cannot be retrieved later.
      </p>

      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">API Key</label>
          <div className="flex gap-2">
            <code className="flex-1 px-3 py-2 rounded bg-[var(--bg-secondary)] text-sm font-mono break-all">
              {apiKey}
            </code>
            <button
              onClick={() => copyToClipboard(apiKey, 'key')}
              className="px-3 py-2 rounded border border-[var(--border)] text-sm hover:bg-[var(--bg-secondary)]"
            >
              {copied === 'key' ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">MCP Server URL</label>
          <div className="flex gap-2">
            <code className="flex-1 px-3 py-2 rounded bg-[var(--bg-secondary)] text-sm font-mono break-all">
              {usage.url_example}
            </code>
            <button
              onClick={() => copyToClipboard(usage.url_example, 'url')}
              className="px-3 py-2 rounded border border-[var(--border)] text-sm hover:bg-[var(--bg-secondary)]"
            >
              {copied === 'url' ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      </div>

      <button
        onClick={onDismiss}
        className="mt-4 text-sm px-4 py-2 rounded border border-[var(--border)] hover:bg-[var(--bg-secondary)]"
      >
        I've saved my key
      </button>
    </div>
  );
}
