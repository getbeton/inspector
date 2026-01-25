/**
 * Billing Status API Endpoint
 *
 * GET /api/billing/status
 *
 * Returns the current billing status for the authenticated workspace.
 * Used by frontend to display billing information and determine UI elements.
 */

import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { isBillingEnabled } from '@/lib/utils/deployment';
import { getAccessStatus, getThresholdWarningLevel } from '@/lib/billing/enforcement-service';
import { getCurrentBillingCycle } from '@/lib/billing/cycle-service';
import {
  getActivePrice,
  getPriceFromSubscription,
  getMtuProductId,
  type BillingResult,
  type PriceInfo,
} from '@/lib/integrations/stripe/billing';

// ============================================
// Types
// ============================================

/**
 * Response shape expected by the frontend client.
 * Must match the BillingStatus interface in /lib/api/billing.ts
 */
interface BillingStatusResponse {
  workspaceId: string;
  status: 'active' | 'free' | 'card_required' | 'suspended';
  hasPaymentMethod: boolean;
  mtu: {
    current: number;
    limit: number;
    percentUsed: number;
  };
  subscription: {
    hasSubscription: boolean;
    status: string | null;
    currentPeriodEnd: string | null;
  };
  threshold: {
    level: 'normal' | 'warning_90' | 'warning_95' | 'exceeded';
    canAccess: boolean;
    accessWarning: string | null;
  };
  pricing: {
    pricePerMtu: string;
    currency: string;
    isSubscriptionPrice: boolean;
  } | null;
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

  // Get the user's workspace membership
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
 * Gets billing details from the database.
 */
async function getBillingDetails(
  workspaceId: string,
  supabase: Awaited<ReturnType<typeof createServerClient>>
): Promise<{
  status: string;
  cardBrand: string | null;
  cardLastFour: string | null;
  cardExpMonth: number | null;
  cardExpYear: number | null;
  stripeSubscriptionId: string | null;
} | null> {
  const { data: billing } = await supabase
    .from('workspace_billing')
    .select(
      'status, card_brand, card_last_four, card_exp_month, card_exp_year, stripe_subscription_id'
    )
    .eq('workspace_id', workspaceId)
    .single();

  // Type assertion for new billing tables
  const typedBilling = billing as {
    status: string;
    card_brand: string | null;
    card_last_four: string | null;
    card_exp_month: number | null;
    card_exp_year: number | null;
    stripe_subscription_id: string | null;
  } | null;

  if (!typedBilling) {
    return null;
  }

  return {
    status: typedBilling.status,
    cardBrand: typedBilling.card_brand,
    cardLastFour: typedBilling.card_last_four,
    cardExpMonth: typedBilling.card_exp_month,
    cardExpYear: typedBilling.card_exp_year,
    stripeSubscriptionId: typedBilling.stripe_subscription_id,
  };
}

/**
 * Gets pricing information for the billing status.
 * Tries subscription price first, then falls back to product's active price.
 */
async function getPricingInfo(
  subscriptionId: string | null
): Promise<BillingStatusResponse['pricing']> {
  try {
    // Try to get price from subscription first
    if (subscriptionId) {
      const subPriceResult = await getPriceFromSubscription(subscriptionId);
      if (subPriceResult.success && subPriceResult.data) {
        return {
          pricePerMtu: subPriceResult.data.formattedPrice,
          currency: subPriceResult.data.currency,
          isSubscriptionPrice: true,
        };
      }
    }

    // Fall back to active price for the configured product
    const productId = getMtuProductId();
    if (!productId) {
      console.warn('[Billing Status] No MTU product ID configured');
      return null;
    }

    const activePriceResult = await getActivePrice(productId);
    if (activePriceResult.success && activePriceResult.data) {
      return {
        pricePerMtu: activePriceResult.data.formattedPrice,
        currency: activePriceResult.data.currency,
        isSubscriptionPrice: false,
      };
    }

    return null;
  } catch (error) {
    console.error('[Billing Status] Failed to fetch pricing info:', error);
    return null;
  }
}

// ============================================
// Route Handler
// ============================================

export async function GET(): Promise<NextResponse<BillingStatusResponse | { error: string }>> {
  const supabase = await createServerClient();

  // Get current user's workspace
  const workspaceId = await getCurrentWorkspaceId(supabase);

  if (!workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Self-hosted mode: return simplified response with unlimited access
  if (!isBillingEnabled()) {
    const response: BillingStatusResponse = {
      workspaceId,
      status: 'active',
      hasPaymentMethod: true, // Treat as always having payment method in self-hosted
      mtu: {
        current: 0,
        limit: Infinity,
        percentUsed: 0,
      },
      subscription: {
        hasSubscription: false,
        status: null,
        currentPeriodEnd: null,
      },
      threshold: {
        level: 'normal',
        canAccess: true,
        accessWarning: null,
      },
      pricing: null, // No pricing in self-hosted mode
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, max-age=300', // 5 minute cache
      },
    });
  }

  // Cloud mode: get full billing status
  const accessStatus = await getAccessStatus(workspaceId);
  const thresholdWarning = await getThresholdWarningLevel(workspaceId);
  const billingCycle = await getCurrentBillingCycle(workspaceId);
  const billingDetails = await getBillingDetails(workspaceId, supabase);

  // Fetch pricing information (from subscription or product)
  const pricing = await getPricingInfo(billingDetails?.stripeSubscriptionId ?? null);

  // Map billing status to expected format
  const statusMap: Record<string, BillingStatusResponse['status']> = {
    active: 'active',
    free: 'free',
    card_required: 'card_required',
    suspended: 'suspended',
  };
  const status = statusMap[accessStatus.billingStatus || 'free'] || 'free';

  // Determine if user has a payment method
  const hasPaymentMethod = Boolean(billingDetails?.cardLastFour);

  // Build access warning message if needed
  let accessWarning: string | null = null;
  if (thresholdWarning === 'exceeded' && !hasPaymentMethod) {
    accessWarning = 'Free tier limit exceeded. Please add a payment method to continue.';
  } else if (thresholdWarning === 'warning_95' && !hasPaymentMethod) {
    accessWarning = 'You have used 95% of your free tier. Add a payment method to avoid interruption.';
  } else if (thresholdWarning === 'warning_90' && !hasPaymentMethod) {
    accessWarning = 'You have used 90% of your free tier.';
  }

  const response: BillingStatusResponse = {
    workspaceId,
    status,
    hasPaymentMethod,
    mtu: {
      current: accessStatus.mtuCount,
      limit: accessStatus.threshold,
      percentUsed: accessStatus.percentUsed,
    },
    subscription: {
      hasSubscription: Boolean(billingDetails?.stripeSubscriptionId),
      status: billingDetails?.status ?? null,
      currentPeriodEnd: billingCycle?.end.toISOString() ?? null,
    },
    threshold: {
      level: thresholdWarning ?? 'normal',
      canAccess: accessStatus.hasAccess,
      accessWarning,
    },
    pricing,
  };

  return NextResponse.json(response, {
    headers: {
      'Cache-Control': 'private, max-age=60', // 1 minute cache for authenticated requests
    },
  });
}
