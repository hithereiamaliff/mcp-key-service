import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth';
import { getStripe } from '@/lib/stripe';
import { backendFetch } from '@/lib/api-client';

// POST /api/stripe/create-portal — Stripe billing portal session
export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (auth.error) return auth.error;

  // Get user's Stripe customer ID from Express backend
  const token = req.headers.get('authorization')!.slice(7);
  const profileRes = await backendFetch('/api/user/profile', {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` },
  });

  if (!profileRes.ok) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  // Look up the user's Stripe customer from the admin endpoint
  const userRes = await backendFetch(`/admin/users`);
  const { users } = await userRes.json();
  const user = users?.find((u: { firebase_uid: string }) => u.firebase_uid === auth.user!.uid);

  if (!user?.stripe_customer_id) {
    return NextResponse.json({ error: 'No active subscription found' }, { status: 404 });
  }

  const stripe = getStripe();
  const origin = req.headers.get('origin') || 'https://mcpkeys.techmavie.digital';

  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripe_customer_id,
    return_url: `${origin}/dashboard`,
  });

  return NextResponse.json({ url: session.url });
}
