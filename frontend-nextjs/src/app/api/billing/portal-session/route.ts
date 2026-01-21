/**
 * Billing Portal Session API Endpoint
 *
 * POST /api/billing/portal-session
 *
 * Creates a Stripe Billing Portal session for managing subscription and
 * payment methods. Redirects the user to Stripe's hosted portal.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { isBillingEnabled } from '@/lib/utils/deployment';
import {
  createBillingPortalSession,
  StripeBillingDisabledError,
} from '@/lib/integrations/stripe/billing';

// ============================================
// Types
// ============================================

interface PortalSessionRequest {
  returnUrl?: string;
}

interface PortalSessionResponse {
  url: string;
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

// ============================================
// Route Handler
// ============================================

export async function POST(
  request: NextRequest
): Promise<NextResponse<PortalSessionResponse | { error: string }>> {
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

  // Parse request body for return URL
  let returnUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  try {
    const body: PortalSessionRequest = await request.json();
    if (body.returnUrl) {
      returnUrl = body.returnUrl;
    }
  } catch {
    // Body is optional, use default return URL
  }

  // Ensure return URL includes settings path
  if (!returnUrl.includes('/settings')) {
    returnUrl = `${returnUrl.replace(/\/$/, '')}/settings`;
  }

  try {
    // Get Stripe customer ID
    const customerId = await getStripeCustomerId(workspaceId, supabase);

    if (!customerId) {
      return NextResponse.json(
        { error: 'No billing customer found. Please link a card first.' },
        { status: 400 }
      );
    }

    // Create billing portal session
    const result = await createBillingPortalSession(customerId, returnUrl);

    if (!result.success || !('url' in result)) {
      console.error('[Portal Session] Failed to create portal session:', result);
      return NextResponse.json(
        { error: 'Failed to create billing portal session' },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: result.url as string });
  } catch (error) {
    if (error instanceof StripeBillingDisabledError) {
      return NextResponse.json(
        { error: 'Billing is not configured' },
        { status: 400 }
      );
    }

    console.error('[Portal Session] Unexpected error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
