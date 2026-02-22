'use client'

import { useQuery } from '@tanstack/react-query'
import { getIntegrationDefinitions } from '@/lib/api/integrations'
import type { IntegrationDefinition } from '@/lib/integrations/types'

export const definitionKeys = {
  all: ['integrations', 'definitions'] as const,
}

/**
 * Fetches all integration definitions enriched with workspace connection status.
 * Used by both the SetupWizard and the Settings page.
 */
export function useIntegrationDefinitions() {
  return useQuery({
    queryKey: definitionKeys.all,
    queryFn: async () => {
      const res = await getIntegrationDefinitions()
      return res.definitions
    },
    staleTime: 5 * 60 * 1000,
  })
}

// ── Pure helper utilities (no hooks — usable server-side & in tests) ──

/**
 * Definitions that have a setup_step_key (they appear in the onboarding wizard),
 * sorted by display_order.
 */
export function getOnboardingSteps(
  definitions: IntegrationDefinition[]
): IntegrationDefinition[] {
  return definitions
    .filter((d) => d.setup_step_key !== null)
    .sort((a, b) => a.display_order - b.display_order)
}

/**
 * Definitions that are required for setup to be considered complete.
 */
export function getRequiredSteps(
  definitions: IntegrationDefinition[]
): IntegrationDefinition[] {
  return definitions.filter((d) => d.required)
}

/**
 * Optional definitions that still have onboarding steps (skippable in wizard).
 */
export function getOptionalSteps(
  definitions: IntegrationDefinition[]
): IntegrationDefinition[] {
  return definitions.filter((d) => !d.required && d.setup_step_key !== null)
}

/**
 * True when every required integration has been connected.
 */
export function isSetupComplete(
  definitions: IntegrationDefinition[]
): boolean {
  return getRequiredSteps(definitions).every((d) => d.is_connected)
}
