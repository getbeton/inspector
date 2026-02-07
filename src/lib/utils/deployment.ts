/**
 * Deployment Mode Feature Flag
 *
 * Controls whether billing features are enabled based on deployment environment.
 * - 'cloud': Billing enabled, MTU limits enforced, Stripe integration active
 * - 'self-hosted': Billing disabled, unlimited access, no Stripe calls
 *
 * Environment Variable: DEPLOYMENT_MODE
 * Default: 'self-hosted' (safe default for self-hosters)
 */

export type DeploymentMode = 'cloud' | 'self-hosted';

/**
 * Get the current deployment mode from environment variable.
 * Defaults to 'self-hosted' if not set or invalid.
 */
export function getDeploymentMode(): DeploymentMode {
  const mode = process.env.DEPLOYMENT_MODE?.toLowerCase();

  if (mode === 'cloud') {
    return 'cloud';
  }

  // Default to 'self-hosted' for safety
  // This ensures self-hosters don't accidentally enable billing
  return 'self-hosted';
}

/**
 * Check if running in cloud deployment mode.
 * Returns true only when explicitly configured as 'cloud'.
 */
export function isCloudDeployment(): boolean {
  return getDeploymentMode() === 'cloud';
}

/**
 * Check if running in self-hosted deployment mode.
 * Returns true if DEPLOYMENT_MODE is 'self-hosted', undefined, or invalid.
 */
export function isSelfHosted(): boolean {
  return getDeploymentMode() === 'self-hosted';
}

/**
 * Check if billing features should be enabled.
 * Alias for isCloudDeployment() - billing is only enabled in cloud mode.
 *
 * Use this function in:
 * - API routes to skip billing logic
 * - UI components to conditionally render billing UI
 * - Cron jobs to skip MTU tracking
 * - Middleware to skip billing enforcement
 *
 * @example
 * ```ts
 * // In API route
 * if (!isBillingEnabled()) {
 *   return { billingStatus: 'disabled', unlimited: true };
 * }
 *
 * // In React component
 * {isBillingEnabled() && <BillingStatusCard />}
 * ```
 */
export function isBillingEnabled(): boolean {
  return isCloudDeployment();
}

/**
 * Configuration object for billing-related settings.
 * Contains defaults that can be overridden in cloud mode.
 */
export const BILLING_CONFIG = {
  /** Default MTU limit for free tier (used in cloud mode) */
  FREE_TIER_MTU_LIMIT: 200,

  /** Threshold percentages for warnings */
  THRESHOLDS: {
    WARNING_90: 90,
    WARNING_95: 95,
    EXCEEDED: 100,
  },

  /** Self-hosted mode returns unlimited MTU */
  SELF_HOSTED_MTU_LIMIT: Infinity,
} as const;

/**
 * Get the MTU limit for a workspace.
 * Returns Infinity for self-hosted deployments.
 */
export function getMtuLimit(customLimit?: number): number {
  if (isSelfHosted()) {
    return BILLING_CONFIG.SELF_HOSTED_MTU_LIMIT;
  }

  return customLimit ?? BILLING_CONFIG.FREE_TIER_MTU_LIMIT;
}

/**
 * Check if MTU tracking should be performed.
 * Only track MTU in cloud deployments.
 */
export function shouldTrackMtu(): boolean {
  return isCloudDeployment();
}

/**
 * Check if Stripe API calls should be made.
 * Only make Stripe calls in cloud deployments.
 */
export function shouldUseStripe(): boolean {
  return isCloudDeployment();
}
