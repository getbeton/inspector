/// <reference types="vitest" />
/**
 * Tests for HubSpot API Client
 *
 * HS-U01: Constructor validates config
 * HS-U02: testConnection success/failure
 * HS-U03: getAccountInfo returns account data
 * HS-U04: getContacts fetches with properties and pagination
 * HS-U05: getCompanies fetches with properties
 * HS-U06: getDeals fetches with properties
 * HS-U07: getRecord fetches single record
 * HS-U08: search builds correct request
 * HS-U09: Retry logic on 429 responses
 * HS-U10: Auth errors throw HubSpotAuthError
 * HS-U11: Not found errors throw HubSpotNotFoundError
 * HS-U12: Server errors retry then throw
 */

import { HubSpotClient } from './client'
import {
  HubSpotError,
  HubSpotAuthError,
  HubSpotNotFoundError,
  HubSpotRateLimitError,
} from './types'
import { resetAll } from './rate-limiter'

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

const originalFetch = global.fetch

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createClient(overrides: Record<string, unknown> = {}) {
  return new HubSpotClient({
    token: 'pat-test-token-12345678',
    authType: 'private_app',
    connectionId: 'test-conn-1',
    ...overrides,
  })
}

function mockFetchSuccess(data: unknown) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
    headers: new Headers({
      'x-hubspot-ratelimit-daily-remaining': '1000',
      'x-hubspot-ratelimit-daily': '250000',
    }),
  })
}

function mockFetchError(status: number, body: string = '') {
  global.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status,
    statusText: `Error ${status}`,
    text: () => Promise.resolve(body),
    headers: new Headers({
      ...(status === 429 ? { 'retry-after': '1' } : {}),
    }),
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HubSpotClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetAll()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  // HS-U01: Constructor validates config
  describe('constructor', () => {
    it('throws when token is missing', () => {
      expect(() => new HubSpotClient({
        token: '',
        authType: 'private_app',
        connectionId: 'conn-1',
      })).toThrow('token is required')
    })

    it('creates client with valid config', () => {
      const client = createClient()
      expect(client).toBeInstanceOf(HubSpotClient)
    })
  })

  // HS-U02: testConnection
  describe('testConnection', () => {
    it('returns success when API responds OK', async () => {
      mockFetchSuccess({ portalId: 12345 })
      const client = createClient()
      const result = await client.testConnection()
      expect(result.success).toBe(true)
    })

    it('returns error when API fails', async () => {
      mockFetchError(401, '{"message": "Unauthorized"}')
      const client = createClient()
      const result = await client.testConnection()
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })

  // HS-U03: getAccountInfo
  describe('getAccountInfo', () => {
    it('returns account info', async () => {
      const accountData = {
        portalId: 12345,
        accountType: 'STANDARD',
        timeZone: 'US/Eastern',
        companyCurrency: 'USD',
      }
      mockFetchSuccess(accountData)

      const client = createClient()
      const result = await client.getAccountInfo()
      expect(result.portalId).toBe(12345)
    })
  })

  // HS-U04: getContacts
  describe('getContacts', () => {
    it('fetches contacts with properties', async () => {
      mockFetchSuccess({
        results: [
          { id: '1', properties: { email: 'test@example.com' }, createdAt: '', updatedAt: '', archived: false },
        ],
        paging: { next: { after: '2' } },
      })

      const client = createClient()
      const result = await client.getContacts({
        properties: ['email', 'firstname'],
        limit: 50,
      })

      expect(result.results).toHaveLength(1)
      expect(result.paging?.next?.after).toBe('2')

      // Verify URL includes properties
      const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
      expect(fetchCall[0]).toContain('properties=email%2Cfirstname')
      expect(fetchCall[0]).toContain('limit=50')
    })

    it('handles pagination with after cursor', async () => {
      mockFetchSuccess({ results: [], paging: undefined })

      const client = createClient()
      await client.getContacts({ after: 'cursor-123' })

      const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
      expect(fetchCall[0]).toContain('after=cursor-123')
    })
  })

  // HS-U05: getCompanies
  describe('getCompanies', () => {
    it('fetches companies', async () => {
      mockFetchSuccess({
        results: [
          { id: '100', properties: { name: 'Acme Corp' }, createdAt: '', updatedAt: '', archived: false },
        ],
      })

      const client = createClient()
      const result = await client.getCompanies({ properties: ['name', 'domain'] })
      expect(result.results).toHaveLength(1)
    })
  })

  // HS-U06: getDeals
  describe('getDeals', () => {
    it('fetches deals', async () => {
      mockFetchSuccess({
        results: [
          { id: '200', properties: { dealname: 'Big Deal' }, createdAt: '', updatedAt: '', archived: false },
        ],
      })

      const client = createClient()
      const result = await client.getDeals()
      expect(result.results).toHaveLength(1)
    })
  })

  // HS-U07: getRecord
  describe('getRecord', () => {
    it('fetches a single record by ID', async () => {
      mockFetchSuccess({
        id: '42',
        properties: { email: 'john@test.com' },
        createdAt: '2024-01-01',
        updatedAt: '2024-06-01',
        archived: false,
      })

      const client = createClient()
      const result = await client.getRecord('contacts', '42', ['email'])
      expect(result.id).toBe('42')
      expect(result.properties.email).toBe('john@test.com')
    })
  })

  // HS-U08: search
  describe('search', () => {
    it('sends correct search request', async () => {
      mockFetchSuccess({
        total: 1,
        results: [{ id: '1', properties: {}, createdAt: '', updatedAt: '', archived: false }],
      })

      const client = createClient()
      await client.search('contacts', {
        query: 'test',
        limit: 5,
        properties: ['email'],
      })

      const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
      expect(fetchCall[0]).toContain('/crm/v3/objects/contacts/search')
      expect(fetchCall[1].method).toBe('POST')

      const body = JSON.parse(fetchCall[1].body)
      expect(body.query).toBe('test')
      expect(body.limit).toBe(5)
    })

    it('sends filter groups correctly', async () => {
      mockFetchSuccess({ total: 0, results: [] })

      const client = createClient()
      await client.search('contacts', {
        filterGroups: [
          {
            filters: [
              { propertyName: 'email', operator: 'CONTAINS_TOKEN', value: '@test.com' },
            ],
          },
        ],
      })

      const body = JSON.parse(
        (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body
      )
      expect(body.filterGroups[0].filters[0].propertyName).toBe('email')
    })
  })

  // HS-U09: Retry logic on 429
  describe('retry logic', () => {
    it('retries on 429 responses', async () => {
      let callCount = 0
      global.fetch = vi.fn().mockImplementation(async () => {
        callCount++
        if (callCount <= 2) {
          return {
            ok: false,
            status: 429,
            statusText: 'Too Many Requests',
            text: () => Promise.resolve('Rate limited'),
            headers: new Headers({ 'retry-after': '0' }),
          }
        }
        return {
          ok: true,
          status: 200,
          json: () => Promise.resolve({ portalId: 12345 }),
          headers: new Headers({
            'x-hubspot-ratelimit-daily-remaining': '1000',
            'x-hubspot-ratelimit-daily': '250000',
          }),
        }
      })

      const client = createClient()
      const result = await client.getAccountInfo()
      expect(result.portalId).toBe(12345)
      expect(callCount).toBe(3) // 2 retries + 1 success
    }, 30000)

    it('throws after max retries on persistent 429', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        text: () => Promise.resolve('Rate limited'),
        headers: new Headers({ 'retry-after': '0' }),
      })

      const client = createClient()
      await expect(client.getAccountInfo()).rejects.toThrow(HubSpotRateLimitError)
    }, 30000)
  })

  // HS-U10: Auth errors
  describe('auth errors', () => {
    it('throws HubSpotAuthError on 401', async () => {
      mockFetchError(401, '{"message": "Invalid token"}')
      const client = createClient()
      await expect(client.getAccountInfo()).rejects.toThrow(HubSpotAuthError)
    })

    it('throws HubSpotAuthError on 403', async () => {
      mockFetchError(403, '{"message": "Forbidden"}')
      const client = createClient()
      await expect(client.getAccountInfo()).rejects.toThrow(HubSpotAuthError)
    })
  })

  // HS-U11: Not found errors
  describe('not found errors', () => {
    it('throws HubSpotNotFoundError on 404', async () => {
      mockFetchError(404, '{"message": "Not found"}')
      const client = createClient()
      await expect(client.getRecord('contacts', '999')).rejects.toThrow(
        HubSpotNotFoundError
      )
    })
  })

  // HS-U12: Server errors retry then throw
  describe('server errors', () => {
    it('retries on 500 then throws', async () => {
      mockFetchError(500, 'Internal Server Error')
      const client = createClient()
      await expect(client.getAccountInfo()).rejects.toThrow(HubSpotError)

      // Should have attempted MAX_RETRIES + 1 times
      expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(1)
    }, 30000)
  })
})
