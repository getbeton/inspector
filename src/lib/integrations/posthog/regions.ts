/**
 * PostHog region configuration
 * Single source of truth for region-to-host mapping
 *
 * This module centralizes all PostHog region configuration to ensure
 * consistent host derivation across the codebase. The /api path is
 * included because PostHog's API requires it for all API calls.
 */

/**
 * PostHog region hosts with the /api path required for API calls
 */
export const POSTHOG_REGION_HOSTS: Record<string, string> = {
  us: 'https://us.posthog.com/api',
  eu: 'https://eu.posthog.com/api',
}

export const DEFAULT_REGION = 'us'

/**
 * Get the PostHog API host for a given region
 * Always includes the /api path required for API calls
 *
 * @param region - The region code ('us' or 'eu')
 * @returns The full API host URL (e.g., 'https://us.posthog.com/api')
 */
export function getPostHogHost(region?: string | null): string {
  const normalizedRegion = (region || DEFAULT_REGION).toLowerCase()
  return POSTHOG_REGION_HOSTS[normalizedRegion] || POSTHOG_REGION_HOSTS[DEFAULT_REGION]
}

/**
 * Valid PostHog regions
 */
export type PostHogRegion = 'us' | 'eu'

/**
 * Get the PostHog app host for a given region (no /api suffix).
 * Used server-side only for constructing UI URLs (profile links, cohort links).
 *
 * @param region - The region code ('us' or 'eu')
 * @returns The app host URL (e.g., 'https://us.posthog.com')
 */
export function getPostHogAppHost(region?: string | null): string {
  const apiHost = getPostHogHost(region)
  return apiHost.replace(/\/api$/, '')
}

/**
 * Check if a string is a valid PostHog region
 */
export function isValidRegion(region: string): region is PostHogRegion {
  return region.toLowerCase() in POSTHOG_REGION_HOSTS
}
