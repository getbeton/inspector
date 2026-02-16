/**
 * Integrations API Client
 *
 * Functions for interacting with the integrations API endpoints.
 * Used by React Query hooks for data fetching and mutations.
 */

export interface IntegrationCredentialsResponse {
  integration: string
  status: string
  isActive?: boolean
  credentials: {
    apiKey: string
    projectId: string | null
    region: string | null
    host: string | null
  } | null
}

/**
 * Fetches decrypted credentials for an integration.
 */
export async function getIntegrationCredentials(
  name: string
): Promise<IntegrationCredentialsResponse> {
  const response = await fetch(`/api/integrations/${name}/credentials`, {
    credentials: 'include',
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || `HTTP ${response.status}`)
  }

  return response.json()
}

/**
 * Saves integration configuration.
 */
export async function saveIntegration(
  name: string,
  config: Record<string, string>
): Promise<{ success: boolean }> {
  const response = await fetch(`/api/integrations/${name}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || `HTTP ${response.status}`)
  }

  return response.json()
}

/**
 * Disconnects (deletes) an integration.
 */
export async function disconnectIntegration(
  name: string
): Promise<{ success: boolean }> {
  const response = await fetch(`/api/integrations/${name}`, {
    method: 'DELETE',
    credentials: 'include',
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || `HTTP ${response.status}`)
  }

  return response.json()
}
