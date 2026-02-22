import type { IntegrationDefinition } from '@/lib/integrations/types'
import { getOnboardingSteps } from '@/lib/hooks/use-integration-definitions'

// ── Step sequence types ────────────────────────────────────

/**
 * Descriptor for a single step in the wizard sequence.
 * Integration steps are seeded from the definitions API; system steps are hardcoded.
 */
export interface WizardStepDescriptor {
  key: string
  label: string
  optional: boolean
  displayOrder: number
  /** True if the integration is already connected (from API). System steps default to false. */
  isConnected: boolean
}

// ── Built-in (non-integration) steps ────────────────────────

const BUILT_IN_STEPS: WizardStepDescriptor[] = [
  { key: 'attio_mapping', label: 'Deal Mapping', optional: false, displayOrder: 25, isConnected: false },
  { key: 'website', label: 'Website', optional: false, displayOrder: 55, isConnected: false },
]

const BILLING_STEP: WizardStepDescriptor = {
  key: 'billing', label: 'Billing', optional: false, displayOrder: 90, isConnected: false,
}

/**
 * Build the full wizard step sequence by merging integration definitions
 * (from API) with built-in system steps. Required steps are ordered first,
 * then optional steps — each group sorted by display_order.
 *
 * @param completedSteps - Optional set of step keys already completed.
 *   When provided, built-in steps check `completedSteps.has(key)` to set `isConnected`.
 */
export function buildStepSequence(
  definitions: IntegrationDefinition[],
  billingEnabled: boolean,
  completedSteps?: Set<string>
): WizardStepDescriptor[] {
  // Integration steps from the DB (those with a setup_step_key)
  const integrationSteps = getOnboardingSteps(definitions).map((d) => ({
    key: d.setup_step_key!,
    label: d.display_name,
    optional: !d.required,
    displayOrder: d.display_order,
    isConnected: d.is_connected,
  }))

  const builtIn = BUILT_IN_STEPS.map((s) => ({
    ...s,
    isConnected: completedSteps?.has(s.key) ?? s.isConnected,
  }))

  const allSteps = [...integrationSteps, ...builtIn]
  if (billingEnabled) {
    allSteps.push({
      ...BILLING_STEP,
      isConnected: completedSteps?.has(BILLING_STEP.key) ?? BILLING_STEP.isConnected,
    })
  }

  // Required first (sorted by displayOrder), then optional (sorted by displayOrder)
  const required = allSteps.filter((s) => !s.optional).sort((a, b) => a.displayOrder - b.displayOrder)
  const optional = allSteps.filter((s) => s.optional).sort((a, b) => a.displayOrder - b.displayOrder)

  return [...required, ...optional]
}

/**
 * Find the first step that needs attention.
 * Priority: first incomplete required step → first optional step → index 0
 */
export function getInitialStepIndex(steps: WizardStepDescriptor[]): number {
  for (let i = 0; i < steps.length; i++) {
    if (!steps[i].optional && !steps[i].isConnected) return i
  }
  // All required steps done — start at first optional step
  for (let i = 0; i < steps.length; i++) {
    if (steps[i].optional) return i
  }
  return 0
}
