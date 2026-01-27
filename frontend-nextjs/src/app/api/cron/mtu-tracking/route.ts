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
import { isBillingEnabled } from '@/lib/utils/deployment';
import { createAdminClient } from '@/lib/supabase/admin';
import { withRetry, withRetryBatch } from '@/lib/utils/retry';
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
  retryStats?: {
    totalRetries: number;
    retriedWorkspaces: number;
  };
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

// Uses the shared typed admin client from lib/supabase/admin.ts
// which includes Database type for full type safety
const getAdminClient = createAdminClient;

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
 * Processes MTU calculation for a single workspace with retry logic.
 */
async function processWorkspaceMtu(
  workspaceId: string
): Promise<{ success: boolean; error?: string; retries?: number }> {
  const result = await withRetry(
    async () => {
      // Calculate current MTU
      const mtuResult = await calculateMTU(workspaceId);

      if (!mtuResult) {
        throw new Error('MTU calculation returned null');
      }

      // Store tracking record
      await storeMTUTracking(workspaceId, mtuResult);

      // Update workspace_billing with current MTU
      const supabase = getAdminClient();
      const today = new Date().toISOString().split('T')[0];

      // Note: peak_mtu_this_cycle update is handled in a separate query to compare with existing value
      const { error: updateError } = await supabase
        .from('workspace_billing')
        .update({
          current_cycle_mtu: mtuResult.mtuCount,
        })
        .eq('workspace_id', workspaceId);

      if (updateError) {
        throw new Error(`Database update failed: ${updateError.message}`);
      }

      // Update peak MTU if current is higher (separate query to handle comparison)
      if (mtuResult.mtuCount > 0) {
        await supabase
          .from('workspace_billing')
          .update({
            peak_mtu_this_cycle: mtuResult.mtuCount,
            peak_mtu_date: today,
          })
          .eq('workspace_id', workspaceId)
          .lt('peak_mtu_this_cycle', mtuResult.mtuCount);
      }

      return mtuResult;
    },
    {
      maxRetries: 3,
      initialDelayMs: 1000,
      onRetry: (attempt, error, delayMs) => {
        console.warn(
          `[MTU Cron] Retry ${attempt} for workspace ${workspaceId} after ${delayMs}ms:`,
          error instanceof Error ? error.message : error
        );
      },
    }
  );

  if (result.success) {
    console.log(
      `[MTU Cron] Processed workspace ${workspaceId}: MTU = ${result.data.mtuCount}` +
        (result.attempts > 1 ? ` (after ${result.attempts} attempts)` : '')
    );
    return {
      success: true,
      retries: result.attempts > 1 ? result.attempts - 1 : 0,
    };
  } else {
    return {
      success: false,
      error: result.error.message,
      retries: result.attempts - 1,
    };
  }
}

/**
 * Reports unreported MTU records to Stripe with retry logic.
 * Queries all unreported records across all workspaces.
 */
async function reportMtuToStripe(): Promise<{
  reported: number;
  errors: string[];
  totalRetries: number;
}> {
  const supabase = getAdminClient();
  let reported = 0;
  const errors: string[] = [];
  let totalRetries = 0;

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
    return { reported: 0, errors: [fetchError.message], totalRetries: 0 };
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
    return { reported: 0, errors: [], totalRetries: 0 };
  }

  // Process records in parallel batches with retry logic
  const batchResults = await withRetryBatch(
    records.filter((record) => {
      // Pre-filter records without Stripe customer ID
      const billingData = Array.isArray(record.workspace_billing)
        ? record.workspace_billing[0]
        : record.workspace_billing;
      return !!billingData?.stripe_customer_id;
    }),
    async (record) => {
      const billingData = Array.isArray(record.workspace_billing)
        ? record.workspace_billing[0]
        : record.workspace_billing;
      const stripeCustomerId = billingData?.stripe_customer_id;

      if (!stripeCustomerId) {
        throw new Error('No Stripe customer ID');
      }

      // Record meter event to Stripe
      const trackingDate = new Date(record.tracking_date);
      const result = await recordMeterEvent({
        customerId: stripeCustomerId,
        mtuCount: record.mtu_count,
        timestamp: Math.floor(trackingDate.getTime() / 1000),
        idempotencyKey: `mtu-${record.workspace_id}-${record.tracking_date}`,
      });

      if (!result.success) {
        const errorMsg = 'error' in result && result.error
          ? result.error.message
          : 'Unknown Stripe error';
        throw new Error(errorMsg);
      }

      await markMtuAsReportedToStripe(record.workspace_id, record.tracking_date);
      return { workspaceId: record.workspace_id, trackingDate: record.tracking_date };
    },
    {
      batchSize: 10,
      maxRetries: 3,
      initialDelayMs: 1000,
      onRetry: (attempt, error, delayMs) => {
        console.warn(
          `[MTU Cron] Stripe reporting retry ${attempt} after ${delayMs}ms:`,
          error instanceof Error ? error.message : error
        );
      },
    }
  );

  // Process batch results
  for (const result of batchResults) {
    if (result.success) {
      reported++;
      if (result.attempts > 1) {
        totalRetries += result.attempts - 1;
      }
    } else {
      errors.push(
        `Failed to report MTU for workspace ${result.item.workspace_id}: ${result.error.message}`
      );
      totalRetries += result.attempts - 1;
    }
  }

  return { reported, errors, totalRetries };
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
  let totalRetries = 0;
  let retriedWorkspaces = 0;

  try {
    // Step 1: Handle billing cycle transitions with retry logic
    const workspacesNeedingTransition = await getWorkspacesNeedingCycleTransition();

    for (const workspaceId of workspacesNeedingTransition) {
      const transitionResult = await withRetry(
        async () => {
          const cycleEnded = await hasCycleEnded(workspaceId);
          if (cycleEnded) {
            const result = await transitionToNextCycle(workspaceId);
            if (!result.success) {
              throw new Error(result.error);
            }
            return true;
          }
          return false;
        },
        {
          maxRetries: 2,
          initialDelayMs: 500,
          onRetry: (attempt, error, delayMs) => {
            console.warn(
              `[MTU Cron] Cycle transition retry ${attempt} for ${workspaceId} after ${delayMs}ms:`,
              error instanceof Error ? error.message : error
            );
          },
        }
      );

      if (transitionResult.success && transitionResult.data) {
        cyclesTransitioned++;
        console.log(
          `[MTU Cron] Transitioned billing cycle for workspace ${workspaceId}`
        );
        if (transitionResult.attempts > 1) {
          totalRetries += transitionResult.attempts - 1;
        }
      } else if (!transitionResult.success) {
        errors.push(
          `Cycle transition failed for ${workspaceId}: ${transitionResult.error.message}`
        );
        totalRetries += transitionResult.attempts - 1;
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
      if (result.retries && result.retries > 0) {
        totalRetries += result.retries;
        retriedWorkspaces++;
      }
    }

    // Step 3: Report unreported MTU records to Stripe
    const stripeResult = await reportMtuToStripe();
    mtuRecordsReported = stripeResult.reported;
    errors.push(...stripeResult.errors);
    totalRetries += stripeResult.totalRetries;

    console.log(
      `[MTU Cron] Completed: ${workspacesProcessed} workspaces processed, ` +
        `${cyclesTransitioned} cycles transitioned, ${mtuRecordsReported} records reported to Stripe, ` +
        `${totalRetries} total retries, ${errors.length} errors`
    );

    return NextResponse.json({
      success: errors.length === 0,
      workspacesProcessed,
      cyclesTransitioned,
      mtuRecordsReported,
      errors,
      timestamp,
      retryStats: {
        totalRetries,
        retriedWorkspaces,
      },
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
