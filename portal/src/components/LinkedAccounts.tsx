'use client';

import type { User } from 'firebase/auth';

interface Props {
  user: User;
  linkingProvider: 'google' | 'github' | null;
  linkError: string | null;
  onLinkGoogle: () => void;
  onLinkGitHub: () => void;
  onUnlink: (providerId: string) => void;
}

export default function LinkedAccounts({ user, linkingProvider, linkError, onLinkGoogle, onLinkGitHub, onUnlink }: Props) {
  const providerIds = user.providerData.map(p => p.providerId);
  const hasGoogle = providerIds.includes('google.com');
  const hasGitHub = providerIds.includes('github.com');
  const canUnlink = user.providerData.length > 1;

  return (
    <div className="rounded-lg border border-[var(--border)] p-6 bg-[var(--card)] mb-8">
      <h3 className="font-semibold mb-1">Linked Accounts</h3>
      <p className="text-sm text-[var(--text-secondary)] mb-4">
        Link multiple sign-in methods to your account for easier access.
      </p>

      {linkError && (
        <div className="mb-4 p-3 rounded-lg border border-[var(--danger)] bg-[var(--bg-secondary)]">
          <p className="text-sm" style={{ color: 'var(--danger)' }}>{linkError}</p>
        </div>
      )}

      <div className="space-y-3">
        {/* Google */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-secondary)]">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <div>
              <p className="font-medium text-sm">Google</p>
              <p className="text-xs text-[var(--text-secondary)]">
                {hasGoogle ? 'Connected' : 'Not connected'}
              </p>
            </div>
          </div>
          {hasGoogle ? (
            <button
              onClick={() => onUnlink('google.com')}
              disabled={!canUnlink}
              className="px-3 py-1.5 text-sm rounded-lg border border-[var(--danger)] hover:bg-[var(--bg)] active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ color: 'var(--danger)' }}
            >
              Unlink
            </button>
          ) : (
            <button
              onClick={onLinkGoogle}
              disabled={linkingProvider === 'google'}
              className="px-3 py-1.5 text-sm rounded-lg border border-[var(--primary)] hover:bg-[var(--bg)] active:scale-[0.98] transition-all duration-200 disabled:opacity-50"
              style={{ color: 'var(--primary)' }}
            >
              {linkingProvider === 'google' ? 'Linking...' : 'Link'}
            </button>
          )}
        </div>

        {/* GitHub */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-secondary)]">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
            </svg>
            <div>
              <p className="font-medium text-sm">GitHub</p>
              <p className="text-xs text-[var(--text-secondary)]">
                {hasGitHub ? 'Connected' : 'Not connected'}
              </p>
            </div>
          </div>
          {hasGitHub ? (
            <button
              onClick={() => onUnlink('github.com')}
              disabled={!canUnlink}
              className="px-3 py-1.5 text-sm rounded-lg border border-[var(--danger)] hover:bg-[var(--bg)] active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ color: 'var(--danger)' }}
            >
              Unlink
            </button>
          ) : (
            <button
              onClick={onLinkGitHub}
              disabled={linkingProvider === 'github'}
              className="px-3 py-1.5 text-sm rounded-lg border border-[var(--primary)] hover:bg-[var(--bg)] active:scale-[0.98] transition-all duration-200 disabled:opacity-50"
              style={{ color: 'var(--primary)' }}
            >
              {linkingProvider === 'github' ? 'Linking...' : 'Link'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
