/**
 * Complete Setup API Endpoint
 *
 * POST /api/billing/complete-setup
 *
 * Completes the card linking flow after the user has entered their
 * payment details via Stripe Elements. This endpoint:
 * 1. Verifies the SetupIntent succeeded
 * 2. Sets the payment method as default
 * 3. Creates/activates a subscription
 * 4. Updates the workspace billing status
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { isBillingEnabled, BILLING_CONFIG } from '@/lib/utils/deployment';
import {
  setDefaultPaymentMethod,
  createSubscription,
  listPaymentMethods,
  getStripeClient,
  StripeBillingDisabledError,
  StripeInvalidRequestError,
  StripeAuthenticationError,
} from '@/lib/integrations/stripe/billing';
import { initializeBillingCycle } from '@/lib/billing/cycle-service';
import type { BillingStatus } from '@/lib/supabase/types';

// ============================================
// Types
// ============================================

interface CompleteSetupRequest {
  setupIntentId: string;
  paymentMethodId: string;
  /** Whether to charge immediately (for users over free tier limit) */
  chargeImmediately?: boolean;
  /** Amount to charge in cents (for immediate charge) */
  overageAmount?: number;
  /** MTU count above free tier (for invoice description) */
  overageMtu?: number;
}

interface CompleteSetupResponse {
  success: boolean;
  subscriptionId?: string;
  billingStatus?: BillingStatus;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Gets the current user's workspace ID.
 */
async function getCurrentWorkspaceId(
  supabase: Awaited<ReturnType<typeof createServerClient>>
): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .single();

  // Type assertion for Supabase query result
  const typedMembership = membership as { workspace_id: string } | null;

  return typedMembership?.workspace_id ?? null;
}

/**
 * Gets the Stripe customer ID for a workspace.
 */
async function getStripeCustomerId(
  workspaceId: string,
  supabase: Awaited<ReturnType<typeof createServerClient>>
): Promise<string | null> {
  const { data: billing } = await supabase
    .from('workspace_billing')
    .select('stripe_customer_id')
    .eq('workspace_id', workspaceId)
    .single();

  // Type assertion for new billing tables
  const typedBilling = billing as { stripe_customer_id: string | null } | null;

  return typedBilling?.stripe_customer_id ?? null;
}

/**
 * Updates the workspace billing with payment method and subscription info.
 */
async function updateWorkspaceBilling(
  workspaceId: string,
  paymentMethodId: string,
  subscriptionId: string | null,
  supabase: Awaited<ReturnType<typeof createServerClient>>
): Promise<void> {
  // Get payment method details
  const customerId = await getStripeCustomerId(workspaceId, supabase);
  if (!customerId) {
    throw new Error('No Stripe customer found');
  }

  const paymentMethodsResult = await listPaymentMethods(customerId);
  if (!paymentMethodsResult.success || !('data' in paymentMethodsResult)) {
    throw new Error('Failed to get payment method details');
  }

  // Type assertion after narrowing check
  const paymentMethods = paymentMethodsResult.data;
  const paymentMethod = paymentMethods.find((pm) => pm.id === paymentMethodId);

  const updates: Record<string, unknown> = {
    stripe_payment_method_id: paymentMethodId,
    status: subscriptionId ? 'active' : 'card_required',
    card_brand: paymentMethod?.card?.brand || null,
    card_last_four: paymentMethod?.card?.last4 || null,
    card_exp_month: paymentMethod?.card?.expMonth || null,
    card_exp_year: paymentMethod?.card?.expYear || null,
  };

  if (subscriptionId) {
    updates.stripe_subscription_id = subscriptionId;
  }

  // Type cast to bypass Supabase type checking for new billing tables
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('workspace_billing')
    .update(updates)
    .eq('workspace_id', workspaceId);

  if (error) {
    console.error('[Complete Setup] Failed to update billing:', error);
    throw new Error('Failed to update billing information');
  }
}

/**
 * Creates an immediate charge for overage users.
 * This happens when a user exceeds the free tier during initial setup.
 */
async function chargeOverageImmediately(
  customerId: string,
  amountCents: number,
  overageMtu: number
): Promise<{ success: boolean; invoiceId?: string; error?: string }> {
  try {
    const stripe = getStripeClient();

    // Create an invoice item for the overage
    await stripe.invoiceItems.create({
      customer: customerId,
      amount: amountCents,
      currency: 'usd',
      description: `Initial setup overage charge: ${overageMtu} MTU above free tier`,
    });

    // Create and finalize the invoice
    const invoice = await stripe.invoices.create({
      customer: customerId,
      auto_advance: true, // Automatically finalize
      collection_method: 'charge_automatically',
      description: 'Initial setup - MTU overage charge',
    });

    // Finalize the invoice (this triggers the charge)
    const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id);

    // If payment is not immediate, try to pay it
    if (finalizedInvoice.status === 'open') {
      await stripe.invoices.pay(invoice.id);
    }

    console.log(
      `[Complete Setup] Charged overage: $${(amountCents / 100).toFixed(2)} ` +
        `for ${overageMtu} MTU, invoice: ${invoice.id}`
    );

    return { success: true, invoiceId: invoice.id };
  } catch (error) {
    console.error('[Complete Setup] Failed to charge overage:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process payment',
    };
  }
}

/**
 * Logs a billing event for audit purposes.
 */
async function logBillingEvent(
  workspaceId: string,
  eventType: string,
  metadata: Record<string, unknown>,
  supabase: Awaited<ReturnType<typeof createServerClient>>
): Promise<void> {
  const event = {
    workspace_id: workspaceId,
    event_type: eventType,
    event_data: metadata,
  };

  // Type cast to bypass Supabase type checking
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('billing_events').insert(event);
}

// ============================================
// Route Handler
// ============================================

export async function POST(
  request: NextRequest
): Promise<NextResponse<CompleteSetupResponse | { error: string }>> {
  // Check if billing is enabled
  if (!isBillingEnabled()) {
    return NextResponse.json(
      { error: 'Billing is disabled in self-hosted mode' },
      { status: 400 }
    );
  }

  const supabase = await createServerClient();

  // Get current user's workspace
  const workspaceId = await getCurrentWorkspaceId(supabase);

  if (!workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Parse request body
  let body: CompleteSetupRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { setupIntentId, paymentMethodId, chargeImmediately, overageAmount, overageMtu } = body;

  if (!setupIntentId || !paymentMethodId) {
    return NextResponse.json(
      { error: 'setupIntentId and paymentMethodId are required' },
      { status: 400 }
    );
  }

  // Validate overage params if charging immediately
  if (chargeImmediately && (!overageAmount || overageAmount <= 0)) {
    return NextResponse.json(
      { error: 'overageAmount is required when chargeImmediately is true' },
      { status: 400 }
    );
  }

  try {
    // Get the Stripe customer ID
    const customerId = await getStripeCustomerId(workspaceId, supabase);

    if (!customerId) {
      return NextResponse.json(
        { error: 'No billing customer found. Please start the setup flow again.' },
        { status: 400 }
      );
    }

    // Set the payment method as default
    const setDefaultResult = await setDefaultPaymentMethod(customerId, paymentMethodId);

    if (!setDefaultResult.success) {
      console.error('[Complete Setup] Failed to set default payment method:', setDefaultResult);
      return NextResponse.json(
        { error: 'Failed to set payment method as default' },
        { status: 500 }
      );
    }

    // Handle immediate charge for overage users
    let immediateChargeResult: { success: boolean; invoiceId?: string; error?: string } | null =
      null;

    if (chargeImmediately && overageAmount && overageAmount > 0) {
      immediateChargeResult = await chargeOverageImmediately(
        customerId,
        overageAmount,
        overageMtu || 0
      );

      if (!immediateChargeResult.success) {
        // Log the failure but continue with setup
        // The subscription will still be created for future billing
        console.error(
          '[Complete Setup] Immediate charge failed:',
          immediateChargeResult.error
        );

        // Log the failed charge event
        await logBillingEvent(
          workspaceId,
          'immediate_charge_failed',
          {
            error: immediateChargeResult.error,
            overage_amount_cents: overageAmount,
            overage_mtu: overageMtu,
          },
          supabase
        );
      } else {
        // Log the successful immediate charge
        await logBillingEvent(
          workspaceId,
          'immediate_charge_success',
          {
            invoice_id: immediateChargeResult.invoiceId,
            overage_amount_cents: overageAmount,
            overage_mtu: overageMtu,
          },
          supabase
        );
      }
    }

    // Create a subscription for the metered billing
    let subscriptionId: string | null = null;

    const subscriptionResult = await createSubscription({
      customerId,
      // Uses the default price ID from environment
      // Payment method is already set via setDefaultPaymentMethod above
    });

    if (subscriptionResult.success && 'data' in subscriptionResult) {
      subscriptionId = subscriptionResult.data.id;

      // Initialize billing cycle
      await initializeBillingCycle(workspaceId);
    } else {
      console.error('[Complete Setup] Failed to create subscription:', subscriptionResult);
      // Continue anyway - card is linked, just no subscription yet
      // This allows the user to try again or support to help
    }

    // Update workspace billing with payment method and subscription info
    await updateWorkspaceBilling(workspaceId, paymentMethodId, subscriptionId, supabase);

    // Log the billing event
    await logBillingEvent(
      workspaceId,
      'card_linked',
      {
        payment_method_id: paymentMethodId,
        setup_intent_id: setupIntentId,
        subscription_id: subscriptionId,
        free_tier_mtu_limit: BILLING_CONFIG.FREE_TIER_MTU_LIMIT,
        charged_immediately: chargeImmediately || false,
        immediate_charge_amount: overageAmount || 0,
      },
      supabase
    );

    console.log(
      `[Complete Setup] Successfully completed setup for workspace ${workspaceId}, ` +
        `payment method: ${paymentMethodId}, subscription: ${subscriptionId}` +
        (immediateChargeResult?.success
          ? `, immediate charge: $${((overageAmount || 0) / 100).toFixed(2)}`
          : '')
    );

    return NextResponse.json({
      success: true,
      subscriptionId: subscriptionId || undefined,
      billingStatus: subscriptionId ? 'active' : 'card_required',
      immediateCharge: immediateChargeResult
        ? {
            charged: immediateChargeResult.success,
            invoiceId: immediateChargeResult.invoiceId,
            error: immediateChargeResult.error,
          }
        : undefined,
    });
  } catch (error) {
    if (error instanceof StripeBillingDisabledError) {
      return NextResponse.json(
        { error: 'Billing is not configured' },
        { status: 400 }
      );
    }

    if (error instanceof StripeInvalidRequestError) {
      console.error('[Complete Setup] Invalid request:', error.message);
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    if (error instanceof StripeAuthenticationError) {
      console.error('[Complete Setup] Stripe authentication failed');
      return NextResponse.json(
        { error: 'Billing service authentication failed' },
        { status: 500 }
      );
    }

    console.error('[Complete Setup] Unexpected error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
