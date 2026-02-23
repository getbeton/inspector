'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogTrigger,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { toastManager } from '@/components/ui/toast'
import { Select, SelectTrigger, SelectPopup, SelectItem } from '@/components/ui/select'
import { cn } from '@/lib/utils/cn'
import { SIGNAL_TYPE_METADATA } from '@/lib/integrations/slack/message-builder'
import type { SignalTypeMeta } from '@/lib/integrations/slack/message-builder'
import type { IntegrationDefinition } from '@/lib/integrations/types'
import {
  useSlackConfig,
  useSlackChannels,
  useUpdateSlackChannel,
  useUpdateSlackSignalTypes,
  useTestSlackNotification,
  useDisconnectSlack,
} from '@/lib/hooks/use-slack'

// ── Signal type grouping ────────────────────────────────────────

const EXPANSION_TYPES = Object.entries(SIGNAL_TYPE_METADATA)
  .filter(([, meta]) => meta.category === 'expansion')
  .map(([type, meta]) => ({ type, ...meta }))

const CHURN_TYPES = Object.entries(SIGNAL_TYPE_METADATA)
  .filter(([, meta]) => meta.category === 'churn_risk')
  .map(([type, meta]) => ({ type, ...meta }))

// ── IntegrationIcon (shared with settings page) ─────────────────

function IntegrationIcon({
  definition,
  size = 32,
}: {
  definition: IntegrationDefinition
  size?: number
}) {
  const [error, setError] = useState(false)

  if (error || (!definition.icon_url && !definition.icon_url_light)) {
    return (
      <div
        className="flex items-center justify-center rounded-md border-2 border-border bg-muted font-bold text-muted-foreground"
        style={{ width: size, height: size }}
      >
        {definition.display_name[0]}
      </div>
    )
  }

  return (
    <picture>
      {definition.icon_url_light && (
        <source srcSet={definition.icon_url_light} media="(prefers-color-scheme: light)" />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={definition.icon_url || definition.icon_url_light!}
        alt={definition.display_name}
        width={size}
        height={size}
        className="rounded-md object-contain"
        onError={() => setError(true)}
      />
    </picture>
  )
}

// ── Main Component ──────────────────────────────────────────────

export function SlackIntegrationCard({
  definition,
}: {
  definition: IntegrationDefinition
}) {
  const { data: config, isLoading } = useSlackConfig()
  const disconnectMutation = useDisconnectSlack()
  const testMutation = useTestSlackNotification()

  const [expanded, setExpanded] = useState(false)

  // Determine card state
  const status: 'loading' | 'not_connected' | 'error' | 'connected_no_channel' | 'configured' =
    isLoading
      ? 'loading'
      : !config?.connected
        ? config?.status === 'error'
          ? 'error'
          : 'not_connected'
        : !config.channelId
          ? 'connected_no_channel'
          : 'configured'

  // Show success toast when returning from OAuth
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('slack') === 'connected') {
      toastManager.add({ type: 'success', title: 'Slack connected successfully' })
      // Clean URL
      const url = new URL(window.location.href)
      url.searchParams.delete('slack')
      window.history.replaceState({}, '', url.toString())
    } else if (params.get('slack') === 'error') {
      const message = params.get('message') || 'Failed to connect Slack'
      toastManager.add({ type: 'error', title: message })
      const url = new URL(window.location.href)
      url.searchParams.delete('slack')
      url.searchParams.delete('message')
      window.history.replaceState({}, '', url.toString())
    }
  }, [])

  const handleDisconnect = async () => {
    try {
      await disconnectMutation.mutateAsync()
      toastManager.add({ type: 'success', title: 'Slack disconnected' })
    } catch {
      toastManager.add({ type: 'error', title: 'Failed to disconnect Slack' })
    }
  }

  const handleTest = async () => {
    try {
      await testMutation.mutateAsync()
      toastManager.add({ type: 'success', title: 'Test notification sent to Slack' })
    } catch (err) {
      toastManager.add({
        type: 'error',
        title: err instanceof Error ? err.message : 'Failed to send test notification',
      })
    }
  }

  return (
    <div
      className={cn(
        'border-2 border-border rounded-lg transition-all',
        expanded ? 'ring-1 ring-primary/50' : ''
      )}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between p-4 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-md border-2 border-border bg-background p-1">
            <IntegrationIcon definition={definition} size={28} />
          </div>
          <div>
            <p className="font-bold">{definition.display_name}</p>
            <p className="text-sm text-muted-foreground">{definition.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {status === 'loading' ? (
            <Spinner className="size-4" />
          ) : status === 'error' ? (
            <Badge className="bg-warning/10 text-warning border-warning/20">Reconnect</Badge>
          ) : status === 'not_connected' ? (
            <Badge variant="outline" className="text-muted-foreground">Not Connected</Badge>
          ) : (
            <Badge className="bg-success/10 text-success border-success/20">Connected</Badge>
          )}
          <svg
            className={cn(
              'w-4 h-4 text-muted-foreground transition-transform',
              expanded ? 'rotate-180' : ''
            )}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div className="px-4 pb-4 border-t-2 border-border pt-4">
          {status === 'loading' && (
            <div className="flex items-center justify-center py-4">
              <Spinner className="size-5" />
            </div>
          )}

          {status === 'not_connected' && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Get signal notifications in Slack when product usage signals are detected.
              </p>
              <a href="/api/integrations/slack/install">
                <Button className="bg-[#4A154B] hover:bg-[#3a1139] text-white">
                  <SlackIcon className="mr-2 size-4" />
                  Add to Slack
                </Button>
              </a>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 p-3 rounded-md bg-warning/10 border border-warning/20">
                <span className="text-warning text-sm">
                  Slack token expired or was revoked. Please reconnect to resume notifications.
                </span>
              </div>
              <a href="/api/integrations/slack/install">
                <Button>Reconnect Slack</Button>
              </a>
            </div>
          )}

          {(status === 'connected_no_channel' || status === 'configured') && config && (
            <div className="space-y-5">
              {/* Connection info */}
              <div className="text-sm text-muted-foreground">
                Connected to <span className="font-medium text-foreground">{config.teamName}</span>
              </div>

              {/* Channel picker */}
              <ChannelPicker
                currentChannelId={config.channelId || undefined}
                currentChannelName={config.channelName || undefined}
              />

              {/* Signal type toggles — only show when channel is configured */}
              {config.channelId && (
                <SignalTypeToggles enabledTypes={config.enabledSignalTypes || []} />
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 pt-2 border-t border-border">
                {config.channelId && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleTest}
                    disabled={testMutation.isPending}
                  >
                    {testMutation.isPending ? 'Sending...' : 'Send Test Notification'}
                  </Button>
                )}
                <Dialog>
                  <DialogTrigger
                    render={
                      <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                        Disconnect
                      </Button>
                    }
                  />
                  <DialogPopup>
                    <DialogHeader>
                      <DialogTitle>Disconnect Slack?</DialogTitle>
                      <DialogDescription>
                        This will revoke the bot token and stop all signal notifications to Slack.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <DialogClose render={<Button variant="outline">Cancel</Button>} />
                      <DialogClose
                        render={
                          <Button variant="destructive" onClick={handleDisconnect}>
                            Disconnect
                          </Button>
                        }
                      />
                    </DialogFooter>
                  </DialogPopup>
                </Dialog>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Channel Picker ──────────────────────────────────────────────

function ChannelPicker({
  currentChannelId,
  currentChannelName,
}: {
  currentChannelId?: string
  currentChannelName?: string
}) {
  const [isOpen, setIsOpen] = useState(!currentChannelId)
  const [fetchEnabled, setFetchEnabled] = useState(false)
  const { data: channels, isLoading, error } = useSlackChannels(fetchEnabled)
  const updateChannel = useUpdateSlackChannel()

  const handleOpenPicker = () => {
    setIsOpen(true)
    setFetchEnabled(true)
  }

  const handleSelectChannel = async (channelId: string | null) => {
    if (!channelId) return
    const channel = channels?.find((c) => c.id === channelId)
    if (!channel) return

    try {
      await updateChannel.mutateAsync({
        channelId: channel.id,
        channelName: channel.name,
      })
      setIsOpen(false)
      toastManager.add({ type: 'success', title: `Channel set to #${channel.name}` })
    } catch {
      toastManager.add({ type: 'error', title: 'Failed to save channel' })
    }
  }

  if (!isOpen && currentChannelId) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm">
          Channel: <span className="font-medium">#{currentChannelName}</span>
        </span>
        <button
          onClick={handleOpenPicker}
          className="text-xs text-primary hover:underline"
        >
          Change
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-bold uppercase tracking-wider block">
        Select Channel
      </label>
      {isLoading ? (
        <div className="flex items-center gap-2 py-2">
          <Spinner className="size-4" />
          <span className="text-sm text-muted-foreground">Loading channels...</span>
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : 'Failed to load channels'}
        </p>
      ) : (
        <Select
          value={currentChannelId || ''}
          onValueChange={handleSelectChannel}
        >
          <SelectTrigger disabled={updateChannel.isPending}>
            <span className="truncate">
              {currentChannelName ? `#${currentChannelName}` : 'Choose a channel...'}
            </span>
          </SelectTrigger>
          <SelectPopup className="max-h-60 overflow-y-auto">
            {channels?.map((ch) => (
              <SelectItem key={ch.id} value={ch.id}>
                <span className="flex items-center gap-2">
                  {ch.is_private ? (
                    <svg className="size-3.5 text-muted-foreground" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M4 6V4a4 4 0 1 1 8 0v2h1a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h1zm2 0h4V4a2 2 0 1 0-4 0v2z" />
                    </svg>
                  ) : (
                    <span className="text-muted-foreground">#</span>
                  )}
                  <span>{ch.name}</span>
                  {ch.num_members != null && (
                    <span className="text-xs text-muted-foreground ml-auto">
                      {ch.num_members} members
                    </span>
                  )}
                </span>
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      )}
    </div>
  )
}

// ── Signal Type Toggles ─────────────────────────────────────────

function SignalTypeToggles({ enabledTypes }: { enabledTypes: string[] }) {
  const [localEnabled, setLocalEnabled] = useState<Set<string>>(new Set(enabledTypes))
  const updateTypes = useUpdateSlackSignalTypes()

  // Sync when server data changes
  useEffect(() => {
    setLocalEnabled(new Set(enabledTypes))
  }, [enabledTypes])

  const handleToggle = useCallback(
    (type: string, checked: boolean) => {
      setLocalEnabled((prev) => {
        const next = new Set(prev)
        if (checked) next.add(type)
        else next.delete(type)
        return next
      })
    },
    []
  )

  const handleSelectAll = useCallback(
    (types: { type: string }[], checked: boolean) => {
      setLocalEnabled((prev) => {
        const next = new Set(prev)
        for (const t of types) {
          if (checked) next.add(t.type)
          else next.delete(t.type)
        }
        return next
      })
    },
    []
  )

  const handleSave = async () => {
    try {
      await updateTypes.mutateAsync([...localEnabled])
      toastManager.add({ type: 'success', title: 'Signal preferences saved' })
    } catch {
      toastManager.add({ type: 'error', title: 'Failed to save signal preferences' })
    }
  }

  const isDirty = (() => {
    const serverSet = new Set(enabledTypes)
    if (localEnabled.size !== serverSet.size) return true
    for (const t of localEnabled) {
      if (!serverSet.has(t)) return true
    }
    return false
  })()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold uppercase tracking-wider">Notify me about</h4>
        {isDirty && (
          <Button
            size="sm"
            onClick={handleSave}
            disabled={updateTypes.isPending}
          >
            {updateTypes.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        )}
      </div>

      {/* Expansion signals */}
      <SignalTypeGroup
        title="Expansion Signals"
        types={EXPANSION_TYPES}
        enabledSet={localEnabled}
        onToggle={handleToggle}
        onSelectAll={handleSelectAll}
      />

      {/* Churn risk signals */}
      <SignalTypeGroup
        title="Churn Risk Signals"
        types={CHURN_TYPES}
        enabledSet={localEnabled}
        onToggle={handleToggle}
        onSelectAll={handleSelectAll}
      />
    </div>
  )
}

function SignalTypeGroup({
  title,
  types,
  enabledSet,
  onToggle,
  onSelectAll,
}: {
  title: string
  types: (SignalTypeMeta & { type: string })[]
  enabledSet: Set<string>
  onToggle: (type: string, checked: boolean) => void
  onSelectAll: (types: { type: string }[], checked: boolean) => void
}) {
  const allEnabled = types.every((t) => enabledSet.has(t.type))
  const noneEnabled = types.every((t) => !enabledSet.has(t.type))

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {title}
        </span>
        <button
          onClick={() => onSelectAll(types, !allEnabled)}
          className="text-xs text-primary hover:underline"
        >
          {allEnabled ? 'Deselect all' : 'Select all'}
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {types.map((t) => (
          <label
            key={t.type}
            className="flex items-center gap-2 py-1 px-2 rounded hover:bg-muted/50 cursor-pointer text-sm"
          >
            <Checkbox
              checked={enabledSet.has(t.type)}
              onCheckedChange={(checked) => onToggle(t.type, checked === true)}
            />
            <span>{t.emoji}</span>
            <span>{t.displayName}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

// ── Slack Icon SVG ──────────────────────────────────────────────

function SlackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
    </svg>
  )
}
