'use client'

import type { ExplorationSession } from '@/lib/api/explorations'

interface OverviewTabProps {
  session: ExplorationSession
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleString()
}

function formatDuration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt) return '—'
  const start = new Date(startedAt)
  const end = completedAt ? new Date(completedAt) : new Date()
  const diffMs = end.getTime() - start.getTime()
  const secs = Math.floor(diffMs / 1000)

  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  const remainingSecs = secs % 60
  return `${mins}m ${remainingSecs}s`
}

export function OverviewTab({ session }: OverviewTabProps) {
  return (
    <div className="space-y-6">
      {/* Timing */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-1">Created</h4>
          <p className="text-sm">{formatDate(session.created_at)}</p>
        </div>
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-1">Started</h4>
          <p className="text-sm">{formatDate(session.started_at)}</p>
        </div>
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-1">Completed</h4>
          <p className="text-sm">{formatDate(session.completed_at)}</p>
        </div>
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-1">Duration</h4>
          <p className="text-sm">{formatDuration(session.started_at, session.completed_at)}</p>
        </div>
      </div>

      {/* IDs */}
      <div className="space-y-3">
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-1">Session ID</h4>
          <p className="text-sm font-mono bg-muted px-2 py-1 rounded select-all">
            {session.session_id}
          </p>
        </div>
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-1">Workspace ID</h4>
          <p className="text-sm font-mono bg-muted px-2 py-1 rounded select-all">
            {session.workspace_id}
          </p>
        </div>
      </div>

      {/* Results Summary */}
      <div>
        <h4 className="text-sm font-medium text-muted-foreground mb-2">Results Summary</h4>
        <div className="grid grid-cols-3 gap-3">
          <div className="border rounded-lg p-3 text-center">
            <div className="text-lg font-bold">{session.eda_count}</div>
            <div className="text-xs text-muted-foreground">Tables</div>
          </div>
          <div className="border rounded-lg p-3 text-center">
            <div className="text-lg font-bold">{session.confirmed_joins?.length || 0}</div>
            <div className="text-xs text-muted-foreground">Join Pairs</div>
          </div>
          <div className="border rounded-lg p-3 text-center">
            <div className="text-lg font-bold">{session.has_website_result ? '1' : '0'}</div>
            <div className="text-xs text-muted-foreground">Website</div>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {session.error_message && (
        <div className="border border-destructive/30 bg-destructive/5 rounded-lg p-3">
          <h4 className="text-sm font-medium text-destructive mb-1">Error</h4>
          <p className="text-sm text-destructive/80 font-mono">{session.error_message}</p>
        </div>
      )}
    </div>
  )
}
