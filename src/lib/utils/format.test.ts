import { describe, it, expect, vi, afterEach } from 'vitest'
import { formatRelativeTime, formatBytes } from './format'

describe('formatRelativeTime', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns "just now" for dates less than 1 minute ago', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-22T12:00:30Z'))
    expect(formatRelativeTime('2026-02-22T12:00:00Z')).toBe('just now')
  })

  it('returns minutes ago for dates less than 1 hour ago', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-22T12:15:00Z'))
    expect(formatRelativeTime('2026-02-22T12:00:00Z')).toBe('15m ago')
  })

  it('returns hours ago for dates less than 24 hours ago', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-22T15:00:00Z'))
    expect(formatRelativeTime('2026-02-22T12:00:00Z')).toBe('3h ago')
  })

  it('returns days ago for dates less than 30 days ago', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-25T12:00:00Z'))
    expect(formatRelativeTime('2026-02-22T12:00:00Z')).toBe('3d ago')
  })

  it('returns locale date string for dates older than 30 days', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-01T12:00:00Z'))
    const result = formatRelativeTime('2026-02-22T12:00:00Z')
    // Should be a date string, not relative
    expect(result).not.toContain('ago')
    expect(result).not.toBe('just now')
  })
})

describe('formatBytes', () => {
  it('formats bytes', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1023)).toBe('1023 B')
  })

  it('formats kilobytes', () => {
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(14320)).toBe('14.0 KB')
    expect(formatBytes(52480)).toBe('51.3 KB')
  })

  it('formats megabytes', () => {
    expect(formatBytes(1048576)).toBe('1.0 MB')
    expect(formatBytes(1572864)).toBe('1.5 MB')
  })
})
