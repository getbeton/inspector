/**
 * Integration credentials retrieval — adapted from src/lib/integrations/credentials.ts
 *
 * Key difference: accepts a SupabaseClient parameter instead of creating one
 * from Next.js cookies. This makes it usable in the MCP server context.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, IntegrationConfig, Json } from './copied/supabase-types.js'
import { decryptCredentials, isEncrypted } from './copied/encryption.js'
import { getPostHogHost } from './copied/posthog-regions.js'

export interface IntegrationCredentials {
  apiKey: string
  projectId: string | null
  region: string | null
  host: string | null
  isActive: boolean
  status: string
}

/**
 * Retrieve and decrypt integration credentials for a workspace.
 *
 * @param supabase - Authenticated Supabase client (user or admin)
 * @param workspaceId - The workspace UUID
 * @param integrationName - e.g. 'posthog', 'attio', 'stripe'
 */
export async function getIntegrationCredentials(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
  integrationName: string
): Promise<IntegrationCredentials | null> {
  const { data, error } = await supabase
    .from('integration_configs')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('integration_name', integrationName)
    .single()

  if (error || !data) return null

  const config = data as IntegrationConfig
  const configJson = config.config_json as Record<string, Json>

  let apiKey: string
  let projectId: string | null = null

  if (isEncrypted(config.api_key_encrypted)) {
    const decrypted = await decryptCredentials({
      apiKeyEncrypted: config.api_key_encrypted,
      projectIdEncrypted: config.project_id_encrypted,
    })
    apiKey = decrypted.apiKey
    projectId = decrypted.projectId
  } else {
    apiKey = config.api_key_encrypted
    projectId = (configJson.project_id as string) || null
  }

  const region = (configJson.region as string) || null
  const storedHost = (configJson.host as string) || null
  const derivedHost = integrationName === 'posthog' && region
    ? getPostHogHost(region)
    : storedHost

  return {
    apiKey,
    projectId,
    region,
    host: derivedHost,
    isActive: config.is_active,
    status: config.status,
  }
}
