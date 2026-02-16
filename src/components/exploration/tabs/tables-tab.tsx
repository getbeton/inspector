'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useSessionEdaResults, useTableColumns } from '@/lib/hooks/use-explorations'
import type { EdaResult } from '@/lib/agent/types'

interface TablesTabProps {
  workspaceId: string | undefined
  sessionId: string
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

export function TablesTab({ workspaceId, sessionId }: TablesTabProps) {
  const { data: edaResults = [], isLoading } = useSessionEdaResults(workspaceId, sessionId)
  const [selectedTable, setSelectedTable] = useState<EdaResult | null>(null)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (edaResults.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No tables discovered in this session.
      </div>
    )
  }

  // Detail view for a selected table
  if (selectedTable) {
    return (
      <TableDetail
        edaResult={selectedTable}
        workspaceId={workspaceId}
        onBack={() => setSelectedTable(null)}
      />
    )
  }

  // Table list view
  return (
    <div className="space-y-2">
      {edaResults.map((result) => {
        const stats = result.table_stats as Record<string, any> | null
        return (
          <button
            key={result.table_id}
            onClick={() => setSelectedTable(result)}
            className="w-full text-left border rounded-lg p-3 hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="font-mono text-sm font-medium">{result.table_id}</span>
                {stats?.total_rows != null && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {Number(stats.total_rows).toLocaleString()} rows
                  </span>
                )}
                {stats?.total_bytes != null && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    · {formatBytes(Number(stats.total_bytes))}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {result.join_suggestions && result.join_suggestions.length > 0 && (
                  <Badge variant="outline" size="sm">{result.join_suggestions.length} joins</Badge>
                )}
                {result.metrics_discovery && result.metrics_discovery.length > 0 && (
                  <Badge variant="info" size="sm">{result.metrics_discovery.length} metrics</Badge>
                )}
                <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
            {result.summary_text && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {result.summary_text}
              </p>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ─── Table Detail Sub-component ───

interface TableDetailProps {
  edaResult: EdaResult
  workspaceId: string | undefined
  onBack: () => void
}

function TableDetail({ edaResult, workspaceId, onBack }: TableDetailProps) {
  const { data: columnsData, isLoading: columnsLoading } = useTableColumns(workspaceId, edaResult.table_id)
  const stats = edaResult.table_stats as Record<string, any> | null

  return (
    <div className="space-y-5">
      {/* Back + Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </Button>
        <h3 className="font-mono font-semibold">{edaResult.table_id}</h3>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 gap-3">
          {stats.total_rows != null && (
            <div className="border rounded-lg p-3 text-center">
              <div className="text-lg font-bold">{Number(stats.total_rows).toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Rows</div>
            </div>
          )}
          {stats.total_bytes != null && (
            <div className="border rounded-lg p-3 text-center">
              <div className="text-lg font-bold">{formatBytes(Number(stats.total_bytes))}</div>
              <div className="text-xs text-muted-foreground">Size</div>
            </div>
          )}
        </div>
      )}

      {/* Summary */}
      {edaResult.summary_text && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-1">Summary</h4>
          <p className="text-sm bg-muted p-2 rounded">{edaResult.summary_text}</p>
        </div>
      )}

      {/* Columns Table */}
      <div>
        <h4 className="text-sm font-medium text-muted-foreground mb-2">Columns</h4>
        {columnsLoading ? (
          <div className="flex justify-center py-4">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : columnsData && columnsData.columns.length > 0 ? (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 text-left text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Examples</th>
                </tr>
              </thead>
              <tbody>
                {columnsData.columns.map((col) => (
                  <tr key={col.name} className="border-t">
                    <td className="px-3 py-2 font-mono">{col.name}</td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" size="sm">{col.type}</Badge>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground truncate max-w-[200px]">
                      {col.samples?.slice(0, 3).map(String).join(', ') || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Column data not available.</p>
        )}
      </div>

      {/* Metrics Discovery */}
      {edaResult.metrics_discovery && edaResult.metrics_discovery.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-2">Discovered Metrics</h4>
          <div className="space-y-2">
            {edaResult.metrics_discovery.map((m, i) => (
              <div key={i} className="border rounded-lg p-2">
                <span className="font-semibold text-sm">{m.name}</span>
                <p className="text-xs text-muted-foreground">{m.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Join Suggestions */}
      {edaResult.join_suggestions && edaResult.join_suggestions.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-2">Related Tables</h4>
          <div className="space-y-1">
            {edaResult.join_suggestions.map((j, i) => (
              <div key={i} className="text-sm">
                <span className="font-mono">{j.table1}.{j.col1}</span>
                <span className="mx-2 text-muted-foreground">=</span>
                <span className="font-mono">{j.table2}.{j.col2}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
