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
  it('merges integration + built-in steps with required first, then optional', () => {
    const steps = buildStepSequence(ALL_DEFS, false)
    const keys = steps.map((s) => s.key)

    // Required: posthog(10), attio(20), attio_mapping(25), website(55)
    // Optional: firecrawl(60)
    expect(keys).toEqual([
      'posthog',
      'attio',
      'attio_mapping',
      'website',
      'firecrawl',
    ])
  })

  it('includes billing step when enabled', () => {
    const steps = buildStepSequence(ALL_DEFS, true)
    const keys = steps.map((s) => s.key)

    // Required: posthog(10), attio(20), attio_mapping(25), website(55), billing(90)
    // Optional: firecrawl(60)
    expect(keys).toEqual([
      'posthog',
      'attio',
      'attio_mapping',
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

  it('marks required integrations as non-optional', () => {
    const steps = buildStepSequence(ALL_DEFS, false)
    const posthog = steps.find((s) => s.key === 'posthog')
    const attio = steps.find((s) => s.key === 'attio')

    expect(posthog?.optional).toBe(false)
    expect(attio?.optional).toBe(false)
  })

  it('preserves isConnected status from definitions', () => {
    const defs = ALL_DEFS.map((d) =>
      d.name === 'posthog' ? { ...d, is_connected: true } : d
    )
    const steps = buildStepSequence(defs, false)
    const posthog = steps.find((s) => s.key === 'posthog')

    expect(posthog?.isConnected).toBe(true)
  })

  it('handles empty definitions (only built-in steps)', () => {
    const steps = buildStepSequence([], false)
    const keys = steps.map((s) => s.key)

    expect(keys).toEqual(['attio_mapping', 'website'])
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

  it('resumes at first incomplete required step', () => {
    // PostHog connected, Attio not
    const defs = ALL_DEFS.map((d) =>
      d.name === 'posthog' ? { ...d, is_connected: true } : d
    )
    const steps = buildStepSequence(defs, false)
    const idx = getInitialStepIndex(steps)

    expect(steps[idx].key).toBe('attio') // next incomplete required step
  })

  it('resumes at Deal Mapping when PostHog + Attio are connected', () => {
    const defs = ALL_DEFS.map((d) =>
      d.name === 'posthog' || d.name === 'attio'
        ? { ...d, is_connected: true }
        : d
    )
    const steps = buildStepSequence(defs, false)
    const idx = getInitialStepIndex(steps)

    expect(steps[idx].key).toBe('attio_mapping')
  })

  it('jumps to first optional step when all required are complete', () => {
    // Mark all required integration steps as connected
    // Built-in steps (attio_mapping, website) always have isConnected=false
    // but they ARE required. So we need to handle this.
    // Actually, built-in steps never become isConnected=true in the current design.
    // Let's test with manual step descriptors instead.
    const steps: WizardStepDescriptor[] = [
      { key: 'posthog', label: 'PostHog', optional: false, displayOrder: 10, isConnected: true },
      { key: 'attio', label: 'Attio', optional: false, displayOrder: 20, isConnected: true },
      { key: 'attio_mapping', label: 'Deal Mapping', optional: false, displayOrder: 25, isConnected: true },
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
