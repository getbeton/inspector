import type { SessionStatus } from '@/lib/api/mcp-sessions'

// ---------------------------------------------------------------------------
// Status badge config
// ---------------------------------------------------------------------------

interface StatusBadgeConfig {
  label: string
  variant: 'outline' | 'info' | 'success' | 'error' | 'secondary'
  /** CSS class for the animated dot (running status) */
  dot?: string
}

const STATUS_MAP: Record<SessionStatus, StatusBadgeConfig> = {
  created: { label: 'Created', variant: 'outline' },
  running: { label: 'Running', variant: 'info', dot: 'bg-info animate-pulse' },
  completed: { label: 'Completed', variant: 'success' },
  failed: { label: 'Failed', variant: 'error' },
  closed: { label: 'Closed', variant: 'secondary' },
}

export function statusBadge(status: string): StatusBadgeConfig {
  return STATUS_MAP[status as SessionStatus] ?? { label: status, variant: 'outline' }
}

// ---------------------------------------------------------------------------
// Date/time formatting (Intl.DateTimeFormat per spec)
// ---------------------------------------------------------------------------

const timestampFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

export function formatTimestamp(iso: string): string {
  try {
    return timestampFormatter.format(new Date(iso))
  } catch {
    return iso
  }
}

// ---------------------------------------------------------------------------
// Duration formatting
// ---------------------------------------------------------------------------

export function formatDuration(
  startedAt: string | null,
  completedAt: string | null,
): string {
  if (!startedAt) return '—'

  const start = new Date(startedAt).getTime()
  const end = completedAt ? new Date(completedAt).getTime() : Date.now()
  const diffMs = Math.max(0, end - start)

  if (diffMs < 1_000) return '<1s'

  const seconds = Math.floor(diffMs / 1_000) % 60
  const minutes = Math.floor(diffMs / 60_000) % 60
  const hours = Math.floor(diffMs / 3_600_000)

  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}
