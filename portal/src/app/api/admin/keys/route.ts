import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth';
import { backendGet, backendDelete } from '@/lib/api-client';

// GET /api/admin/keys — list all keys (admin only)
export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (auth.error) return auth.error;

  if (!isAdmin(auth.user!.uid)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const res = await backendGet('/admin/keys');
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

// DELETE /api/admin/keys?prefix=xxx — revoke any key (admin only)
export async function DELETE(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (auth.error) return auth.error;

  if (!isAdmin(auth.user!.uid)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const prefix = req.nextUrl.searchParams.get('prefix');
  if (!prefix) {
    return NextResponse.json({ error: 'prefix is required' }, { status: 400 });
  }

  const res = await backendDelete(`/admin/keys/${encodeURIComponent(prefix)}`);
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

function isAdmin(uid: string): boolean {
  const adminUids = (process.env.ADMIN_UIDS || '').split(',').filter(Boolean);
  return adminUids.includes(uid);
}
