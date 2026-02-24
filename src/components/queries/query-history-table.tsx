'use client'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { QueryHistoryItem } from '@/lib/api/query-history'

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'secondary' | 'info'> = {
  completed: 'success',
  running: 'warning',
  failed: 'error',
  pending: 'secondary',
  timeout: 'info',
}

/** Format execution time for display */
function formatExecTime(ms: number | null): string {
  if (ms === null || ms === undefined) return '-'
  if (ms === 0) return '0ms'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

/** Format relative time */
function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then

  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

/** Truncate query for table display */
function truncateQuery(text: string, maxLen: number = 80): string {
  const oneLine = text.replace(/\s+/g, ' ').trim()
  return oneLine.length > maxLen ? oneLine.substring(0, maxLen) + '...' : oneLine
}

interface QueryHistoryTableProps {
  queries: QueryHistoryItem[]
  onQueryClick: (query: QueryHistoryItem) => void
}

export function QueryHistoryTable({ queries, onQueryClick }: QueryHistoryTableProps) {
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Query</th>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground w-[100px]">Status</th>
            <th className="text-right px-4 py-3 font-medium text-muted-foreground w-[100px]">Time</th>
            <th className="text-center px-4 py-3 font-medium text-muted-foreground w-[70px]">Cached</th>
            <th className="text-right px-4 py-3 font-medium text-muted-foreground w-[100px]">Created</th>
          </tr>
        </thead>
        <tbody>
          {queries.map((query) => (
            <tr
              key={query.id}
              onClick={() => onQueryClick(query)}
              className={cn(
                'border-b last:border-b-0 cursor-pointer transition-colors',
                'hover:bg-muted/50'
              )}
            >
              <td className="px-4 py-3">
                <code className="text-xs font-mono text-foreground/80">
                  {truncateQuery(query.query_text)}
                </code>
              </td>
              <td className="px-4 py-3">
                <Badge variant={STATUS_VARIANT[query.status] || 'secondary'} size="sm">
                  {query.status}
                </Badge>
              </td>
              <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">
                {formatExecTime(query.execution_time_ms)}
              </td>
              <td className="px-4 py-3 text-center">
                {query.execution_time_ms === 0 && query.status === 'completed' ? (
                  <span className="text-success-foreground text-xs font-medium">Yes</span>
                ) : (
                  <span className="text-muted-foreground text-xs">-</span>
                )}
              </td>
              <td className="px-4 py-3 text-right text-muted-foreground text-xs">
                {timeAgo(query.created_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
