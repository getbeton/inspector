/**
 * Payment Methods API Endpoint
 *
 * GET /api/billing/payment-methods
 *   Lists all payment methods for the workspace.
 *
 * These endpoints manage payment methods for the authenticated workspace.
 */

import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { isBillingEnabled } from '@/lib/utils/deployment';
import {
  listPaymentMethods,
  StripeBillingDisabledError,
  type PaymentMethodInfo,
} from '@/lib/integrations/stripe/billing';

// ============================================
// Types
// ============================================

interface PaymentMethodsResponse {
  paymentMethods: PaymentMethodInfo[];
  defaultPaymentMethodId: string | null;
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
 * Gets the Stripe customer ID and default payment method for a workspace.
 */
async function getWorkspaceBillingInfo(
  workspaceId: string,
  supabase: Awaited<ReturnType<typeof createServerClient>>
): Promise<{
  customerId: string | null;
  defaultPaymentMethodId: string | null;
}> {
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

  return {
    customerId: typedBilling?.stripe_customer_id ?? null,
    defaultPaymentMethodId: typedBilling?.stripe_payment_method_id ?? null,
  };
}

// ============================================
// Route Handler - GET
// ============================================

export async function GET(): Promise<NextResponse<PaymentMethodsResponse | { error: string }>> {
  // In self-hosted mode, return empty payment methods (graceful degradation)
  if (!isBillingEnabled()) {
    return NextResponse.json({
      paymentMethods: [],
      defaultPaymentMethodId: null,
    });
  }

  const supabase = await createServerClient();

  // Get current user's workspace
  const workspaceId = await getCurrentWorkspaceId(supabase);

  if (!workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get Stripe customer info
    const { customerId, defaultPaymentMethodId } = await getWorkspaceBillingInfo(
      workspaceId,
      supabase
    );

    if (!customerId) {
      // No customer yet - return empty list
      return NextResponse.json({
        paymentMethods: [],
        defaultPaymentMethodId: null,
      });
    }

    // List payment methods from Stripe
    const result = await listPaymentMethods(customerId);

    if (!result.success || !('data' in result)) {
      console.error('[Payment Methods] Failed to list payment methods:', result);
      return NextResponse.json(
        { error: 'Failed to retrieve payment methods' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      paymentMethods: result.data,
      defaultPaymentMethodId,
    });
  } catch (error) {
    if (error instanceof StripeBillingDisabledError) {
      return NextResponse.json(
        { error: 'Billing is not configured' },
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
