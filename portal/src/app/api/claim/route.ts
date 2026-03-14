import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth';
import { backendFetch } from '@/lib/api-client';

// POST /api/claim — claim a legacy key
export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (auth.error) return auth.error;

  const body = await req.json();
  const token = req.headers.get('authorization')!.slice(7);

  const res = await backendFetch('/api/user/claim-key', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
