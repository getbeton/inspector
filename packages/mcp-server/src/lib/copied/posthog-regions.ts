/**
 * PostHog region configuration — copied from src/lib/integrations/posthog/regions.ts
 */

export const POSTHOG_REGION_HOSTS: Record<string, string> = {
  us: 'https://us.posthog.com/api',
  eu: 'https://eu.posthog.com/api',
}

export const DEFAULT_REGION = 'us'

export function getPostHogHost(region?: string | null): string {
  const normalizedRegion = (region || DEFAULT_REGION).toLowerCase()
  return POSTHOG_REGION_HOSTS[normalizedRegion] || POSTHOG_REGION_HOSTS[DEFAULT_REGION]
}

export type PostHogRegion = 'us' | 'eu'

export function getPostHogAppHost(region?: string | null): string {
  const apiHost = getPostHogHost(region)
  return apiHost.replace(/\/api$/, '')
}

export function isValidRegion(region: string): region is PostHogRegion {
  return region.toLowerCase() in POSTHOG_REGION_HOSTS
}
