/// <reference types="vitest" />
/**
 * Tests for HubSpot Association Management
 *
 * HS-U23: createAssociation creates single association with correct type ID
 * HS-U24: createAssociation auto-resolves association type ID
 * HS-U25: createAssociation throws on unknown type pair
 * HS-U26: batchCreateAssociations groups by type pair
 * HS-U27: batchCreateAssociations chunks at 2000
 * HS-U28: batchCreateAssociations handles empty array
 */

import {
  createAssociation,
  batchCreateAssociations,
  ASSOCIATION_TYPE_IDS,
} from './associations'

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

// ---------------------------------------------------------------------------
// Mock Client
// ---------------------------------------------------------------------------

function createMockClient() {
  return {
    createAssociationV4: vi.fn().mockResolvedValue(undefined),
    batchCreateAssociationsV4: vi.fn().mockResolvedValue(undefined),
  } as any
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HubSpot Association Management', () => {
  describe('ASSOCIATION_TYPE_IDS', () => {
    it('has correct type IDs', () => {
      expect(ASSOCIATION_TYPE_IDS['contacts_to_companies']).toBe(1)
      expect(ASSOCIATION_TYPE_IDS['companies_to_contacts']).toBe(2)
      expect(ASSOCIATION_TYPE_IDS['deals_to_contacts']).toBe(3)
      expect(ASSOCIATION_TYPE_IDS['contacts_to_deals']).toBe(4)
      expect(ASSOCIATION_TYPE_IDS['deals_to_companies']).toBe(5)
      expect(ASSOCIATION_TYPE_IDS['companies_to_deals']).toBe(342)
    })
  })

  describe('createAssociation', () => {
    it('HS-U23: creates single association with explicit type ID', async () => {
      const client = createMockClient()

      await createAssociation(client, 'contacts', '100', 'companies', '200', 1)

      expect(client.createAssociationV4).toHaveBeenCalledWith(
        'contacts',
        '100',
        'companies',
        '200',
        1
      )
    })

    it('HS-U24: auto-resolves association type ID', async () => {
      const client = createMockClient()

      await createAssociation(client, 'contacts', '100', 'companies', '200')

      expect(client.createAssociationV4).toHaveBeenCalledWith(
        'contacts',
        '100',
        'companies',
        '200',
        1 // contacts_to_companies = 1
      )
    })

    it('resolves deals_to_companies type ID', async () => {
      const client = createMockClient()

      await createAssociation(client, 'deals', '100', 'companies', '200')

      expect(client.createAssociationV4).toHaveBeenCalledWith(
        'deals',
        '100',
        'companies',
        '200',
        5
      )
    })

    it('HS-U25: throws on unknown type pair', async () => {
      const client = createMockClient()

      await expect(
        createAssociation(client, 'unknown_a', '100', 'unknown_b', '200')
      ).rejects.toThrow('Unknown association type')
    })
  })

  describe('batchCreateAssociations', () => {
    it('HS-U26: groups by type pair and calls batch API', async () => {
      const client = createMockClient()

      const associations = [
        { fromType: 'contacts', fromId: '1', toType: 'companies', toId: '10' },
        { fromType: 'contacts', fromId: '2', toType: 'companies', toId: '20' },
        { fromType: 'deals', fromId: '3', toType: 'contacts', toId: '1' },
      ]

      const result = await batchCreateAssociations(client, associations)

      // Should make 2 batch calls (one for contacts->companies, one for deals->contacts)
      expect(client.batchCreateAssociationsV4).toHaveBeenCalledTimes(2)
      expect(result.succeeded).toBe(3)
      expect(result.failed).toBe(0)
    })

    it('HS-U28: handles empty array', async () => {
      const client = createMockClient()

      const result = await batchCreateAssociations(client, [])

      expect(result.succeeded).toBe(0)
      expect(result.failed).toBe(0)
      expect(client.batchCreateAssociationsV4).not.toHaveBeenCalled()
    })

    it('counts failures on batch error', async () => {
      const client = createMockClient()
      client.batchCreateAssociationsV4.mockRejectedValue(new Error('Batch failed'))

      const associations = [
        { fromType: 'contacts', fromId: '1', toType: 'companies', toId: '10' },
        { fromType: 'contacts', fromId: '2', toType: 'companies', toId: '20' },
      ]

      const result = await batchCreateAssociations(client, associations)

      expect(result.succeeded).toBe(0)
      expect(result.failed).toBe(2)
    })
  })
})
