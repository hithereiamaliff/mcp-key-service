import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth';
import { getStripe } from '@/lib/stripe';

// POST /api/stripe/create-checkout — create a Stripe checkout session
export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (auth.error) return auth.error;

  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
  }

  const stripe = getStripe();
  const origin = req.headers.get('origin') || 'https://mcpkeys.techmavie.digital';

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/dashboard`,
    client_reference_id: auth.user!.uid,
    customer_email: auth.user!.email,
    metadata: {
      firebase_uid: auth.user!.uid,
    },
    subscription_data: {
      metadata: {
        firebase_uid: auth.user!.uid,
      },
    },
  });

  return NextResponse.json({ url: session.url });
}
