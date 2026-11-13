import { describe, expect, it, vi } from 'vitest'

import { createHubSpotSourceAdapter, type HubSpotSourceClient } from './source-adapter'
import type { HubSpotListResponse, HubSpotSearchOptions, HubSpotSearchResponse } from './types'

/** Build a fake HubSpot client exposing only what the source adapter uses. */
function makeFakeClient(overrides: Partial<HubSpotSourceClient> = {}): HubSpotSourceClient {
  return {
    testConnection: vi.fn(async () => ({ success: true })),
    getContacts: vi.fn(async (): Promise<HubSpotListResponse> => ({ results: [] })),
    getCompanies: vi.fn(async (): Promise<HubSpotListResponse> => ({ results: [] })),
    getDeals: vi.fn(async (): Promise<HubSpotListResponse> => ({ results: [] })),
    getProperties: vi.fn(async () => ({ results: [] })),
    search: vi.fn(async (): Promise<HubSpotSearchResponse> => ({ total: 0, results: [] })),
    ...overrides,
  }
}

function adapterWith(client: HubSpotSourceClient) {
  return createHubSpotSourceAdapter({ getClient: async () => client })
}

const WS = 'ws-1'

describe('HubSpot SourceAdapter', () => {
  it('identifies as the hubspot source', () => {
    expect(adapterWith(makeFakeClient()).source).toBe('hubspot')
  })

  describe('testConnection', () => {
    it('maps client success → ok', async () => {
      const a = adapterWith(makeFakeClient({ testConnection: vi.fn(async () => ({ success: true })) }))
      expect(await a.testConnection(WS)).toEqual({ ok: true })
    })

    it('maps client failure → ok:false with error', async () => {
      const a = adapterWith(
        makeFakeClient({ testConnection: vi.fn(async () => ({ success: false, error: 'bad token' })) }),
      )
      expect(await a.testConnection(WS)).toEqual({ ok: false, error: 'bad token' })
    })
  })

  describe('listObjects', () => {
    it('returns the three canonical objects with subject kinds', async () => {
      const objs = await adapterWith(makeFakeClient()).listObjects(WS)
      expect(objs).toEqual([
        { nativeId: 'contacts', canonical: 'people', label: 'Contacts', subjectKind: 'person' },
        { nativeId: 'companies', canonical: 'companies', label: 'Companies', subjectKind: 'group_org' },
        { nativeId: 'deals', canonical: 'deals', label: 'Deals', subjectKind: undefined },
      ])
    })
  })

  describe('listFields', () => {
    it('maps HubSpot property definitions to SourceFieldSchema', async () => {
      const getProperties = vi.fn(async () => ({
        results: [
          { name: 'email', label: 'Email', type: 'string', fieldType: 'text' },
          { name: 'tags', label: 'Tags', type: 'enumeration', fieldType: 'checkbox' },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ] as any,
      }))
      const a = adapterWith(makeFakeClient({ getProperties }))
      const fields = await a.listFields(WS, 'contacts')
      expect(getProperties).toHaveBeenCalledWith('contacts')
      expect(fields).toEqual([
        { id: 'email', label: 'Email', kind: 'text', isMulti: false },
        { id: 'tags', label: 'Tags', kind: 'enumeration', isMulti: true },
      ])
    })
  })

  describe('listRecords — full pull (no watermark)', () => {
    it('uses the list endpoint, maps records, surfaces cursor + max updatedAt', async () => {
      const getContacts = vi.fn(
        async (): Promise<HubSpotListResponse> => ({
          results: [
            { id: '1', properties: { email: 'a@x.com' }, createdAt: '', updatedAt: '2026-05-01T00:00:00Z', archived: false },
            { id: '2', properties: { email: 'b@x.com' }, createdAt: '', updatedAt: '2026-05-03T00:00:00Z', archived: false },
          ],
          paging: { next: { after: 'CURSOR2' } },
        }),
      )
      const a = adapterWith(makeFakeClient({ getContacts }))
      const page = await a.listRecords(WS, 'contacts', { limit: 50 })

      expect(getContacts).toHaveBeenCalledWith({ limit: 50, after: undefined })
      expect(a /* unused */ && page.records).toEqual([
        { externalId: '1', values: { email: 'a@x.com' }, updatedAt: '2026-05-01T00:00:00Z' },
        { externalId: '2', values: { email: 'b@x.com' }, updatedAt: '2026-05-03T00:00:00Z' },
      ])
      expect(page.nextCursor).toBe('CURSOR2')
      expect(page.maxUpdatedAt).toBe('2026-05-03T00:00:00Z')
    })

    it('returns null cursor and null maxUpdatedAt when empty', async () => {
      const page = await adapterWith(makeFakeClient()).listRecords(WS, 'companies', {})
      expect(page).toEqual({ records: [], nextCursor: null, maxUpdatedAt: null })
    })

    it('routes companies and deals to their endpoints', async () => {
      const getCompanies = vi.fn(async (): Promise<HubSpotListResponse> => ({ results: [] }))
      const getDeals = vi.fn(async (): Promise<HubSpotListResponse> => ({ results: [] }))
      const a = adapterWith(makeFakeClient({ getCompanies, getDeals }))
      await a.listRecords(WS, 'companies', {})
      await a.listRecords(WS, 'deals', {})
      expect(getCompanies).toHaveBeenCalledOnce()
      expect(getDeals).toHaveBeenCalledOnce()
    })
  })

  describe('listRecords — incremental (watermark)', () => {
    it('uses search with a GTE hs_lastmodifieddate filter (epoch ms) sorted ascending', async () => {
      const since = '2026-05-02T00:00:00Z'
      const search = vi.fn(
        async (_object: string, _opts: HubSpotSearchOptions): Promise<HubSpotSearchResponse> => ({
          total: 1,
          results: [
            { id: '9', properties: { email: 'c@x.com', lastmodifieddate: '2026-05-04T00:00:00Z' }, createdAt: '', updatedAt: '2026-05-04T00:00:00Z', archived: false },
          ],
          paging: { next: { after: '10' } },
        }),
      )
      const a = adapterWith(makeFakeClient({ search }))
      const page = await a.listRecords(WS, 'contacts', { since, cursor: '0', limit: 25 })

      expect(search).toHaveBeenCalledOnce()
      const [objectType, opts] = search.mock.calls[0]!
      expect(objectType).toBe('contacts')
      expect(opts.filterGroups).toEqual([
        { filters: [{ propertyName: 'hs_lastmodifieddate', operator: 'GTE', value: String(Date.parse(since)) }] },
      ])
      expect(opts.sorts).toEqual([{ propertyName: 'hs_lastmodifieddate', direction: 'ASCENDING' }])
      expect(opts.after).toBe('0')
      expect(opts.limit).toBe(25)
      expect(page.records).toEqual([
        { externalId: '9', values: { email: 'c@x.com', lastmodifieddate: '2026-05-04T00:00:00Z' }, updatedAt: '2026-05-04T00:00:00Z' },
      ])
      expect(page.nextCursor).toBe('10')
      expect(page.maxUpdatedAt).toBe('2026-05-04T00:00:00Z')
    })
  })

  it('throws on an unsupported object', async () => {
    await expect(adapterWith(makeFakeClient()).listRecords(WS, 'tickets', {})).rejects.toThrow(/tickets/)
  })
})
