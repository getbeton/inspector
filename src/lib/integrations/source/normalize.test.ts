import { describe, expect, it } from 'vitest'

import { CANONICAL_OBJECT_IDS, canonicalObjectId, subjectKindFor } from './normalize'

describe('canonicalObjectId', () => {
  it('maps HubSpot native objects to canonical ids', () => {
    expect(canonicalObjectId('hubspot', 'contacts')).toBe('people')
    expect(canonicalObjectId('hubspot', 'companies')).toBe('companies')
    expect(canonicalObjectId('hubspot', 'deals')).toBe('deals')
  })

  it('maps Pipedrive native objects to canonical ids', () => {
    expect(canonicalObjectId('pipedrive', 'persons')).toBe('people')
    expect(canonicalObjectId('pipedrive', 'organizations')).toBe('companies')
    expect(canonicalObjectId('pipedrive', 'deals')).toBe('deals')
  })

  it('maps Zoho native modules (capitalized) to canonical ids', () => {
    expect(canonicalObjectId('zoho', 'Contacts')).toBe('people')
    expect(canonicalObjectId('zoho', 'Accounts')).toBe('companies')
    expect(canonicalObjectId('zoho', 'Deals')).toBe('deals')
  })

  it('returns null for an unmapped native object', () => {
    expect(canonicalObjectId('hubspot', 'tickets')).toBeNull()
    expect(canonicalObjectId('pipedrive', 'activities')).toBeNull()
  })

  it('returns null for an unknown source', () => {
    expect(canonicalObjectId('mystery_crm', 'contacts')).toBeNull()
  })
})

describe('subjectKindFor', () => {
  it('maps person/group canonical objects to PostHog subject kinds', () => {
    expect(subjectKindFor('people')).toBe('person')
    expect(subjectKindFor('companies')).toBe('group_org')
  })

  it('returns undefined for non-subject objects and null', () => {
    expect(subjectKindFor('deals')).toBeUndefined()
    expect(subjectKindFor('workspaces')).toBeUndefined()
    expect(subjectKindFor(null)).toBeUndefined()
  })
})

describe('CANONICAL_OBJECT_IDS', () => {
  it('matches the field-mapping canonical object set', () => {
    expect([...CANONICAL_OBJECT_IDS].sort()).toEqual(['companies', 'deals', 'people', 'workspaces'])
  })
})
