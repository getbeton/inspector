/// <reference types="vitest" />
import type { IntegrationDefinition } from '@/lib/integrations/types'
import { buildStepSequence, getInitialStepIndex, type WizardStepDescriptor } from './wizard-sequence'

/**
 * Tests for wizard step sequence logic.
 *
 * BETON-278 TC1: Wizard loads steps from registry
 * BETON-278 TC11: Resume logic with dynamic steps
 */

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeDef(
  overrides: Partial<IntegrationDefinition> & { name: string }
): IntegrationDefinition {
  return {
    id: `id-${overrides.name}`,
    display_name: overrides.name,
    description: `${overrides.name} integration`,
    category: 'data_source',
    icon_url: null,
    icon_url_light: null,
    required: false,
    display_order: 10,
    setup_step_key: overrides.name,
    supports_self_hosted: false,
    config_schema: null,
    is_connected: false,
    last_validated_at: null,
    ...overrides,
  }
}

const POSTHOG = makeDef({
  name: 'posthog',
  display_name: 'PostHog',
  category: 'data_source',
  required: true,
  display_order: 10,
  setup_step_key: 'posthog',
})

const ATTIO = makeDef({
  name: 'attio',
  display_name: 'Attio',
  category: 'crm',
  required: true,
  display_order: 20,
  setup_step_key: 'attio',
})

const FIRECRAWL = makeDef({
  name: 'firecrawl',
  display_name: 'Firecrawl',
  category: 'web_scraping',
  required: false,
  display_order: 60,
  setup_step_key: 'firecrawl',
})

const STRIPE_DEF = makeDef({
  name: 'stripe',
  display_name: 'Stripe',
  category: 'billing',
  required: false,
  display_order: 40,
  setup_step_key: null, // no onboarding step
})

const APOLLO_DEF = makeDef({
  name: 'apollo',
  display_name: 'Apollo',
  category: 'enrichment',
  required: false,
  display_order: 50,
  setup_step_key: null,
})

const ALL_DEFS = [POSTHOG, ATTIO, FIRECRAWL, STRIPE_DEF, APOLLO_DEF]

// ---------------------------------------------------------------------------
// TC1: Wizard loads steps from registry
// ---------------------------------------------------------------------------

describe('buildStepSequence', () => {
  it('collapses CRM integrations into the unified crm → connect → mapping block', () => {
    const steps = buildStepSequence(ALL_DEFS, false)
    const keys = steps.map((s) => s.key)

    // Required: posthog(10), crm(20), crm_connect(21), crm_mapping(22), website(55)
    // Optional: firecrawl(60)
    // The standalone `attio` connect step is subsumed by the CRM block.
    expect(keys).toEqual([
      'posthog',
      'crm',
      'crm_connect',
      'crm_mapping',
      'website',
      'firecrawl',
    ])
    expect(keys).not.toContain('attio')
    expect(keys).not.toContain('attio_mapping')
  })

  it('exposes available CRMs as options on the picker step', () => {
    // Add HubSpot alongside Attio to prove multiple CRMs collapse into one picker.
    const HUBSPOT = makeDef({
      name: 'hubspot',
      display_name: 'HubSpot',
      category: 'crm',
      required: true,
      display_order: 22,
      setup_step_key: 'hubspot',
    })
    const steps = buildStepSequence([...ALL_DEFS, HUBSPOT], false)
    const picker = steps.find((s) => s.key === 'crm')

    expect(picker).toBeDefined()
    expect(picker?.crmOptions?.map((c) => c.id)).toEqual(['attio', 'hubspot'])
  })

  it('omits the CRM block entirely when no CRM definitions exist', () => {
    const steps = buildStepSequence([POSTHOG, FIRECRAWL], false)
    const keys = steps.map((s) => s.key)

    expect(keys).not.toContain('crm')
    expect(keys).not.toContain('crm_connect')
    expect(keys).not.toContain('crm_mapping')
    expect(keys).toEqual(['posthog', 'website', 'firecrawl'])
  })

  it('includes billing step when enabled', () => {
    const steps = buildStepSequence(ALL_DEFS, true)
    const keys = steps.map((s) => s.key)

    // Required: posthog(10), crm(20), crm_connect(21), crm_mapping(22), website(55), billing(90)
    // Optional: firecrawl(60)
    expect(keys).toEqual([
      'posthog',
      'crm',
      'crm_connect',
      'crm_mapping',
      'website',
      'billing',
      'firecrawl',
    ])
  })

  it('excludes definitions without setup_step_key (Stripe, Apollo)', () => {
    const steps = buildStepSequence(ALL_DEFS, false)
    const keys = steps.map((s) => s.key)

    expect(keys).not.toContain('stripe')
    expect(keys).not.toContain('apollo')
  })

  it('marks Firecrawl as optional', () => {
    const steps = buildStepSequence(ALL_DEFS, false)
    const firecrawl = steps.find((s) => s.key === 'firecrawl')

    expect(firecrawl?.optional).toBe(true)
  })

  it('marks required integrations + the CRM block as non-optional', () => {
    const steps = buildStepSequence(ALL_DEFS, false)
    const posthog = steps.find((s) => s.key === 'posthog')
    const crm = steps.find((s) => s.key === 'crm')

    expect(posthog?.optional).toBe(false)
    expect(crm?.optional).toBe(false)
  })

  it('preserves isConnected status from definitions', () => {
    const defs = ALL_DEFS.map((d) =>
      d.name === 'posthog' ? { ...d, is_connected: true } : d
    )
    const steps = buildStepSequence(defs, false)
    const posthog = steps.find((s) => s.key === 'posthog')

    expect(posthog?.isConnected).toBe(true)
  })

  it('handles empty definitions (only built-in steps, no CRM block)', () => {
    const steps = buildStepSequence([], false)
    const keys = steps.map((s) => s.key)

    expect(keys).toEqual(['website'])
  })
})

// ---------------------------------------------------------------------------
// TC11: Resume logic with dynamic steps
// ---------------------------------------------------------------------------

describe('getInitialStepIndex', () => {
  it('returns 0 when no steps are connected', () => {
    const steps = buildStepSequence(ALL_DEFS, false)
    expect(getInitialStepIndex(steps)).toBe(0)
  })

  it('resumes at the CRM picker when PostHog is connected but no CRM is', () => {
    // PostHog connected, Attio not → CRM block is the next incomplete required step.
    const defs = ALL_DEFS.map((d) =>
      d.name === 'posthog' ? { ...d, is_connected: true } : d
    )
    const steps = buildStepSequence(defs, false)
    const idx = getInitialStepIndex(steps)

    expect(steps[idx].key).toBe('crm') // unified CRM picker
  })

  it('resumes past the CRM picker when a CRM is already connected', () => {
    // PostHog + Attio connected → picker & connect are marked done; resume at mapping.
    const defs = ALL_DEFS.map((d) =>
      d.name === 'posthog' || d.name === 'attio'
        ? { ...d, is_connected: true }
        : d
    )
    const steps = buildStepSequence(defs, false)
    const idx = getInitialStepIndex(steps)

    expect(steps[idx].key).toBe('crm_mapping')
  })

  it('jumps to first optional step when all required are complete', () => {
    const steps: WizardStepDescriptor[] = [
      { key: 'posthog', label: 'PostHog', optional: false, displayOrder: 10, isConnected: true },
      { key: 'crm', label: 'CRM', optional: false, displayOrder: 20, isConnected: true },
      { key: 'crm_connect', label: 'Connect', optional: false, displayOrder: 21, isConnected: true },
      { key: 'crm_mapping', label: 'Mapping', optional: false, displayOrder: 22, isConnected: true },
      { key: 'website', label: 'Website', optional: false, displayOrder: 55, isConnected: true },
      { key: 'firecrawl', label: 'Firecrawl', optional: true, displayOrder: 60, isConnected: false },
    ]
    const idx = getInitialStepIndex(steps)

    expect(steps[idx].key).toBe('firecrawl')
  })

  it('returns 0 when all steps are complete (no optional)', () => {
    const steps: WizardStepDescriptor[] = [
      { key: 'posthog', label: 'PostHog', optional: false, displayOrder: 10, isConnected: true },
      { key: 'attio', label: 'Attio', optional: false, displayOrder: 20, isConnected: true },
    ]
    expect(getInitialStepIndex(steps)).toBe(0)
  })

  it('returns 0 for empty steps', () => {
    expect(getInitialStepIndex([])).toBe(0)
  })
})
