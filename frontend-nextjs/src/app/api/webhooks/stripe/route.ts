/**
 * Stripe Webhook Handler
 *
 * Receives and processes Stripe webhook events to keep billing state in sync.
 * Handles subscription, invoice, payment method, and customer events.
 *
 * Security:
 * - Verifies webhook signatures using STRIPE_WEBHOOK_SECRET
 * - No authentication middleware (Stripe can't authenticate)
 * - Idempotent event handling via stripe_event_id
 */

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { constructWebhookEvent, isBillingConfigured } from '@/lib/integrations/stripe/billing';
import { isBillingEnabled } from '@/lib/utils/deployment';
import { initializeBillingCycle } from '@/lib/billing/cycle-service';
import type { BillingStatus } from '@/lib/supabase/types';

// ============================================
// Types
// ============================================

interface WebhookResult {
  success: boolean;
  message: string;
  eventId?: string;
}

// ============================================
// Event Handlers
// ============================================

/**
 * Handles subscription created event.
 */
async function handleSubscriptionCreated(
  subscription: Stripe.Subscription,
  supabase: Awaited<ReturnType<typeof createServerClient>>
): Promise<void> {
  const customerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;

  // Find workspace by customer ID
  const workspace = await findWorkspaceByCustomerId(customerId, supabase);
  if (!workspace) {
    console.warn(`[Webhook] No workspace found for customer ${customerId}`);
    return;
  }

  // Update billing status
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('workspace_billing')
    .update({
      status: mapSubscriptionStatus(subscription.status),
      stripe_subscription_id: subscription.id,
    })
    .eq('workspace_id', workspace.id);

  // Initialize billing cycle
  await initializeBillingCycle(workspace.id, new Date());

  console.log(
    `[Webhook] Subscription created for workspace ${workspace.id}: ${subscription.id}`
  );
}

/**
 * Handles subscription updated event.
 */
async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription,
  supabase: Awaited<ReturnType<typeof createServerClient>>
): Promise<void> {
  const customerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;

  const workspace = await findWorkspaceByCustomerId(customerId, supabase);
  if (!workspace) {
    console.warn(`[Webhook] No workspace found for customer ${customerId}`);
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('workspace_billing')
    .update({
      status: mapSubscriptionStatus(subscription.status),
    })
    .eq('workspace_id', workspace.id);

  console.log(
    `[Webhook] Subscription updated for workspace ${workspace.id}: status=${subscription.status}`
  );
}

/**
 * Handles subscription deleted event.
 */
async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription,
  supabase: Awaited<ReturnType<typeof createServerClient>>
): Promise<void> {
  const customerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;

  const workspace = await findWorkspaceByCustomerId(customerId, supabase);
  if (!workspace) {
    console.warn(`[Webhook] No workspace found for customer ${customerId}`);
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('workspace_billing')
    .update({
      status: 'cancelled' as BillingStatus,
      stripe_subscription_id: null,
    })
    .eq('workspace_id', workspace.id);

  console.log(`[Webhook] Subscription deleted for workspace ${workspace.id}`);
}

/**
 * Handles subscription paused event.
 */
async function handleSubscriptionPaused(
  subscription: Stripe.Subscription,
  supabase: Awaited<ReturnType<typeof createServerClient>>
): Promise<void> {
  const customerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;

  const workspace = await findWorkspaceByCustomerId(customerId, supabase);
  if (!workspace) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('workspace_billing')
    .update({
      status: 'cancelled' as BillingStatus, // Treat paused as cancelled for access control
    })
    .eq('workspace_id', workspace.id);

  console.log(`[Webhook] Subscription paused for workspace ${workspace.id}`);
}

/**
 * Handles subscription resumed event.
 */
async function handleSubscriptionResumed(
  subscription: Stripe.Subscription,
  supabase: Awaited<ReturnType<typeof createServerClient>>
): Promise<void> {
  const customerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;

  const workspace = await findWorkspaceByCustomerId(customerId, supabase);
  if (!workspace) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('workspace_billing')
    .update({
      status: 'active' as BillingStatus,
    })
    .eq('workspace_id', workspace.id);

  console.log(`[Webhook] Subscription resumed for workspace ${workspace.id}`);
}

/**
 * Handles invoice paid event.
 */
async function handleInvoicePaid(
  invoice: Stripe.Invoice,
  supabase: Awaited<ReturnType<typeof createServerClient>>
): Promise<void> {
  const customerId =
    typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
  if (!customerId) return;

  const workspace = await findWorkspaceByCustomerId(customerId, supabase);
  if (!workspace) return;

  // Update status to active if it was past_due
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('workspace_billing')
    .update({
      status: 'active' as BillingStatus,
    })
    .eq('workspace_id', workspace.id)
    .eq('status', 'past_due');

  console.log(`[Webhook] Invoice paid for workspace ${workspace.id}: ${invoice.id}`);
}

/**
 * Handles invoice payment failed event.
 */
async function handleInvoicePaymentFailed(
  invoice: Stripe.Invoice,
  supabase: Awaited<ReturnType<typeof createServerClient>>
): Promise<void> {
  const customerId =
    typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
  if (!customerId) return;

  const workspace = await findWorkspaceByCustomerId(customerId, supabase);
  if (!workspace) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('workspace_billing')
    .update({
      status: 'past_due' as BillingStatus,
    })
    .eq('workspace_id', workspace.id);

  console.log(`[Webhook] Invoice payment failed for workspace ${workspace.id}: ${invoice.id}`);
}

/**
 * Handles payment method attached event.
 */
async function handlePaymentMethodAttached(
  paymentMethod: Stripe.PaymentMethod,
  supabase: Awaited<ReturnType<typeof createServerClient>>
): Promise<void> {
  const customerId =
    typeof paymentMethod.customer === 'string'
      ? paymentMethod.customer
      : paymentMethod.customer?.id;
  if (!customerId) return;

  const workspace = await findWorkspaceByCustomerId(customerId, supabase);
  if (!workspace) return;

  const cardInfo = paymentMethod.card
    ? {
        stripe_payment_method_id: paymentMethod.id,
        card_last_four: paymentMethod.card.last4,
        card_brand: paymentMethod.card.brand,
        card_exp_month: paymentMethod.card.exp_month,
        card_exp_year: paymentMethod.card.exp_year,
      }
    : { stripe_payment_method_id: paymentMethod.id };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('workspace_billing')
    .update({
      ...cardInfo,
      status: 'active' as BillingStatus, // Linking card activates account
    })
    .eq('workspace_id', workspace.id);

  console.log(`[Webhook] Payment method attached for workspace ${workspace.id}`);
}

/**
 * Handles payment method detached event.
 */
async function handlePaymentMethodDetached(
  paymentMethod: Stripe.PaymentMethod,
  supabase: Awaited<ReturnType<typeof createServerClient>>
): Promise<void> {
  // Find workspace by payment method ID
  const { data: billing } = await supabase
    .from('workspace_billing')
    .select('workspace_id')
    .eq('stripe_payment_method_id', paymentMethod.id)
    .single();

  const typedBilling = billing as { workspace_id: string } | null;
  if (!typedBilling) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('workspace_billing')
    .update({
      stripe_payment_method_id: null,
      card_last_four: null,
      card_brand: null,
      card_exp_month: null,
      card_exp_year: null,
      status: 'card_required' as BillingStatus,
    })
    .eq('workspace_id', typedBilling.workspace_id);

  console.log(`[Webhook] Payment method detached for workspace ${typedBilling.workspace_id}`);
}

/**
 * Handles setup intent succeeded event.
 */
async function handleSetupIntentSucceeded(
  setupIntent: Stripe.SetupIntent,
  supabase: Awaited<ReturnType<typeof createServerClient>>
): Promise<void> {
  const customerId =
    typeof setupIntent.customer === 'string' ? setupIntent.customer : setupIntent.customer?.id;
  if (!customerId) return;

  const workspace = await findWorkspaceByCustomerId(customerId, supabase);
  if (!workspace) return;

  // The payment method will be attached via a separate webhook event
  console.log(`[Webhook] Setup intent succeeded for workspace ${workspace.id}`);
}

// ============================================
// Helper Functions
// ============================================

/**
 * Finds a workspace by Stripe customer ID.
 */
async function findWorkspaceByCustomerId(
  customerId: string,
  supabase: Awaited<ReturnType<typeof createServerClient>>
): Promise<{ id: string } | null> {
  const { data } = await supabase
    .from('workspace_billing')
    .select('workspace_id')
    .eq('stripe_customer_id', customerId)
    .single();

  const typedData = data as { workspace_id: string } | null;
  return typedData ? { id: typedData.workspace_id } : null;
}

/**
 * Maps Stripe subscription status to our billing status.
 */
function mapSubscriptionStatus(stripeStatus: Stripe.Subscription.Status): BillingStatus {
  switch (stripeStatus) {
    case 'active':
    case 'trialing':
      return 'active';
    case 'past_due':
      return 'past_due';
    case 'canceled':
    case 'unpaid':
    case 'incomplete_expired':
      return 'cancelled';
    case 'incomplete':
    case 'paused':
      return 'card_required';
    default:
      return 'free';
  }
}

/**
 * Checks if an event has already been processed (idempotency).
 */
async function isEventProcessed(
  eventId: string,
  supabase: Awaited<ReturnType<typeof createServerClient>>
): Promise<boolean> {
  const { data } = await supabase
    .from('billing_events')
    .select('id')
    .eq('stripe_event_id', eventId)
    .single();

  return !!data;
}

/**
 * Logs a billing event to the database.
 */
async function logBillingEvent(
  workspaceId: string | null,
  eventType: string,
  stripeEventId: string,
  eventData: Record<string, unknown>,
  supabase: Awaited<ReturnType<typeof createServerClient>>
): Promise<void> {
  const event = {
    workspace_id: workspaceId,
    event_type: eventType,
    stripe_event_id: stripeEventId,
    event_data: eventData,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('billing_events').insert(event);
}

// ============================================
// Main Webhook Handler
// ============================================

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Check if billing is enabled
  if (!isBillingEnabled()) {
    return NextResponse.json(
      { success: true, message: 'Billing disabled, webhook ignored' },
      { status: 200 }
    );
  }

  // Check if billing is configured
  if (!isBillingConfigured()) {
    return NextResponse.json(
      { success: false, message: 'Stripe not configured' },
      { status: 503 }
    );
  }

  // Get raw body for signature verification
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json(
      { success: false, message: 'Missing stripe-signature header' },
      { status: 401 }
    );
  }

  // Verify webhook signature
  let event: Stripe.Event;
  try {
    event = constructWebhookEvent(body, signature);
  } catch (error) {
    console.error('[Webhook] Signature verification failed:', error);
    return NextResponse.json(
      { success: false, message: 'Invalid webhook signature' },
      { status: 401 }
    );
  }

  // Initialize Supabase client
  const supabase = await createServerClient();

  // Check idempotency - if already processed, return success
  const alreadyProcessed = await isEventProcessed(event.id, supabase);
  if (alreadyProcessed) {
    console.log(`[Webhook] Event ${event.id} already processed, skipping`);
    return NextResponse.json(
      { success: true, message: 'Event already processed', eventId: event.id },
      { status: 200 }
    );
  }

  let result: WebhookResult = { success: true, message: 'Event processed', eventId: event.id };
  let workspaceId: string | null = null;

  try {
    // Process event based on type
    switch (event.type) {
      // Subscription events
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object as Stripe.Subscription, supabase);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription, supabase);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription, supabase);
        break;

      case 'customer.subscription.paused':
        await handleSubscriptionPaused(event.data.object as Stripe.Subscription, supabase);
        break;

      case 'customer.subscription.resumed':
        await handleSubscriptionResumed(event.data.object as Stripe.Subscription, supabase);
        break;

      // Invoice events
      case 'invoice.paid':
        await handleInvoicePaid(event.data.object as Stripe.Invoice, supabase);
        break;

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice, supabase);
        break;

      case 'invoice.finalized':
        // Just log, no action needed
        console.log(`[Webhook] Invoice finalized: ${(event.data.object as Stripe.Invoice).id}`);
        break;

      // Payment method events
      case 'payment_method.attached':
        await handlePaymentMethodAttached(event.data.object as Stripe.PaymentMethod, supabase);
        break;

      case 'payment_method.detached':
        await handlePaymentMethodDetached(event.data.object as Stripe.PaymentMethod, supabase);
        break;

      case 'setup_intent.succeeded':
        await handleSetupIntentSucceeded(event.data.object as Stripe.SetupIntent, supabase);
        break;

      // Customer events
      case 'customer.updated':
        // Just log, no action needed
        console.log(`[Webhook] Customer updated: ${(event.data.object as Stripe.Customer).id}`);
        break;

      default:
        console.log(`[Webhook] Unhandled event type: ${event.type}`);
        result = { success: true, message: `Unhandled event type: ${event.type}`, eventId: event.id };
    }

    // Try to get workspace ID from the event object
    const eventObject = event.data.object as { customer?: string | Stripe.Customer };
    if (eventObject.customer) {
      const customerId =
        typeof eventObject.customer === 'string' ? eventObject.customer : eventObject.customer.id;
      const workspace = await findWorkspaceByCustomerId(customerId, supabase);
      workspaceId = workspace?.id ?? null;
    }

    // Log the event
    await logBillingEvent(workspaceId, event.type, event.id, event.data.object as unknown as Record<string, unknown>, supabase);

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error(`[Webhook] Error processing ${event.type}:`, error);

    // Log the failed event
    await logBillingEvent(
      workspaceId,
      `${event.type}_error`,
      event.id,
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        eventData: event.data.object,
      },
      supabase
    );

    // Return 500 so Stripe retries
    return NextResponse.json(
      { success: false, message: 'Event processing failed', eventId: event.id },
      { status: 500 }
    );
  }
}
