import { afterEach, describe, expect, it } from 'vitest'

import {
  _resetSourceRegistry,
  getSourceAdapter,
  listRegisteredSources,
  registerSourceAdapter,
  SourceAdapterNotFoundError,
  type SourceAdapter,
} from './adapter'
import type { RecordPage } from './types'

/** Minimal conforming adapter for registry tests. */
function makeFakeAdapter(source: SourceAdapter['source']): SourceAdapter {
  return {
    source,
    async testConnection() {
      return { ok: true }
    },
    async listObjects() {
      return [{ nativeId: 'contacts', canonical: 'people', label: 'Contacts', subjectKind: 'person' }]
    },
    async listFields() {
      return [{ id: 'email', label: 'Email', kind: 'email' }]
    },
    async listRecords(): Promise<RecordPage> {
      return { records: [], nextCursor: null, maxUpdatedAt: null }
    },
  }
}

describe('source adapter registry', () => {
  afterEach(() => {
    _resetSourceRegistry()
  })

  it('registers and resolves an adapter by source name', () => {
    const adapter = makeFakeAdapter('hubspot')
    registerSourceAdapter(adapter)
    expect(getSourceAdapter('hubspot')).toBe(adapter)
  })

  it('lists all registered sources', () => {
    registerSourceAdapter(makeFakeAdapter('hubspot'))
    registerSourceAdapter(makeFakeAdapter('pipedrive'))
    expect(listRegisteredSources().sort()).toEqual(['hubspot', 'pipedrive'])
  })

  it('overwrites a previous registration for the same source', () => {
    const first = makeFakeAdapter('zoho')
    const second = makeFakeAdapter('zoho')
    registerSourceAdapter(first)
    registerSourceAdapter(second)
    expect(getSourceAdapter('zoho')).toBe(second)
    expect(listRegisteredSources()).toEqual(['zoho'])
  })

  it('throws SourceAdapterNotFoundError for an unregistered source', () => {
    expect(() => getSourceAdapter('segment')).toThrow(SourceAdapterNotFoundError)
    expect(() => getSourceAdapter('segment')).toThrow(/segment/)
  })

  it('starts empty after reset', () => {
    registerSourceAdapter(makeFakeAdapter('hubspot'))
    _resetSourceRegistry()
    expect(listRegisteredSources()).toEqual([])
  })
})
