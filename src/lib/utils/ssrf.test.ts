import { describe, it, expect } from 'vitest'
import { isPrivateHost, validateUrl } from './ssrf'

describe('isPrivateHost', () => {
  it('blocks localhost', () => {
    expect(isPrivateHost('http://localhost')).toBe(true)
    expect(isPrivateHost('http://localhost:3000')).toBe(true)
    expect(isPrivateHost('https://LOCALHOST/path')).toBe(true)
  })

  it('blocks 127.x.x.x loopback addresses', () => {
    expect(isPrivateHost('http://127.0.0.1')).toBe(true)
    expect(isPrivateHost('http://127.0.0.1:8080')).toBe(true)
    expect(isPrivateHost('http://127.255.255.255')).toBe(true)
  })

  it('blocks 10.x.x.x private addresses', () => {
    expect(isPrivateHost('http://10.0.0.1')).toBe(true)
    expect(isPrivateHost('http://10.255.255.255')).toBe(true)
  })

  it('blocks 172.16-31.x.x private addresses', () => {
    expect(isPrivateHost('http://172.16.0.1')).toBe(true)
    expect(isPrivateHost('http://172.31.255.255')).toBe(true)
    // 172.15.x.x and 172.32.x.x are public
    expect(isPrivateHost('http://172.15.0.1')).toBe(false)
    expect(isPrivateHost('http://172.32.0.1')).toBe(false)
  })

  it('blocks 192.168.x.x private addresses', () => {
    expect(isPrivateHost('http://192.168.0.1')).toBe(true)
    expect(isPrivateHost('http://192.168.1.100')).toBe(true)
  })

  it('blocks link-local 169.254.x.x addresses', () => {
    expect(isPrivateHost('http://169.254.0.1')).toBe(true)
    expect(isPrivateHost('http://169.254.169.254')).toBe(true)
  })

  it('blocks 0.0.0.0', () => {
    expect(isPrivateHost('http://0.0.0.0')).toBe(true)
  })

  it('blocks IPv6 loopback ::1', () => {
    expect(isPrivateHost('http://[::1]')).toBe(true)
  })

  it('blocks .internal, .local, .localhost TLDs', () => {
    expect(isPrivateHost('http://app.internal')).toBe(true)
    expect(isPrivateHost('http://printer.local')).toBe(true)
    expect(isPrivateHost('http://test.localhost')).toBe(true)
  })

  it('blocks cloud metadata endpoints', () => {
    expect(isPrivateHost('http://169.254.169.254')).toBe(true)
    expect(isPrivateHost('http://metadata.google.internal')).toBe(true)
  })

  it('blocks non-http protocols', () => {
    expect(isPrivateHost('ftp://example.com')).toBe(true)
    expect(isPrivateHost('file:///etc/passwd')).toBe(true)
    expect(isPrivateHost('javascript:alert(1)')).toBe(true)
  })

  it('allows public URLs', () => {
    expect(isPrivateHost('https://example.com')).toBe(false)
    expect(isPrivateHost('https://api.posthog.com')).toBe(false)
    expect(isPrivateHost('https://cdn.brandfetch.io/id123')).toBe(false)
    expect(isPrivateHost('http://8.8.8.8')).toBe(false)
  })

  it('blocks invalid URLs', () => {
    expect(isPrivateHost('not-a-url')).toBe(true)
    expect(isPrivateHost('')).toBe(true)
  })
})

describe('validateUrl', () => {
  it('returns null for valid public URLs', () => {
    expect(validateUrl('https://example.com')).toBeNull()
    expect(validateUrl('https://api.posthog.com/api/projects/123')).toBeNull()
    expect(validateUrl('http://8.8.8.8')).toBeNull()
  })

  it('returns error for invalid URL format', () => {
    expect(validateUrl('not-a-url')).toBe('Invalid URL format')
    expect(validateUrl('')).toBe('Invalid URL format')
  })

  it('returns error for non-HTTP protocols', () => {
    expect(validateUrl('ftp://example.com')).toBe('Only HTTP and HTTPS protocols are allowed')
    expect(validateUrl('file:///etc/passwd')).toBe('Only HTTP and HTTPS protocols are allowed')
  })

  it('returns error for metadata endpoints', () => {
    expect(validateUrl('http://169.254.169.254/latest/meta-data')).toBe(
      'Access to this host is blocked (metadata endpoint)'
    )
    expect(validateUrl('http://metadata.google.internal/computeMetadata')).toBe(
      'Access to this host is blocked (metadata endpoint)'
    )
  })

  it('returns error for private/internal addresses', () => {
    expect(validateUrl('http://localhost:3000')).toBe('Access to private/internal addresses is blocked')
    expect(validateUrl('http://127.0.0.1')).toBe('Access to private/internal addresses is blocked')
    expect(validateUrl('http://10.0.0.1')).toBe('Access to private/internal addresses is blocked')
    expect(validateUrl('http://192.168.1.1')).toBe('Access to private/internal addresses is blocked')
  })
})
