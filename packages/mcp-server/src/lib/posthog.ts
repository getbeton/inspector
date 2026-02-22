/**
 * PostHog client factory for MCP tools
 *
 * Creates a PostHogClient from workspace integration credentials.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './copied/supabase-types.js'
import { PostHogClient } from './copied/posthog-client.js'
import { getIntegrationCredentials } from './credentials.js'

/**
 * Create a PostHogClient for a workspace.
 * Fetches and decrypts credentials from the integration_configs table.
 *
 * @throws Error if PostHog is not configured for the workspace
 */
export async function createWorkspacePostHogClient(
  supabase: SupabaseClient<Database>,
  workspaceId: string
): Promise<PostHogClient> {
  const creds = await getIntegrationCredentials(supabase, workspaceId, 'posthog')

  if (!creds || !creds.isActive) {
    throw new Error('PostHog is not configured for this workspace')
  }

  if (!creds.projectId) {
    throw new Error('PostHog project ID is missing')
  }

  return new PostHogClient({
    apiKey: creds.apiKey,
    projectId: creds.projectId,
    host: creds.host || undefined,
  })
}
