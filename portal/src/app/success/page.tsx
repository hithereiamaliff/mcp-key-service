'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';

export default function SuccessPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to dashboard after 3 seconds
    const timer = setTimeout(() => router.push('/dashboard'), 3000);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <>
      <Navbar />
      <main className="max-w-lg mx-auto mt-20 px-6 text-center">
        <div className="rounded-lg border border-[var(--border)] p-8 bg-[var(--card)]">
          <div className="text-4xl mb-4" style={{ color: 'var(--success)' }}>&#10003;</div>
          <h1 className="text-2xl font-bold mb-2">Payment Successful!</h1>
          <p className="text-[var(--text-secondary)] mb-4">
            Your subscription is now active. You can start adding MCP server connections.
          </p>
          <p className="text-sm text-[var(--text-secondary)]">
            Redirecting to dashboard...
          </p>
        </div>
      </main>
    </>
  );
}
