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
import { isBillingEnabled, getDeploymentMode } from '@/lib/utils/deployment';
import { getAccessStatus, getThresholdWarningLevel } from '@/lib/billing/enforcement-service';
import { getCurrentBillingCycle } from '@/lib/billing/cycle-service';

// ============================================
// Types
// ============================================

interface BillingStatusResponse {
  deploymentMode: 'cloud' | 'self-hosted';
  billingStatus: string;
  mtu?: {
    current: number;
    threshold: number;
    percentUsed: number;
  };
  subscription?: {
    status: string;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  } | null;
  paymentMethod?: {
    cardBrand: string | null;
    cardLastFour: string | null;
    cardExpMonth: number | null;
    cardExpYear: number | null;
  } | null;
  hasAccess: boolean;
  requiresCardLink: boolean;
  thresholdWarning: '90_percent' | '95_percent' | 'over_threshold' | null;
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

  // Self-hosted mode: return simplified response
  if (!isBillingEnabled()) {
    const response: BillingStatusResponse = {
      deploymentMode: 'self-hosted',
      billingStatus: 'unlimited',
      hasAccess: true,
      requiresCardLink: false,
      thresholdWarning: null,
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

  // Map threshold warning to API format
  let thresholdWarningApi: BillingStatusResponse['thresholdWarning'] = null;
  if (thresholdWarning === 'warning_90') thresholdWarningApi = '90_percent';
  else if (thresholdWarning === 'warning_95') thresholdWarningApi = '95_percent';
  else if (thresholdWarning === 'exceeded') thresholdWarningApi = 'over_threshold';

  const response: BillingStatusResponse = {
    deploymentMode: getDeploymentMode(),
    billingStatus: accessStatus.billingStatus || 'free',
    mtu: {
      current: accessStatus.mtuCount,
      threshold: accessStatus.threshold,
      percentUsed: accessStatus.percentUsed,
    },
    subscription: billingDetails?.stripeSubscriptionId
      ? {
          status: billingDetails.status,
          currentPeriodStart: billingCycle?.start.toISOString() ?? null,
          currentPeriodEnd: billingCycle?.end.toISOString() ?? null,
          cancelAtPeriodEnd: false, // Would need to get this from Stripe
        }
      : null,
    paymentMethod: billingDetails?.cardLastFour
      ? {
          cardBrand: billingDetails.cardBrand,
          cardLastFour: billingDetails.cardLastFour,
          cardExpMonth: billingDetails.cardExpMonth,
          cardExpYear: billingDetails.cardExpYear,
        }
      : null,
    hasAccess: accessStatus.hasAccess,
    requiresCardLink: accessStatus.requiresCardLink,
    thresholdWarning: thresholdWarningApi,
  };

  return NextResponse.json(response, {
    headers: {
      'Cache-Control': 'private, max-age=60', // 1 minute cache for authenticated requests
    },
  });
}
