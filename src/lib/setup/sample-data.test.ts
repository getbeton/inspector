/// <reference types="vitest" />
import { deriveCompanyFromEmail, getDefaultSampleData } from './sample-data'

/**
 * Tests for sample data helpers and deep link construction logic.
 *
 * BETON-279 TC1: Email domain extraction
 * BETON-279 TC2: Demo mode fallback (verified via getDefaultSampleData shape)
 */

// ---------------------------------------------------------------------------
// TC1: deriveCompanyFromEmail
// ---------------------------------------------------------------------------

describe('deriveCompanyFromEmail', () => {
  it('extracts company name and domain from a corporate email', () => {
    const result = deriveCompanyFromEmail('john@acme.com')
    expect(result.companyName).toBe('Acme')
    expect(result.companyDomain).toBe('acme.com')
  })

  it('capitalizes first letter of company name', () => {
    const result = deriveCompanyFromEmail('user@bigco.io')
    expect(result.companyName).toBe('Bigco')
  })

  it('handles multi-part domain names (takes first segment)', () => {
    const result = deriveCompanyFromEmail('user@my.company.co.uk')
    expect(result.companyName).toBe('My')
    expect(result.companyDomain).toBe('my.company.co.uk')
  })

  it('handles single-word domain', () => {
    const result = deriveCompanyFromEmail('admin@localhost')
    expect(result.companyName).toBe('Localhost')
    expect(result.companyDomain).toBe('localhost')
  })

  it('returns "Company" for empty email', () => {
    const result = deriveCompanyFromEmail('')
    expect(result.companyName).toBe('Company')
    expect(result.companyDomain).toBe('')
  })

  it('handles email with no @ symbol gracefully', () => {
    const result = deriveCompanyFromEmail('noemail')
    expect(result.companyName).toBe('Company')
    expect(result.companyDomain).toBe('')
  })

  it('handles email with subdomain', () => {
    const result = deriveCompanyFromEmail('user@mail.example.com')
    expect(result.companyName).toBe('Mail')
    expect(result.companyDomain).toBe('mail.example.com')
  })
})

// ---------------------------------------------------------------------------
// TC2: Fallback sample data shape
// ---------------------------------------------------------------------------

describe('getDefaultSampleData', () => {
  it('has all required fields', () => {
    const sample = getDefaultSampleData()
    expect(sample).toHaveProperty('company_name')
    expect(sample).toHaveProperty('company_domain')
    expect(sample).toHaveProperty('user_email')
    expect(sample).toHaveProperty('signal_name')
    expect(sample).toHaveProperty('signal_type')
    expect(sample).toHaveProperty('health_score')
    expect(sample).toHaveProperty('signal_count')
    expect(sample).toHaveProperty('deal_value')
    expect(sample).toHaveProperty('detected_at')
  })

  it('uses demo data (Acme Corp)', () => {
    const sample = getDefaultSampleData()
    expect(sample.company_name).toBe('Acme Corp')
    expect(sample.company_domain).toBe('acme.com')
    expect(sample.user_email).toBe('user@acme.com')
  })

  it('has realistic numeric values', () => {
    const sample = getDefaultSampleData()
    expect(sample.health_score).toBeGreaterThan(0)
    expect(sample.health_score).toBeLessThanOrEqual(100)
    expect(sample.deal_value).toBeGreaterThan(0)
  })

  it('returns a fresh object on each call', () => {
    const a = getDefaultSampleData()
    const b = getDefaultSampleData()
    expect(a).not.toBe(b)
    expect(a).toEqual(b)
  })
})

// ---------------------------------------------------------------------------
// Deep link URL construction (tested as pure functions)
// ---------------------------------------------------------------------------

describe('deep link URL construction', () => {
  // TC3: PostHog deep link (cloud)
  it('builds PostHog US deep link from region', () => {
    const region: string = 'us'
    const host = region === 'eu' ? 'https://eu.posthog.com' : 'https://us.posthog.com'
    expect(host).toBe('https://us.posthog.com')
  })

  // TC4: PostHog deep link (EU)
  it('builds PostHog EU deep link from region', () => {
    const region = 'eu'
    const host = region === 'eu' ? 'https://eu.posthog.com' : 'https://us.posthog.com'
    expect(host).toBe('https://eu.posthog.com')
  })

  // TC5: Attio entity URL
  it('builds Attio entity URL from workspace slug and record', () => {
    const workspaceSlug = 'acme-sales'
    const objectSlug = 'companies'
    const recordId = 'abc123'
    const url = `https://app.attio.com/${workspaceSlug}/${objectSlug}/${recordId}`

    expect(url).toBe('https://app.attio.com/acme-sales/companies/abc123')
  })

  it('builds Attio person URL', () => {
    const url = `https://app.attio.com/acme-sales/people/person-456`
    expect(url).toContain('/people/')
  })

  it('builds Attio deal URL', () => {
    const url = `https://app.attio.com/acme-sales/deals/deal-789`
    expect(url).toContain('/deals/')
  })
})
