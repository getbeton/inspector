import { describe, it, expect } from 'vitest'
import { toMcpError, httpErrorToMcp } from '../src/lib/errors'
import { McpError } from '@modelcontextprotocol/sdk/types.js'

describe('toMcpError', () => {
  it('should format Error instances', () => {
    const result = toMcpError(new Error('Something broke'))

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: Something broke')
  })

  it('should handle non-Error values', () => {
    const result = toMcpError('string error')

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: Unknown error')
  })
})

describe('httpErrorToMcp', () => {
  it('should throw McpError for 401 status', () => {
    expect(() => httpErrorToMcp({ error: 'Unauthorized' }, 401)).toThrow(McpError)
  })

  it('should throw McpError for 403 status', () => {
    expect(() => httpErrorToMcp({ error: 'Forbidden' }, 403)).toThrow(McpError)
  })

  it('should return error result for 404 status', () => {
    const result = httpErrorToMcp({ error: 'Not found' }, 404)

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: Not found')
  })

  it('should return error result for 500 status', () => {
    const result = httpErrorToMcp({ error: 'Server error' }, 500)

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: Server error')
  })

  it('should handle null response bodies', () => {
    const result = httpErrorToMcp(null, 500)

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Error: HTTP 500 error')
  })
})
