/**
 * Payment Method Delete API Endpoint
 *
 * DELETE /api/billing/payment-methods/[id]
 *   Detaches a payment method from the workspace.
 *
 * This endpoint handles removing a specific payment method.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { isBillingEnabled } from '@/lib/utils/deployment';
import { getStripeClient, StripeBillingDisabledError } from '@/lib/integrations/stripe/billing';

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
    .select('stripe_customer_id, stripe_payment_method_id')
    .eq('workspace_id', workspaceId)
    .single();

  // Type assertion for new billing tables
  const typedBilling = billing as {
    stripe_customer_id: string | null;
    stripe_payment_method_id: string | null;
  } | null;

  return typedBilling?.stripe_customer_id ?? null;
}

/**
 * Gets the default payment method ID for a workspace.
 */
async function getDefaultPaymentMethodId(
  workspaceId: string,
  supabase: Awaited<ReturnType<typeof createServerClient>>
): Promise<string | null> {
  const { data: billing } = await supabase
    .from('workspace_billing')
    .select('stripe_payment_method_id')
    .eq('workspace_id', workspaceId)
    .single();

  // Type assertion for new billing tables
  const typedBilling = billing as { stripe_payment_method_id: string | null } | null;

  return typedBilling?.stripe_payment_method_id ?? null;
}

/**
 * Clears the payment method info if this was the default.
 */
async function clearDefaultPaymentMethod(
  workspaceId: string,
  paymentMethodId: string,
  supabase: Awaited<ReturnType<typeof createServerClient>>
): Promise<void> {
  const currentDefault = await getDefaultPaymentMethodId(workspaceId, supabase);

  if (currentDefault === paymentMethodId) {
    // Type cast to bypass Supabase type checking for new billing tables
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('workspace_billing')
      .update({
        stripe_payment_method_id: null,
        card_brand: null,
        card_last_four: null,
        card_exp_month: null,
        card_exp_year: null,
        status: 'card_required',
      })
      .eq('workspace_id', workspaceId);
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
// Route Handler - DELETE
// ============================================

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<{ success: boolean } | { error: string }>> {
  // Check if billing is enabled
  if (!isBillingEnabled()) {
    return NextResponse.json(
      { error: 'Billing is disabled in self-hosted mode' },
      { status: 400 }
    );
  }

  const { id: paymentMethodId } = await params;

  if (!paymentMethodId) {
    return NextResponse.json(
      { error: 'Payment method ID is required' },
      { status: 400 }
    );
  }

  const supabase = await createServerClient();

  // Get current user's workspace
  const workspaceId = await getCurrentWorkspaceId(supabase);

  if (!workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get Stripe customer ID
    const customerId = await getStripeCustomerId(workspaceId, supabase);

    if (!customerId) {
      return NextResponse.json(
        { error: 'No billing customer found' },
        { status: 400 }
      );
    }

    // Get Stripe client and detach the payment method
    const stripe = getStripeClient();

    // First verify this payment method belongs to this customer
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);

    if (paymentMethod.customer !== customerId) {
      return NextResponse.json(
        { error: 'Payment method does not belong to this workspace' },
        { status: 403 }
      );
    }

    // Detach the payment method
    await stripe.paymentMethods.detach(paymentMethodId);

    // Clear the default payment method if this was it
    await clearDefaultPaymentMethod(workspaceId, paymentMethodId, supabase);

    // Log the event
    await logBillingEvent(
      workspaceId,
      'payment_method_removed',
      {
        payment_method_id: paymentMethodId,
      },
      supabase
    );

    console.log(
      `[Payment Methods] Detached payment method ${paymentMethodId} from workspace ${workspaceId}`
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof StripeBillingDisabledError) {
      return NextResponse.json(
        { error: 'Billing is not configured' },
        { status: 400 }
      );
    }

    // Handle Stripe-specific errors
    if (
      error &&
      typeof error === 'object' &&
      'type' in error &&
      (error as { type: string }).type === 'StripeInvalidRequestError'
    ) {
      return NextResponse.json(
        { error: 'Invalid payment method' },
        { status: 400 }
      );
    }

    console.error('[Payment Methods] Unexpected error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
