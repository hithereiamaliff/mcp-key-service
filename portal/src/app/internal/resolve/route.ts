import { NextRequest, NextResponse } from 'next/server';

const KEY_SERVICE_URL = process.env.KEY_SERVICE_URL || 'http://mcp-key-service:8090';

export const dynamic = 'force-dynamic';

// Public proxy for MCP servers that need to reach the internal resolver through the portal hostname.
export async function POST(req: NextRequest) {
  const authorization = req.headers.get('authorization');
  const contentType = req.headers.get('content-type') || 'application/json';
  const body = await req.text();

  try {
    const upstream = await fetch(`${KEY_SERVICE_URL}/internal/resolve`, {
      method: 'POST',
      headers: {
        ...(authorization ? { Authorization: authorization } : {}),
        'Content-Type': contentType,
      },
      body,
      cache: 'no-store',
    });

    const responseBody = await upstream.text();
    const responseContentType = upstream.headers.get('content-type') || 'application/json';

    return new NextResponse(responseBody, {
      status: upstream.status,
      headers: {
        'Content-Type': responseContentType,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Internal resolve proxy failed:', error);
    return NextResponse.json(
      { valid: false, error: 'Key service unavailable' },
      { status: 503 }
    );
  }
}
