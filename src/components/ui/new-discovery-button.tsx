'use client'

import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils/cn'
import { Button } from '@/components/ui/button'
import { Sparkles, RefreshCw } from 'lucide-react'

interface AgentSession {
  session_id: string
  status: 'created' | 'running' | 'completed' | 'failed' | 'closed'
  created_at: string
  updated_at: string
  error_message: string | null
}

interface SessionsResponse {
  sessions: AgentSession[]
}

function formatTimeAgo(date: string | null | undefined): string {
  if (!date) return 'No discovery yet'
  const diffMs = Date.now() - new Date(date).getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}

interface NewDiscoveryButtonProps {
  workspaceId: string | undefined
  className?: string
  size?: 'sm' | 'default'
}

/**
 * Triggers a fresh agent signal-discovery run via the explicit force path.
 * Bypasses the 24h idempotency window so users can manually re-run.
 *
 * Polls the workspace's most recent agent session every 5s while one is
 * `created` or `running`, so the button reflects live state.
 */
export function NewDiscoveryButton({ workspaceId, className, size = 'sm' }: NewDiscoveryButtonProps) {
  const queryClient = useQueryClient()
  const [justFired, setJustFired] = useState(false)

  // Latest session for this workspace (drives the "running" indicator + last-run timestamp).
  const { data: sessions } = useQuery({
    queryKey: ['agent-sessions', workspaceId],
    queryFn: async (): Promise<AgentSession[]> => {
      if (!workspaceId) return []
      const res = await fetch(`/api/agent/sessions?workspaceId=${encodeURIComponent(workspaceId)}`)
      if (!res.ok) return []
      const data = (await res.json()) as SessionsResponse
      return data.sessions ?? []
    },
    enabled: Boolean(workspaceId),
    refetchInterval: (query) => {
      const latest = query.state.data?.[0]
      if (!latest) return 60_000
      return latest.status === 'created' || latest.status === 'running' ? 5_000 : 60_000
    },
    refetchOnWindowFocus: true,
  })

  const latest = sessions?.[0]
  const isRunning = latest?.status === 'created' || latest?.status === 'running' || justFired

  const trigger = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/onboarding/complete?force=true', {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || `Trigger failed (${res.status})`)
      }
      return res.json()
    },
    onMutate: () => {
      setJustFired(true)
    },
    onSuccess: () => {
      // Refresh the sessions list so the new row appears
      queryClient.invalidateQueries({ queryKey: ['agent-sessions', workspaceId] })
    },
    onError: () => {
      setJustFired(false)
    },
  })

  // Reset justFired once a new session is observed
  useEffect(() => {
    if (justFired && latest && (latest.status === 'created' || latest.status === 'running')) {
      // We've seen the trigger land — let the polled status take over
      const t = setTimeout(() => setJustFired(false), 1000)
      return () => clearTimeout(t)
    }
  }, [justFired, latest])

  const lastFinishedAt = sessions?.find(
    (s) => s.status === 'completed' || s.status === 'failed' || s.status === 'closed',
  )?.updated_at

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Button
        type="button"
        variant="outline"
        size={size}
        onClick={() => trigger.mutate()}
        disabled={isRunning || !workspaceId}
        className="gap-1.5"
      >
        {isRunning ? (
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Sparkles className="w-3.5 h-3.5" strokeWidth={2.25} />
        )}
        {isRunning ? 'Discovery running…' : 'New signal discovery'}
      </Button>
      <span className="text-xs text-muted-foreground">
        {trigger.error
          ? `Failed: ${(trigger.error as Error).message}`
          : `Last run ${formatTimeAgo(lastFinishedAt)}`}
      </span>
    </div>
  )
}
