import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth';
import { backendGet } from '@/lib/api-client';

// GET /api/admin/users — list all users (admin only)
export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (auth.error) return auth.error;

  // Check admin status
  const adminCheck = await checkAdmin(auth.user!.uid);
  if (!adminCheck) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const res = await backendGet('/admin/users');
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

async function checkAdmin(uid: string): Promise<boolean> {
  // Check env-based admin list
  const adminUids = (process.env.ADMIN_UIDS || '').split(',').filter(Boolean);
  if (adminUids.includes(uid)) return true;

  // Check DB-based admin flag via backend
  const res = await backendGet('/admin/users');
  if (!res.ok) return false;

  const { users } = await res.json();
  const user = users?.find((u: { firebase_uid: string }) => u.firebase_uid === uid);
  return user?.is_admin === 1;
}
