'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

// ── Query keys ──────────────────────────────────────────────────

export const slackKeys = {
  all: ['slack'] as const,
  config: () => [...slackKeys.all, 'config'] as const,
  channels: () => [...slackKeys.all, 'channels'] as const,
}

// ── Types ───────────────────────────────────────────────────────

interface SlackConfig {
  connected: boolean
  status?: string
  teamName?: string | null
  channelId?: string | null
  channelName?: string | null
  enabledSignalTypes?: string[]
}

interface SlackChannel {
  id: string
  name: string
  is_private: boolean
  num_members?: number
}

// ── Fetchers ────────────────────────────────────────────────────

async function fetchSlackConfig(): Promise<SlackConfig> {
  const res = await fetch('/api/integrations/slack/config', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch Slack config')
  return res.json()
}

async function fetchSlackChannels(): Promise<SlackChannel[]> {
  const res = await fetch('/api/integrations/slack/channels', { credentials: 'include' })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || 'Failed to fetch channels')
  }
  const data = await res.json()
  return data.channels
}

// ── Hooks ───────────────────────────────────────────────────────

/**
 * Fetch current Slack integration config (connection status, channel, enabled types).
 */
export function useSlackConfig() {
  return useQuery({
    queryKey: slackKeys.config(),
    queryFn: fetchSlackConfig,
    staleTime: 30_000,
  })
}

/**
 * Fetch channels the Slack bot can see.
 * Disabled by default — enable when the channel picker opens.
 */
export function useSlackChannels(enabled = false) {
  return useQuery({
    queryKey: slackKeys.channels(),
    queryFn: fetchSlackChannels,
    enabled,
    staleTime: 60_000,
  })
}

/**
 * Mutation to save the selected channel.
 */
export function useUpdateSlackChannel() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ channelId, channelName }: { channelId: string; channelName: string }) => {
      const res = await fetch('/api/integrations/slack/channel', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel_id: channelId, channel_name: channelName }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to save channel')
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: slackKeys.config() })
    },
  })
}

/**
 * Mutation to update enabled signal types.
 */
export function useUpdateSlackSignalTypes() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (enabledSignalTypes: string[]) => {
      const res = await fetch('/api/integrations/slack/config', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled_signal_types: enabledSignalTypes }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to update signal types')
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: slackKeys.config() })
    },
  })
}

/**
 * Mutation to send a test notification.
 */
export function useTestSlackNotification() {
  return useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/integrations/slack/test', {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to send test notification')
      }
      return res.json()
    },
  })
}

/**
 * Mutation to disconnect Slack integration.
 */
export function useDisconnectSlack() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/integrations/slack/disconnect', {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to disconnect Slack')
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: slackKeys.all })
      // Also invalidate the generic integration credentials
      queryClient.invalidateQueries({ queryKey: ['integrations', 'credentials', 'slack'] })
    },
  })
}
