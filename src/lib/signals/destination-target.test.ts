import { describe, it, expect } from 'vitest'
import {
  hubspotObjectApiName,
  hubspotObjectLabel,
  buildHubSpotTarget,
} from './destination-target'

describe('hubspotObjectApiName', () => {
  it('maps contact → contacts', () => {
    expect(hubspotObjectApiName('contact')).toBe('contacts')
  })
  it('maps company → companies', () => {
    expect(hubspotObjectApiName('company')).toBe('companies')
  })
  it('maps deal → deals', () => {
    expect(hubspotObjectApiName('deal')).toBe('deals')
  })
})

describe('hubspotObjectLabel', () => {
  it('labels each object choice', () => {
    expect(hubspotObjectLabel('contact')).toBe('HubSpot · Contacts')
    expect(hubspotObjectLabel('company')).toBe('HubSpot · Companies')
    expect(hubspotObjectLabel('deal')).toBe('HubSpot · Deals')
  })
})

describe('buildHubSpotTarget', () => {
  it('produces a hubspot target whose external_id is the plural object-type API name', () => {
    expect(buildHubSpotTarget('contact')).toEqual({
      type: 'hubspot',
      external_id: 'contacts',
      external_name: 'HubSpot · Contacts',
      auto_update: true,
    })
  })

  it('encodes the company object type as the external_id the sync cron reads', () => {
    const target = buildHubSpotTarget('company')
    expect(target.type).toBe('hubspot')
    // sync-signals/route.ts: `const objectType = target.external_id || 'contacts'`
    expect(target.external_id).toBe('companies')
  })

  it('encodes the deal object type', () => {
    expect(buildHubSpotTarget('deal').external_id).toBe('deals')
  })

  it('defaults auto_update to true and honours an explicit override', () => {
    expect(buildHubSpotTarget('contact').auto_update).toBe(true)
    expect(buildHubSpotTarget('contact', { autoUpdate: false }).auto_update).toBe(false)
  })
})
