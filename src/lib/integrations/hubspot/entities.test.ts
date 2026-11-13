/// <reference types="vitest" />
/**
 * Tests for HubSpot Entity Operations
 *
 * HS-U13: upsertCompany creates when no match found
 * HS-U14: upsertCompany updates when match found
 * HS-U15: upsertContact creates when no match found
 * HS-U16: upsertContact updates when match found
 * HS-U17: createDeal creates deal successfully
 * HS-U18: batchCreateChain creates company -> contact -> deal
 * HS-U19: batchCreateChain handles partial failure
 * HS-U20: ensureBetonProperties creates missing properties
 * HS-U21: buildHubSpotUrl generates correct URLs
 * HS-U22: filterNullProperties removes null/undefined values
 */

import {
  upsertCompany,
  upsertContact,
  createDeal,
  batchCreateChain,
  ensureBetonProperties,
  buildHubSpotUrl,
} from './entities'
import { HubSpotValidationError } from './types'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/utils/logger', () => ({
  createModuleLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

vi.mock('./associations', () => ({
  createAssociation: vi.fn().mockResolvedValue(undefined),
}))

// ---------------------------------------------------------------------------
// Mock Client
// ---------------------------------------------------------------------------

function createMockClient() {
  return {
    search: vi.fn(),
    createRecord: vi.fn(),
    updateRecord: vi.fn(),
    getProperties: vi.fn(),
    createProperty: vi.fn(),
    createPropertyGroup: vi.fn(),
    createAssociationV4: vi.fn(),
  } as any
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HubSpot Entity Operations', () => {
  describe('buildHubSpotUrl', () => {
    it('HS-U21: generates correct URL for contacts', () => {
      const url = buildHubSpotUrl('12345', 'contacts', '789')
      expect(url).toBe('https://app.hubspot.com/contacts/12345/contact/789')
    })

    it('generates correct URL for companies', () => {
      const url = buildHubSpotUrl('12345', 'companies', '789')
      expect(url).toBe('https://app.hubspot.com/contacts/12345/company/789')
    })

    it('generates correct URL for deals', () => {
      const url = buildHubSpotUrl('12345', 'deals', '789')
      expect(url).toBe('https://app.hubspot.com/contacts/12345/deal/789')
    })

    it('returns null when portalId is null', () => {
      expect(buildHubSpotUrl(null, 'contacts', '789')).toBeNull()
    })

    it('returns null when portalId is undefined', () => {
      expect(buildHubSpotUrl(undefined, 'contacts', '789')).toBeNull()
    })

    it('works with numeric portalId', () => {
      const url = buildHubSpotUrl(12345, 'deals', '789')
      expect(url).toBe('https://app.hubspot.com/contacts/12345/deal/789')
    })
  })

  describe('upsertCompany', () => {
    it('HS-U13: creates company when no match found', async () => {
      const client = createMockClient()
      client.search.mockResolvedValue({ results: [] })
      client.createRecord.mockResolvedValue({ id: 'new-company-1', properties: {} })

      const result = await upsertCompany(client, {
        domain: 'acme.com',
        name: 'Acme Corp',
      })

      expect(result.recordId).toBe('new-company-1')
      expect(result.action).toBe('created')
      expect(result.objectType).toBe('companies')
      expect(client.search).toHaveBeenCalledWith('companies', expect.objectContaining({
        filterGroups: [{ filters: [{ propertyName: 'domain', operator: 'EQ', value: 'acme.com' }] }],
      }))
    })

    it('HS-U14: updates company when match found', async () => {
      const client = createMockClient()
      client.search.mockResolvedValue({
        results: [{ id: 'existing-company-1', properties: { domain: 'acme.com' } }],
      })
      client.updateRecord.mockResolvedValue({ id: 'existing-company-1', properties: {} })

      const result = await upsertCompany(client, {
        domain: 'acme.com',
        name: 'Acme Corp Updated',
      })

      expect(result.recordId).toBe('existing-company-1')
      expect(result.action).toBe('updated')
      expect(client.updateRecord).toHaveBeenCalledWith(
        'companies',
        'existing-company-1',
        expect.objectContaining({ domain: 'acme.com', name: 'Acme Corp Updated' })
      )
    })

    it('throws validation error when matching property is missing', async () => {
      const client = createMockClient()

      await expect(
        upsertCompany(client, { name: 'Acme Corp' })
      ).rejects.toThrow(HubSpotValidationError)
    })

    it('HS-U22: filters null and undefined properties', async () => {
      const client = createMockClient()
      client.search.mockResolvedValue({ results: [] })
      client.createRecord.mockResolvedValue({ id: 'new-1', properties: {} })

      await upsertCompany(client, {
        domain: 'acme.com',
        name: null,
        city: undefined,
        empty_string: '',
      })

      expect(client.createRecord).toHaveBeenCalledWith(
        'companies',
        { domain: 'acme.com' }
      )
    })
  })

  describe('upsertContact', () => {
    it('HS-U15: creates contact when no match found', async () => {
      const client = createMockClient()
      client.search.mockResolvedValue({ results: [] })
      client.createRecord.mockResolvedValue({ id: 'new-contact-1', properties: {} })

      const result = await upsertContact(client, {
        email: 'user@acme.com',
        firstname: 'Jane',
        lastname: 'Doe',
      })

      expect(result.recordId).toBe('new-contact-1')
      expect(result.action).toBe('created')
      expect(result.objectType).toBe('contacts')
    })

    it('HS-U16: updates contact when match found', async () => {
      const client = createMockClient()
      client.search.mockResolvedValue({
        results: [{ id: 'existing-contact-1', properties: { email: 'user@acme.com' } }],
      })
      client.updateRecord.mockResolvedValue({ id: 'existing-contact-1', properties: {} })

      const result = await upsertContact(client, {
        email: 'user@acme.com',
        firstname: 'Jane Updated',
      })

      expect(result.recordId).toBe('existing-contact-1')
      expect(result.action).toBe('updated')
    })

    it('throws validation error when email is missing', async () => {
      const client = createMockClient()

      await expect(
        upsertContact(client, { firstname: 'Jane' })
      ).rejects.toThrow(HubSpotValidationError)
    })
  })

  describe('createDeal', () => {
    it('HS-U17: creates deal successfully', async () => {
      const client = createMockClient()
      client.createRecord.mockResolvedValue({ id: 'new-deal-1', properties: {} })

      const result = await createDeal(client, {
        dealname: 'Acme Corp -- Beton Signal',
        amount: '50000',
      })

      expect(result.recordId).toBe('new-deal-1')
      expect(result.action).toBe('created')
      expect(result.objectType).toBe('deals')
    })

    it('throws validation error when dealname is missing', async () => {
      const client = createMockClient()

      await expect(
        createDeal(client, { amount: '50000' })
      ).rejects.toThrow(HubSpotValidationError)
    })
  })

  describe('batchCreateChain', () => {
    it('HS-U18: creates company -> contact -> deal chain', async () => {
      const client = createMockClient()
      client.search.mockResolvedValue({ results: [] })
      client.createRecord
        .mockResolvedValueOnce({ id: 'company-1', properties: {} })
        .mockResolvedValueOnce({ id: 'contact-1', properties: {} })
        .mockResolvedValueOnce({ id: 'deal-1', properties: {} })

      const result = await batchCreateChain(client, {
        portalId: '12345',
        createCompany: true,
        companyData: { domain: 'acme.com', name: 'Acme Corp' },
        createContact: true,
        contactData: { email: 'user@acme.com', firstname: 'Jane' },
        createDeal: true,
        dealData: { dealname: 'Acme -- Beton Signal' },
      })

      expect(result.company?.record_id).toBe('company-1')
      expect(result.contact?.record_id).toBe('contact-1')
      expect(result.deal?.record_id).toBe('deal-1')
      expect(result.company?.hubspot_url).toContain('12345')
      expect(result.error).toBeUndefined()
    })

    it('HS-U19: handles partial failure at contact step', async () => {
      const client = createMockClient()
      // Company succeeds
      client.search.mockResolvedValue({ results: [] })
      client.createRecord
        .mockResolvedValueOnce({ id: 'company-1', properties: {} })
        .mockRejectedValueOnce(new Error('Contact creation failed'))

      const result = await batchCreateChain(client, {
        portalId: '12345',
        createCompany: true,
        companyData: { domain: 'acme.com', name: 'Acme Corp' },
        createContact: true,
        contactData: { email: 'user@acme.com' },
        createDeal: true,
        dealData: { dealname: 'Acme -- Beton Signal' },
      })

      expect(result.company?.record_id).toBe('company-1')
      expect(result.contact).toBeUndefined()
      expect(result.deal).toBeUndefined()
      expect(result.error).toBeDefined()
      expect(result.partial).toBe(true)
    })

    it('handles company-only creation', async () => {
      const client = createMockClient()
      client.search.mockResolvedValue({ results: [] })
      client.createRecord.mockResolvedValue({ id: 'company-1', properties: {} })

      const result = await batchCreateChain(client, {
        createCompany: true,
        companyData: { domain: 'acme.com', name: 'Acme Corp' },
        createContact: false,
        createDeal: false,
      })

      expect(result.company?.record_id).toBe('company-1')
      expect(result.contact).toBeUndefined()
      expect(result.deal).toBeUndefined()
    })
  })

  describe('ensureBetonProperties', () => {
    it('HS-U20: creates missing properties and skips existing', async () => {
      const client = createMockClient()

      // Property group creation succeeds
      client.createPropertyGroup.mockResolvedValue({ name: 'beton', label: 'Beton Inspector' })

      // Some properties already exist
      client.getProperties.mockResolvedValue({
        results: [
          { name: 'beton_health_score' },
          { name: 'domain' },
        ],
      })

      // Property creation succeeds
      client.createProperty.mockResolvedValue({ name: 'beton_signal_count' })

      const result = await ensureBetonProperties(client, 'companies')

      expect(result.skipped).toContain('beton_health_score')
      expect(result.created.length).toBeGreaterThan(0)
      // beton_health_score was in existing, so should be skipped
      expect(result.created).not.toContain('beton_health_score')
    })

    it('handles property group already existing (409)', async () => {
      const client = createMockClient()

      const error = new Error('409')
      error.name = 'HubSpotError'
      client.createPropertyGroup.mockRejectedValue(error)

      client.getProperties.mockResolvedValue({ results: [] })
      client.createProperty.mockResolvedValue({ name: 'test' })

      // Should not throw — 409 is handled gracefully
      const result = await ensureBetonProperties(client, 'companies')
      expect(result.errors.length).toBe(0)
    })
  })
})
