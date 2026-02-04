'use client'

import { Badge } from '@/components/ui/badge'
import type { ExplorationSession } from '@/lib/api/explorations'

interface ExplorationRunsTableProps {
  sessions: ExplorationSession[]
  onSessionClick: (session: ExplorationSession) => void
}

const STATUS_VARIANT: Record<string, 'default' | 'success' | 'error' | 'warning' | 'secondary'> = {
  created: 'secondary',
  running: 'warning',
  completed: 'success',
  failed: 'error',
  closed: 'secondary',
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60_000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`

  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 30) return `${diffDays}d ago`

  return date.toLocaleDateString()
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

function truncateSessionId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 12)}…` : id
}

export function ExplorationRunsTable({ sessions, onSessionClick }: ExplorationRunsTableProps) {
  if (sessions.length === 0) {
    return null
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="bg-muted/50 text-left text-sm text-muted-foreground">
            <th className="px-4 py-3 font-medium">Session</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Agent</th>
            <th className="px-4 py-3 font-medium">Started</th>
            <th className="px-4 py-3 font-medium">Duration</th>
            <th className="px-4 py-3 font-medium">Tables</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((session) => (
            <tr
              key={session.session_id}
              onClick={() => onSessionClick(session)}
              className="border-t hover:bg-muted/30 cursor-pointer transition-colors"
            >
              <td className="px-4 py-3">
                <span className="font-mono text-sm" title={session.session_id}>
                  {truncateSessionId(session.session_id)}
                </span>
              </td>
              <td className="px-4 py-3">
                <Badge variant={STATUS_VARIANT[session.status] || 'secondary'}>
                  {session.status}
                </Badge>
              </td>
              <td className="px-4 py-3 text-sm text-muted-foreground">
                {session.agent_app_name || '—'}
              </td>
              <td className="px-4 py-3 text-sm text-muted-foreground">
                {formatRelativeTime(session.created_at)}
              </td>
              <td className="px-4 py-3 text-sm text-muted-foreground">
                {formatDuration(session.started_at, session.completed_at)}
              </td>
              <td className="px-4 py-3 text-sm text-muted-foreground">
                {session.eda_count}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
