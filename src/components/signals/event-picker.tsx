'use client'

import { useState, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils/cn'
import { useEventDefinitions } from '@/lib/hooks/use-event-definitions'
import { useSetupStatus } from '@/lib/hooks/use-setup-status'

interface EventPickerProps {
  value?: string
  onSelect: (eventName: string) => void
  className?: string
}

function formatVolume(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

/**
 * Searchable event picker that fetches real PostHog event definitions.
 * Falls back to a free-text input when PostHog is not connected.
 */
export function EventPicker({ value, onSelect, className }: EventPickerProps) {
  const { data: setupStatus } = useSetupStatus()
  const posthogConnected = setupStatus?.integrations?.posthog ?? false

  const [search, setSearch] = useState('')
  const [includeSystem, setIncludeSystem] = useState(false)
  const { data: events, isLoading, isError } = useEventDefinitions({ includeSystem })

  // Client-side search filtering
  const filtered = useMemo(() => {
    if (!events) return []
    if (!search) return events
    const q = search.toLowerCase()
    return events.filter(e => e.name.toLowerCase().includes(q))
  }, [events, search])

  // Fallback: free-text input when PostHog is not connected or on error
  if (!posthogConnected || isError) {
    return (
      <div className={className}>
        <Input
          placeholder="Enter event name (e.g., dashboard_viewed)"
          value={value || ''}
          onChange={(e) => onSelect(e.target.value)}
        />
        {!posthogConnected && (
          <p className="text-xs text-muted-foreground mt-1.5">
            Connect PostHog to browse your real events.
          </p>
        )}
        {isError && (
          <p className="text-xs text-destructive mt-1.5">
            Failed to load events. You can type an event name manually.
          </p>
        )}
      </div>
    )
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* Search */}
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <Input
          placeholder="Search events..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* System events toggle */}
      <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
        <input
          type="checkbox"
          checked={includeSystem}
          onChange={(e) => setIncludeSystem(e.target.checked)}
          className="rounded border-border"
        />
        Include system events ($pageview, $autocapture, etc.)
      </label>

      {/* Event list */}
      <div className="border border-border rounded-lg max-h-64 overflow-y-auto">
        {isLoading ? (
          // Skeleton loading state
          <div className="p-2 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 bg-muted animate-pulse rounded-md" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-sm text-muted-foreground">
              {search
                ? 'No events match your search.'
                : 'No events found. Make sure your PostHog project has tracked events.'}
            </p>
          </div>
        ) : (
          <div className="p-1">
            {filtered.map((event) => (
              <button
                key={event.name}
                type="button"
                onClick={() => {
                  onSelect(event.name)
                  setSearch('')
                }}
                className={cn(
                  'w-full text-left px-3 py-2 rounded-md text-sm transition-colors',
                  'flex items-center justify-between gap-2',
                  value === event.name
                    ? 'bg-primary/10 text-primary'
                    : 'hover:bg-muted/50'
                )}
              >
                <span className="font-mono truncate">{event.name}</span>
                {event.volume_30_day > 0 && (
                  <Badge variant="secondary" className="text-xs shrink-0">
                    {formatVolume(event.volume_30_day)}/30d
                  </Badge>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {value && (
        <p className="text-xs text-muted-foreground">
          Selected: <span className="font-mono font-medium text-foreground">{value}</span>
        </p>
      )}
    </div>
  )
}
