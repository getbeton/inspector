'use client'

import { cn } from '@/lib/utils/cn'
import { Button } from '@/components/ui/button'
import { useSyncStatus, useTriggerSync } from '@/lib/hooks/use-sync-status'

interface RefreshButtonProps {
  syncType: string
  className?: string
  size?: 'sm' | 'default'
}

function formatTimeAgo(date: string | null | undefined): string {
  if (!date) return 'Never synced'
  const diffMs = Date.now() - new Date(date).getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}

/**
 * Reusable refresh button with spinner and "last synced X ago" text.
 * Encapsulates the sync status polling + trigger pattern.
 */
export function RefreshButton({ syncType, className, size = 'sm' }: RefreshButtonProps) {
  const { data: status } = useSyncStatus(syncType)
  const trigger = useTriggerSync()

  const isRunning = status?.status === 'running' || trigger.isPending
  const lastSynced = status?.completed_at || status?.started_at

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Button
        type="button"
        variant="outline"
        size={size}
        onClick={() => trigger.mutate({ syncType })}
        disabled={isRunning}
        className="gap-1.5"
      >
        <svg
          className={cn('w-3.5 h-3.5', isRunning && 'animate-spin')}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
        {isRunning ? 'Syncing...' : 'Refresh'}
      </Button>
      <span className="text-xs text-muted-foreground">
        {formatTimeAgo(lastSynced)}
      </span>
    </div>
  )
}
