import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth';
import { backendFetch } from '@/lib/api-client';

// GET /api/connections — list user's keys
export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (auth.error) return auth.error;

  // Forward the user's Firebase token to the Express user endpoint
  const token = req.headers.get('authorization')!.slice(7);
  const res = await backendFetch('/api/user/keys', {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` },
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

// POST /api/connections — register a new key
export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (auth.error) return auth.error;

  const body = await req.json();
  const token = req.headers.get('authorization')!.slice(7);

  const res = await backendFetch('/api/register', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
