/**
 * Setup Intent API Endpoint
 *
 * POST /api/billing/setup-intent
 *
 * Creates a Stripe SetupIntent for collecting payment method details.
 * This is the first step in the card linking flow.
 */

import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { isBillingEnabled } from '@/lib/utils/deployment';
import {
  createSetupIntent,
  createCustomer,
  StripeBillingDisabledError,
} from '@/lib/integrations/stripe/billing';

// ============================================
// Types
// ============================================

interface SetupIntentResponse {
  clientSecret: string;
  customerId: string;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Gets the current user and their workspace info.
 */
async function getCurrentUserWorkspace(
  supabase: Awaited<ReturnType<typeof createServerClient>>
): Promise<{
  userId: string;
  email: string;
  workspaceId: string;
  workspaceName: string;
} | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    return null;
  }

  // Get the user's workspace membership and workspace details
  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id, workspaces(name)')
    .eq('user_id', user.id)
    .single();

  // Type assertion for Supabase query result
  const typedMembership = membership as {
    workspace_id: string;
    workspaces: { name: string };
  } | null;

  if (!typedMembership) {
    return null;
  }

  return {
    userId: user.id,
    email: user.email,
    workspaceId: typedMembership.workspace_id,
    workspaceName: typedMembership.workspaces?.name || 'Workspace',
  };
}

/**
 * Gets or creates a Stripe customer for the workspace.
 */
async function getOrCreateStripeCustomer(
  workspaceId: string,
  email: string,
  workspaceName: string,
  supabase: Awaited<ReturnType<typeof createServerClient>>
): Promise<string | null> {
  // Check if workspace already has a Stripe customer
  const { data: billing } = await supabase
    .from('workspace_billing')
    .select('stripe_customer_id')
    .eq('workspace_id', workspaceId)
    .single();

  // Type assertion for new billing tables
  const typedBilling = billing as { stripe_customer_id: string | null } | null;

  if (typedBilling?.stripe_customer_id) {
    return typedBilling.stripe_customer_id;
  }

  // Create new Stripe customer
  const customerResult = await createCustomer({
    workspaceId,
    email,
    name: workspaceName,
  });

  if (!customerResult.success || !('customerId' in customerResult)) {
    console.error('[Setup Intent] Failed to create Stripe customer:', customerResult);
    return null;
  }

  // Update workspace_billing with the new customer ID
  // Type cast to bypass Supabase type checking for new billing tables
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateError } = await (supabase as any)
    .from('workspace_billing')
    .upsert(
      {
        workspace_id: workspaceId,
        stripe_customer_id: customerResult.customerId,
        status: 'free',
      },
      { onConflict: 'workspace_id' }
    );

  if (updateError) {
    console.error('[Setup Intent] Failed to save Stripe customer ID:', updateError);
    // Still return the customer ID even if we couldn't save it
  }

  return customerResult.customerId as string;
}

// ============================================
// Route Handler
// ============================================

export async function POST(): Promise<NextResponse<SetupIntentResponse | { error: string }>> {
  // Check if billing is enabled
  if (!isBillingEnabled()) {
    return NextResponse.json(
      { error: 'Billing is disabled in self-hosted mode' },
      { status: 400 }
    );
  }

  const supabase = await createServerClient();

  // Get current user and workspace
  const userWorkspace = await getCurrentUserWorkspace(supabase);

  if (!userWorkspace) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get or create Stripe customer
    const customerId = await getOrCreateStripeCustomer(
      userWorkspace.workspaceId,
      userWorkspace.email,
      userWorkspace.workspaceName,
      supabase
    );

    if (!customerId) {
      return NextResponse.json(
        { error: 'Failed to create billing customer' },
        { status: 500 }
      );
    }

    // Create SetupIntent
    const setupIntentResult = await createSetupIntent(customerId);

    if (!setupIntentResult.success || !('clientSecret' in setupIntentResult)) {
      console.error('[Setup Intent] Failed to create SetupIntent:', setupIntentResult);
      return NextResponse.json(
        { error: 'Failed to initialize payment setup' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      clientSecret: setupIntentResult.clientSecret as string,
      customerId,
    });
  } catch (error) {
    if (error instanceof StripeBillingDisabledError) {
      return NextResponse.json(
        { error: 'Billing is not configured' },
        { status: 400 }
      );
    }

    console.error('[Setup Intent] Unexpected error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
