import type { IntegrationDefinition } from '@/lib/integrations/types'
import {
  getOnboardingSteps,
  getRequiredSteps,
  getOptionalSteps,
  isSetupComplete,
} from './use-integration-definitions'

/**
 * Tests for pure helper utilities exported from use-integration-definitions.
 * These functions operate on IntegrationDefinition[] arrays with no external dependencies.
 *
 * BETON-277 TC5: Hook helper functions
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
    icon_url: `https://cdn.example.com/${overrides.name}.svg`,
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
  supports_self_hosted: true,
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
  supports_self_hosted: true,
})

const STRIPE = makeDef({
  name: 'stripe',
  display_name: 'Stripe',
  category: 'billing',
  required: false,
  display_order: 40,
  setup_step_key: null, // no onboarding step
})

const APOLLO = makeDef({
  name: 'apollo',
  display_name: 'Apollo',
  category: 'enrichment',
  required: false,
  display_order: 50,
  setup_step_key: null, // no onboarding step
  icon_url: null,
})

const ALL_DEFS = [POSTHOG, ATTIO, FIRECRAWL, STRIPE, APOLLO]

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getOnboardingSteps', () => {
  it('returns only definitions with setup_step_key set', () => {
    const steps = getOnboardingSteps(ALL_DEFS)
    expect(steps).toHaveLength(3) // posthog, attio, firecrawl
    expect(steps.every((s) => s.setup_step_key !== null)).toBe(true)
  })

  it('returns results sorted by display_order ascending', () => {
    // Feed in reverse order to verify sorting
    const reversed = [...ALL_DEFS].reverse()
    const steps = getOnboardingSteps(reversed)
    const orders = steps.map((s) => s.display_order)
    expect(orders).toEqual([10, 20, 60])
  })

  it('returns empty array when no definitions have setup_step_key', () => {
    const defs = [STRIPE, APOLLO]
    expect(getOnboardingSteps(defs)).toEqual([])
  })

  it('returns empty array for empty input', () => {
    expect(getOnboardingSteps([])).toEqual([])
  })
})

describe('getRequiredSteps', () => {
  it('returns only definitions where required=true', () => {
    const required = getRequiredSteps(ALL_DEFS)
    expect(required).toHaveLength(2)
    expect(required.map((d) => d.name)).toEqual(['posthog', 'attio'])
  })

  it('returns empty array when no definitions are required', () => {
    const defs = [FIRECRAWL, STRIPE, APOLLO]
    expect(getRequiredSteps(defs)).toEqual([])
  })
})

describe('getOptionalSteps', () => {
  it('returns non-required definitions that have a setup_step_key', () => {
    const optional = getOptionalSteps(ALL_DEFS)
    expect(optional).toHaveLength(1)
    expect(optional[0].name).toBe('firecrawl')
  })

  it('excludes definitions without setup_step_key even if optional', () => {
    const optional = getOptionalSteps(ALL_DEFS)
    const names = optional.map((d) => d.name)
    expect(names).not.toContain('stripe')
    expect(names).not.toContain('apollo')
  })
})

describe('isSetupComplete', () => {
  it('returns true when all required integrations are connected', () => {
    const defs = ALL_DEFS.map((d) =>
      d.required ? { ...d, is_connected: true } : d
    )
    expect(isSetupComplete(defs)).toBe(true)
  })

  it('returns true even if optional integrations are not connected', () => {
    const defs = ALL_DEFS.map((d) =>
      d.required ? { ...d, is_connected: true } : { ...d, is_connected: false }
    )
    expect(isSetupComplete(defs)).toBe(true)
  })

  it('returns false when one required integration is not connected', () => {
    const defs = ALL_DEFS.map((d) => {
      if (d.name === 'posthog') return { ...d, is_connected: true }
      if (d.name === 'attio') return { ...d, is_connected: false }
      return d
    })
    expect(isSetupComplete(defs)).toBe(false)
  })

  it('returns false when no required integrations are connected', () => {
    expect(isSetupComplete(ALL_DEFS)).toBe(false) // all is_connected=false by default
  })

  it('returns true when there are no required integrations', () => {
    const defs = [FIRECRAWL, STRIPE, APOLLO]
    expect(isSetupComplete(defs)).toBe(true) // vacuously true
  })

  it('returns true for empty definitions array', () => {
    expect(isSetupComplete([])).toBe(true)
  })
})
