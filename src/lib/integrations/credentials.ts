/**
 * Integration credentials retrieval and decryption
 *
 * Provides a helper function to fetch integration configurations from the database
 * and decrypt the stored credentials for use in API calls.
 */

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { decryptCredentials, isEncrypted } from '@/lib/crypto/encryption'
import { getPostHogHost } from '@/lib/integrations/posthog/regions'
import type { IntegrationConfig, Json } from '@/lib/supabase/types'

export interface IntegrationCredentials {
  apiKey: string
  projectId: string | null
  region: string | null
  host: string | null
  isActive: boolean
  status: string
}

/**
 * Retrieve and decrypt integration credentials for a workspace
 *
 * @param workspaceId - The workspace UUID
 * @param integrationName - The integration name (e.g., 'posthog', 'attio')
 * @returns Decrypted credentials or null if not found
 */
export async function getIntegrationCredentials(
  workspaceId: string,
  integrationName: string
): Promise<IntegrationCredentials | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('integration_configs')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('integration_name', integrationName)
    .single()

  if (error || !data) {
    return null
  }

  const config = data as IntegrationConfig
  const configJson = config.config_json as Record<string, Json>

  // Handle backwards compatibility:
  // - New encrypted credentials will be in the salt:iv:tag:ciphertext format
  // - Old unencrypted credentials should still work (during migration period)
  let apiKey: string
  let projectId: string | null = null

  if (isEncrypted(config.api_key_encrypted)) {
    // New format: decrypt the credentials (async to avoid blocking event loop)
    const decrypted = await decryptCredentials({
      apiKeyEncrypted: config.api_key_encrypted,
      projectIdEncrypted: config.project_id_encrypted
    })
    apiKey = decrypted.apiKey
    projectId = decrypted.projectId
  } else {
    // Legacy format: credentials stored as plain text (backwards compatibility)
    // This path will be removed after all credentials are migrated
    apiKey = config.api_key_encrypted
    projectId = (configJson.project_id as string) || null
  }

  // For PostHog, always derive host from region to ensure /api path is included
  // For other integrations, use the stored host value
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
    status: config.status
  }
}

/**
 * Retrieve and decrypt integration credentials using the admin (service-role) client.
 *
 * Use this variant when the caller has no user cookies/session — for example,
 * Agent callback requests that arrive with only `x-agent-secret` auth.
 * The admin client bypasses RLS, so caller must validate access independently.
 */
export async function getIntegrationCredentialsAdmin(
  workspaceId: string,
  integrationName: string
): Promise<IntegrationCredentials | null> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('integration_configs')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('integration_name', integrationName)
    .single()

  if (error || !data) {
    return null
  }

  const config = data as IntegrationConfig
  const configJson = config.config_json as Record<string, Json>

  let apiKey: string
  let projectId: string | null = null

  if (isEncrypted(config.api_key_encrypted)) {
    const decrypted = await decryptCredentials({
      apiKeyEncrypted: config.api_key_encrypted,
      projectIdEncrypted: config.project_id_encrypted
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
    status: config.status
  }
}

/**
 * Check if an integration is configured and active for a workspace
 *
 * @param workspaceId - The workspace UUID
 * @param integrationName - The integration name
 * @returns true if the integration is configured and active
 */
export async function isIntegrationConfigured(
  workspaceId: string,
  integrationName: string
): Promise<boolean> {
  const credentials = await getIntegrationCredentials(workspaceId, integrationName)
  return credentials !== null && credentials.isActive
}

/**
 * Check if an integration is configured using the admin (service-role) client.
 *
 * Use this variant in agent routes where there are no user cookies/session.
 */
export async function isIntegrationConfiguredAdmin(
  workspaceId: string,
  integrationName: string
): Promise<boolean> {
  const credentials = await getIntegrationCredentialsAdmin(workspaceId, integrationName)
  return credentials !== null && credentials.isActive
}
