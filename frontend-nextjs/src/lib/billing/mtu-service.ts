/**
 * MTU (Monthly Tracked Users) Calculation Service
 *
 * Calculates unique user counts from PostHog for billing purposes.
 * MTU is defined as the count of distinct PostHog person UUIDs.
 *
 * Features:
 * - Queries PostHog via HogQL for accurate distinct user counts
 * - Caches results to minimize API calls
 * - Stores historical data in mtu_tracking table
 * - Calculates threshold percentage for billing alerts
 */

import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createPostHogClient, PostHogClient } from '@/lib/integrations/posthog/client';
import { isBillingEnabled, getMtuLimit, BILLING_CONFIG } from '@/lib/utils/deployment';
import type { MtuTracking, MtuTrackingInsert, WorkspaceBilling } from '@/lib/supabase/types';

// ============================================
// Types
// ============================================

export interface MTUResult {
  mtuCount: number;
  trackedDate: string;
  billingCycleStart: string;
  billingCycleEnd: string;
  source: 'posthog' | 'cache';
}

export interface MTUHistory {
  records: MtuTracking[];
  totalMtu: number;
  averageMtu: number;
}

export interface ThresholdStatus {
  currentMtu: number;
  limit: number;
  percentage: number;
  status: 'safe' | 'warning_90' | 'warning_95' | 'exceeded';
  remainingMtu: number;
}

export interface MTUCalculationOptions {
  /** Force fresh calculation, bypassing cache */
  skipCache?: boolean;
  /** Date to calculate MTU for (defaults to today) */
  date?: Date;
}

// ============================================
// Cache Configuration
// ============================================

/** Cache duration in milliseconds (1 hour) */
const CACHE_DURATION_MS = 60 * 60 * 1000;

/** In-memory cache for MTU results */
const mtuCache = new Map<string, { result: MTUResult; timestamp: number }>();

function getCacheKey(workspaceId: string, date: string): string {
  return `${workspaceId}:${date}`;
}

function getCachedResult(workspaceId: string, date: string): MTUResult | null {
  const key = getCacheKey(workspaceId, date);
  const cached = mtuCache.get(key);

  if (!cached) {
    return null;
  }

  // Check if cache is still valid
  if (Date.now() - cached.timestamp > CACHE_DURATION_MS) {
    mtuCache.delete(key);
    return null;
  }

  return { ...cached.result, source: 'cache' };
}

function setCachedResult(workspaceId: string, date: string, result: MTUResult): void {
  const key = getCacheKey(workspaceId, date);
  mtuCache.set(key, { result, timestamp: Date.now() });
}

export function invalidateCache(workspaceId: string): void {
  // Remove all cache entries for this workspace
  for (const key of mtuCache.keys()) {
    if (key.startsWith(`${workspaceId}:`)) {
      mtuCache.delete(key);
    }
  }
}

// ============================================
// Date Formatting Helpers
// ============================================

/** Regex pattern for YYYY-MM-DD date format */
const DATE_FORMAT_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Safely formats a Date object to YYYY-MM-DD string for HogQL queries.
 * Validates the output format to prevent injection attacks.
 * @throws Error if date cannot be safely formatted
 */
function formatDateForHogQL(date: Date): string {
  const dateStr = date.toISOString().split('T')[0];

  // Validate the format is exactly YYYY-MM-DD
  if (!DATE_FORMAT_REGEX.test(dateStr)) {
    throw new Error(`Invalid date format for HogQL: ${dateStr}`);
  }

  return dateStr;
}

// ============================================
// PostHog Integration
// ============================================

/**
 * Gets the PostHog client for a workspace.
 */
async function getPostHogClientForWorkspace(workspaceId: string): Promise<PostHogClient | null> {
  const supabase = await createServerClient();

  const { data: config, error } = await supabase
    .from('posthog_workspace_config')
    .select('posthog_api_key, posthog_project_id')
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)
    .eq('is_validated', true)
    .single();

  if (error || !config) {
    console.warn(`[MTU Service] No PostHog config found for workspace ${workspaceId}`);
    return null;
  }

  // Type assertion since we're selecting specific fields
  const typedConfig = config as { posthog_api_key: string; posthog_project_id: string };
  return createPostHogClient(typedConfig.posthog_api_key, typedConfig.posthog_project_id);
}

/**
 * Queries PostHog for distinct user count using HogQL.
 * Uses validated date formatting to prevent SQL injection.
 */
async function queryPostHogMTU(
  client: PostHogClient,
  startDate: Date,
  endDate: Date
): Promise<number> {
  // Safely format dates with validation
  const startDateStr = formatDateForHogQL(startDate);
  const endDateStr = formatDateForHogQL(endDate);

  // HogQL query to count ALL distinct identified persons (those with email)
  // MTU counts all users ever identified, not just those created in the billing cycle
  // This filters out anonymous visitors who haven't been identified via posthog.identify()
  const hogql = `
    SELECT count(distinct id) as mtu_count
    FROM persons
    WHERE properties['email'] IS NOT NULL
      AND properties['email'] != ''
  `;

  try {
    console.log(`[MTU Service] Executing HogQL query for MTU count`);
    const result = await client.query(hogql, { timeoutMs: 60000 });

    // Extract the count from the result
    // Result format: { results: [[count]], columns: ['mtu_count'] }
    if (result.results && result.results.length > 0 && result.results[0].length > 0) {
      const count = Number(result.results[0][0]) || 0;
      console.log(`[MTU Service] PostHog returned MTU count: ${count}`);
      return count;
    }

    return 0;
  } catch (error) {
    console.error('[MTU Service] Failed to query PostHog:', error);
    throw error;
  }
}

/** Maximum persons to count via API fallback (prevents Vercel timeout) */
const MAX_PERSONS_API_COUNT = 100_000;

/**
 * Alternative: Count distinct persons using the Persons API with pagination.
 * Use this if HogQL is not available or for validation.
 */
async function countPersonsViaAPI(
  client: PostHogClient,
  _startDate: Date,
  _endDate: Date
): Promise<number> {
  let totalCount = 0;
  let cursor: string | undefined;
  let hasMore = true;

  console.log(`[MTU Service] Counting persons via API (fallback)`);

  while (hasMore) {
    const response = await client.getPersons({ limit: 100, cursor });
    // Filter to only count persons with email property (identified users)
    const identifiedPersons = response.results.filter(
      (person) => person.properties?.email
    );
    totalCount += identifiedPersons.length;
    cursor = response.next;
    hasMore = !!response.next;

    // Safety limit to prevent Vercel timeout (5 min limit on Pro plan)
    if (totalCount > MAX_PERSONS_API_COUNT) {
      console.warn(`[MTU Service] Safety limit of ${MAX_PERSONS_API_COUNT} reached, stopping pagination`);
      break;
    }
  }

  console.log(`[MTU Service] API count complete: ${totalCount} persons`);
  return totalCount;
}

// ============================================
// Billing Cycle Helpers
// ============================================

/**
 * Gets the billing cycle dates for a workspace.
 */
async function getBillingCycle(workspaceId: string): Promise<{ start: Date; end: Date } | null> {
  const supabase = await createServerClient();

  const { data: billing } = await supabase
    .from('workspace_billing')
    .select('billing_cycle_start, billing_cycle_end')
    .eq('workspace_id', workspaceId)
    .single();

  // Type assertion for selected fields
  const typedBilling = billing as { billing_cycle_start: string | null; billing_cycle_end: string | null } | null;

  if (!typedBilling?.billing_cycle_start || !typedBilling?.billing_cycle_end) {
    // Default to current month if no billing cycle set
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { start, end };
  }

  return {
    start: new Date(typedBilling.billing_cycle_start),
    end: new Date(typedBilling.billing_cycle_end),
  };
}

// ============================================
// Main MTU Functions
// ============================================

/**
 * Calculates MTU for a workspace.
 * Returns cached result if available and not expired.
 */
export async function calculateMTU(
  workspaceId: string,
  options: MTUCalculationOptions = {}
): Promise<MTUResult | null> {
  const { skipCache = false, date = new Date() } = options;
  const dateStr = date.toISOString().split('T')[0];

  console.log(`[MTU Service] Calculating MTU for workspace ${workspaceId}, date: ${dateStr}`);

  // Check cache first
  if (!skipCache) {
    const cached = getCachedResult(workspaceId, dateStr);
    if (cached) {
      console.log(`[MTU Service] Returning cached result: ${cached.mtuCount} MTUs`);
      return cached;
    }
  }

  // Get billing cycle
  const billingCycle = await getBillingCycle(workspaceId);
  if (!billingCycle) {
    console.error(`[MTU Service] Could not determine billing cycle for workspace ${workspaceId}`);
    return null;
  }

  // Get PostHog client
  const postHogClient = await getPostHogClientForWorkspace(workspaceId);
  if (!postHogClient) {
    console.warn(`[MTU Service] No PostHog client available for workspace ${workspaceId}`);
    return null;
  }

  // Query PostHog for MTU count
  let mtuCount: number;
  try {
    mtuCount = await queryPostHogMTU(postHogClient, billingCycle.start, date);
  } catch (error) {
    console.warn('[MTU Service] HogQL query failed, falling back to API count:', error);
    mtuCount = await countPersonsViaAPI(postHogClient, billingCycle.start, date);
  }

  const result: MTUResult = {
    mtuCount,
    trackedDate: dateStr,
    billingCycleStart: billingCycle.start.toISOString().split('T')[0],
    billingCycleEnd: billingCycle.end.toISOString().split('T')[0],
    source: 'posthog',
  };

  // Cache the result
  setCachedResult(workspaceId, dateStr, result);

  return result;
}

/**
 * Gets MTU history for a workspace within a date range.
 */
export async function getMTUHistory(
  workspaceId: string,
  startDate: Date,
  endDate: Date
): Promise<MTUHistory> {
  const supabase = await createServerClient();

  const { data: records, error } = await supabase
    .from('mtu_tracking')
    .select('*')
    .eq('workspace_id', workspaceId)
    .gte('tracking_date', startDate.toISOString().split('T')[0])
    .lte('tracking_date', endDate.toISOString().split('T')[0])
    .order('tracking_date', { ascending: false });

  if (error) {
    console.error('[MTU Service] Failed to fetch MTU history:', error);
    return { records: [], totalMtu: 0, averageMtu: 0 };
  }

  // Type assertion for new billing tables
  const typedRecords = records as MtuTracking[];
  const totalMtu = typedRecords.reduce((sum, r) => sum + (r.mtu_count || 0), 0);
  const averageMtu = typedRecords.length > 0 ? Math.round(totalMtu / typedRecords.length) : 0;

  return {
    records: typedRecords,
    totalMtu,
    averageMtu,
  };
}

/**
 * Gets the current billing cycle's cumulative MTU for a workspace.
 */
export async function getCurrentBillingCycleMTU(workspaceId: string): Promise<number> {
  const supabase = await createServerClient();

  // Get the billing record which has the current cycle MTU
  const { data: billing } = await supabase
    .from('workspace_billing')
    .select('current_cycle_mtu, billing_cycle_start, billing_cycle_end')
    .eq('workspace_id', workspaceId)
    .single();

  // Type assertion for new billing tables
  const typedBilling = billing as { current_cycle_mtu: number | null } | null;

  if (!typedBilling) {
    // Fallback: calculate from mtu_tracking table
    const billingCycle = await getBillingCycle(workspaceId);
    if (!billingCycle) return 0;

    const { data: records } = await supabase
      .from('mtu_tracking')
      .select('mtu_count')
      .eq('workspace_id', workspaceId)
      .gte('tracking_date', billingCycle.start.toISOString().split('T')[0])
      .lt('tracking_date', billingCycle.end.toISOString().split('T')[0]);

    // Type assertion for mtu_tracking records
    const typedRecords = records as { mtu_count: number | null }[] | null;
    return typedRecords?.reduce((sum, r) => sum + (r.mtu_count || 0), 0) || 0;
  }

  return typedBilling.current_cycle_mtu || 0;
}

/**
 * Gets the threshold status for a workspace's MTU usage.
 */
export async function getThresholdStatus(workspaceId: string): Promise<ThresholdStatus> {
  const currentMtu = await getCurrentBillingCycleMTU(workspaceId);
  const limit = await getWorkspaceMtuLimit(workspaceId);

  const percentage = limit > 0 ? Math.round((currentMtu / limit) * 100) : 0;
  const remainingMtu = Math.max(0, limit - currentMtu);

  // Use threshold constants from BILLING_CONFIG for consistency
  const { WARNING_90, WARNING_95, EXCEEDED } = BILLING_CONFIG.THRESHOLDS;

  let status: ThresholdStatus['status'] = 'safe';
  if (percentage >= EXCEEDED) {
    status = 'exceeded';
  } else if (percentage >= WARNING_95) {
    status = 'warning_95';
  } else if (percentage >= WARNING_90) {
    status = 'warning_90';
  }

  return {
    currentMtu,
    limit,
    percentage,
    status,
    remainingMtu,
  };
}

/**
 * Gets the MTU limit for a workspace.
 */
async function getWorkspaceMtuLimit(workspaceId: string): Promise<number> {
  // In self-hosted mode, return unlimited
  if (!isBillingEnabled()) {
    return BILLING_CONFIG.SELF_HOSTED_MTU_LIMIT;
  }

  const supabase = await createServerClient();

  const { data: billing } = await supabase
    .from('workspace_billing')
    .select('free_tier_mtu_limit')
    .eq('workspace_id', workspaceId)
    .single();

  // Type assertion for new billing tables
  const typedBilling = billing as { free_tier_mtu_limit: number | null } | null;
  return getMtuLimit(typedBilling?.free_tier_mtu_limit ?? undefined);
}

// ============================================
// MTU Tracking Storage
// ============================================

/**
 * Stores an MTU calculation result in the database.
 */
export async function storeMTUTracking(
  workspaceId: string,
  result: MTUResult,
  mtuBySource?: Record<string, number>
): Promise<MtuTracking | null> {
  const supabase = createAdminClient();

  const record: MtuTrackingInsert = {
    workspace_id: workspaceId,
    tracking_date: result.trackedDate,
    mtu_count: result.mtuCount,
    mtu_by_source: mtuBySource || { posthog: result.mtuCount },
    billing_cycle_start: result.billingCycleStart,
    billing_cycle_end: result.billingCycleEnd,
    reported_to_stripe: false,
  };

  const { data, error } = await supabase
    .from('mtu_tracking')
    .upsert(record, {
      onConflict: 'workspace_id,tracking_date',
    })
    .select()
    .single();

  if (error) {
    console.error('[MTU Service] Failed to store MTU tracking:', error);
    return null;
  }

  // Invalidate cache for this workspace
  invalidateCache(workspaceId);

  // Update the workspace_billing current_cycle_mtu
  await updateBillingCycleMtu(workspaceId, result.mtuCount);

  return data as MtuTracking;
}

/**
 * Updates the current_cycle_mtu in workspace_billing.
 */
async function updateBillingCycleMtu(workspaceId: string, mtuCount: number): Promise<void> {
  const supabase = createAdminClient();

  // Get the current billing record
  const { data: billing } = await supabase
    .from('workspace_billing')
    .select('current_cycle_mtu, peak_mtu_this_cycle')
    .eq('workspace_id', workspaceId)
    .single();

  // Type assertion for new billing tables
  const typedBilling = billing as { current_cycle_mtu: number | null; peak_mtu_this_cycle: number | null } | null;

  if (!typedBilling) return;

  const updates: Partial<WorkspaceBilling> = {
    current_cycle_mtu: mtuCount,
  };

  // Update peak MTU if current exceeds it
  if (mtuCount > (typedBilling.peak_mtu_this_cycle || 0)) {
    updates.peak_mtu_this_cycle = mtuCount;
    updates.peak_mtu_date = new Date().toISOString().split('T')[0];
  }

  await supabase.from('workspace_billing').update(updates).eq('workspace_id', workspaceId);
}

/**
 * Marks an MTU tracking record as reported to Stripe.
 */
export async function markMtuAsReportedToStripe(
  workspaceId: string,
  trackingDate: string,
  stripeUsageRecordId?: string
): Promise<void> {
  const supabase = createAdminClient();

  await supabase
    .from('mtu_tracking')
    .update({
      reported_to_stripe: true,
      reported_at: new Date().toISOString(),
      stripe_usage_record_id: stripeUsageRecordId,
    })
    .eq('workspace_id', workspaceId)
    .eq('tracking_date', trackingDate);
}

/**
 * Batch marks multiple MTU tracking records as reported to Stripe.
 * Replaces N individual UPDATE queries with a single batch update per workspace.
 */
export async function batchMarkMtuAsReportedToStripe(
  records: Array<{ workspaceId: string; trackingDate: string }>
): Promise<void> {
  if (records.length === 0) return;

  const supabase = createAdminClient();
  const reportedAt = new Date().toISOString();

  // Group by workspace to minimize queries
  const byWorkspace = new Map<string, string[]>();
  for (const record of records) {
    const dates = byWorkspace.get(record.workspaceId) || [];
    dates.push(record.trackingDate);
    byWorkspace.set(record.workspaceId, dates);
  }

  // One UPDATE per workspace instead of one per record
  await Promise.all(
    Array.from(byWorkspace.entries()).map(([workspaceId, dates]) =>
      supabase
        .from('mtu_tracking')
        .update({
          reported_to_stripe: true,
          reported_at: reportedAt,
        })
        .eq('workspace_id', workspaceId)
        .in('tracking_date', dates)
    )
  );
}

/**
 * Gets unreported MTU tracking records for a workspace.
 */
export async function getUnreportedMtuRecords(workspaceId: string): Promise<MtuTracking[]> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from('mtu_tracking')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('reported_to_stripe', false)
    .order('tracking_date', { ascending: true });

  if (error) {
    console.error('[MTU Service] Failed to fetch unreported MTU records:', error);
    return [];
  }

  return data as MtuTracking[];
}
