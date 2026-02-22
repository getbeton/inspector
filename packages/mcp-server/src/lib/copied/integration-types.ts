/**
 * Integration types — copied from src/lib/integrations/types.ts
 * Only includes types needed by the MCP server (PostHog).
 */

export interface PostHogEvent {
  id: string
  distinct_id: string
  event: string
  timestamp: string
  properties: Record<string, unknown>
}

export interface PostHogPerson {
  id: string
  distinct_ids: string[]
  properties: Record<string, unknown>
  created_at: string
}

export interface PostHogGroup {
  group_type: string
  group_key: string
  properties: Record<string, unknown>
}

export interface IntegrationError extends Error {
  code?: string
  statusCode?: number
  isRetryable: boolean
}

export function createIntegrationError(
  message: string,
  code?: string,
  statusCode?: number,
  isRetryable = false
): IntegrationError {
  const error = new Error(message) as IntegrationError
  error.code = code
  error.statusCode = statusCode
  error.isRetryable = isRetryable
  return error
}
