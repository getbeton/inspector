/**
 * Billing Enforcement Service
 *
 * Enforces billing rules based on MTU thresholds and payment status.
 * Determines whether a workspace can use the product and what restrictions apply.
 *
 * Enforcement Rules:
 * - Without card: Full access if MTU < threshold, blocked if MTU >= threshold
 * - With card: Full access regardless of MTU (they will be charged)
 * - Self-hosted: Always full access, no billing checks
 */

import { createClient as createServerClient } from '@/lib/supabase/server';
import { isBillingEnabled, BILLING_CONFIG } from '@/lib/utils/deployment';
import type { BillingStatus } from '@/lib/supabase/types';

// ============================================
// Types
// ============================================

export type AccessStatusType = 'active' | 'free_tier' | 'over_threshold' | 'payment_failed' | 'self_hosted';

export interface AccessStatus {
  /** Whether the workspace has access to the product */
  hasAccess: boolean;
  /** Current billing status */
  status: AccessStatusType;
  /** Current MTU count for this billing cycle */
  mtuCount: number;
  /** Free tier threshold (e.g., 200) */
  threshold: number;
  /** Percentage of threshold used (can exceed 100) */
  percentUsed: number;
  /** Whether a payment card is linked */
  cardLinked: boolean;
  /** Human-readable reason if blocked, null otherwise */
  blockReason: string | null;
  /** Whether the user needs to link a card to continue */
  requiresCardLink: boolean;
  /** Billing status from database */
  billingStatus: BillingStatus | null;
}

export interface AccessCheckResult {
  allowed: boolean;
  status: AccessStatus;
}

// ============================================
// Block Reason Messages
// ============================================

const BLOCK_REASONS = {
  OVER_THRESHOLD:
    'You have exceeded the free tier limit of {threshold} monthly tracked users. Please add a payment method to continue using the product.',
  PAYMENT_FAILED:
    'Your last payment failed. Please update your payment method to restore access.',
  SUBSCRIPTION_CANCELLED:
    'Your subscription has been cancelled. Please reactivate to continue using the product.',
} as const;

// ============================================
// Main Enforcement Functions
// ============================================

/**
 * Gets the detailed access status for a workspace.
 * This is the main function to call for billing enforcement.
 */
export async function getAccessStatus(workspaceId: string): Promise<AccessStatus> {
  // Self-hosted mode: always allow access
  if (!isBillingEnabled()) {
    return createSelfHostedStatus();
  }

  const supabase = await createServerClient();

  // Get billing data for the workspace
  const { data: billing } = await supabase
    .from('workspace_billing')
    .select(
      'status, current_cycle_mtu, free_tier_mtu_limit, stripe_payment_method_id, card_last_four'
    )
    .eq('workspace_id', workspaceId)
    .single();

  // Type assertion for new billing tables
  const typedBilling = billing as {
    status: BillingStatus;
    current_cycle_mtu: number | null;
    free_tier_mtu_limit: number | null;
    stripe_payment_method_id: string | null;
    card_last_four: string | null;
  } | null;

  // If no billing record exists, treat as new workspace in free tier
  if (!typedBilling) {
    return createFreeTierStatus(0, BILLING_CONFIG.FREE_TIER_MTU_LIMIT);
  }

  const mtuCount = typedBilling.current_cycle_mtu || 0;
  const threshold = typedBilling.free_tier_mtu_limit || BILLING_CONFIG.FREE_TIER_MTU_LIMIT;
  const cardLinked = !!typedBilling.stripe_payment_method_id || !!typedBilling.card_last_four;
  const billingStatus = typedBilling.status;
  const percentUsed = threshold > 0 ? Math.round((mtuCount / threshold) * 100) : 0;

  // Check for payment failure
  if (billingStatus === 'past_due') {
    return {
      hasAccess: false,
      status: 'payment_failed',
      mtuCount,
      threshold,
      percentUsed,
      cardLinked,
      blockReason: BLOCK_REASONS.PAYMENT_FAILED,
      requiresCardLink: true,
      billingStatus,
    };
  }

  // Check for cancelled subscription
  if (billingStatus === 'cancelled') {
    return {
      hasAccess: false,
      status: 'over_threshold', // Use over_threshold as the status
      mtuCount,
      threshold,
      percentUsed,
      cardLinked: false,
      blockReason: BLOCK_REASONS.SUBSCRIPTION_CANCELLED,
      requiresCardLink: true,
      billingStatus,
    };
  }

  // With card linked: always allow access (they will be charged)
  if (cardLinked || billingStatus === 'active') {
    return {
      hasAccess: true,
      status: 'active',
      mtuCount,
      threshold,
      percentUsed,
      cardLinked: true,
      blockReason: null,
      requiresCardLink: false,
      billingStatus,
    };
  }

  // Without card: check if over threshold
  const isOverThreshold = mtuCount >= threshold;

  if (isOverThreshold) {
    return {
      hasAccess: false,
      status: 'over_threshold',
      mtuCount,
      threshold,
      percentUsed,
      cardLinked: false,
      blockReason: BLOCK_REASONS.OVER_THRESHOLD.replace('{threshold}', threshold.toString()),
      requiresCardLink: true,
      billingStatus,
    };
  }

  // Under threshold without card: free tier access
  return createFreeTierStatus(mtuCount, threshold, billingStatus);
}

/**
 * Simplified check for whether workspace has access.
 * Use this in API middleware for quick access checks.
 */
export async function checkAccess(workspaceId: string): Promise<AccessCheckResult> {
  const status = await getAccessStatus(workspaceId);

  return {
    allowed: status.hasAccess,
    status,
  };
}

/**
 * Checks if the workspace is over the free tier threshold.
 */
export async function isOverThreshold(workspaceId: string): Promise<boolean> {
  if (!isBillingEnabled()) {
    return false;
  }

  const status = await getAccessStatus(workspaceId);
  return status.mtuCount >= status.threshold;
}

/**
 * Checks if the workspace needs to link a card to continue.
 */
export async function requiresCardLink(workspaceId: string): Promise<boolean> {
  if (!isBillingEnabled()) {
    return false;
  }

  const status = await getAccessStatus(workspaceId);
  return status.requiresCardLink;
}

/**
 * Gets the human-readable block reason if workspace is blocked.
 * Returns null if workspace has access.
 */
export async function getBlockReason(workspaceId: string): Promise<string | null> {
  const status = await getAccessStatus(workspaceId);
  return status.blockReason;
}

/**
 * Gets the threshold percentage for a workspace.
 * Useful for displaying progress bars and warnings.
 */
export async function getThresholdPercentage(workspaceId: string): Promise<number> {
  if (!isBillingEnabled()) {
    return 0;
  }

  const status = await getAccessStatus(workspaceId);
  return status.percentUsed;
}

/**
 * Checks if the workspace should see a threshold warning.
 * Returns the warning level if applicable.
 */
export async function getThresholdWarningLevel(
  workspaceId: string
): Promise<'warning_90' | 'warning_95' | 'exceeded' | null> {
  if (!isBillingEnabled()) {
    return null;
  }

  const status = await getAccessStatus(workspaceId);

  // Only show warnings if card is not linked
  if (status.cardLinked) {
    return null;
  }

  // Use threshold constants from BILLING_CONFIG for consistency
  const { WARNING_90, WARNING_95, EXCEEDED } = BILLING_CONFIG.THRESHOLDS;

  if (status.percentUsed >= EXCEEDED) {
    return 'exceeded';
  }
  if (status.percentUsed >= WARNING_95) {
    return 'warning_95';
  }
  if (status.percentUsed >= WARNING_90) {
    return 'warning_90';
  }

  return null;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Creates an access status for self-hosted mode.
 */
function createSelfHostedStatus(): AccessStatus {
  return {
    hasAccess: true,
    status: 'self_hosted',
    mtuCount: 0,
    threshold: Infinity,
    percentUsed: 0,
    cardLinked: false,
    blockReason: null,
    requiresCardLink: false,
    billingStatus: null,
  };
}

/**
 * Creates an access status for free tier (under threshold, no card).
 */
function createFreeTierStatus(
  mtuCount: number,
  threshold: number,
  billingStatus: BillingStatus | null = 'free'
): AccessStatus {
  return {
    hasAccess: true,
    status: 'free_tier',
    mtuCount,
    threshold,
    percentUsed: threshold > 0 ? Math.round((mtuCount / threshold) * 100) : 0,
    cardLinked: false,
    blockReason: null,
    requiresCardLink: false,
    billingStatus,
  };
}

// ============================================
// Utility Functions for API Routes
// ============================================

/**
 * Enforces access and throws an error if blocked.
 * Use this in API routes that require billing access.
 */
export async function enforceAccess(workspaceId: string): Promise<void> {
  const { allowed, status } = await checkAccess(workspaceId);

  if (!allowed) {
    const error = new Error(status.blockReason || 'Access denied due to billing restrictions');
    (error as Error & { status: number; code: string }).status = 403;
    (error as Error & { status: number; code: string }).code = 'BILLING_ACCESS_DENIED';
    throw error;
  }
}

/**
 * Middleware helper to check access and return appropriate response.
 * Returns null if access is allowed, otherwise returns an error response object.
 */
export async function checkAccessForRequest(
  workspaceId: string
): Promise<{ error: string; code: string; status: AccessStatus } | null> {
  const { allowed, status } = await checkAccess(workspaceId);

  if (!allowed) {
    return {
      error: status.blockReason || 'Access denied due to billing restrictions',
      code: 'BILLING_ACCESS_DENIED',
      status,
    };
  }

  return null;
}
