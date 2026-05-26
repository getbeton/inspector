import { describe, expect, it } from 'vitest'

import { adapterFor } from './adapter-for'
import type { Destination } from './types'

// Minimal stand-in for the supabase client the factories accept.
const ctx = { supabase: {} as never }

describe('adapterFor', () => {
  it('returns the Attio adapter for "attio"', () => {
    const adapter = adapterFor('attio', ctx)
    expect(adapter.destination).toBe('attio')
  })

  it('returns the HubSpot adapter for "hubspot"', () => {
    const adapter = adapterFor('hubspot', ctx)
    expect(adapter.destination).toBe('hubspot')
  })

  it('throws a clear error for an unknown destination', () => {
    expect(() => adapterFor('pipedrive' as Destination, ctx)).toThrow(
      /No adapter for destination "pipedrive"/,
    )
  })
})
