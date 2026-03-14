import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { backendPut, backendPost, backendGet } from '@/lib/api-client';
import type Stripe from 'stripe';

// Processed event IDs to prevent duplicate handling
const processedEvents = new Set<string>();
const MAX_PROCESSED = 10000;

function markProcessed(eventId: string) {
  if (processedEvents.size >= MAX_PROCESSED) {
    // Evict oldest entries (Set maintains insertion order)
    const iter = processedEvents.values();
    for (let i = 0; i < 1000; i++) iter.next();
    // Rebuild with remaining
    const remaining = [...processedEvents].slice(1000);
    processedEvents.clear();
    remaining.forEach(id => processedEvents.add(id));
  }
  processedEvents.add(eventId);
}

// POST /api/stripe/webhook — handle Stripe webhook events
export async function POST(req: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
  }

  const body = await req.text();
  const sig = req.headers.get('stripe-signature');

  if (!sig) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', (err as Error).message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Idempotency check
  if (processedEvents.has(event.id)) {
    return NextResponse.json({ received: true, deduplicated: true });
  }
  markProcessed(event.id);

  const priceId = process.env.STRIPE_PRICE_ID;

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;

        // Only process subscriptions for our price — ignore Ghost/other products
        if (priceId && !subscriptionMatchesPrice(subscription, priceId)) {
          console.log(`Ignoring ${event.type}: subscription ${subscription.id} does not match our price`);
          break;
        }

        const customerId = subscription.customer as string;
        const uid = await findUidByCustomer(customerId, subscription);

        if (uid) {
          await backendPut(`/admin/users/${uid}/subscription`, {
            stripe_customer_id: customerId,
            subscription_status: subscription.status,
            subscription_id: subscription.id,
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          });

          // Reactivate keys if subscription became active
          if (subscription.status === 'active') {
            await backendPost(`/admin/users/${uid}/reactivate-keys`, {});
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;

        if (priceId && !subscriptionMatchesPrice(subscription, priceId)) {
          console.log(`Ignoring ${event.type}: subscription ${subscription.id} does not match our price`);
          break;
        }

        const customerId = subscription.customer as string;
        const uid = await findUidByCustomer(customerId, subscription);

        if (uid) {
          await backendPut(`/admin/users/${uid}/subscription`, {
            stripe_customer_id: customerId,
            subscription_status: 'canceled',
            subscription_id: subscription.id,
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          });
          // Suspend keys (grace period: keys stay active until current_period_end)
          await backendPost(`/admin/users/${uid}/suspend-keys`, {});
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;

        if (priceId && !invoiceMatchesPrice(invoice, priceId)) {
          console.log(`Ignoring ${event.type}: invoice ${invoice.id} does not match our price`);
          break;
        }

        const customerId = invoice.customer as string;
        const uid = await findUidByCustomer(customerId);

        if (uid) {
          await backendPut(`/admin/users/${uid}/subscription`, {
            stripe_customer_id: customerId,
            subscription_status: 'past_due',
            subscription_id: (invoice.subscription as string) || null,
            current_period_end: null,
          });
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;

        if (priceId && !invoiceMatchesPrice(invoice, priceId)) {
          console.log(`Ignoring ${event.type}: invoice ${invoice.id} does not match our price`);
          break;
        }

        const customerId = invoice.customer as string;
        const uid = await findUidByCustomer(customerId);

        if (uid) {
          await backendPost(`/admin/users/${uid}/reactivate-keys`, {});
        }
        break;
      }
    }
  } catch (err) {
    console.error(`Webhook handler error for ${event.type}:`, err);
    // Return 200 to prevent Stripe from retrying — we'll handle via reconciliation
  }

  return NextResponse.json({ received: true });
}

// Find Firebase UID from Stripe customer ID
async function findUidByCustomer(
  customerId: string,
  subscription?: Stripe.Subscription
): Promise<string | null> {
  // First check subscription metadata for firebase_uid
  if (subscription?.metadata?.firebase_uid) {
    return subscription.metadata.firebase_uid;
  }

  // Fall back to looking up by stripe_customer_id in our user table
  const res = await backendGet('/admin/users');
  if (!res.ok) return null;

  const { users } = await res.json();
  const user = users?.find(
    (u: { stripe_customer_id: string | null }) => u.stripe_customer_id === customerId
  );
  return user?.firebase_uid || null;
}

// Check if a subscription contains a line item matching our price ID
function subscriptionMatchesPrice(subscription: Stripe.Subscription, priceId: string): boolean {
  const items = subscription.items?.data;
  if (!items) return false;
  return items.some(item => item.price?.id === priceId);
}

// Check if an invoice contains a line item matching our price ID
function invoiceMatchesPrice(invoice: Stripe.Invoice, priceId: string): boolean {
  const lines = invoice.lines?.data;
  if (!lines) return false;
  return lines.some(line => line.price?.id === priceId);
}
