'use client'

import { useState, useMemo, Fragment } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Input } from '@/components/ui/input'
import { CopyButton } from '@/components/ui/copy-button'
import { cn } from '@/lib/utils/cn'
import { useMcpLogs } from '@/lib/hooks/use-mcp-logs'
import { MCP_METHODS } from '../mcp-methods'

// ---------------------------------------------------------------------------
// Relative time formatter (Intl.RelativeTimeFormat)
// ---------------------------------------------------------------------------

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
const fullDateFmt = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'medium',
})

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const diffSec = Math.floor(diffMs / 1_000)

  if (diffSec < 60) return rtf.format(-diffSec, 'second')
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return rtf.format(-diffMin, 'minute')
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return rtf.format(-diffHr, 'hour')
  const diffDay = Math.floor(diffHr / 24)
  return rtf.format(-diffDay, 'day')
}

function fullTimestamp(iso: string): string {
  try {
    return fullDateFmt.format(new Date(iso))
  } catch {
    return iso
  }
}

// ---------------------------------------------------------------------------
// Duration formatter
// ---------------------------------------------------------------------------

function formatDurationMs(ms: number | null): string {
  if (ms === null) return '—'
  if (ms < 1_000) return `${ms}ms`
  return `${(ms / 1_000).toFixed(1)}s`
}

// ---------------------------------------------------------------------------
// Tool name options (sorted)
// ---------------------------------------------------------------------------

const TOOL_NAME_OPTIONS = MCP_METHODS.map((m) => m.name).sort()

// ---------------------------------------------------------------------------
// Logs Tab
// ---------------------------------------------------------------------------

export default function LogsTab() {
  const [toolFilter, setToolFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'' | 'success' | 'error'>('')
  const [sessionFilter, setSessionFilter] = useState('')
  const [expandedRow, setExpandedRow] = useState<string | null>(null)

  const filters = useMemo(
    () => ({
      tool_name: toolFilter || undefined,
      status: statusFilter || undefined,
      session_id: sessionFilter || undefined,
    }),
    [toolFilter, statusFilter, sessionFilter],
  )

  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useMcpLogs(filters)

  const logs = data?.pages.flatMap((p) => p.data) ?? []
  const hasFilters = !!(toolFilter || statusFilter || sessionFilter)

  const clearFilters = () => {
    setToolFilter('')
    setStatusFilter('')
    setSessionFilter('')
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="size-5" />
      </div>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-sm text-destructive">
            Failed to load logs. Please try again.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={toolFilter}
          onChange={(e) => setToolFilter(e.target.value)}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
          aria-label="Filter by tool"
        >
          <option value="">All tools</option>
          {TOOL_NAME_OPTIONS.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as '' | 'success' | 'error')}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="success">Success</option>
          <option value="error">Error</option>
        </select>

        <Input
          placeholder="Session ID\u2026"
          value={sessionFilter}
          onChange={(e) => setSessionFilter(e.target.value)}
          className="h-8 w-40 text-xs"
          aria-label="Filter by session ID"
        />

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 text-xs">
            Clear filters
          </Button>
        )}
      </div>

      {/* Table */}
      {logs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center gap-2">
            <p className="text-sm font-medium">
              {hasFilters ? 'No logs match your filters' : 'No request logs yet'}
            </p>
            <p className="text-sm text-muted-foreground max-w-md">
              {hasFilters
                ? 'Try adjusting your filters to see more results.'
                : 'Logs will appear here once MCP tools are invoked by connected agents.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle>Request Logs</CardTitle>
              <Badge variant="outline" size="sm">{logs.length}{hasNextPage ? '+' : ''}</Badge>
            </div>
            <CardDescription>
              Tool invocations from connected MCP agents.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-2 pr-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Time</th>
                    <th className="pb-2 pr-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Tool</th>
                    <th className="pb-2 pr-3 text-xs font-bold uppercase tracking-wider text-muted-foreground hidden md:table-cell">Session</th>
                    <th className="pb-2 pr-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Status</th>
                    <th className="pb-2 pr-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Duration</th>
                    <th className="pb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => {
                    const isExpanded = expandedRow === log.id
                    const isError = log.status === 'error'
                    return (
                      <Fragment key={log.id}>
                        <tr
                          className={cn(
                            'border-b border-border/50 last:border-0 cursor-pointer transition-colors',
                            isError
                              ? 'bg-destructive/5 hover:bg-destructive/10'
                              : 'hover:bg-muted/50',
                            isExpanded && 'bg-muted/30',
                          )}
                          style={logs.length > 50 ? { contentVisibility: 'auto' } : undefined}
                          onClick={() => setExpandedRow(isExpanded ? null : log.id)}
                        >
                          <td className="py-2 pr-3 text-muted-foreground whitespace-nowrap" title={fullTimestamp(log.created_at)}>
                            {relativeTime(log.created_at)}
                          </td>
                          <td className="py-2 pr-3">
                            <span className="flex items-center gap-1">
                              <code className="font-mono truncate max-w-[160px]">{log.tool_name}</code>
                              <CopyButton value={log.tool_name} size="sm" />
                            </span>
                          </td>
                          <td className="py-2 pr-3 hidden md:table-cell">
                            {log.session_id ? (
                              <span className="flex items-center gap-1">
                                <code className="font-mono text-muted-foreground truncate max-w-[80px]" title={log.session_id}>
                                  {log.session_id.length > 12
                                    ? `${log.session_id.slice(0, 8)}\u2026`
                                    : log.session_id}
                                </code>
                                <CopyButton value={log.session_id} size="sm" />
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-2 pr-3">
                            <Badge
                              variant={isError ? 'error' : 'success'}
                              size="sm"
                            >
                              {log.status}
                            </Badge>
                          </td>
                          <td className="py-2 pr-3 text-muted-foreground whitespace-nowrap">
                            {formatDurationMs(log.duration_ms)}
                          </td>
                          <td className="py-2 max-w-[200px]">
                            {log.error_message ? (
                              <span
                                className="text-destructive truncate block"
                                title={log.error_message}
                              >
                                {log.error_message.length > 60
                                  ? `${log.error_message.slice(0, 60)}\u2026`
                                  : log.error_message}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>

                        {/* Expanded request params */}
                        {isExpanded && (
                          <tr>
                            <td colSpan={6} className="px-3 py-3 bg-muted/20">
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                    Request Params
                                  </span>
                                  {log.request_params && (
                                    <CopyButton
                                      value={JSON.stringify(log.request_params, null, 2)}
                                      size="sm"
                                    />
                                  )}
                                </div>
                                {log.request_params ? (
                                  <pre className="text-xs font-mono bg-background rounded-md border border-border p-3 overflow-x-auto whitespace-pre-wrap max-h-64">
                                    {JSON.stringify(log.request_params, null, 2)}
                                  </pre>
                                ) : (
                                  <p className="text-xs text-muted-foreground italic">
                                    No request params recorded.
                                  </p>
                                )}

                                {/* Full error message if truncated */}
                                {log.error_message && log.error_message.length > 60 && (
                                  <div className="space-y-1 pt-2 border-t border-border">
                                    <span className="text-xs font-bold uppercase tracking-wider text-destructive">
                                      Full Error
                                    </span>
                                    <p className="text-xs text-destructive font-mono bg-destructive/5 rounded-md border border-destructive/20 p-3 whitespace-pre-wrap">
                                      {log.error_message}
                                    </p>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Load more */}
            <div className="flex justify-center pt-4">
              {hasNextPage ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                >
                  {isFetchingNextPage ? (
                    <>
                      <Spinner className="size-3.5 mr-1.5" />
                      Loading\u2026
                    </>
                  ) : (
                    'Load more'
                  )}
                </Button>
              ) : logs.length > 0 ? (
                <p className="text-xs text-muted-foreground">No more logs</p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
