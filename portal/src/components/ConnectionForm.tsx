'use client';

import { useState, useEffect } from 'react';
import { getIdToken } from '@/lib/firebase';

interface ConnectorField {
  key: string;
  label: string;
  type: 'text' | 'url' | 'password';
  required: boolean;
  placeholder?: string;
  helpText?: string;
}

interface Connector {
  label: string;
  fields: ConnectorField[];
  servers: string[];
}

interface Props {
  previewMode?: boolean;
  onCreated: (result: { api_key: string; label: string; connector_id: string; usage: { url_example: string; supported_servers: string[] } }) => void;
}

export default function ConnectionForm({ onCreated, previewMode = false }: Props) {
  const [connectors, setConnectors] = useState<Record<string, Connector>>({});
  const [selectedConnector, setSelectedConnector] = useState('');
  const [label, setLabel] = useState('');
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Fetch connectors from the Express backend (public endpoint)
    fetch('/api/connectors-info')
      .then(res => res.json())
      .then(data => {
        setConnectors(data.connectors || {});
        const ids = Object.keys(data.connectors || {});
        if (ids.length > 0) setSelectedConnector(ids[0]);
      })
      .catch(() => setError('Failed to load connectors'));
  }, []);

  const connector = connectors[selectedConnector];

  function handleCredentialChange(fieldName: string, value: string) {
    setCredentials(prev => ({ ...prev, [fieldName]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (previewMode) {
        onCreated({
          api_key: `usr_preview_${selectedConnector}_${Date.now()}`,
          label: label || 'Preview Connection',
          connector_id: selectedConnector,
          usage: {
            url_example: `https://mcp.techmavie.digital/${selectedConnector}/mcp?api_key=usr_preview_${selectedConnector}`,
            supported_servers: connector?.servers || [selectedConnector],
          },
        });
        setLabel('');
        setCredentials({});
        return;
      }

      const token = await getIdToken();
      const res = await fetch('/api/connections', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          label,
          connector_id: selectedConnector,
          credentials,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Registration failed');
        return;
      }

      onCreated(data);
      setLabel('');
      setCredentials({});
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Connection Label</label>
        <input
          type="text"
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder="e.g. My Nextcloud"
          maxLength={100}
          required
          className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)]"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">MCP Server</label>
        <select
          value={selectedConnector}
          onChange={e => {
            setSelectedConnector(e.target.value);
            setCredentials({});
          }}
          className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)]"
        >
          {Object.entries(connectors).map(([id, c]) => (
            <option key={id} value={id}>{c.label}</option>
          ))}
        </select>
      </div>

      {connector?.fields.map(field => (
        <div key={field.key}>
          <label className="block text-sm font-medium mb-1">{field.label}</label>
          <input
            type={field.type === 'password' ? 'password' : 'text'}
            value={credentials[field.key] || ''}
            onChange={e => handleCredentialChange(field.key, e.target.value)}
            placeholder={field.placeholder || ''}
            required={field.required}
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)]"
          />
          {field.helpText && (
            <p className="mt-1 text-xs text-[var(--text-secondary)]">{field.helpText}</p>
          )}
        </div>
      ))}

      {error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}

      {previewMode && (
        <p className="text-xs text-[var(--text-secondary)]">
          Submitting here generates a local preview key only. No credentials are sent anywhere.
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-2 px-4 rounded-lg font-medium text-white disabled:opacity-50"
        style={{ backgroundColor: 'var(--primary)' }}
      >
        {loading ? 'Registering...' : 'Add Connection'}
      </button>
    </form>
  );
}
