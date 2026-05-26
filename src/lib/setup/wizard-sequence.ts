import type { IntegrationDefinition } from '@/lib/integrations/types'
import { getOnboardingSteps } from '@/lib/hooks/use-integration-definitions'

// ── Step sequence types ────────────────────────────────────

/** A CRM option offered by the unified CRM picker step. */
export interface CrmOption {
  /** Integration name / destination id (e.g. 'hubspot', 'attio'). */
  id: string
  label: string
  /** Connected already (from the definitions API). */
  isConnected: boolean
  /** display_order from the definition (used for stable ordering). */
  displayOrder: number
}

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
  /**
   * Only set on the synthetic `crm` picker step: the CRMs the user can choose
   * between. Subsumes the per-CRM `attio`/`hubspot` connect steps.
   */
  crmOptions?: CrmOption[]
}

// ── Synthetic CRM step keys ─────────────────────────────────
//
// The wizard collapses every CRM-category integration (attio, hubspot, …) into
// a single unified flow: pick a CRM (`crm`), connect it (`crm_connect`), then map
// fields (`crm_mapping`). The connect + mapping steps are CRM-routed at render
// time based on the picker selection.

export const CRM_PICKER_STEP = 'crm'
export const CRM_CONNECT_STEP = 'crm_connect'
export const CRM_MAPPING_STEP = 'crm_mapping'

/** Display order anchoring the CRM block (between PostHog @10 and Website @55). */
const CRM_BLOCK_ORDER = 20

// ── Built-in (non-integration) steps ────────────────────────

const BUILT_IN_STEPS: WizardStepDescriptor[] = [
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
  const onboardingDefs = getOnboardingSteps(definitions)

  // CRM-category integrations are subsumed by the unified picker → connect → map
  // flow rather than appearing as separate connect steps.
  const crmDefs = onboardingDefs.filter((d) => d.category === 'crm')
  const nonCrmDefs = onboardingDefs.filter((d) => d.category !== 'crm')

  // Non-CRM integration steps from the DB (posthog, firecrawl, …)
  const integrationSteps: WizardStepDescriptor[] = nonCrmDefs.map((d) => ({
    key: d.setup_step_key!,
    label: d.display_name,
    optional: !d.required,
    displayOrder: d.display_order,
    isConnected: d.is_connected,
  }))

  // Unified CRM block: picker (`crm`) + connect (`crm_connect`) + mapping (`crm_mapping`).
  // Inserted only when at least one CRM definition exists. The picker carries the
  // CRM options; connect/mapping are required (the user picks one or explicitly skips).
  const crmSteps: WizardStepDescriptor[] = []
  if (crmDefs.length > 0) {
    const crmOptions: CrmOption[] = crmDefs
      .map((d) => ({
        id: d.name,
        label: d.display_name,
        isConnected: d.is_connected,
        displayOrder: d.display_order,
      }))
      .sort((a, b) => a.displayOrder - b.displayOrder)

    const anyCrmConnected = crmOptions.some((c) => c.isConnected)

    crmSteps.push(
      {
        key: CRM_PICKER_STEP,
        label: 'CRM',
        optional: false,
        displayOrder: CRM_BLOCK_ORDER,
        isConnected: anyCrmConnected,
        crmOptions,
      },
      {
        key: CRM_CONNECT_STEP,
        label: 'Connect',
        optional: false,
        displayOrder: CRM_BLOCK_ORDER + 1,
        isConnected: anyCrmConnected,
      },
      {
        key: CRM_MAPPING_STEP,
        label: 'Mapping',
        optional: false,
        displayOrder: CRM_BLOCK_ORDER + 2,
        isConnected: completedSteps?.has(CRM_MAPPING_STEP) ?? false,
      },
    )
  }

  const builtIn = BUILT_IN_STEPS.map((s) => ({
    ...s,
    isConnected: completedSteps?.has(s.key) ?? s.isConnected,
  }))

  const allSteps = [...integrationSteps, ...crmSteps, ...builtIn]
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
