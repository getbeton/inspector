'use client'

import { useState, useMemo } from 'react'
import { Popover, PopoverTrigger, PopoverPopup } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils/cn'
import { useEventDefinitions } from '@/lib/hooks/use-event-definitions'
import { useSetupStatus } from '@/lib/hooks/use-setup-status'

interface EventPickerProps {
  value: string[]
  onChange: (eventNames: string[]) => void
  placeholder?: string
  className?: string
}

const MAX_VISIBLE_BADGES = 3

function formatVolume(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

/**
 * PostHog hedgehog SVG icon (16x16)
 */
function PostHogIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="64" cy="64" r="64" fill="#1D4AFF" />
      <path d="M44 52h40M44 64h40M44 76h28" stroke="white" strokeWidth="6" strokeLinecap="round" />
    </svg>
  )
}

/**
 * Multi-select event picker with Popover combobox.
 * Shows PostHog branding, search, checkboxes, and badge overflow.
 * Falls back to a free-text input when PostHog is not connected.
 */
export function EventPicker({ value, onChange, placeholder, className }: EventPickerProps) {
  const { data: setupStatus } = useSetupStatus()
  const posthogConnected = setupStatus?.integrations?.posthog ?? false

  const [search, setSearch] = useState('')
  const [includeSystem, setIncludeSystem] = useState(false)
  const [open, setOpen] = useState(false)
  const { data: events, isLoading, isError } = useEventDefinitions({ includeSystem })

  const filtered = useMemo(() => {
    if (!events) return []
    if (!search) return events
    const q = search.toLowerCase()
    return events.filter(e => e.name.toLowerCase().includes(q))
  }, [events, search])

  const toggleEvent = (name: string) => {
    if (value.includes(name)) {
      onChange(value.filter(v => v !== name))
    } else {
      onChange([...value, name])
    }
  }

  const removeEvent = (name: string) => {
    onChange(value.filter(v => v !== name))
  }

  // Fallback: free-text input when PostHog is not connected or on error
  if (!posthogConnected || isError) {
    return (
      <div className={className}>
        <Input
          placeholder="Enter event name (e.g., dashboard_viewed)"
          value={value[0] || ''}
          onChange={(e) => onChange(e.target.value ? [e.target.value] : [])}
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

  const visibleBadges = value.slice(0, MAX_VISIBLE_BADGES)
  const overflowCount = value.length - MAX_VISIBLE_BADGES

  return (
    <div className={cn('space-y-2', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={<div />}
          className={cn(
            'flex items-center gap-1.5 flex-wrap min-h-[2.25rem] w-full px-3 py-1.5',
            'rounded-lg border border-input bg-background text-sm cursor-pointer',
            'hover:bg-muted/50 transition-colors',
          )}
        >
          {value.length > 0 ? (
            <>
              {visibleBadges.map(name => (
                <Badge
                  key={name}
                  variant="secondary"
                  className="gap-1 font-mono text-xs"
                >
                  {name}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); removeEvent(name) }}
                    className="ml-0.5 hover:text-destructive"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </Badge>
              ))}
              {overflowCount > 0 && (
                <Badge variant="outline" className="text-xs">
                  +{overflowCount} more
                </Badge>
              )}
            </>
          ) : (
            <span className="text-muted-foreground">
              {placeholder || 'Select events...'}
            </span>
          )}
          <svg
            className="w-4 h-4 text-muted-foreground ml-auto shrink-0"
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </PopoverTrigger>

        <PopoverPopup
          side="bottom"
          align="start"
          className="w-[var(--anchor-width)] max-h-80"
        >
          {/* Header with PostHog branding */}
          <div className="flex items-center gap-2 px-3 pb-2 border-b border-border mb-2">
            <PostHogIcon className="w-4 h-4 shrink-0" />
            <span className="text-xs font-medium text-muted-foreground">PostHog Events</span>
          </div>

          {/* Search input */}
          <div className="px-3 pb-2">
            <div className="relative">
              <svg
                className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground"
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <Input
                placeholder="Search events..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
                size="sm"
              />
            </div>
          </div>

          {/* System events toggle */}
          <div className="px-3 pb-2">
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <Checkbox
                checked={includeSystem}
                onCheckedChange={(checked) => setIncludeSystem(checked === true)}
              />
              Include system events
            </label>
          </div>

          {/* Event list */}
          <ScrollArea className="max-h-48">
            <div className="px-1">
              {isLoading ? (
                <div className="p-2 space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-8 bg-muted animate-pulse rounded-md" />
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <div className="p-4 text-center">
                  <p className="text-xs text-muted-foreground">
                    {search ? 'No events match your search.' : 'No events found.'}
                  </p>
                </div>
              ) : (
                filtered.map((event) => {
                  const isSelected = value.includes(event.name)
                  return (
                    <button
                      key={event.name}
                      type="button"
                      onClick={() => toggleEvent(event.name)}
                      className={cn(
                        'w-full text-left px-2 py-1.5 rounded-md text-sm transition-colors',
                        'flex items-center gap-2',
                        isSelected ? 'bg-primary/5' : 'hover:bg-muted/50'
                      )}
                    >
                      <Checkbox
                        checked={isSelected}
                        tabIndex={-1}
                        className="pointer-events-none"
                      />
                      <span className="font-mono truncate text-xs">{event.name}</span>
                      {event.volume_30_day > 0 && (
                        <Badge variant="secondary" className="text-[10px] ml-auto shrink-0">
                          {formatVolume(event.volume_30_day)}
                        </Badge>
                      )}
                    </button>
                  )
                })
              )}
            </div>
          </ScrollArea>

          {/* Footer */}
          <div className="px-3 pt-2 mt-2 border-t border-border">
            <p className="text-xs text-muted-foreground">
              {value.length} selected
            </p>
          </div>
        </PopoverPopup>
      </Popover>
    </div>
  )
}
