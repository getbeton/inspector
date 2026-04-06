/**
 * Number, date, and currency formatting utilities for CLI output
 */

export function formatNumber(n: number): string {
  return n.toLocaleString('en-US')
}

export function formatCurrency(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000
    return `$${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`
  }
  if (n >= 1_000) {
    const k = n / 1_000
    return `$${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}K`
  }
  return `$${n}`
}

export function formatPercent(n: number): string {
  if (n > 1) return `${n.toFixed(1)}%`
  return `${(n * 100).toFixed(1)}%`
}

export function formatLift(n: number): string {
  return `${n.toFixed(1)}x`
}

export function formatRelativeTime(iso: string): string {
  const now = Date.now()
  const then = new Date(iso).getTime()
  if (isNaN(then)) return 'unknown'
  const diffMs = now - then
  const seconds = Math.floor(diffMs / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  const years = Math.floor(months / 12)
  return `${years}y ago`
}

export function formatDate(iso: string, format: 'relative' | 'iso' | 'local' = 'relative'): string {
  if (!iso) return '-'
  switch (format) {
    case 'relative': return formatRelativeTime(iso)
    case 'iso': return iso.slice(0, 19).replace('T', ' ')
    case 'local': return new Date(iso).toLocaleString()
    default: return formatRelativeTime(iso)
  }
}

export function truncate(s: string, max: number): string {
  if (!s) return ''
  if (s.length <= max) return s
  return s.slice(0, max - 1) + '\u2026'
}

export function padRight(s: string, width: number): string {
  if (s.length >= width) return s.slice(0, width)
  return s + ' '.repeat(width - s.length)
}

export function padLeft(s: string, width: number): string {
  if (s.length >= width) return s.slice(0, width)
  return ' '.repeat(width - s.length) + s
}
