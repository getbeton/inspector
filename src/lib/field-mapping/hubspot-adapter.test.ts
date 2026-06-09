import { describe, expect, it, vi } from 'vitest'

import { createHubSpotDestinationAdapter, type HubSpotDestinationDeps } from './hubspot-adapter'
import { HubSpotValidationError, HubSpotAuthError } from '@/lib/integrations/hubspot'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fakeSupabase: any = {}
const WS = 'ws-1'

/** Build the adapter with `supabase` pre-supplied; `over` carries the test-specific deps. */
function makeAdapter(over: Partial<Omit<HubSpotDestinationDeps, 'supabase'>> = {}) {
  return createHubSpotDestinationAdapter({ supabase: fakeSupabase, ...over })
}

describe('HubSpot DestinationAdapter', () => {
  it('identifies as the hubspot destination', () => {
    expect(makeAdapter().destination).toBe('hubspot')
  })

  describe('listObjects', () => {
    it('exposes people/companies/deals with subject kinds and deferred fields', async () => {
      const objs = await makeAdapter().listObjects(WS)
      expect(objs).toEqual([
        { id: 'people', label: 'Contacts', description: expect.any(String), subjectKind: 'person', fields: [] },
        { id: 'companies', label: 'Companies', description: expect.any(String), subjectKind: 'group_org', fields: [] },
        { id: 'deals', label: 'Deals', description: expect.any(String), subjectKind: 'group_org', fields: [] },
      ])
    })
  })

  describe('listFields', () => {
    it('maps writable HubSpot properties, filtering calculated/hidden, mapping enums', async () => {
      const getProperties = vi.fn(async () => ({
        results: [
          { name: 'email', label: 'Email', type: 'string', fieldType: 'text', calculated: false, hidden: false, options: [] },
          {
            name: 'lifecyclestage', label: 'Lifecycle Stage', type: 'enumeration', fieldType: 'select',
            calculated: false, hidden: false,
            options: [{ value: 'lead' }, { value: 'customer' }],
          },
          { name: 'hs_calc', label: 'Calc', type: 'number', fieldType: 'number', calculated: true, hidden: false, options: [] },
          { name: 'hs_hidden', label: 'Hidden', type: 'string', fieldType: 'text', calculated: false, hidden: true, options: [] },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ] as any,
      }))
      const fields = await makeAdapter({ getClient: async () => ({ getProperties }) as never }).listFields(WS, 'people')

      expect(getProperties).toHaveBeenCalledWith('contacts') // people → contacts
      expect(fields).toEqual([
        { id: 'email', label: 'Email', kind: 'text', required: false, isMulti: false },
        { id: 'lifecyclestage', label: 'Lifecycle Stage', kind: 'select', required: false, isMulti: false, options: ['lead', 'customer'] },
      ])
    })
  })

  describe('fetchSampleSubjects', () => {
    it('delegates to the shared helper with the resolved limit', async () => {
      const sampleSubjects = vi.fn(async () => [])
      await makeAdapter({ sampleSubjects }).fetchSampleSubjects(WS, 'people', { limit: 5 })
      expect(sampleSubjects).toHaveBeenCalledWith(fakeSupabase, WS, 'people', 5)
    })
  })

  describe('sendTest', () => {
    const dummyClient = {} as never
    const ok = { recordId: 'r1', action: 'created' as const, objectType: 'contacts' }

    it('routes people → upsertContact (match on email)', async () => {
      const upsertContact = vi.fn(async () => ok)
      const res = await makeAdapter({ getClient: async () => dummyClient, ops: { upsertContact } as never })
        .sendTest(WS, 'people', { email: 'a@x.com' }, [], [])
      expect(upsertContact).toHaveBeenCalledWith(dummyClient, { email: 'a@x.com' }, 'email')
      expect(res.status).toBe('success')
      expect(res.code).toBe(200)
    })

    it('routes companies → upsertCompany (match on domain)', async () => {
      const upsertCompany = vi.fn(async () => ({ ...ok, objectType: 'companies' }))
      await makeAdapter({ getClient: async () => dummyClient, ops: { upsertCompany } as never })
        .sendTest(WS, 'companies', { domain: 'x.com' }, [], [])
      expect(upsertCompany).toHaveBeenCalledWith(dummyClient, { domain: 'x.com' }, 'domain')
    })

    it('routes deals → createDeal', async () => {
      const createDeal = vi.fn(async () => ({ ...ok, objectType: 'deals' }))
      await makeAdapter({ getClient: async () => dummyClient, ops: { createDeal } as never })
        .sendTest(WS, 'deals', { dealname: 'D' }, [], [])
      expect(createDeal).toHaveBeenCalledWith(dummyClient, { dealname: 'D' })
    })

    it('returns an unsupported-object error for workspaces', async () => {
      const res = await makeAdapter({ getClient: async () => dummyClient })
        .sendTest(WS, 'workspaces', {}, [], [])
      expect(res.status).toBe('error')
      expect(res.code).toBe(400)
    })

    it('maps a HubSpot validation error to a 422 result', async () => {
      const upsertContact = vi.fn(async () => { throw new HubSpotValidationError('Property "email" is invalid') })
      const res = await makeAdapter({ getClient: async () => dummyClient, ops: { upsertContact } as never })
        .sendTest(WS, 'people', { email: 'bad' }, [], [])
      expect(res.status).toBe('error')
      expect(res.code).toBe(422)
      expect(res.detail).toMatch(/email/)
    })

    it('maps a HubSpot auth error to a 401 result with a reconnect action', async () => {
      const upsertContact = vi.fn(async () => { throw new HubSpotAuthError('token expired') })
      const res = await makeAdapter({ getClient: async () => dummyClient, ops: { upsertContact } as never })
        .sendTest(WS, 'people', { email: 'a@x.com' }, [], [])
      expect(res.code).toBe(401)
      expect(res.action).toMatch(/HubSpot/i)
    })
  })
})
