/**
 * Daily MTU Tracking Cron Job
 *
 * GET /api/cron/mtu-tracking
 *
 * This cron job runs daily to:
 * 1. Calculate MTU for all active workspaces with billing enabled
 * 2. Store MTU tracking records for historical analysis
 * 3. Update current cycle MTU counts in workspace_billing
 * 4. Handle billing cycle transitions when cycles end
 * 5. Report unreported MTU records to Stripe
 *
 * Schedule: Daily at 2:00 AM UTC (configured in vercel.json)
 * CRON_SECRET header required for authentication.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isBillingEnabled } from '@/lib/utils/deployment';
import {
  calculateMTU,
  storeMTUTracking,
  markMtuAsReportedToStripe,
} from '@/lib/billing/mtu-service';
import {
  hasCycleEnded,
  transitionToNextCycle,
  getWorkspacesNeedingCycleTransition,
} from '@/lib/billing/cycle-service';
import { recordMeterEvent } from '@/lib/integrations/stripe/billing';

// ============================================
// Types
// ============================================

interface CronResult {
  success: boolean;
  workspacesProcessed: number;
  cyclesTransitioned: number;
  mtuRecordsReported: number;
  errors: string[];
  timestamp: string;
}

// ============================================
// Cron Authentication
// ============================================

/**
 * Verifies the CRON_SECRET header for authentication.
 */
function verifyCronAuth(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.warn('[MTU Cron] CRON_SECRET not configured');
    return false;
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader === `Bearer ${cronSecret}`) {
    return true;
  }

  // Also check X-Cron-Secret for Vercel cron compatibility
  const cronSecretHeader = request.headers.get('x-cron-secret');
  return cronSecretHeader === cronSecret;
}

// ============================================
// Supabase Admin Client
// ============================================

/**
 * Creates a Supabase admin client with service role key.
 * This bypasses RLS for batch operations.
 */
function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase configuration missing');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// ============================================
// Main Cron Logic
// ============================================

/**
 * Gets all active workspaces with billing enabled.
 */
async function getActiveWorkspaces(): Promise<
  Array<{
    workspace_id: string;
    stripe_customer_id: string | null;
  }>
> {
  const supabase = getAdminClient();

  const { data, error } = await supabase
    .from('workspace_billing')
    .select('workspace_id, stripe_customer_id')
    .in('status', ['active', 'free', 'card_required']);

  if (error) {
    console.error('[MTU Cron] Failed to get active workspaces:', error);
    return [];
  }

  // Type assertion for new billing tables
  return (
    (data as Array<{ workspace_id: string; stripe_customer_id: string | null }>) || []
  );
}

/**
 * Processes MTU calculation for a single workspace.
 */
async function processWorkspaceMtu(
  workspaceId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Calculate current MTU
    const mtuResult = await calculateMTU(workspaceId);

    if (!mtuResult) {
      return {
        success: false,
        error: 'MTU calculation returned null',
      };
    }

    // Store tracking record
    await storeMTUTracking(workspaceId, mtuResult);

    // Update workspace_billing with current MTU
    const supabase = getAdminClient();
    const today = new Date().toISOString().split('T')[0];

    // Type cast to bypass Supabase type checking for new billing tables
    // Note: peak_mtu_this_cycle update is handled in a separate query to compare with existing value
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (supabase as any)
      .from('workspace_billing')
      .update({
        current_cycle_mtu: mtuResult.mtuCount,
        last_mtu_calculation: today,
      })
      .eq('workspace_id', workspaceId);

    // Update peak MTU if current is higher (separate query to handle comparison)
    if (!updateError && mtuResult.mtuCount > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('workspace_billing')
        .update({
          peak_mtu_this_cycle: mtuResult.mtuCount,
          peak_mtu_date: today,
        })
        .eq('workspace_id', workspaceId)
        .lt('peak_mtu_this_cycle', mtuResult.mtuCount);
    }

    if (updateError) {
      console.error(
        `[MTU Cron] Failed to update workspace ${workspaceId}:`,
        updateError
      );
      return {
        success: false,
        error: `Database update failed: ${updateError.message}`,
      };
    }

    console.log(
      `[MTU Cron] Processed workspace ${workspaceId}: MTU = ${mtuResult.mtuCount}`
    );
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

/**
 * Reports unreported MTU records to Stripe.
 * Queries all unreported records across all workspaces.
 */
async function reportMtuToStripe(): Promise<{
  reported: number;
  errors: string[];
}> {
  const supabase = getAdminClient();
  let reported = 0;
  const errors: string[] = [];

  // Get all unreported MTU records with their workspace's Stripe customer ID
  const { data: unreportedRecords, error: fetchError } = await supabase
    .from('mtu_tracking')
    .select(
      `
      workspace_id,
      tracking_date,
      mtu_count,
      workspace_billing!inner(stripe_customer_id)
    `
    )
    .eq('reported_to_stripe', false)
    .order('tracking_date', { ascending: true })
    .limit(100); // Process in batches to avoid timeouts

  if (fetchError) {
    console.error('[MTU Cron] Failed to fetch unreported MTU records:', fetchError);
    return { reported: 0, errors: [fetchError.message] };
  }

  // Type assertion for joined query
  // Note: Supabase returns nested relations as arrays, but !inner ensures single match
  const records = unreportedRecords as unknown as Array<{
    workspace_id: string;
    tracking_date: string;
    mtu_count: number;
    workspace_billing: { stripe_customer_id: string | null };
  }> | null;

  if (!records || records.length === 0) {
    return { reported: 0, errors: [] };
  }

  for (const record of records) {
    // Skip if no Stripe customer ID
    // Handle both array and object formats from Supabase join
    const billingData = Array.isArray(record.workspace_billing)
      ? record.workspace_billing[0]
      : record.workspace_billing;
    const stripeCustomerId = billingData?.stripe_customer_id;
    if (!stripeCustomerId) {
      continue;
    }

    // Record meter event to Stripe
    const trackingDate = new Date(record.tracking_date);
    const result = await recordMeterEvent({
      customerId: stripeCustomerId,
      mtuCount: record.mtu_count,
      timestamp: Math.floor(trackingDate.getTime() / 1000),
      idempotencyKey: `mtu-${record.workspace_id}-${record.tracking_date}`,
    });

    if (result.success) {
      await markMtuAsReportedToStripe(record.workspace_id, record.tracking_date);
      reported++;
    } else {
      errors.push(
        `Failed to report MTU for workspace ${record.workspace_id}: ${'error' in result ? result.error : 'Unknown error'}`
      );
    }
  }

  return { reported, errors };
}

// ============================================
// Route Handler
// ============================================

export async function GET(
  request: NextRequest
): Promise<NextResponse<CronResult>> {
  const timestamp = new Date().toISOString();

  // Verify cron authentication
  if (!verifyCronAuth(request)) {
    return NextResponse.json(
      {
        success: false,
        workspacesProcessed: 0,
        cyclesTransitioned: 0,
        mtuRecordsReported: 0,
        errors: ['Unauthorized'],
        timestamp,
      },
      { status: 401 }
    );
  }

  // Check if billing is enabled
  if (!isBillingEnabled()) {
    return NextResponse.json({
      success: true,
      workspacesProcessed: 0,
      cyclesTransitioned: 0,
      mtuRecordsReported: 0,
      errors: [],
      timestamp,
    });
  }

  console.log('[MTU Cron] Starting daily MTU tracking job');

  const errors: string[] = [];
  let workspacesProcessed = 0;
  let cyclesTransitioned = 0;
  let mtuRecordsReported = 0;

  try {
    // Step 1: Handle billing cycle transitions
    const workspacesNeedingTransition = await getWorkspacesNeedingCycleTransition();

    for (const workspaceId of workspacesNeedingTransition) {
      try {
        const cycleEnded = await hasCycleEnded(workspaceId);
        if (cycleEnded) {
          const result = await transitionToNextCycle(workspaceId);
          if (result.success) {
            cyclesTransitioned++;
            console.log(
              `[MTU Cron] Transitioned billing cycle for workspace ${workspaceId}`
            );
          } else {
            errors.push(
              `Cycle transition failed for ${workspaceId}: ${result.error}`
            );
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Cycle transition error for ${workspaceId}: ${message}`);
      }
    }

    // Step 2: Calculate MTU for all active workspaces
    const activeWorkspaces = await getActiveWorkspaces();

    for (const workspace of activeWorkspaces) {
      const result = await processWorkspaceMtu(workspace.workspace_id);
      if (result.success) {
        workspacesProcessed++;
      } else {
        errors.push(
          `Workspace ${workspace.workspace_id}: ${result.error}`
        );
      }
    }

    // Step 3: Report unreported MTU records to Stripe
    const stripeResult = await reportMtuToStripe();
    mtuRecordsReported = stripeResult.reported;
    errors.push(...stripeResult.errors);

    console.log(
      `[MTU Cron] Completed: ${workspacesProcessed} workspaces processed, ` +
        `${cyclesTransitioned} cycles transitioned, ${mtuRecordsReported} records reported to Stripe, ` +
        `${errors.length} errors`
    );

    return NextResponse.json({
      success: errors.length === 0,
      workspacesProcessed,
      cyclesTransitioned,
      mtuRecordsReported,
      errors,
      timestamp,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[MTU Cron] Fatal error:', error);

    return NextResponse.json(
      {
        success: false,
        workspacesProcessed,
        cyclesTransitioned,
        mtuRecordsReported,
        errors: [...errors, `Fatal error: ${message}`],
        timestamp,
      },
      { status: 500 }
    );
  }
}
