import { describe, expect, it } from 'vitest'

/**
 * Importing the framework index runs the `./register` side-effect, which must
 * leave the HubSpot source adapter resolvable. Guards against the regression
 * where `getSourceAdapter('hubspot')` threw because nothing registered it.
 */
import { getSourceAdapter, listRegisteredSources } from './index'

describe('source adapter registration (side-effect)', () => {
  it('registers the hubspot source adapter at module load', () => {
    const adapter = getSourceAdapter('hubspot')
    expect(adapter.source).toBe('hubspot')
  })

  it('exposes hubspot in the list of registered sources', () => {
    expect(listRegisteredSources()).toContain('hubspot')
  })
})
