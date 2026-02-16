/**
 * Shared PostHog configuration helper (server-side only)
 *
 * Centralizes credential retrieval and validation for PostHog.
 * Used by all PostHog API routes to avoid duplicating the same
 * getPostHogConfig() pattern across multiple files.
 *
 * SECURITY: The returned values (apiKey, projectId) must NEVER be
 * sent to the frontend. Only use them for server-side API calls.
 */

import { getIntegrationCredentials } from '@/lib/integrations/credentials'
import { getPostHogHost, getPostHogAppHost } from '@/lib/integrations/posthog/regions'
import { ConfigurationError } from '@/lib/errors/query-errors'

export interface PostHogConfig {
  /** PostHog API key — NEVER send to frontend */
  apiKey: string
  /** PostHog project ID — NEVER send to frontend */
  projectId: string
  /** API host with /api suffix (e.g., https://us.posthog.com/api) */
  host: string
  /** App host without /api (e.g., https://us.posthog.com) — for constructing UI URLs server-side */
  appHost: string
}

/**
 * Retrieve and validate PostHog configuration for a workspace.
 * Throws ConfigurationError with user-friendly messages if not configured.
 */
export async function getPostHogConfig(workspaceId: string): Promise<PostHogConfig> {
  const credentials = await getIntegrationCredentials(workspaceId, 'posthog')

  if (!credentials) {
    throw new ConfigurationError(
      'PostHog integration is not configured for this workspace. ' +
      'Please configure PostHog in Settings \u2192 Integrations.'
    )
  }

  if (!credentials.isActive) {
    throw new ConfigurationError(
      'PostHog integration is disabled for this workspace. ' +
      'Please enable it in Settings \u2192 Integrations.'
    )
  }

  if (credentials.status !== 'connected' && credentials.status !== 'validating') {
    throw new ConfigurationError(
      `PostHog integration status is "${credentials.status}". ` +
      'Please reconnect PostHog in Settings \u2192 Integrations.'
    )
  }

  if (!credentials.apiKey) {
    throw new ConfigurationError(
      'PostHog API key is missing. Please reconfigure PostHog.'
    )
  }

  if (!credentials.projectId) {
    throw new ConfigurationError(
      'PostHog project ID is missing. Please reconfigure PostHog with a project ID.'
    )
  }

  return {
    apiKey: credentials.apiKey,
    projectId: credentials.projectId,
    host: getPostHogHost(credentials.region),
    appHost: getPostHogAppHost(credentials.region),
  }
}
