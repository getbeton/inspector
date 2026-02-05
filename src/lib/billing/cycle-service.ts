/**
 * Billing Cycle Management Service
 *
 * Manages billing cycles for each workspace. Billing cycles start when a
 * customer activates their subscription and run for exactly 1 calendar month.
 *
 * Features:
 * - Initialize billing cycles on subscription activation
 * - Calculate cycle dates with edge case handling (month-end dates, leap years)
 * - Track cycle transitions and reset cycle-specific data
 * - Integrate with Stripe for meter event submission
 */

import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isBillingEnabled } from '@/lib/utils/deployment';
import { recordMeterEvent } from '@/lib/integrations/stripe/billing';
import type { Json, WorkspaceBilling } from '@/lib/supabase/types';

// ============================================
// Types
// ============================================

export interface BillingCycle {
  start: Date;
  end: Date;
}

export interface BillingCycleInfo extends BillingCycle {
  workspaceId: string;
  daysRemaining: number;
  daysElapsed: number;
  totalDays: number;
  percentComplete: number;
}

export interface CycleTransitionResult {
  success: boolean;
  previousCycle: BillingCycle;
  newCycle: BillingCycle;
  finalMtu: number;
  stripeEventRecorded: boolean;
  error?: string;
}

// ============================================
// Date Calculation Utilities
// ============================================

/**
 * Calculates the end date for a billing cycle, exactly 1 month from start.
 * Handles edge cases like month-end dates correctly.
 *
 * Examples:
 * - Jan 18 → Feb 18
 * - Jan 31 → Feb 28 (or Feb 29 in leap year)
 * - Feb 28 (non-leap) → Mar 28
 * - Feb 29 (leap) → Mar 29
 */
export function calculateCycleEndDate(startDate: Date): Date {
  const start = new Date(startDate);
  const startDay = start.getDate();
  const startMonth = start.getMonth();
  const startYear = start.getFullYear();

  // Calculate next month
  let endMonth = startMonth + 1;
  let endYear = startYear;

  // Handle year rollover
  if (endMonth > 11) {
    endMonth = 0;
    endYear += 1;
  }

  // Get the last day of the target month
  const lastDayOfEndMonth = new Date(endYear, endMonth + 1, 0).getDate();

  // Use the original start day, or the last day of the month if it doesn't exist
  const endDay = Math.min(startDay, lastDayOfEndMonth);

  return new Date(endYear, endMonth, endDay, 0, 0, 0, 0);
}

/**
 * Gets the number of days between two dates.
 */
export function getDaysBetween(start: Date, end: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const startMs = new Date(start).setHours(0, 0, 0, 0);
  const endMs = new Date(end).setHours(0, 0, 0, 0);
  return Math.round((endMs - startMs) / msPerDay);
}

/**
 * Checks if a date falls within a billing cycle (inclusive of start, exclusive of end).
 */
export function isDateInCycle(date: Date, cycle: BillingCycle): boolean {
  const checkDate = new Date(date).setHours(0, 0, 0, 0);
  const cycleStart = new Date(cycle.start).setHours(0, 0, 0, 0);
  const cycleEnd = new Date(cycle.end).setHours(0, 0, 0, 0);

  return checkDate >= cycleStart && checkDate < cycleEnd;
}

/**
 * Formats a date for storage (YYYY-MM-DD).
 */
function formatDateForStorage(date: Date): string {
  return date.toISOString().split('T')[0];
}

// ============================================
// Billing Cycle Management Functions
// ============================================

/**
 * Initializes a billing cycle for a workspace.
 * Called when subscription is activated.
 */
export async function initializeBillingCycle(
  workspaceId: string,
  startDate: Date = new Date()
): Promise<BillingCycle | null> {
  if (!isBillingEnabled()) {
    console.log('[Cycle Service] Billing disabled, skipping cycle initialization');
    return null;
  }

  const supabase = createAdminClient();

  const cycleStart = new Date(startDate);
  cycleStart.setHours(0, 0, 0, 0);
  const cycleEnd = calculateCycleEndDate(cycleStart);

  const updates: Partial<WorkspaceBilling> = {
    billing_cycle_start: cycleStart.toISOString(),
    billing_cycle_end: cycleEnd.toISOString(),
    current_cycle_mtu: 0,
    peak_mtu_this_cycle: 0,
    peak_mtu_date: null,
  };

  const { error } = await supabase
    .from('workspace_billing')
    .update(updates)
    .eq('workspace_id', workspaceId);

  if (error) {
    console.error('[Cycle Service] Failed to initialize billing cycle:', error);
    return null;
  }

  // Log the billing event
  await logBillingEvent(workspaceId, 'cycle_started', {
    cycle_start: formatDateForStorage(cycleStart),
    cycle_end: formatDateForStorage(cycleEnd),
  });

  console.log(
    `[Cycle Service] Initialized billing cycle for workspace ${workspaceId}: ` +
      `${formatDateForStorage(cycleStart)} to ${formatDateForStorage(cycleEnd)}`
  );

  return { start: cycleStart, end: cycleEnd };
}

/**
 * Gets the current billing cycle for a workspace.
 */
export async function getCurrentBillingCycle(workspaceId: string): Promise<BillingCycleInfo | null> {
  const supabase = await createServerClient();

  const { data: billing } = await supabase
    .from('workspace_billing')
    .select('billing_cycle_start, billing_cycle_end')
    .eq('workspace_id', workspaceId)
    .single();

  // Type assertion for new billing tables
  const typedBilling = billing as {
    billing_cycle_start: string | null;
    billing_cycle_end: string | null;
  } | null;

  if (!typedBilling?.billing_cycle_start || !typedBilling?.billing_cycle_end) {
    return null;
  }

  const start = new Date(typedBilling.billing_cycle_start);
  const end = new Date(typedBilling.billing_cycle_end);
  const now = new Date();

  const totalDays = getDaysBetween(start, end);
  const daysElapsed = getDaysBetween(start, now);
  const daysRemaining = Math.max(0, getDaysBetween(now, end));
  const percentComplete = totalDays > 0 ? Math.round((daysElapsed / totalDays) * 100) : 0;

  return {
    workspaceId,
    start,
    end,
    daysRemaining,
    daysElapsed,
    totalDays,
    percentComplete: Math.min(100, percentComplete),
  };
}

/**
 * Gets the next billing cycle dates for a workspace.
 */
export async function getNextBillingCycle(workspaceId: string): Promise<BillingCycle | null> {
  const currentCycle = await getCurrentBillingCycle(workspaceId);

  if (!currentCycle) {
    return null;
  }

  const nextStart = currentCycle.end;
  const nextEnd = calculateCycleEndDate(nextStart);

  return { start: nextStart, end: nextEnd };
}

/**
 * Checks if the billing cycle is ending within the specified number of days.
 */
export async function isBillingCycleEnding(
  workspaceId: string,
  withinDays: number = 3
): Promise<boolean> {
  const currentCycle = await getCurrentBillingCycle(workspaceId);

  if (!currentCycle) {
    return false;
  }

  return currentCycle.daysRemaining <= withinDays;
}

/**
 * Gets the number of days remaining in the current billing cycle.
 */
export async function getDaysRemainingInCycle(workspaceId: string): Promise<number> {
  const currentCycle = await getCurrentBillingCycle(workspaceId);
  return currentCycle?.daysRemaining ?? 0;
}

/**
 * Transitions a workspace to the next billing cycle.
 * This should be called when the current cycle ends.
 */
export async function transitionToNextCycle(workspaceId: string): Promise<CycleTransitionResult> {
  const supabase = createAdminClient();

  // Get current billing data
  const { data: billing } = await supabase
    .from('workspace_billing')
    .select(
      'billing_cycle_start, billing_cycle_end, current_cycle_mtu, stripe_customer_id, stripe_subscription_id'
    )
    .eq('workspace_id', workspaceId)
    .single();

  // Type assertion for new billing tables
  const typedBilling = billing as {
    billing_cycle_start: string | null;
    billing_cycle_end: string | null;
    current_cycle_mtu: number | null;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
  } | null;

  if (!typedBilling?.billing_cycle_start || !typedBilling?.billing_cycle_end) {
    return {
      success: false,
      previousCycle: { start: new Date(), end: new Date() },
      newCycle: { start: new Date(), end: new Date() },
      finalMtu: 0,
      stripeEventRecorded: false,
      error: 'No billing cycle found for workspace',
    };
  }

  const previousCycle: BillingCycle = {
    start: new Date(typedBilling.billing_cycle_start),
    end: new Date(typedBilling.billing_cycle_end),
  };

  const finalMtu = typedBilling.current_cycle_mtu || 0;

  // Calculate new cycle dates
  const newCycleStart = previousCycle.end;
  const newCycleEnd = calculateCycleEndDate(newCycleStart);

  const newCycle: BillingCycle = {
    start: newCycleStart,
    end: newCycleEnd,
  };

  // Record meter event to Stripe with final MTU
  let stripeEventRecorded = false;
  if (typedBilling.stripe_customer_id && finalMtu > 0) {
    const meterResult = await recordMeterEvent({
      customerId: typedBilling.stripe_customer_id,
      mtuCount: finalMtu,
      timestamp: Math.floor(previousCycle.end.getTime() / 1000),
    });

    stripeEventRecorded = meterResult.success;
    if (!meterResult.success && 'error' in meterResult) {
      console.error('[Cycle Service] Failed to record Stripe meter event:', meterResult.error);
    }
  }

  // Update workspace_billing with new cycle
  const updates: Partial<WorkspaceBilling> = {
    billing_cycle_start: newCycleStart.toISOString(),
    billing_cycle_end: newCycleEnd.toISOString(),
    current_cycle_mtu: 0,
    peak_mtu_this_cycle: 0,
    peak_mtu_date: null,
  };

  const { error: updateError } = await supabase
    .from('workspace_billing')
    .update(updates)
    .eq('workspace_id', workspaceId);

  if (updateError) {
    console.error('[Cycle Service] Failed to transition billing cycle:', updateError);
    return {
      success: false,
      previousCycle,
      newCycle,
      finalMtu,
      stripeEventRecorded,
      error: 'Failed to update billing cycle dates',
    };
  }

  // Reset threshold notifications for the new cycle
  await resetThresholdNotifications(workspaceId);

  // Log the cycle transition event
  await logBillingEvent(workspaceId, 'cycle_ended', {
    previous_cycle_start: formatDateForStorage(previousCycle.start),
    previous_cycle_end: formatDateForStorage(previousCycle.end),
    final_mtu: finalMtu,
    new_cycle_start: formatDateForStorage(newCycleStart),
    new_cycle_end: formatDateForStorage(newCycleEnd),
    stripe_event_recorded: stripeEventRecorded,
  });

  console.log(
    `[Cycle Service] Transitioned workspace ${workspaceId} to new cycle: ` +
      `${formatDateForStorage(newCycleStart)} to ${formatDateForStorage(newCycleEnd)} ` +
      `(Final MTU: ${finalMtu})`
  );

  return {
    success: true,
    previousCycle,
    newCycle,
    finalMtu,
    stripeEventRecorded,
  };
}

/**
 * Checks if the current billing cycle has ended.
 */
export async function hasCycleEnded(workspaceId: string): Promise<boolean> {
  const currentCycle = await getCurrentBillingCycle(workspaceId);

  if (!currentCycle) {
    return false;
  }

  const now = new Date();
  return now >= currentCycle.end;
}

/**
 * Gets workspaces with billing cycles that have ended and need transition.
 */
export async function getWorkspacesNeedingCycleTransition(): Promise<string[]> {
  if (!isBillingEnabled()) {
    return [];
  }

  const supabase = await createServerClient();
  const now = new Date().toISOString();

  const { data: workspaces, error } = await supabase
    .from('workspace_billing')
    .select('workspace_id')
    .lt('billing_cycle_end', now)
    .in('status', ['active', 'card_required']);

  if (error) {
    console.error('[Cycle Service] Failed to get workspaces needing transition:', error);
    return [];
  }

  // Type assertion
  const typedWorkspaces = workspaces as { workspace_id: string }[] | null;
  return typedWorkspaces?.map((w) => w.workspace_id) || [];
}

// ============================================
// Helper Functions
// ============================================

/**
 * Resets threshold notifications for a workspace (called at cycle transition).
 */
async function resetThresholdNotifications(workspaceId: string): Promise<void> {
  const supabase = createAdminClient();

  // Reset threshold notification timestamps for the new cycle
  await supabase
    .from('workspace_billing')
    .update({
      last_90_threshold_sent_at: null,
      last_95_threshold_sent_at: null,
      last_exceeded_threshold_sent_at: null,
    })
    .eq('workspace_id', workspaceId);

  console.log(`[Cycle Service] Reset threshold notifications for workspace ${workspaceId}`);
}

/**
 * Logs a billing event for audit purposes.
 */
async function logBillingEvent(
  workspaceId: string,
  eventType: string,
  metadata: Record<string, Json | undefined>
): Promise<void> {
  const supabase = createAdminClient();

  const event = {
    workspace_id: workspaceId,
    event_type: eventType,
    event_data: metadata,
  };

  await supabase.from('billing_events').insert(event);
}
