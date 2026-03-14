import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from './firebase-admin';

// Authenticate a portal API request, returning the Firebase user
export async function authenticateRequest(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (!token) {
    return { error: NextResponse.json({ error: 'Authorization required' }, { status: 401 }) };
  }

  try {
    const decoded = await verifyIdToken(token);
    return { user: { uid: decoded.uid, email: decoded.email || '' } };
  } catch {
    return { error: NextResponse.json({ error: 'Invalid token' }, { status: 401 }) };
  }
}
