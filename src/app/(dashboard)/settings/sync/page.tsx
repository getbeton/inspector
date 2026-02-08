'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { useAllSyncStatuses, useTriggerSync } from '@/lib/hooks/use-sync-status'
import { cn } from '@/lib/utils/cn'

const SYNC_JOBS = [
  {
    type: 'signal_detection',
    label: 'Signal Detection',
    description: 'Detects product usage signals for all accounts',
    schedule: 'Daily at 6:00 AM UTC',
  },
  {
    type: 'mtu_tracking',
    label: 'MTU Tracking',
    description: 'Calculates monthly tracked users for billing',
    schedule: 'Daily at 2:00 AM UTC',
  },
  {
    type: 'sync_signals',
    label: 'Signal Sync',
    description: 'Refreshes auto-update cohorts and Attio lists',
    schedule: 'Every 6 hours',
  },
  {
    type: 'posthog_events',
    label: 'PostHog Events',
    description: 'Fetches latest events from PostHog',
    schedule: 'On demand',
  },
]

function formatTimeAgo(date: string | null | undefined): string {
  if (!date) return 'Never'
  const diffMs = Date.now() - new Date(date).getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}

function formatDuration(startedAt: string, completedAt: string | null): string {
  if (!completedAt) return '...'
  const durationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime()
  if (durationMs < 1000) return `${durationMs}ms`
  return `${(durationMs / 1000).toFixed(1)}s`
}

function statusBadge(status: string | undefined) {
  if (!status) return <Badge variant="outline">No data</Badge>
  switch (status) {
    case 'completed':
      return <Badge className="bg-success/10 text-success border-success/20">Completed</Badge>
    case 'running':
      return <Badge className="bg-primary/10 text-primary border-primary/20">Running</Badge>
    case 'failed':
      return <Badge className="bg-destructive/10 text-destructive border-destructive/20">Failed</Badge>
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

export default function SyncStatusPage() {
  const { data: statuses, isLoading } = useAllSyncStatuses()
  const triggerSync = useTriggerSync()

  const getStatusForType = (syncType: string) => {
    return statuses?.find(s => (s as { sync_type: string }).sync_type === syncType)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Sync Status</h1>
        <p className="text-muted-foreground">
          Monitor background sync jobs and trigger manual refreshes
        </p>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <Spinner className="size-6" />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Sync Job
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Schedule
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Last Run
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Duration
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {SYNC_JOBS.map(job => {
                    const entry = getStatusForType(job.type)
                    const isRunning = entry?.status === 'running' ||
                      (triggerSync.isPending && triggerSync.variables?.syncType === job.type)

                    return (
                      <tr key={job.type} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-4">
                          <div>
                            <p className="font-medium text-sm">{job.label}</p>
                            <p className="text-xs text-muted-foreground">{job.description}</p>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span className="text-sm text-muted-foreground">{job.schedule}</span>
                        </td>
                        <td className="px-4 py-4">
                          <span className="text-sm">
                            {formatTimeAgo(entry?.completed_at || entry?.started_at)}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          {statusBadge(entry?.status)}
                        </td>
                        <td className="px-4 py-4">
                          <span className="text-sm text-muted-foreground">
                            {entry ? formatDuration(entry.started_at, entry.completed_at) : '—'}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => triggerSync.mutate({ syncType: job.type })}
                            disabled={isRunning}
                          >
                            {isRunning ? (
                              <>
                                <Spinner className="size-3 mr-1.5" />
                                Running...
                              </>
                            ) : (
                              'Run Now'
                            )}
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error display */}
      {triggerSync.isError && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
          <p className="text-sm text-destructive">
            {triggerSync.error instanceof Error ? triggerSync.error.message : 'Failed to trigger sync'}
          </p>
        </div>
      )}
    </div>
  )
}
