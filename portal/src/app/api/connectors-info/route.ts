import { NextResponse } from 'next/server';
import { backendGet } from '@/lib/api-client';

// GET /api/connectors-info — proxy public connectors list from Express
export async function GET() {
  const res = await backendGet('/api/connectors');
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
