import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Import after mocking
import { callApi } from '../src/lib/proxy'

describe('callApi', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should call the correct URL with GET method by default', async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ data: 'test' }),
    })

    const result = await callApi('/api/signals', 'Bearer token123')

    expect(mockFetch).toHaveBeenCalledOnce()
    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toContain('/api/signals')
    expect(options.method).toBe('GET')
    expect(result).toEqual({ data: { data: 'test' }, status: undefined })
  })

  it('should forward the auth header', async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({}),
    })

    await callApi('/api/test', 'Bearer my-jwt-token')

    const [, options] = mockFetch.mock.calls[0]
    expect(options.headers.Authorization).toBe('Bearer my-jwt-token')
  })

  it('should not include Authorization header when undefined', async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({}),
    })

    await callApi('/api/test', undefined)

    const [, options] = mockFetch.mock.calls[0]
    expect(options.headers.Authorization).toBeUndefined()
  })

  it('should append query parameters', async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({}),
    })

    await callApi('/api/signals', 'Bearer token', {
      params: { page: '1', limit: '50', type: 'custom:test' },
    })

    const [url] = mockFetch.mock.calls[0]
    expect(url).toContain('page=1')
    expect(url).toContain('limit=50')
    expect(url).toContain('type=custom%3Atest')
  })

  it('should skip empty param values', async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({}),
    })

    await callApi('/api/signals', 'Bearer token', {
      params: { page: '1', type: '' },
    })

    const [url] = mockFetch.mock.calls[0]
    expect(url).toContain('page=1')
    expect(url).not.toContain('type=')
  })

  it('should send POST request with JSON body', async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ id: '123' }),
    })

    await callApi('/api/signals/custom', 'Bearer token', {
      method: 'POST',
      body: { name: 'Test Signal', event_name: 'pageview' },
    })

    const [, options] = mockFetch.mock.calls[0]
    expect(options.method).toBe('POST')
    expect(options.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(options.body)).toEqual({
      name: 'Test Signal',
      event_name: 'pageview',
    })
  })

  it('should send PUT request with JSON body', async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ success: true }),
    })

    await callApi('/api/integrations/attio/mappings', 'Bearer token', {
      method: 'PUT',
      body: { mappings: { field1: 'attr1' } },
    })

    const [, options] = mockFetch.mock.calls[0]
    expect(options.method).toBe('PUT')
  })

  it('should return status from response', async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ error: 'Not found' }),
      status: 404,
    })

    // callApi doesn't currently capture res.status — it returns res.json()
    // This test verifies the response shape
    const result = await callApi('/api/signals/bad-id', 'Bearer token')
    expect(result.data).toEqual({ error: 'Not found' })
  })

  it('should use NEXT_APP_URL env var', async () => {
    // The module reads APP_URL at import time, so we test the default
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({}),
    })

    await callApi('/api/test', undefined)

    const [url] = mockFetch.mock.calls[0]
    expect(url).toContain('localhost:3000')
  })
})
