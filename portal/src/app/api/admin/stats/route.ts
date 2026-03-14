import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth';
import { backendGet } from '@/lib/api-client';

// GET /api/admin/stats — service stats (admin only)
export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (auth.error) return auth.error;

  const adminUids = (process.env.ADMIN_UIDS || '').split(',').filter(Boolean);
  if (!adminUids.includes(auth.user!.uid)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const res = await backendGet('/admin/stats');
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
