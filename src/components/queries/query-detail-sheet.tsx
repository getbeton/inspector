'use client'

import { useCallback, useState } from 'react'
import {
  Sheet,
  SheetPopup,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetBody,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useQueryDetail } from '@/lib/hooks/use-query-history'
import type { QueryHistoryItem } from '@/lib/api/query-history'

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'secondary' | 'info'> = {
  completed: 'success',
  running: 'warning',
  failed: 'error',
  pending: 'secondary',
  timeout: 'info',
}

/** Max rows shown in the results preview */
const MAX_PREVIEW_ROWS = 50

interface QueryDetailSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  query: QueryHistoryItem | null
}

export function QueryDetailSheet({ open, onOpenChange, query }: QueryDetailSheetProps) {
  const { data: detail, isLoading } = useQueryDetail(query?.id)
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    if (!detail?.query.query_text) return
    navigator.clipboard.writeText(detail.query.query_text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [detail])

  if (!query) return null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetPopup>
        <SheetHeader>
          <div className="flex items-center gap-3 pr-8">
            <SheetTitle>
              <span className="font-mono text-base">{query.id.slice(0, 12)}...</span>
            </SheetTitle>
            <Badge variant={STATUS_VARIANT[query.status] || 'secondary'}>
              {query.status}
            </Badge>
          </div>
          <SheetDescription>
            {new Date(query.created_at).toLocaleString()}
            {query.execution_time_ms !== null && (
              <> &middot; {query.execution_time_ms}ms</>
            )}
          </SheetDescription>
        </SheetHeader>

        <SheetBody>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : detail ? (
            <div className="space-y-6">
              {/* Query Text */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-foreground">Query</h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopy}
                  >
                    {copied ? 'Copied!' : 'Copy query'}
                  </Button>
                </div>
                <pre className="bg-muted rounded-lg p-4 text-xs font-mono whitespace-pre-wrap break-all overflow-x-auto max-h-[300px] overflow-y-auto">
                  {detail.query.query_text}
                </pre>
              </section>

              {/* Execution Metadata */}
              <section>
                <h3 className="text-sm font-medium text-foreground mb-2">Metadata</h3>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <dt className="text-muted-foreground">Status</dt>
                  <dd>
                    <Badge variant={STATUS_VARIANT[detail.query.status] || 'secondary'} size="sm">
                      {detail.query.status}
                    </Badge>
                  </dd>
                  <dt className="text-muted-foreground">Execution Time</dt>
                  <dd className="tabular-nums">
                    {detail.query.execution_time_ms !== null
                      ? `${detail.query.execution_time_ms}ms`
                      : '-'}
                  </dd>
                  <dt className="text-muted-foreground">Cached</dt>
                  <dd>
                    {detail.query.execution_time_ms === 0 && detail.query.status === 'completed'
                      ? 'Yes'
                      : 'No'}
                  </dd>
                  <dt className="text-muted-foreground">Query Hash</dt>
                  <dd className="font-mono text-xs truncate" title={detail.query.query_hash}>
                    {detail.query.query_hash.slice(0, 16)}...
                  </dd>
                  {detail.query.session_id && (
                    <>
                      <dt className="text-muted-foreground">Session</dt>
                      <dd className="font-mono text-xs truncate">
                        {detail.query.session_id.slice(0, 12)}...
                      </dd>
                    </>
                  )}
                  {detail.query.started_at && (
                    <>
                      <dt className="text-muted-foreground">Started</dt>
                      <dd>{new Date(detail.query.started_at).toLocaleString()}</dd>
                    </>
                  )}
                  {detail.query.completed_at && (
                    <>
                      <dt className="text-muted-foreground">Completed</dt>
                      <dd>{new Date(detail.query.completed_at).toLocaleString()}</dd>
                    </>
                  )}
                  {detail.query.error_message && (
                    <>
                      <dt className="text-muted-foreground">Error</dt>
                      <dd className="text-destructive-foreground">{detail.query.error_message}</dd>
                    </>
                  )}
                </dl>
              </section>

              {/* Results Preview */}
              {detail.result && (
                <section>
                  <h3 className="text-sm font-medium text-foreground mb-2">
                    Results
                    <span className="text-muted-foreground font-normal ml-2">
                      ({detail.result.row_count} {detail.result.row_count === 1 ? 'row' : 'rows'})
                    </span>
                  </h3>
                  <div className="rounded-lg border border-border overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          {detail.result.columns.map((col, i) => (
                            <th
                              key={i}
                              className="text-left px-3 py-2 font-medium text-muted-foreground whitespace-nowrap"
                            >
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {detail.result.results.slice(0, MAX_PREVIEW_ROWS).map((row, rowIdx) => (
                          <tr key={rowIdx} className="border-b last:border-b-0">
                            {(row as unknown[]).map((cell, cellIdx) => (
                              <td
                                key={cellIdx}
                                className="px-3 py-1.5 whitespace-nowrap font-mono tabular-nums"
                              >
                                {cell === null ? (
                                  <span className="text-muted-foreground italic">null</span>
                                ) : (
                                  String(cell)
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {detail.result.row_count > MAX_PREVIEW_ROWS && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Showing {MAX_PREVIEW_ROWS} of {detail.result.row_count} rows
                    </p>
                  )}
                </section>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              Failed to load query details
            </div>
          )}
        </SheetBody>
      </SheetPopup>
    </Sheet>
  )
}
