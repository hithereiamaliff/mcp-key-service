import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth';
import { backendFetch } from '@/lib/api-client';

// DELETE /api/connections/:prefix — revoke user's own key
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ prefix: string }> }
) {
  const auth = await authenticateRequest(req);
  if (auth.error) return auth.error;

  const { prefix } = await params;
  const token = req.headers.get('authorization')!.slice(7);

  const res = await backendFetch(`/api/user/keys/${encodeURIComponent(prefix)}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` },
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
