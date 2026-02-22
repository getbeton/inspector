/**
 * Single source of truth for supported integration names.
 *
 * Used by API route handlers to validate the `[name]` parameter.
 */
const _SUPPORTED_INTEGRATIONS = [
  'posthog',
  'stripe',
  'attio',
  'apollo',
  'firecrawl',
] as const

export type IntegrationName = (typeof _SUPPORTED_INTEGRATIONS)[number]

/** Supported integration names — widened to accept `string` in .includes() guards. */
export const SUPPORTED_INTEGRATIONS: readonly string[] = _SUPPORTED_INTEGRATIONS
