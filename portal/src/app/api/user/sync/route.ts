import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth';
import { backendPost } from '@/lib/api-client';

// POST /api/user/sync — sync Firebase user to Express backend
export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (auth.error) return auth.error;

  const { display_name } = await req.json().catch(() => ({ display_name: null }));

  const res = await backendPost('/admin/users', {
    firebase_uid: auth.user!.uid,
    email: auth.user!.email,
    display_name,
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
